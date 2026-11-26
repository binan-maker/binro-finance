import { DEFAULT_CURRENCY_CODE } from '@/constants/currencies';
import type {
  AppSettings,
  Budget,
  BudgetPeriod,
  Category,
  PaymentMethodRecord,
  Tag,
  Transaction,
  TransactionType,
} from '@/types/models';
import type {
  BudgetHealthStatus,
  BudgetOverviewStats,
  BudgetProgress,
  CategoryBreakdownItem,
  ComparisonBucket,
  CurrencySummary,
  DailyTotalItem,
  DashboardPeriod,
  FinancialSummary,
  LargestExpenseInsight,
  PeriodComparison,
  PeriodSummary,
  ReportAnalytics,
  ReportGranularity,
  SpendingTrendPoint,
  SpendingTrendSeries,
  TransactionFilterState,
  TrendPoint,
} from '@/types/reports';
import {
  addDaysToISODate,
  diffDaysISODate,
  enumerateDatesInRange,
  getBiweeklyPeriodForDate,
  getDaysInMonth,
  getMonthLabel,
  getMonthRange,
  getTodayISODate,
  getWeekRange,
  getYearRange,
  isValidISODate,
  normalizeDateRange,
  parseISODateParts,
  resolveDatePresetRange,
  toISODate,
} from '@/utils/date';

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

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
  settings: Pick<
    AppSettings,
    'currencyCode' | 'openingBalanceMinor' | 'openingBalanceCurrencyCode'
  >,
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
      const netMovementMinor = calculateNetMovementMinor(
        entry.incomeMinor,
        entry.expensesMinor,
      );
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

  const netMovementMinor = calculateNetMovementMinor(
    totalIncomeMinor,
    totalExpensesMinor,
  );
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

/**
 * Dynamically derives selectable years from actual stored transaction dates and the current calendar year.
 * Never returns a hardcoded static year window.
 */
export function getAvailableTransactionYears(
  transactions: readonly Transaction[],
  currentYear: number = new Date().getFullYear(),
): number[] {
  const yearSet = new Set<number>([currentYear]);
  for (const tx of transactions) {
    if (isValidISODate(tx.transactionDate)) {
      const { year } = parseISODateParts(tx.transactionDate);
      yearSet.add(year);
    }
  }
  return Array.from(yearSet).sort((a, b) => b - a);
}

