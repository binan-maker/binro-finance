import { DEFAULT_CURRENCY_CODE } from '@/constants/currencies';
import type { AppSettings, Budget, Category, Transaction } from '@/types/models';
import type {
  BudgetProgress,
  CategoryBreakdownItem,
  CurrencySummary,
  DailyTotalItem,
  DashboardPeriod,
  FinancialSummary,
  PeriodComparison,
  PeriodSummary,
  TrendPoint,
} from '@/types/reports';
import {
  addDaysToISODate,
  enumerateDatesInRange,
  getDaysInMonth,
  getMonthRange,
  getTodayISODate,
  getWeekRange,
  getYearRange,
  parseISODateParts,
  toISODate,
} from '@/utils/date';

export function calculateNetMovementMinor(
  totalIncomeMinor: number,
  totalExpensesMinor: number,
): number {
  return totalIncomeMinor - totalExpensesMinor;
}

export function calculateCurrentBalanceMinor(
  openingBalanceMinor: number,
  totalIncomeMinor: number,
  totalExpensesMinor: number,
): number {
  return openingBalanceMinor + totalIncomeMinor - totalExpensesMinor;
}

/**
 * Groups financial totals strictly per currency. Distinct currencies are never summed together.
 */
export function summarizeByCurrency(
  transactions: readonly Transaction[],
  settings: Pick<AppSettings, 'currencyCode' | 'openingBalanceMinor' | 'openingBalanceCurrencyCode'>,
): CurrencySummary[] {
  const groups = new Map<string, { incomeMinor: number; expensesMinor: number }>();

  const openingCurrency = settings.openingBalanceCurrencyCode || settings.currencyCode;
  if (openingCurrency) {
    groups.set(openingCurrency, { incomeMinor: 0, expensesMinor: 0 });
  }

  for (const tx of transactions) {
    const code = tx.currencyCode || settings.currencyCode || DEFAULT_CURRENCY_CODE;
    const entry = groups.get(code) ?? { incomeMinor: 0, expensesMinor: 0 };
    if (tx.type === 'income') {
      entry.incomeMinor += tx.amountMinor;
    } else {
      entry.expensesMinor += tx.amountMinor;
    }
    groups.set(code, entry);
  }

  return Array.from(groups.entries())
    .map(([currencyCode, entry]) => {
      const openingBalanceMinor =
        currencyCode === openingCurrency ? settings.openingBalanceMinor : 0;
      const netMovementMinor = calculateNetMovementMinor(entry.incomeMinor, entry.expensesMinor);
      const currentBalanceMinor = calculateCurrentBalanceMinor(
        openingBalanceMinor,
        entry.incomeMinor,
        entry.expensesMinor,
      );
      return {
        currencyCode,
        openingBalanceMinor,
        totalIncomeMinor: entry.incomeMinor,
        totalExpensesMinor: entry.expensesMinor,
        netMovementMinor,
        currentBalanceMinor,
      };
    })
    .sort((a, b) => {
      if (a.currencyCode === settings.currencyCode) return -1;
      if (b.currencyCode === settings.currencyCode) return 1;
      return a.currencyCode.localeCompare(b.currencyCode);
    });
}

export function summarizeTransactions(
  transactions: readonly Transaction[],
  openingBalanceMinor: number,
  currencyCode: string = DEFAULT_CURRENCY_CODE,
  openingBalanceCurrencyCode: string = currencyCode,
): FinancialSummary {
  const normalizedCode = currencyCode.trim().toUpperCase();
  const scoped = transactions.filter(
    (tx) => (tx.currencyCode || normalizedCode).toUpperCase() === normalizedCode,
  );

  let totalIncomeMinor = 0;
  let totalExpensesMinor = 0;

  for (const tx of scoped) {
    if (tx.type === 'income') {
      totalIncomeMinor += tx.amountMinor;
    } else {
      totalExpensesMinor += tx.amountMinor;
    }
  }

  const effectiveOpening =
    normalizedCode === openingBalanceCurrencyCode.trim().toUpperCase()
      ? openingBalanceMinor
      : 0;

  const netMovementMinor = calculateNetMovementMinor(totalIncomeMinor, totalExpensesMinor);
  const currentBalanceMinor = calculateCurrentBalanceMinor(
    effectiveOpening,
    totalIncomeMinor,
    totalExpensesMinor,
  );

  return {
    currencyCode: normalizedCode,
    openingBalanceMinor: effectiveOpening,
    totalIncomeMinor,
    totalExpensesMinor,
    netMovementMinor,
    currentBalanceMinor,
  };
}

