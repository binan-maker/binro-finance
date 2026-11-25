import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, test } from 'bun:test';

import {
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
} from '@/constants/categories';
import type { SqlBindValue, SqlDatabaseAdapter } from '@/database/driver';
import { runMigrations } from '@/database/migrations';
import { createRepositories } from '@/database/repositories/factory';
import {
  calculateBudgetProgress,
  calculatePeriodSummary,
  summarizeTransactions,
} from '@/services/calculations/financialCalculations';

function createBunSqliteAdapter(): SqlDatabaseAdapter {
  const raw = new Database(':memory:');

  return {
    async execAsync(source: string) {
      raw.exec(source);
    },
    async runAsync(source: string, ...params: SqlBindValue[]) {
      const stmt = raw.prepare(source);
      const res = stmt.run(...params);
      return {
        changes: res.changes,
        lastInsertRowId: Number(res.lastInsertRowid),
      };
    },
    async getFirstAsync<T>(source: string, ...params: SqlBindValue[]) {
      const stmt = raw.prepare(source);
      return (stmt.get(...params) as T | undefined) ?? null;
    },
    async getAllAsync<T>(source: string, ...params: SqlBindValue[]) {
      const stmt = raw.prepare(source);
      return stmt.all(...params) as T[];
    },
    async withTransactionAsync(task: () => Promise<void>) {
      raw.exec('BEGIN');
      try {
        await task();
        raw.exec('COMMIT');
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

describe('SQLite migrations, repositories & calculations', () => {
  let db: SqlDatabaseAdapter;
  let repos: ReturnType<typeof createRepositories>;

  beforeEach(async () => {
    db = createBunSqliteAdapter();
    await runMigrations(db);
    repos = createRepositories(async () => db);
  });

  test('runs migrations idempotently and seeds default categories and settings without duplicates', async () => {
    // Run migrations a second time simulating app restart
    const version = await runMigrations(db);
    expect(version).toBe(1);

    const categories = await repos.categories.getAll({ includeArchived: true });
    const expectedCount =
      DEFAULT_EXPENSE_CATEGORIES.length + DEFAULT_INCOME_CATEGORIES.length;
    expect(categories.length).toBe(expectedCount);

    const settings = await repos.settings.get();
    expect(settings.currencyCode).toBe('INR');
    expect(settings.openingBalanceMinor).toBe(0);
    expect(settings.theme).toBe('system');
    expect(settings.onboardingCompleted).toBe(false);
  });

  test('supports onboarding & settings updates without altering transactions', async () => {
    await repos.transactions.create({
      type: 'income',
      title: 'Salary',
      amountMinor: 500000,
      categoryId: 'cat-inc-salary',
      categoryNameSnapshot: 'Salary',
      paymentMethod: 'Bank transfer',
      transactionDate: '2026-11-01',
    });

    const updated = await repos.settings.update({
      currencyCode: 'USD',
      openingBalanceMinor: 100000,
      theme: 'dark',
      dateFormat: 'YYYY-MM-DD',
      onboardingCompleted: true,
    });

    expect(updated).toEqual({
      id: 1,
      currencyCode: 'USD',
      openingBalanceMinor: 100000,
      theme: 'dark',
      dateFormat: 'YYYY-MM-DD',
      onboardingCompleted: true,
    });

    const txs = await repos.transactions.getAll();
    const summary = summarizeTransactions(txs, updated.openingBalanceMinor);
    expect(summary.currentBalanceMinor).toBe(600000);
    expect(summary.totalIncomeMinor).toBe(500000);
    expect(summary.openingBalanceMinor).toBe(100000);
  });

  test('creates, filters, updates, and deletes transactions accurately', async () => {
    const tx1 = await repos.transactions.create({
      type: 'expense',
      title: 'Groceries',
      amountMinor: 45050,
      categoryId: 'cat-exp-food',
      categoryNameSnapshot: 'Food and Dining',
      paymentMethod: 'UPI',
      transactionDate: '2026-11-10',
      note: 'Weekly market',
    });

    await repos.transactions.create({
      type: 'income',
      title: 'Freelance Design',
      amountMinor: 150000,
      categoryId: 'cat-inc-freelance',
      categoryNameSnapshot: 'Freelance',
      paymentMethod: 'Bank transfer',
      transactionDate: '2026-11-12',
    });

    const filteredBySearch = await repos.transactions.getAll({ search: 'market' });
    expect(filteredBySearch.length).toBe(1);
    expect(filteredBySearch[0].id).toBe(tx1.id);

    const filteredByType = await repos.transactions.getAll({ type: 'expense' });
    expect(filteredByType.length).toBe(1);

    const updated = await repos.transactions.update(tx1.id, {
      amountMinor: 50000,
      title: 'Supermarket',
    });
    expect(updated.amountMinor).toBe(50000);
    expect(updated.title).toBe('Supermarket');

    await repos.transactions.delete(tx1.id);
    const afterDelete = await repos.transactions.getById(tx1.id);
    expect(afterDelete).toBeNull();
  });

  test('upserts overall and category monthly budgets without duplicates and calculates progress', async () => {
    const overall1 = await repos.budgets.upsert({
      amountMinor: 200000,
      month: 11,
      year: 2026,
      categoryId: null,
    });
    const overall2 = await repos.budgets.upsert({
      amountMinor: 250000,
      month: 11,
      year: 2026,
      categoryId: null,
    });

    expect(overall2.id).toBe(overall1.id);
    expect(overall2.amountMinor).toBe(250000);

    const foodBudget = await repos.budgets.upsert({
      amountMinor: 50000,
      month: 11,
      year: 2026,
      categoryId: 'cat-exp-food',
    });

    await repos.transactions.create({
      type: 'expense',
      title: 'Dinner',
      amountMinor: 60000,
      categoryId: 'cat-exp-food',
      categoryNameSnapshot: 'Food and Dining',
      paymentMethod: 'Card',
      transactionDate: '2026-11-15',
    });

    const allBudgets = await repos.budgets.getByMonthYear(11, 2026);
    expect(allBudgets.length).toBe(2);

    const txs = await repos.transactions.getAll();
    const foodCat = await repos.categories.getById('cat-exp-food');
    const progress = calculateBudgetProgress({
      budget: foodBudget,
      transactions: txs,
      category: foodCat,
    });

    expect(progress.spentMinor).toBe(60000);
    expect(progress.remainingMinor).toBe(-10000);
    expect(progress.isExceeded).toBe(true);
    expect(progress.percentageUsed).toBe(120);
  });

  test('calculates period summary and exports/restores backup without duplicate records', async () => {
    await repos.settings.update({
      currencyCode: 'INR',
      openingBalanceMinor: 10000,
      onboardingCompleted: true,
    });

    await repos.transactions.create({
      type: 'expense',
      title: 'Cab',
      amountMinor: 3500,
      categoryId: 'cat-exp-transport',
      categoryNameSnapshot: 'Transportation',
      paymentMethod: 'Cash',
      transactionDate: '2026-11-05',
    });

    const txs = await repos.transactions.getAll();
    const cats = await repos.categories.getAll();
    const periodSummary = calculatePeriodSummary({
      transactions: txs,
      categories: cats,
      startDate: '2026-11-01',
      endDate: '2026-11-30',
    });
    expect(periodSummary.totalExpensesMinor).toBe(3500);
    expect(periodSummary.highestSpendingCategory?.categoryName).toBe('Transportation');
    expect(periodSummary.highestSpendingDay).toEqual({
      date: '2026-11-05',
      amountMinor: 3500,
    });

    const exported = await repos.backup.exportAll('1.0.0');
    expect(exported.transactions.length).toBe(1);

    // Merge restore on existing database should skip duplicates
    const mergeResult = await repos.backup.restoreFromBackup(exported, 'merge');
    expect(mergeResult.transactionsInserted).toBe(0);
    expect(mergeResult.transactionsSkipped).toBe(1);

    // Clear all local data resets transactions and onboarding flag while preserving default categories
    await repos.backup.clearAllData();
    const txsAfterClear = await repos.transactions.getAll();
    const settingsAfterClear = await repos.settings.get();
    const catsAfterClear = await repos.categories.getAll();
    expect(txsAfterClear.length).toBe(0);
    expect(settingsAfterClear.onboardingCompleted).toBe(false);
    expect(catsAfterClear.length).toBe(
      DEFAULT_EXPENSE_CATEGORIES.length + DEFAULT_INCOME_CATEGORIES.length,
    );
  });
});
