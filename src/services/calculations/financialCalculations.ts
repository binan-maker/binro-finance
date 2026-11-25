import type { Budget, Category, Transaction } from '@/types/models';
import type {
  BudgetProgress,
  CategoryBreakdownItem,
  DailyTotalItem,
  FinancialSummary,
  PeriodSummary,
} from '@/types/reports';
import { enumerateDatesInRange, getMonthRange } from '@/utils/date';

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

export function summarizeTransactions(
  transactions: readonly Transaction[],
  openingBalanceMinor: number,
): FinancialSummary {
  let totalIncomeMinor = 0;
  let totalExpensesMinor = 0;

  for (const tx of transactions) {
    if (tx.type === 'income') {
      totalIncomeMinor += tx.amountMinor;
    } else {
      totalExpensesMinor += tx.amountMinor;
    }
  }

  const netMovementMinor = calculateNetMovementMinor(totalIncomeMinor, totalExpensesMinor);
  const currentBalanceMinor = calculateCurrentBalanceMinor(
    openingBalanceMinor,
    totalIncomeMinor,
    totalExpensesMinor,
  );

  return {
    openingBalanceMinor,
    totalIncomeMinor,
    totalExpensesMinor,
    netMovementMinor,
    currentBalanceMinor,
  };
}

export function calculatePeriodSummary(params: {
  transactions: readonly Transaction[];
  categories: readonly Category[];
  startDate: string;
  endDate: string;
}): PeriodSummary {
  const { transactions, categories, startDate, endDate } = params;
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  const filtered = transactions.filter(
    (tx) => tx.transactionDate >= startDate && tx.transactionDate <= endDate,
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
        color: cat?.color ?? '#546E7A',
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
    if (day.expenseMinor > 0 && (!highestSpendingDay || day.expenseMinor > highestSpendingDay.amountMinor)) {
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