export function getDistinctTransactionCurrencies(
  transactions: readonly Transaction[],
  preferredCurrency: string,
  openingCurrency?: string,
): string[] {
  const set = new Set<string>();
  if (preferredCurrency) {
    set.add(preferredCurrency.trim().toUpperCase());
  }
  if (openingCurrency) {
    set.add(openingCurrency.trim().toUpperCase());
  }
  for (const tx of transactions) {
    if (tx.currencyCode) {
      set.add(tx.currencyCode.trim().toUpperCase());
    }
  }
  return Array.from(set).sort((a, b) => {
    if (a === preferredCurrency) return -1;
    if (b === preferredCurrency) return 1;
    return a.localeCompare(b);
  });
}

export function calculatePeriodSummary(params: {
  transactions: readonly Transaction[];
  categories: readonly Category[];
  currencyCode?: string;
  startDate: string;
  endDate: string;
}): PeriodSummary {
  const { transactions, categories, startDate, endDate } = params;
  const currencyCode = (
    params.currencyCode ??
    transactions[0]?.currencyCode ??
    DEFAULT_CURRENCY_CODE
  )
    .trim()
    .toUpperCase();
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  const filtered = transactions.filter(
    (tx) =>
      (tx.currencyCode || currencyCode).toUpperCase() === currencyCode &&
      tx.transactionDate >= startDate &&
      tx.transactionDate <= endDate,
  );

  let totalIncomeMinor = 0;
  let totalExpensesMinor = 0;

  const dailyMap = new Map<
    string,
    { incomeMinor: number; expenseMinor: number; transactionCount: number }
  >();
  const categoryExpenseMap = new Map<
    string,
    {
      categoryId: string | null;
      categoryName: string;
      color: string;
      icon: string;
      totalMinor: number;
      transactionCount: number;
    }
  >();

  for (const tx of filtered) {
    const dayEntry = dailyMap.get(tx.transactionDate) ?? {
      incomeMinor: 0,
      expenseMinor: 0,
      transactionCount: 0,
    };
    dayEntry.transactionCount += 1;

    if (tx.type === 'income') {
      totalIncomeMinor += tx.amountMinor;
      dayEntry.incomeMinor += tx.amountMinor;
    } else {
      totalExpensesMinor += tx.amountMinor;
      dayEntry.expenseMinor += tx.amountMinor;

      const cat = tx.categoryId ? categoryMap.get(tx.categoryId) : undefined;
      const key = tx.categoryId ?? `snapshot:${tx.categoryNameSnapshot}`;
      const existingCat = categoryExpenseMap.get(key) ?? {
        categoryId: tx.categoryId,
        categoryName: cat?.name ?? tx.categoryNameSnapshot ?? 'Other',
        color: cat?.color ?? '#059669',
        icon: cat?.icon ?? 'tag',
        totalMinor: 0,
        transactionCount: 0,
      };
      existingCat.totalMinor += tx.amountMinor;
      existingCat.transactionCount += 1;
      categoryExpenseMap.set(key, existingCat);
    }

    dailyMap.set(tx.transactionDate, dayEntry);
  }

  const dates = enumerateDatesInRange(startDate, endDate);
  const dailyTotals: DailyTotalItem[] = dates.map((date) => {
    const entry = dailyMap.get(date);
    const incomeMinor = entry?.incomeMinor ?? 0;
    const expenseMinor = entry?.expenseMinor ?? 0;
    return {
      date,
      incomeMinor,
      expenseMinor,
      netMinor: incomeMinor - expenseMinor,
      transactionCount: entry?.transactionCount ?? 0,
    };
  });

  const dayCount = Math.max(dates.length, 1);
  const averageDailyExpenseMinor = Math.round(totalExpensesMinor / dayCount);

  let highestSpendingDay: { date: string; amountMinor: number } | null = null;
  for (const day of dailyTotals) {
    if (
      day.expenseMinor > 0 &&
      (!highestSpendingDay || day.expenseMinor > highestSpendingDay.amountMinor)
    ) {
      highestSpendingDay = { date: day.date, amountMinor: day.expenseMinor };
    }
  }

  const categoryBreakdown: CategoryBreakdownItem[] = Array.from(categoryExpenseMap.values())
    .sort((a, b) => b.totalMinor - a.totalMinor)
    .map((item) => ({
      ...item,
      percentage:
        totalExpensesMinor > 0
          ? Math.round((item.totalMinor / totalExpensesMinor) * 1000) / 10
          : 0,
    }));

  return {
    currencyCode,
    startDate,
    endDate,
    totalIncomeMinor,
    totalExpensesMinor,
    netMovementMinor: calculateNetMovementMinor(totalIncomeMinor, totalExpensesMinor),
    transactionCount: filtered.length,
    averageDailyExpenseMinor,
    highestSpendingDay,
    highestSpendingCategory: categoryBreakdown[0] ?? null,
    categoryBreakdown,
    dailyTotals,
  };
}

