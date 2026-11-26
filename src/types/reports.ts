import type { Budget } from './models';

export type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
export type ReportPeriodPreset =
  | 'today'
  | 'last_7'
  | 'last_30'
  | 'this_month'
  | 'this_year'
  | 'all_time'
  | 'custom';
export type ReportGranularity = 'daily' | 'weekly' | 'monthly';
export type DashboardPeriod = 'this_month' | 'this_year' | 'last_30' | 'all_time' | 'this_week';

export type DateFilterPreset =
  | 'today'
  | 'yesterday'
  | 'last_7'
  | 'last_30'
  | 'this_month'
  | 'this_year'
  | 'all_time'
  | 'custom';

export type TransactionSortBy =
  | 'newest'
  | 'oldest'
  | 'highest_amount'
  | 'lowest_amount';

export interface TransactionFilterState {
  datePreset: DateFilterPreset;
  customStartDate: string;
  customEndDate: string;
  selectedYears: number[]; // empty = all years
  categoryIds: string[]; // empty = all categories
  paymentMethodIds: string[]; // empty = all payment methods
  tagIds: string[]; // empty = all tags
  currencyCode: string | 'all';
  sortBy: TransactionSortBy;
}

export interface CurrencySummary {
  currencyCode: string;
  openingBalanceMinor: number;
  totalIncomeMinor: number;
  totalExpensesMinor: number;
  netMovementMinor: number;
  currentBalanceMinor: number;
}

export interface FinancialSummary {
  currencyCode: string;
  openingBalanceMinor: number;
  totalIncomeMinor: number;
  totalExpensesMinor: number;
  netMovementMinor: number;
  currentBalanceMinor: number;
}

export interface PeriodComparison {
  currentValueMinor: number;
  previousValueMinor: number;
  percentageChange: number | null; // null when previous period has zero baseline
  direction: 'up' | 'down' | 'flat';
  comparisonLabel: string;
}

export interface TrendPoint {
  label: string;
  date: string;
  valueMinor: number;
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
  currencyCode: string;
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

export interface ComparisonBucket {
  key: string;
  label: string;
  incomeMinor: number;
  expenseMinor: number;
}

export type TrendBucketMode = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface SpendingTrendPoint {
  key: string;
  label: string;
  detailLabel: string;
  amountMinor: number;
}

export interface SpendingTrendSeries {
  mode: TrendBucketMode;
  subtitle: string;
  points: SpendingTrendPoint[];
}

export interface LargestExpenseInsight {
  id: string;
  title: string;
  amountMinor: number;
  transactionDate: string;
  categoryName: string;
}

export interface ReportAnalytics {
  currencyCode: string;
  startDate: string;
  endDate: string;
  totalIncomeMinor: number;
  totalExpensesMinor: number;
  netMovementMinor: number;
  transactionCount: number;
  incomeTransactionCount: number;
  expenseTransactionCount: number;
  averageDailyExpenseMinor: number;
  highestSpendingDay: { date: string; amountMinor: number } | null;
  highestSpendingCategory: CategoryBreakdownItem | null;
  largestExpenseTransaction: LargestExpenseInsight | null;
  categoryBreakdown: CategoryBreakdownItem[];
  comparisonBuckets: ComparisonBucket[];
  spendingTrend: SpendingTrendSeries;
}

export type BudgetHealthStatus = 'healthy' | 'warning' | 'exceeded';

export interface BudgetProgress {
  budget: Budget;
  categoryName: string | null;
  categoryColor: string | null;
  categoryIcon: string | null;
  categoryImageUri: string | null;
  periodStartDate: string;
  periodEndDate: string;
  nextPeriodStartDate: string | null;
  nextPeriodEndDate: string | null;
  monthlyContributionMinor: number | null;
  dailyAverageSpentMinor: number;
  spentMinor: number;
  remainingMinor: number;
  percentageUsed: number;
  isExceeded: boolean;
  status: BudgetHealthStatus;
}

export interface BudgetOverviewStats {
  currencyCode: string;
  periodStartDate: string;
  periodEndDate: string;
  totalBudgetMinor: number;
  totalSpentMinor: number;
  remainingMinor: number;
  percentageUsed: number;
  status: BudgetHealthStatus;
  hasAnyBudget: boolean;
  hasExpenseData: boolean;
  dailyAverageSpentMinor: number;
  highestSpendingCategory: CategoryBreakdownItem | null;
  spendingTrend: SpendingTrendSeries;
  monthlyContributionMinor: number | null;
}