export function filterAndSortTransactions(params: {
  transactions: readonly Transaction[];
  categories: readonly Category[];
  paymentMethods?: readonly PaymentMethodRecord[];
  tags?: readonly Tag[];
  typeFilter?: 'all' | TransactionType;
  searchQuery?: string;
  filters: TransactionFilterState;
  referenceToday?: string;
}): Transaction[] {
  const {
    transactions,
    categories,
    paymentMethods = [],
    tags = [],
    typeFilter = 'all',
    searchQuery = '',
    filters,
    referenceToday,
  } = params;

  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const tagMap = new Map(tags.map((t) => [t.id, t]));
  const pmById = new Map(paymentMethods.map((pm) => [pm.id, pm]));

  // Include subcategories when a parent category is selected
  const selectedCategorySet = new Set(filters.categoryIds);
  if (selectedCategorySet.size > 0) {
    for (const cat of categories) {
      if (cat.parentId && selectedCategorySet.has(cat.parentId)) {
        selectedCategorySet.add(cat.id);
      }
    }
  }

  const selectedPmNames = new Set(
    filters.paymentMethodIds
      .map((id) => pmById.get(id)?.name.trim().toLowerCase() ?? id.trim().toLowerCase())
      .filter(Boolean),
  );
  const selectedPmIds = new Set(filters.paymentMethodIds);
  const selectedTagIds = new Set(filters.tagIds);
  const selectedYearsSet = new Set(filters.selectedYears);

  const dateRange = resolveDatePresetRange({
    preset: filters.datePreset,
    referenceToday,
    customStartDate: filters.customStartDate,
    customEndDate: filters.customEndDate,
  });

  const term = searchQuery.trim().toLowerCase();

  const filtered = transactions.filter((tx) => {
    if (typeFilter !== 'all' && tx.type !== typeFilter) {
      return false;
    }

    if (
      filters.currencyCode !== 'all' &&
      tx.currencyCode.toUpperCase() !== filters.currencyCode.toUpperCase()
    ) {
      return false;
    }

    if (dateRange.startDate && tx.transactionDate < dateRange.startDate) {
      return false;
    }
    if (dateRange.endDate && tx.transactionDate > dateRange.endDate) {
      return false;
    }

    if (selectedYearsSet.size > 0 && isValidISODate(tx.transactionDate)) {
      const { year } = parseISODateParts(tx.transactionDate);
      if (!selectedYearsSet.has(year)) {
        return false;
      }
    }

    if (selectedCategorySet.size > 0) {
      if (!tx.categoryId || !selectedCategorySet.has(tx.categoryId)) {
        return false;
      }
    }

    if (selectedPmIds.size > 0) {
      const matchesId = Boolean(tx.paymentMethodId && selectedPmIds.has(tx.paymentMethodId));
      const matchesName = selectedPmNames.has(tx.paymentMethod.trim().toLowerCase());
      if (!matchesId && !matchesName) {
        return false;
      }
    }

    if (selectedTagIds.size > 0) {
      const txTags = tx.tagIds ?? [];
      if (!txTags.some((tid) => selectedTagIds.has(tid))) {
        return false;
      }
    }

    if (term) {
      const catName =
        (tx.categoryId ? categoryMap.get(tx.categoryId)?.name : null) ??
        tx.categoryNameSnapshot;
      const tagNames = (tx.tagIds ?? [])
        .map((id) => tagMap.get(id)?.name ?? '')
        .join(' ');
      const haystack =
        `${tx.title} ${tx.note ?? ''} ${catName} ${tx.paymentMethod} ${tx.currencyCode} ${tagNames}`.toLowerCase();
      if (!haystack.includes(term)) {
        return false;
      }
    }

    return true;
  });

  return [...filtered].sort((a, b) => {
    switch (filters.sortBy) {
      case 'oldest': {
        const dateCmp = a.transactionDate.localeCompare(b.transactionDate);
        if (dateCmp !== 0) return dateCmp;
        return a.createdAt.localeCompare(b.createdAt);
      }
      case 'highest_amount': {
        const amtCmp = b.amountMinor - a.amountMinor;
        if (amtCmp !== 0) return amtCmp;
        return b.transactionDate.localeCompare(a.transactionDate);
      }
      case 'lowest_amount': {
        const amtCmp = a.amountMinor - b.amountMinor;
        if (amtCmp !== 0) return amtCmp;
        return b.transactionDate.localeCompare(a.transactionDate);
      }
      case 'newest':
      default: {
        const dateCmp = b.transactionDate.localeCompare(a.transactionDate);
        if (dateCmp !== 0) return dateCmp;
        return b.createdAt.localeCompare(a.createdAt);
      }
    }
  });
}