export function getDashboardPeriodRanges(
  period: DashboardPeriod,
  referenceToday?: string,
  transactions?: readonly Transaction[],
): {
  label: string;
  comparisonLabel: string;
  startDate: string;
  endDate: string;
  previousStartDate: string | null;
  previousEndDate: string | null;
} {
  const today = referenceToday ?? getTodayISODate();
  const { year, month, day } = parseISODateParts(today);

  switch (period) {
    case 'this_week': {
      const currentWeek = getWeekRange(today);
      const prevAnchor = addDaysToISODate(currentWeek.startDate, -1);
      const previousWeek = getWeekRange(prevAnchor);
      return {
        label: 'This Week',
        comparisonLabel: 'from last week',
        startDate: currentWeek.startDate,
        endDate: today,
        previousStartDate: previousWeek.startDate,
        previousEndDate: addDaysToISODate(
          previousWeek.startDate,
          enumerateDatesInRange(currentWeek.startDate, today).length - 1,
        ),
      };
    }
    case 'last_30': {
      const startDate = addDaysToISODate(today, -29);
      const previousEndDate = addDaysToISODate(startDate, -1);
      const previousStartDate = addDaysToISODate(previousEndDate, -29);
      return {
        label: 'Last 30 Days',
        comparisonLabel: 'from previous 30 days',
        startDate,
        endDate: today,
        previousStartDate,
        previousEndDate,
      };
    }
    case 'this_year': {
      const startDate = toISODate(year, 1, 1);
      const prevYear = year - 1;
      const prevMaxDay = Math.min(day, getDaysInMonth(prevYear, month));
      return {
        label: 'This Year',
        comparisonLabel: 'from last year',
        startDate,
        endDate: today,
        previousStartDate: toISODate(prevYear, 1, 1),
        previousEndDate: toISODate(prevYear, month, prevMaxDay),
      };
    }
    case 'all_time': {
      let earliest = today;
      if (transactions) {
        for (const tx of transactions) {
          if (tx.transactionDate < earliest) {
            earliest = tx.transactionDate;
          }
        }
      }
      return {
        label: 'All Time',
        comparisonLabel: 'all recorded history',
        startDate: earliest,
        endDate: today,
        previousStartDate: null,
        previousEndDate: null,
      };
    }
    case 'this_month':
    default: {
      const startDate = toISODate(year, month, 1);
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;
      const prevRange = getMonthRange(prevYear, prevMonth);
      const prevDay = Math.min(day, getDaysInMonth(prevYear, prevMonth));
      return {
        label: 'This Month',
        comparisonLabel: 'from last month',
        startDate,
        endDate: today,
        previousStartDate: prevRange.startDate,
        previousEndDate: toISODate(prevYear, prevMonth, prevDay),
      };
    }
  }
}

