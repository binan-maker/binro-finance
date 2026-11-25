import type { Budget } from './models';

export type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

export interface FinancialSummary {
  openingBalanceMinor: number;
  totalIncomeMinor: number;
  totalExpensesMinor: number;
  netMovementMinor: number;
  currentBalanceMinor: number;
}

export interface CategoryBreakdownItem {
  categoryId: string | null;
  categoryName: string;
  color: string;
  icon: string;
  totalMinor: number;
  percentage: number;
  transactionCount: number;
}

export interface DailyTotalItem {
  date: string; // YYYY-MM-DD
  incomeMinor: number;
  expenseMinor: number;
  netMinor: number;
  transactionCount: number;
}

export interface PeriodSummary {
  startDate: string;
  endDate: string;
  totalIncomeMinor: number;
  totalExpensesMinor: number;
  netMovementMinor: number;
  transactionCount: number;
  averageDailyExpenseMinor: number;
  highestSpendingDay: { date: string; amountMinor: number } | null;
  highestSpendingCategory: CategoryBreakdownItem | null;
  categoryBreakdown: CategoryBreakdownItem[];
  dailyTotals: DailyTotalItem[];
}

export interface BudgetProgress {
  budget: Budget;
  categoryName: string | null;
  categoryColor: string | null;
  spentMinor: number;
  remainingMinor: number;
  percentageUsed: number;
  isExceeded: boolean;
}