export function calculatePeriodSummary(params: {
  transactions: readonly Transaction[];
  categories: readonly Category[];
  currencyCode?: string;
  startDate: string;
  endDate: string;
}): PeriodSummary {
  const { transactions, categories } = params;
  const normalized = normalizeDateRange(params.startDate, params.endDate);
  const { startDate, endDate } = normalized;

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

function formatShortDayMonth(isoDate: string): string {
  const { month, day } = parseISODateParts(isoDate);
  return `${day} ${SHORT_MONTHS[month - 1]}`;
}

function enumerateMonthsInRange(startDate: string, endDate: string): { year: number; month: number; key: string; label: string }[] {
  const start = parseISODateParts(startDate);
  const end = parseISODateParts(endDate);
  const months: { year: number; month: number; key: string; label: string }[] = [];

  let y = start.year;
  let m = start.month;
  let guard = 0;
  while ((y < end.year || (y === end.year && m <= end.month)) && guard < 240) {
    const key = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`;
    months.push({
      year: y,
      month: m,
      key,
      label: start.year === end.year ? SHORT_MONTHS[m - 1] : `${SHORT_MONTHS[m - 1]} ${String(y).slice(2)}`,
    });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    guard += 1;
  }
  return months;
}

export function buildReportAnalytics(params: {
  transactions: readonly Transaction[];
  categories: readonly Category[];
  currencyCode: string;
  startDate: string;
  endDate: string;
  categoryId?: string | null;
  granularity: ReportGranularity;
}): ReportAnalytics {
  const { transactions, categories, currencyCode, categoryId, granularity } = params;
  const normalized = normalizeDateRange(params.startDate, params.endDate);
  const { startDate, endDate } = normalized;
  const normalizedCurrency = currencyCode.trim().toUpperCase();
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  const allowedCategoryIds = new Set<string>();
  if (categoryId) {
    allowedCategoryIds.add(categoryId);
    for (const c of categories) {
      if (c.parentId === categoryId) {
        allowedCategoryIds.add(c.id);
      }
    }
  }

  const scoped = transactions.filter((tx) => {
    if ((tx.currencyCode || normalizedCurrency).toUpperCase() !== normalizedCurrency) {
      return false;
    }
    if (tx.transactionDate < startDate || tx.transactionDate > endDate) {
      return false;
    }
    if (allowedCategoryIds.size > 0) {
      if (!tx.categoryId || !allowedCategoryIds.has(tx.categoryId)) {
        return false;
      }
    }
    return true;
  });

  let totalIncomeMinor = 0;
  let totalExpensesMinor = 0;
  let incomeTransactionCount = 0;
  let expenseTransactionCount = 0;
  let largestExpenseTransaction: LargestExpenseInsight | null = null;

  const dailyIncomeMap = new Map<string, number>();
  const dailyExpenseMap = new Map<string, number>();
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

  for (const tx of scoped) {
    if (tx.type === 'income') {
      totalIncomeMinor += tx.amountMinor;
      incomeTransactionCount += 1;
      dailyIncomeMap.set(
        tx.transactionDate,
        (dailyIncomeMap.get(tx.transactionDate) ?? 0) + tx.amountMinor,
      );
    } else {
      totalExpensesMinor += tx.amountMinor;
      expenseTransactionCount += 1;
      dailyExpenseMap.set(
        tx.transactionDate,
        (dailyExpenseMap.get(tx.transactionDate) ?? 0) + tx.amountMinor,
      );

      const cat = tx.categoryId ? categoryMap.get(tx.categoryId) : undefined;
      const catName = cat?.name ?? tx.categoryNameSnapshot ?? 'Other';

      if (
        !largestExpenseTransaction ||
        tx.amountMinor > largestExpenseTransaction.amountMinor
      ) {
        largestExpenseTransaction = {
          id: tx.id,
          title: tx.title,
          amountMinor: tx.amountMinor,
          transactionDate: tx.transactionDate,
          categoryName: catName,
        };
      }

      const key = tx.categoryId ?? `snapshot:${tx.categoryNameSnapshot}`;
      const existingCat = categoryExpenseMap.get(key) ?? {
        categoryId: tx.categoryId,
        categoryName: catName,
        color: cat?.color ?? '#059669',
        icon: cat?.icon ?? 'tag',
        totalMinor: 0,
        transactionCount: 0,
      };
      existingCat.totalMinor += tx.amountMinor;
      existingCat.transactionCount += 1;
      categoryExpenseMap.set(key, existingCat);
    }
  }

  const allDates = enumerateDatesInRange(startDate, endDate);
  const dayCount = Math.max(allDates.length, 1);
  const averageDailyExpenseMinor = Math.round(totalExpensesMinor / dayCount);

  let highestSpendingDay: { date: string; amountMinor: number } | null = null;
  for (const [date, amountMinor] of dailyExpenseMap.entries()) {
    if (
      amountMinor > 0 &&
      (!highestSpendingDay || amountMinor > highestSpendingDay.amountMinor)
    ) {
      highestSpendingDay = { date, amountMinor };
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

  // 1. Income vs Expense comparison buckets driven directly by `granularity`
  let comparisonBuckets: ComparisonBucket[] = [];

  if (granularity === 'daily') {
    if (allDates.length <= 62) {
      comparisonBuckets = allDates.map((d) => ({
        key: d,
        label: formatShortDayMonth(d),
        incomeMinor: dailyIncomeMap.get(d) ?? 0,
        expenseMinor: dailyExpenseMap.get(d) ?? 0,
      }));
    } else {
      const bucketSize = Math.ceil(allDates.length / 45);
      for (let i = 0; i < allDates.length; i += bucketSize) {
        const slice = allDates.slice(i, i + bucketSize);
        let inc = 0;
        let exp = 0;
        for (const d of slice) {
          inc += dailyIncomeMap.get(d) ?? 0;
          exp += dailyExpenseMap.get(d) ?? 0;
        }
        comparisonBuckets.push({
          key: slice[0],
          label: formatShortDayMonth(slice[0]),
          incomeMinor: inc,
          expenseMinor: exp,
        });
      }
    }
  } else if (granularity === 'weekly') {
    const weekMap = new Map<string, ComparisonBucket>();
    for (const d of allDates) {
      const { startDate: weekStart } = getWeekRange(d);
      const existing = weekMap.get(weekStart) ?? {
        key: weekStart,
        label: formatShortDayMonth(weekStart),
        incomeMinor: 0,
        expenseMinor: 0,
      };
      existing.incomeMinor += dailyIncomeMap.get(d) ?? 0;
      existing.expenseMinor += dailyExpenseMap.get(d) ?? 0;
      weekMap.set(weekStart, existing);
    }
    comparisonBuckets = Array.from(weekMap.values());
  } else {
    const months = enumerateMonthsInRange(startDate, endDate);
    const monthTotals = new Map<string, { inc: number; exp: number }>();
    for (const [d, inc] of dailyIncomeMap.entries()) {
      const key = d.slice(0, 7);
      const cur = monthTotals.get(key) ?? { inc: 0, exp: 0 };
      cur.inc += inc;
      monthTotals.set(key, cur);
    }
    for (const [d, exp] of dailyExpenseMap.entries()) {
      const key = d.slice(0, 7);
      const cur = monthTotals.get(key) ?? { inc: 0, exp: 0 };
      cur.exp += exp;
      monthTotals.set(key, cur);
    }
    comparisonBuckets = months.map((m) => {
      const entry = monthTotals.get(m.key);
      return {
        key: m.key,
        label: m.label,
        incomeMinor: entry?.inc ?? 0,
        expenseMinor: entry?.exp ?? 0,
      };
    });
  }

  // 2. Dynamic Spending Trend aggregation (single day = hourly, 7d = daily, 30d/month = daily/weekly, year/long = monthly/yearly)
  let spendingTrend: SpendingTrendSeries;

  if (allDates.length === 1) {
    const hourSums = Array.from({ length: 24 }, () => 0);
    for (const tx of scoped) {
      if (tx.type !== 'expense') continue;
      const parsed = new Date(tx.createdAt);
      const hour = Number.isNaN(parsed.getTime()) ? 12 : parsed.getHours();
      hourSums[hour] += tx.amountMinor;
    }

    const points: SpendingTrendPoint[] = hourSums.map((amt, hour) => {
      const hour12 = hour % 12 === 0 ? 12 : hour % 12;
      const suffix = hour >= 12 ? 'p' : 'a';
      const detail = `${String(hour).padStart(2, '0')}:00`;
      return {
        key: `h-${hour}`,
        label: `${hour12}${suffix}`,
        detailLabel: detail,
        amountMinor: amt,
      };
    });

    spendingTrend = {
      mode: 'hourly',
      subtitle: 'Hourly spending trend',
      points,
    };
  } else if (allDates.length <= 10 || (allDates.length <= 62 && granularity === 'daily')) {
    const points: SpendingTrendPoint[] = allDates.map((d) => ({
      key: d,
      label: formatShortDayMonth(d),
      detailLabel: d,
      amountMinor: dailyExpenseMap.get(d) ?? 0,
    }));

    spendingTrend = {
      mode: 'daily',
      subtitle: 'Daily spending trend',
      points,
    };
  } else if (allDates.length <= 62 || (allDates.length <= 400 && granularity === 'weekly')) {
    const weekMap = new Map<string, SpendingTrendPoint>();
    for (const d of allDates) {
      const { startDate: weekStart, endDate: weekEnd } = getWeekRange(d);
      const existing = weekMap.get(weekStart) ?? {
        key: weekStart,
        label: formatShortDayMonth(weekStart),
        detailLabel: `${formatShortDayMonth(weekStart)} – ${formatShortDayMonth(weekEnd)}`,
        amountMinor: 0,
      };
      existing.amountMinor += dailyExpenseMap.get(d) ?? 0;
      weekMap.set(weekStart, existing);
    }

    spendingTrend = {
      mode: 'weekly',
      subtitle: 'Weekly spending trend',
      points: Array.from(weekMap.values()),
    };
  } else if (allDates.length <= 548) {
    const months = enumerateMonthsInRange(startDate, endDate);
    const monthTotals = new Map<string, number>();
    for (const [d, exp] of dailyExpenseMap.entries()) {
      const key = d.slice(0, 7);
      monthTotals.set(key, (monthTotals.get(key) ?? 0) + exp);
    }

    spendingTrend = {
      mode: 'monthly',
      subtitle: 'Monthly spending trend',
      points: months.map((m) => ({
        key: m.key,
        label: m.label,
        detailLabel: getMonthLabel(m.year, m.month),
        amountMinor: monthTotals.get(m.key) ?? 0,
      })),
    };
  } else {
    const startYear = parseISODateParts(startDate).year;
    const endYear = parseISODateParts(endDate).year;
    if (endYear - startYear >= 2) {
      const yearTotals = new Map<number, number>();
      for (const [d, exp] of dailyExpenseMap.entries()) {
        const y = parseISODateParts(d).year;
        yearTotals.set(y, (yearTotals.get(y) ?? 0) + exp);
      }
      const points: SpendingTrendPoint[] = [];
      for (let y = startYear; y <= endYear; y += 1) {
        points.push({
          key: String(y),
          label: String(y),
          detailLabel: `Year ${y}`,
          amountMinor: yearTotals.get(y) ?? 0,
        });
      }
      spendingTrend = {
        mode: 'yearly',
        subtitle: 'Yearly spending trend',
        points,
      };
    } else {
      const months = enumerateMonthsInRange(startDate, endDate);
      const monthTotals = new Map<string, number>();
      for (const [d, exp] of dailyExpenseMap.entries()) {
        const key = d.slice(0, 7);
        monthTotals.set(key, (monthTotals.get(key) ?? 0) + exp);
      }
      spendingTrend = {
        mode: 'monthly',
        subtitle: 'Monthly spending trend',
        points: months.map((m) => ({
          key: m.key,
          label: m.label,
          detailLabel: getMonthLabel(m.year, m.month),
          amountMinor: monthTotals.get(m.key) ?? 0,
        })),
      };
    }
  }

  return {
    currencyCode: normalizedCurrency,
    startDate,
    endDate,
    totalIncomeMinor,
    totalExpensesMinor,
    netMovementMinor: calculateNetMovementMinor(totalIncomeMinor, totalExpensesMinor),
    transactionCount: scoped.length,
    incomeTransactionCount,
    expenseTransactionCount,
    averageDailyExpenseMinor,
    highestSpendingDay,
    highestSpendingCategory: categoryBreakdown[0] ?? null,
    largestExpenseTransaction,
    categoryBreakdown,
    comparisonBuckets,
    spendingTrend,
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
        comparisonLabel: 'across all history',
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

  const rawPct =
    ((currentValueMinor - previousValueMinor) / Math.abs(previousValueMinor)) * 100;
  const percentageChange = Math.round(rawPct * 100) / 100;
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

  const sampled: TrendPoint[] = [];
  const step = (points.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i += 1) {
    const idx = i === maxPoints - 1 ? points.length - 1 : Math.round(i * step);
    sampled.push(points[idx]);
  }
  return sampled;
}

export function resolveBudgetPeriodRange(params: {
  budget: Budget;
  referenceDate?: string;
}): {
  startDate: string;
  endDate: string;
  nextPeriodStartDate: string | null;
  nextPeriodEndDate: string | null;
} {
  const { budget, referenceDate } = params;
  if (budget.period === 'biweekly') {
    const anchor = budget.startDate ?? toISODate(budget.year, budget.month, 1);
    const biweekly = getBiweeklyPeriodForDate(anchor, referenceDate ?? anchor);
    return {
      startDate: biweekly.startDate,
      endDate: biweekly.endDate,
      nextPeriodStartDate: biweekly.nextStartDate,
      nextPeriodEndDate: biweekly.nextEndDate,
    };
  }

  if (budget.period === 'yearly') {
    const { startDate, endDate } = getYearRange(budget.year);
    return {
      startDate,
      endDate,
      nextPeriodStartDate: null,
      nextPeriodEndDate: null,
    };
  }

  const { startDate, endDate } = getMonthRange(budget.year, budget.month);
  return {
    startDate,
    endDate,
    nextPeriodStartDate: null,
    nextPeriodEndDate: null,
  };
}

export function getBudgetHealthStatus(
  percentageUsed: number,
  isExceeded: boolean,
): BudgetHealthStatus {
  if (isExceeded || percentageUsed > 100) return 'exceeded';
  if (percentageUsed >= 85) return 'warning';
  return 'healthy';
}

export function calculateBudgetProgress(params: {
  budget: Budget;
  transactions: readonly Transaction[];
  category?: Category | null;
  referenceDate?: string;
}): BudgetProgress {
  const { budget, transactions, category, referenceDate } = params;
  const range = resolveBudgetPeriodRange({ budget, referenceDate });

  let spentMinor = 0;
  for (const tx of transactions) {
    if (tx.type !== 'expense') continue;
    if (tx.currencyCode.toUpperCase() !== budget.currencyCode.toUpperCase()) continue;
    if (tx.transactionDate < range.startDate || tx.transactionDate > range.endDate) continue;
    if (budget.categoryId !== null && tx.categoryId !== budget.categoryId) continue;
    spentMinor += tx.amountMinor;
  }

  const dayCount = Math.max(diffDaysISODate(range.startDate, range.endDate) + 1, 1);
  const dailyAverageSpentMinor = Math.round(spentMinor / dayCount);
  const remainingMinor = budget.amountMinor - spentMinor;
  const percentageUsed =
    budget.amountMinor > 0
      ? Math.round((spentMinor / budget.amountMinor) * 1000) / 10
      : 0;
  const isExceeded = spentMinor > budget.amountMinor;
  const monthlyContributionMinor =
    budget.period === 'yearly' ? Math.round(budget.amountMinor / 12) : null;

  return {
    budget,
    categoryName: category?.name ?? null,
    categoryColor: category?.color ?? null,
    categoryIcon: category?.icon ?? null,
    categoryImageUri: category?.imageUri ?? null,
    periodStartDate: range.startDate,
    periodEndDate: range.endDate,
    nextPeriodStartDate: range.nextPeriodStartDate,
    nextPeriodEndDate: range.nextPeriodEndDate,
    monthlyContributionMinor,
    dailyAverageSpentMinor,
    spentMinor,
    remainingMinor,
    percentageUsed,
    isExceeded,
    status: getBudgetHealthStatus(percentageUsed, isExceeded),
  };
}

export function calculateBudgetOverviewStats(params: {
  period: BudgetPeriod;
  periodStartDate: string;
  periodEndDate: string;
  currencyCode: string;
  transactions: readonly Transaction[];
  categories: readonly Category[];
  overallProgress: BudgetProgress | null;
  categoryProgressList: readonly BudgetProgress[];
}): BudgetOverviewStats {
  const {
    period,
    periodStartDate,
    periodEndDate,
    currencyCode,
    transactions,
    categories,
    overallProgress,
    categoryProgressList,
  } = params;

  const analytics = buildReportAnalytics({
    transactions,
    categories,
    currencyCode,
    startDate: periodStartDate,
    endDate: periodEndDate,
    granularity: period === 'yearly' ? 'monthly' : 'daily',
  });

  const hasOverall = Boolean(overallProgress);
  const hasCategories = categoryProgressList.length > 0;
  const hasAnyBudget = hasOverall || hasCategories;

  let totalBudgetMinor = 0;
  let totalSpentMinor = analytics.totalExpensesMinor;

  if (overallProgress) {
    totalBudgetMinor = overallProgress.budget.amountMinor;
    totalSpentMinor = overallProgress.spentMinor;
  } else if (hasCategories) {
    totalSpentMinor = 0;
    for (const item of categoryProgressList) {
      totalBudgetMinor += item.budget.amountMinor;
      totalSpentMinor += item.spentMinor;
    }
  }

  const remainingMinor = hasAnyBudget ? totalBudgetMinor - totalSpentMinor : 0;
  const percentageUsed =
    hasAnyBudget && totalBudgetMinor > 0
      ? Math.round((totalSpentMinor / totalBudgetMinor) * 1000) / 10
      : 0;
  const isExceeded = hasAnyBudget && totalSpentMinor > totalBudgetMinor;

  const monthlyContributionMinor =
    period === 'yearly' && hasAnyBudget ? Math.round(totalBudgetMinor / 12) : null;

  return {
    currencyCode: analytics.currencyCode,
    periodStartDate: analytics.startDate,
    periodEndDate: analytics.endDate,
    totalBudgetMinor,
    totalSpentMinor,
    remainingMinor,
    percentageUsed,
    status: getBudgetHealthStatus(percentageUsed, isExceeded),
    hasAnyBudget,
    hasExpenseData: analytics.expenseTransactionCount > 0,
    dailyAverageSpentMinor: analytics.averageDailyExpenseMinor,
    highestSpendingCategory: analytics.highestSpendingCategory,
    spendingTrend: analytics.spendingTrend,
    monthlyContributionMinor,
  };
}

export function getFullYearRange(year: number): { startDate: string; endDate: string } {
  return getYearRange(year);
}