export function calculatePeriodComparison(params: {
  transactions: readonly Transaction[];
  currencyCode: string;
  startDate: string;
  endDate: string;
  previousStartDate: string | null;
  previousEndDate: string | null;
  comparisonLabel: string;
}): PeriodComparison {
  const {
    transactions,
    currencyCode,
    startDate,
    endDate,
    previousStartDate,
    previousEndDate,
    comparisonLabel,
  } = params;

  const currencyTxs = transactions.filter(
    (tx) => tx.currencyCode.toUpperCase() === currencyCode.toUpperCase(),
  );

  const sumNetInRange = (from: string, to: string): number => {
    let net = 0;
    for (const tx of currencyTxs) {
      if (tx.transactionDate >= from && tx.transactionDate <= to) {
        net += tx.type === 'income' ? tx.amountMinor : -tx.amountMinor;
      }
    }
    return net;
  };

  const currentValueMinor = sumNetInRange(startDate, endDate);
  if (!previousStartDate || !previousEndDate) {
    return {
      currentValueMinor,
      previousValueMinor: 0,
      percentageChange: null,
      direction: currentValueMinor > 0 ? 'up' : currentValueMinor < 0 ? 'down' : 'flat',
      comparisonLabel,
    };
  }

  const previousValueMinor = sumNetInRange(previousStartDate, previousEndDate);
  if (previousValueMinor === 0) {
    return {
      currentValueMinor,
      previousValueMinor,
      percentageChange: null,
      direction: currentValueMinor > 0 ? 'up' : currentValueMinor < 0 ? 'down' : 'flat',
      comparisonLabel,
    };
  }

  const rawPct = ((currentValueMinor - previousValueMinor) / Math.abs(previousValueMinor)) * 100;
  const percentageChange = Math.round(rawPct * 10) / 10;
  const direction =
    percentageChange > 0 ? 'up' : percentageChange < 0 ? 'down' : 'flat';

  return {
    currentValueMinor,
    previousValueMinor,
    percentageChange,
    direction,
    comparisonLabel,
  };
}

export function buildFinancialTrendPoints(params: {
  transactions: readonly Transaction[];
  currencyCode: string;
  openingBalanceMinor: number;
  openingBalanceCurrencyCode: string;
  startDate: string;
  endDate: string;
  maxPoints?: number;
}): TrendPoint[] {
  const {
    transactions,
    currencyCode,
    openingBalanceMinor,
    openingBalanceCurrencyCode,
    startDate,
    endDate,
    maxPoints = 12,
  } = params;

  const normalizedCurrency = currencyCode.trim().toUpperCase();
  const scoped = transactions.filter(
    (tx) => (tx.currencyCode || normalizedCurrency).toUpperCase() === normalizedCurrency,
  );

  const initialOpening =
    normalizedCurrency === openingBalanceCurrencyCode.trim().toUpperCase()
      ? openingBalanceMinor
      : 0;

  // Balance immediately before startDate
  let runningBalance = initialOpening;
  const dailyNet = new Map<string, number>();

  for (const tx of scoped) {
    const delta = tx.type === 'income' ? tx.amountMinor : -tx.amountMinor;
    if (tx.transactionDate < startDate) {
      runningBalance += delta;
    } else if (tx.transactionDate <= endDate) {
      dailyNet.set(tx.transactionDate, (dailyNet.get(tx.transactionDate) ?? 0) + delta);
    }
  }

  const allDates = enumerateDatesInRange(startDate, endDate);
  if (allDates.length === 0) return [];

  const points: TrendPoint[] = [];
  for (const date of allDates) {
    runningBalance += dailyNet.get(date) ?? 0;
    const { month, day } = parseISODateParts(date);
    points.push({
      date,
      label: `${day}/${month}`,
      valueMinor: runningBalance,
    });
  }

  if (points.length <= maxPoints) {
    return points;
  }

  // Evenly sample while always keeping first and last date
  const sampled: TrendPoint[] = [];
  const step = (points.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i += 1) {
    const idx = i === maxPoints - 1 ? points.length - 1 : Math.round(i * step);
    sampled.push(points[idx]);
  }
  return sampled;
}

export function calculateBudgetProgress(params: {
  budget: Budget;
  transactions: readonly Transaction[];
  category?: Category | null;
}): BudgetProgress {
  const { budget, transactions, category } = params;
  const { startDate, endDate } = getMonthRange(budget.year, budget.month);

  let spentMinor = 0;
  for (const tx of transactions) {
    if (tx.type !== 'expense') continue;
    if (tx.currencyCode.toUpperCase() !== budget.currencyCode.toUpperCase()) continue;
    if (tx.transactionDate < startDate || tx.transactionDate > endDate) continue;
    if (budget.categoryId !== null && tx.categoryId !== budget.categoryId) continue;
    spentMinor += tx.amountMinor;
  }

  const remainingMinor = budget.amountMinor - spentMinor;
  const percentageUsed =
    budget.amountMinor > 0
      ? Math.round((spentMinor / budget.amountMinor) * 1000) / 10
      : 0;

  return {
    budget,
    categoryName: category?.name ?? null,
    categoryColor: category?.color ?? null,
    spentMinor,
    remainingMinor,
    percentageUsed,
    isExceeded: spentMinor > budget.amountMinor,
  };
}

export function getFullYearRange(year: number): { startDate: string; endDate: string } {
  return getYearRange(year);
}
