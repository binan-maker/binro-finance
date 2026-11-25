import { describe, expect, test } from 'bun:test';

import {
  buildReportAnalytics,
  calculatePeriodComparison,
  filterAndSortTransactions,
  getAvailableTransactionYears,
} from '@/services/calculations/financialCalculations';
import type { Category, PaymentMethodRecord, Transaction } from '@/types/models';
import type { TransactionFilterState } from '@/types/reports';
import {
  formatTransactionDateTimeRowLabel,
  normalizeDateRange,
  resolveDatePresetRange,
} from '@/utils/date';
import { formatMoney } from '@/utils/money';

const CATEGORIES: Category[] = [
  {
    id: 'cat-food',
    name: 'Food & Dining',
    type: 'expense',
    color: '#EF4444',
    icon: 'restaurant',
    parentId: null,
    isDefault: true,
    isArchived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'cat-coffee',
    name: 'Coffee',
    type: 'expense',
    color: '#F59E0B',
    icon: 'cafe',
    parentId: 'cat-food',
    isDefault: false,
    isArchived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'cat-salary',
    name: 'Salary',
    type: 'income',
    color: '#10B981',
    icon: 'cash',
    parentId: null,
    isDefault: true,
    isArchived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const PAYMENT_METHODS: PaymentMethodRecord[] = [
  {
    id: 'pm-upi',
    name: 'UPI',
    icon: 'flash',
    isBuiltin: true,
    isArchived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'pm-custom-wallet',
    name: 'Travel Card',
    icon: 'card',
    isBuiltin: false,
    isArchived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

function makeTx(overrides: Partial<Transaction> & { id: string }): Transaction {
  return {
    type: 'expense',
    title: 'Sample',
    amountMinor: 1000,
    currencyCode: 'INR',
    categoryId: 'cat-food',
    categoryNameSnapshot: 'Food & Dining',
    paymentMethodId: 'pm-upi',
    paymentMethod: 'UPI',
    tagIds: [],
    transactionDate: '2026-11-25',
    note: null,
    createdAt: '2026-11-25T10:15:00.000Z',
    updatedAt: '2026-11-25T10:15:00.000Z',
    ...overrides,
  };
}

const BASE_FILTERS: TransactionFilterState = {
  datePreset: 'all_time',
  customStartDate: '2026-11-01',
  customEndDate: '2026-11-25',
  selectedYears: [],
  categoryIds: [],
  paymentMethodIds: [],
  tagIds: [],
  currencyCode: 'all',
  sortBy: 'newest',
};

describe('V2 Refinements: Filters, Dynamic Years, Dashboard Comparison & Reports Analytics', () => {
  test('normalizes reversed custom date ranges safely and resolves all 8 date presets', () => {
    const normalized = normalizeDateRange('2026-11-25', '2026-11-01');
    expect(normalized.startDate).toBe('2026-11-01');
    expect(normalized.endDate).toBe('2026-11-25');
    expect(normalized.wasReversed).toBe(true);

    expect(
      resolveDatePresetRange({ preset: 'today', referenceToday: '2026-11-25' }),
    ).toEqual({ startDate: '2026-11-25', endDate: '2026-11-25' });

    expect(
      resolveDatePresetRange({ preset: 'yesterday', referenceToday: '2026-11-25' }),
    ).toEqual({ startDate: '2026-11-24', endDate: '2026-11-24' });

    expect(
      resolveDatePresetRange({ preset: 'last_7', referenceToday: '2026-11-25' }),
    ).toEqual({ startDate: '2026-11-19', endDate: '2026-11-25' });

    expect(
      resolveDatePresetRange({ preset: 'last_30', referenceToday: '2026-11-25' }),
    ).toEqual({ startDate: '2026-10-27', endDate: '2026-11-25' });

    expect(
      resolveDatePresetRange({ preset: 'this_month', referenceToday: '2026-11-25' }),
    ).toEqual({ startDate: '2026-11-01', endDate: '2026-11-30' });

    expect(
      resolveDatePresetRange({ preset: 'this_year', referenceToday: '2026-11-25' }),
    ).toEqual({ startDate: '2026-01-01', endDate: '2026-12-31' });

    expect(
      resolveDatePresetRange({
        preset: 'custom',
        referenceToday: '2026-11-25',
        customStartDate: '2026-11-20',
        customEndDate: '2026-11-05',
      }),
    ).toEqual({ startDate: '2026-11-05', endDate: '2026-11-20' });
  });

  test('derives available years dynamically from actual transaction dates plus current year', () => {
    const txs: Transaction[] = [
      makeTx({ id: 't1', transactionDate: '2021-04-02' }),
      makeTx({ id: 't2', transactionDate: '2026-11-25' }),
      makeTx({ id: 't3', transactionDate: '2028-02-14' }),
    ];
    expect(getAvailableTransactionYears(txs, 2026)).toEqual([2028, 2026, 2021]);
    expect(getAvailableTransactionYears([], 2027)).toEqual([2027]);
  });

  test('filters by preset, reversed custom range, subcategories, custom payment methods, years, and sorts properly', () => {
    const txs: Transaction[] = [
      makeTx({
        id: 't1',
        title: 'Latte',
        amountMinor: 450,
        categoryId: 'cat-coffee',
        categoryNameSnapshot: 'Coffee',
        paymentMethodId: 'pm-custom-wallet',
        paymentMethod: 'Travel Card',
        transactionDate: '2026-11-24',
        createdAt: '2026-11-24T09:00:00.000Z',
      }),
      makeTx({
        id: 't2',
        title: 'Dinner',
        amountMinor: 2500,
        categoryId: 'cat-food',
        paymentMethodId: 'pm-upi',
        paymentMethod: 'UPI',
        transactionDate: '2026-11-25',
        createdAt: '2026-11-25T20:00:00.000Z',
      }),
      makeTx({
        id: 't3',
        type: 'income',
        title: 'Bonus',
        amountMinor: 50000,
        categoryId: 'cat-salary',
        categoryNameSnapshot: 'Salary',
        paymentMethodId: 'pm-upi',
        paymentMethod: 'UPI',
        transactionDate: '2024-06-15',
        createdAt: '2024-06-15T12:00:00.000Z',
      }),
    ];

    // Selecting parent category "Food & Dining" also matches child category "Coffee"
    const foodFiltered = filterAndSortTransactions({
      transactions: txs,
      categories: CATEGORIES,
      paymentMethods: PAYMENT_METHODS,
      filters: {
        ...BASE_FILTERS,
        categoryIds: ['cat-food'],
        sortBy: 'highest_amount',
      },
      referenceToday: '2026-11-25',
    });
    expect(foodFiltered.map((t) => t.id)).toEqual(['t2', 't1']);

    // Custom payment method + reversed custom range
    const pmAndReversedRange = filterAndSortTransactions({
      transactions: txs,
      categories: CATEGORIES,
      paymentMethods: PAYMENT_METHODS,
      filters: {
        ...BASE_FILTERS,
        datePreset: 'custom',
        customStartDate: '2026-11-25',
        customEndDate: '2026-11-20',
        paymentMethodIds: ['pm-custom-wallet'],
      },
      referenceToday: '2026-11-25',
    });
    expect(pmAndReversedRange.map((t) => t.id)).toEqual(['t1']);

    // Year filter + lowest_amount sort
    const yearFiltered = filterAndSortTransactions({
      transactions: txs,
      categories: CATEGORIES,
      paymentMethods: PAYMENT_METHODS,
      filters: {
        ...BASE_FILTERS,
        selectedYears: [2024],
        sortBy: 'lowest_amount',
      },
      referenceToday: '2026-11-25',
    });
    expect(yearFiltered.map((t) => t.id)).toEqual(['t3']);
  });

  test('computes period comparison percentage to 2 decimal places', () => {
    const txs: Transaction[] = [
      makeTx({
        id: 'prev',
        type: 'income',
        amountMinor: 10000,
        transactionDate: '2026-10-10',
      }),
      makeTx({
        id: 'curr',
        type: 'income',
        amountMinor: 11215,
        transactionDate: '2026-11-10',
      }),
    ];
    const cmp = calculatePeriodComparison({
      transactions: txs,
      currencyCode: 'INR',
      startDate: '2026-11-01',
      endDate: '2026-11-25',
      previousStartDate: '2026-10-01',
      previousEndDate: '2026-10-25',
      comparisonLabel: 'from last month',
    });
    expect(cmp.direction).toBe('up');
    expect(cmp.percentageChange).toBe(12.15);
  });

  test('builds dynamic report analytics across granularities, hourly/daily/yearly trends, and empty ranges', () => {
    const txs: Transaction[] = [
      makeTx({
        id: 'inc1',
        type: 'income',
        title: 'Salary',
        amountMinor: 100000,
        categoryId: 'cat-salary',
        categoryNameSnapshot: 'Salary',
        transactionDate: '2026-11-01',
        createdAt: '2026-11-01T09:00:00',
      }),
      makeTx({
        id: 'exp1',
        type: 'expense',
        title: 'Morning Coffee',
        amountMinor: 350,
        categoryId: 'cat-coffee',
        categoryNameSnapshot: 'Coffee',
        transactionDate: '2026-11-25',
        createdAt: '2026-11-25T08:30:00',
      }),
      makeTx({
        id: 'exp2',
        type: 'expense',
        title: 'Team Lunch',
        amountMinor: 4200,
        categoryId: 'cat-food',
        categoryNameSnapshot: 'Food & Dining',
        transactionDate: '2026-11-25',
        createdAt: '2026-11-25T13:15:00',
      }),
      makeTx({
        id: 'usd1',
        type: 'expense',
        title: 'USD Cloud',
        amountMinor: 9900,
        currencyCode: 'USD',
        categoryId: 'cat-food',
        transactionDate: '2026-11-25',
      }),
    ];

    // Single-day range produces 24-hour trend
    const singleDay = buildReportAnalytics({
      transactions: txs,
      categories: CATEGORIES,
      currencyCode: 'INR',
      startDate: '2026-11-25',
      endDate: '2026-11-25',
      granularity: 'daily',
    });
    expect(singleDay.spendingTrend.mode).toBe('hourly');
    expect(singleDay.spendingTrend.points.length).toBe(24);
    expect(singleDay.spendingTrend.points[8].amountMinor).toBe(350);
    expect(singleDay.spendingTrend.points[13].amountMinor).toBe(4200);
    expect(singleDay.totalExpensesMinor).toBe(4550); // USD transaction excluded
    expect(singleDay.largestExpenseTransaction?.id).toBe('exp2');

    // Monthly granularity over November produces 1 comparison bucket
    const monthlyComparison = buildReportAnalytics({
      transactions: txs,
      categories: CATEGORIES,
      currencyCode: 'INR',
      startDate: '2026-11-01',
      endDate: '2026-11-30',
      granularity: 'monthly',
    });
    expect(monthlyComparison.comparisonBuckets.length).toBe(1);
    expect(monthlyComparison.comparisonBuckets[0].incomeMinor).toBe(100000);
    expect(monthlyComparison.comparisonBuckets[0].expenseMinor).toBe(4550);
    expect(monthlyComparison.incomeTransactionCount).toBe(1);
    expect(monthlyComparison.expenseTransactionCount).toBe(2);

    // Multi-year range yields yearly spending trend
    const multiYear = buildReportAnalytics({
      transactions: txs,
      categories: CATEGORIES,
      currencyCode: 'INR',
      startDate: '2023-01-01',
      endDate: '2026-11-30',
      granularity: 'monthly',
    });
    expect(multiYear.spendingTrend.mode).toBe('yearly');
    expect(multiYear.spendingTrend.points.map((p) => p.label)).toEqual([
      '2023',
      '2024',
      '2025',
      '2026',
    ]);

    // Empty range stays zeroed without fabricating values
    const emptyRange = buildReportAnalytics({
      transactions: txs,
      categories: CATEGORIES,
      currencyCode: 'INR',
      startDate: '2025-01-01',
      endDate: '2025-01-31',
      granularity: 'weekly',
    });
    expect(emptyRange.transactionCount).toBe(0);
    expect(emptyRange.totalIncomeMinor).toBe(0);
    expect(emptyRange.totalExpensesMinor).toBe(0);
    expect(emptyRange.highestSpendingCategory).toBeNull();
    expect(emptyRange.highestSpendingDay).toBeNull();
    expect(emptyRange.largestExpenseTransaction).toBeNull();
  });

  test('formats balance money with symbolSpace and formats Home transaction row date/time labels', () => {
    expect(formatMoney(200000, 'USD', { symbolSpace: true })).toBe('$ 2,000.00');
    expect(formatMoney(123450, 'INR', { symbolSpace: true })).toBe('₹ 1,234.50');
    expect(formatMoney(-500, 'USD', { symbolSpace: true })).toBe('-$ 5.00');

    const localTodayEvening = new Date(2026, 10, 25, 20, 15, 0).toISOString();
    const localYesterdayEvening = new Date(2026, 10, 24, 17, 27, 0).toISOString();
    const localOlderMorning = new Date(2026, 10, 10, 10, 30, 0).toISOString();

    expect(
      formatTransactionDateTimeRowLabel(
        '2026-11-25',
        localTodayEvening,
        'DD MMM YYYY',
        '2026-11-25',
      ),
    ).toBe('Today, 08:15 PM');
    expect(
      formatTransactionDateTimeRowLabel(
        '2026-11-24',
        localYesterdayEvening,
        'DD MMM YYYY',
        '2026-11-25',
      ),
    ).toBe('Yesterday, 05:27 PM');
    expect(
      formatTransactionDateTimeRowLabel(
        '2026-11-10',
        localOlderMorning,
        'DD MMM YYYY',
        '2026-11-25',
      ),
    ).toBe('10 Nov 2026, 10:30 AM');
  });
});
