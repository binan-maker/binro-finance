import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, test } from 'bun:test';

import {
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  DEFAULT_PAYMENT_METHODS,
} from '@/constants/categories';
import type { SqlBindValue, SqlDatabaseAdapter } from '@/database/driver';
import { runMigrations } from '@/database/migrations';
import { createRepositories } from '@/database/repositories/factory';
import {
  calculateBudgetProgress,
  calculatePeriodSummary,
  summarizeByCurrency,
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

describe('SQLite V2 migrations, repositories & multi-currency calculations', () => {
  let db: SqlDatabaseAdapter;
  let repos: ReturnType<typeof createRepositories>;

  beforeEach(async () => {
    db = createBunSqliteAdapter();
    await runMigrations(db);
    repos = createRepositories(async () => db);
  });

  test('runs V3 migrations idempotently and seeds V2/V3 categories, payment methods, and settings', async () => {
    const version = await runMigrations(db);
    expect(version).toBe(3);

    const categories = await repos.categories.getAll({ includeArchived: true });
    const expectedCount =
      DEFAULT_EXPENSE_CATEGORIES.length + DEFAULT_INCOME_CATEGORIES.length;
    expect(categories.length).toBe(expectedCount);

    const paymentMethods = await repos.paymentMethods.getAll({ includeArchived: true });
    expect(paymentMethods.length).toBe(DEFAULT_PAYMENT_METHODS.length);

    const settings = await repos.settings.get();
    expect(settings.currencyCode).toBe('INR');
    expect(settings.openingBalanceCurrencyCode).toBe('INR');
    expect(settings.openingBalanceMinor).toBe(0);
    expect(settings.theme).toBe('system');
    expect(settings.onboardingCompleted).toBe(false);
    expect(settings.currencyInitialized).toBe(false);
  });

  test('safely upgrades a simulated V1 database to V2 without data loss', async () => {
    const v1Db = createBunSqliteAdapter();
    await v1Db.execAsync(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE app_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        currency_code TEXT NOT NULL DEFAULT 'INR',
        opening_balance_minor INTEGER NOT NULL DEFAULT 0,
        theme TEXT NOT NULL DEFAULT 'system',
        date_format TEXT NOT NULL DEFAULT 'DD MMM YYYY',
        onboarding_completed INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE categories (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
        icon TEXT NOT NULL,
        color TEXT NOT NULL,
        is_default INTEGER NOT NULL DEFAULT 0,
        is_archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE transactions (
        id TEXT PRIMARY KEY NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
        title TEXT NOT NULL,
        amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
        category_id TEXT,
        category_name_snapshot TEXT NOT NULL,
        payment_method TEXT NOT NULL,
        transaction_date TEXT NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE budgets (
        id TEXT PRIMARY KEY NOT NULL,
        amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
        period TEXT NOT NULL DEFAULT 'monthly',
        month INTEGER NOT NULL,
        year INTEGER NOT NULL,
        category_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX idx_budgets_unique_scope ON budgets(period, year, month, COALESCE(category_id, ''));
      PRAGMA user_version = 1;
    `);

    const now = '2026-10-01T10:00:00.000Z';
    await v1Db.runAsync(
      "INSERT INTO app_settings (id, currency_code, opening_balance_minor, theme, date_format, onboarding_completed) VALUES (1, 'USD', 25000, 'dark', 'YYYY-MM-DD', 1)",
    );
    await v1Db.runAsync(
      "INSERT INTO categories VALUES ('cat-exp-food', 'Food', 'expense', 'utensils', '#E65100', 1, 0, ?, ?)",
      now,
      now,
    );
    await v1Db.runAsync(
      "INSERT INTO categories VALUES ('cat-exp-bills', 'Bills', 'expense', 'zap', '#00838F', 1, 0, ?, ?)",
      now,
      now,
    );
    await v1Db.runAsync(
      "INSERT INTO transactions VALUES ('v1-tx-1', 'expense', 'V1 Lunch', 1500, 'cat-exp-food', 'Food', 'UPI', '2026-10-05', 'Old note', ?, ?)",
      now,
      now,
    );
    await v1Db.runAsync(
      "INSERT INTO transactions VALUES ('v1-tx-other', 'expense', 'Legacy Other', 900, 'cat-exp-bills', 'Bills', 'Other', '2026-10-06', NULL, ?, ?)",
      now,
      now,
    );
    await v1Db.runAsync(
      "INSERT INTO budgets VALUES ('v1-b-1', 50000, 'monthly', 10, 2026, NULL, ?, ?)",
      now,
      now,
    );

    const upgradedVersion = await runMigrations(v1Db);
    expect(upgradedVersion).toBe(3);

    const upgradedRepos = createRepositories(async () => v1Db);
    const settings = await upgradedRepos.settings.get();
    expect(settings.currencyCode).toBe('USD');
    expect(settings.openingBalanceCurrencyCode).toBe('USD');
    expect(settings.openingBalanceMinor).toBe(25000);

    const cats = await upgradedRepos.categories.getAll();
    expect(cats.find((c) => c.id === 'cat-exp-food')?.name).toBe('Food & Drink');
    expect(cats.find((c) => c.id === 'cat-exp-bills')?.name).toBe('Utilities');
    expect(cats.some((c) => c.id === 'cat-exp-travel')).toBe(true);
    expect(cats.some((c) => c.id === 'cat-inc-business')).toBe(true);

    const tx1 = await upgradedRepos.transactions.getById('v1-tx-1');
    expect(tx1?.currencyCode).toBe('USD');
    expect(tx1?.paymentMethodId).toBe('pm-upi');
    expect(tx1?.paymentMethod).toBe('UPI');

    // Legacy 'Other' transaction preserves exact historical string
    const txOther = await upgradedRepos.transactions.getById('v1-tx-other');
    expect(txOther?.paymentMethod).toBe('Other');
    expect(txOther?.paymentMethodId).toBeNull();

    const budgets = await upgradedRepos.budgets.getAll();
    expect(budgets.length).toBe(1);
    expect(budgets[0].currencyCode).toBe('USD');
  });

  test('changing default currency preserves historical transaction currencies & opening balance currency', async () => {
    await repos.transactions.create({
      type: 'income',
      title: 'INR Salary',
      amountMinor: 500000,
      currencyCode: 'INR',
      categoryId: 'cat-inc-salary',
      categoryNameSnapshot: 'Salary',
      paymentMethodId: 'pm-bank',
      paymentMethod: 'Bank Transfer',
      transactionDate: '2026-11-01',
    });

    await repos.transactions.create({
      type: 'expense',
      title: 'USD SaaS',
      amountMinor: 2500,
      currencyCode: 'USD',
      categoryId: 'cat-exp-bills',
      categoryNameSnapshot: 'Utilities',
      paymentMethodId: 'pm-card',
      paymentMethod: 'Card',
      transactionDate: '2026-11-02',
    });

    const updated = await repos.settings.update({
      currencyCode: 'EUR',
      openingBalanceMinor: 100000,
      openingBalanceCurrencyCode: 'INR',
      theme: 'dark',
      dateFormat: 'YYYY-MM-DD',
      onboardingCompleted: true,
    });

    expect(updated.currencyCode).toBe('EUR');
    expect(updated.openingBalanceCurrencyCode).toBe('INR');

    const txs = await repos.transactions.getAll();
    expect(txs.find((t) => t.title === 'INR Salary')?.currencyCode).toBe('INR');
    expect(txs.find((t) => t.title === 'USD SaaS')?.currencyCode).toBe('USD');

    const byCurrency = summarizeByCurrency(txs, updated);
    const inrSummary = byCurrency.find((s) => s.currencyCode === 'INR');
    const usdSummary = byCurrency.find((s) => s.currencyCode === 'USD');
    expect(inrSummary?.currentBalanceMinor).toBe(600000);
    expect(usdSummary?.totalExpensesMinor).toBe(2500);
    expect(usdSummary?.openingBalanceMinor).toBe(0);
  });

  test('supports multi-tag assignment, filtering, search, and non-interference with category budgets', async () => {
    const workTag = await repos.tags.create({ name: 'Work', color: '#10B981' });
    const travelTag = await repos.tags.create({ name: 'Trip', color: '#0891B2' });

    const tx1 = await repos.transactions.create({
      type: 'expense',
      title: 'Airport Taxi',
      amountMinor: 45050,
      currencyCode: 'INR',
      categoryId: 'cat-exp-transport',
      categoryNameSnapshot: 'Transport',
      paymentMethodId: 'pm-upi',
      paymentMethod: 'UPI',
      tagIds: [workTag.id, travelTag.id],
      transactionDate: '2026-11-10',
      note: 'Client visit',
    });

    await repos.transactions.create({
      type: 'income',
      title: 'Freelance Design',
      amountMinor: 150000,
      currencyCode: 'INR',
      categoryId: 'cat-inc-freelance',
      categoryNameSnapshot: 'Freelance',
      paymentMethodId: 'pm-bank',
      paymentMethod: 'Bank Transfer',
      tagIds: [workTag.id],
      transactionDate: '2026-11-12',
    });

    const filteredByTag = await repos.transactions.getAll({ tagIds: [travelTag.id] });
    expect(filteredByTag.length).toBe(1);
    expect(filteredByTag[0].id).toBe(tx1.id);
    expect([...(filteredByTag[0].tagIds ?? [])].sort()).toEqual(
      [workTag.id, travelTag.id].sort(),
    );

    const filteredByTagSearch = await repos.transactions.getAll({ search: 'trip' });
    expect(filteredByTagSearch.length).toBe(1);
    expect(filteredByTagSearch[0].id).toBe(tx1.id);

    const updated = await repos.transactions.update(tx1.id, {
      amountMinor: 50000,
      title: 'Airport Cab',
      tagIds: [workTag.id],
    });
    expect(updated.amountMinor).toBe(50000);
    expect(updated.tagIds).toEqual([workTag.id]);

    // Deleting a tag unlinks it cleanly without deleting the transaction
    await repos.tags.delete(workTag.id);
    const afterTagDelete = await repos.transactions.getById(tx1.id);
    expect(afterTagDelete?.tagIds).toEqual([]);
  });

  test('supports subcategories (1-level) and preserves historical category snapshot on rename/archive', async () => {
    const coffeeSub = await repos.categories.create({
      name: 'Coffee Shops',
      type: 'expense',
      parentId: 'cat-exp-food',
      icon: 'coffee',
      color: '#059669',
    });
    expect(coffeeSub.parentId).toBe('cat-exp-food');

    const tx = await repos.transactions.create({
      type: 'expense',
      title: 'Cold Brew',
      amountMinor: 35000,
      currencyCode: 'INR',
      categoryId: coffeeSub.id,
      categoryNameSnapshot: coffeeSub.name,
      paymentMethodId: 'pm-card',
      paymentMethod: 'Card',
      transactionDate: '2026-11-18',
    });

    await repos.categories.update(coffeeSub.id, { name: 'Specialty Cafe', isArchived: true });
    const afterRename = await repos.transactions.getById(tx.id);
    expect(afterRename?.categoryNameSnapshot).toBe('Coffee Shops');
  });

  test('supports custom payment methods while preserving historical transaction labels', async () => {
    const customPm = await repos.paymentMethods.create({
      name: 'Corporate Card',
      icon: 'card',
    });
    const tx = await repos.transactions.create({
      type: 'expense',
      title: 'Hotel Stay',
      amountMinor: 800000,
      currencyCode: 'INR',
      categoryId: 'cat-exp-travel',
      categoryNameSnapshot: 'Travel',
      paymentMethodId: customPm.id,
      paymentMethod: customPm.name,
      transactionDate: '2026-11-19',
    });

    await repos.paymentMethods.update(customPm.id, { name: 'Old Corp Card', isArchived: true });
    const afterPmUpdate = await repos.transactions.getById(tx.id);
    expect(afterPmUpdate?.paymentMethod).toBe('Corporate Card');
  });

  test('upserts currency-scoped budgets without mixing distinct currencies', async () => {
    const inrBudget = await repos.budgets.upsert({
      amountMinor: 50000,
      currencyCode: 'INR',
      month: 11,
      year: 2026,
      categoryId: 'cat-exp-food',
    });
    const usdBudget = await repos.budgets.upsert({
      amountMinor: 50000,
      currencyCode: 'USD',
      month: 11,
      year: 2026,
      categoryId: 'cat-exp-food',
    });
    expect(inrBudget.id).not.toBe(usdBudget.id);

    await repos.transactions.create({
      type: 'expense',
      title: 'INR Dinner',
      amountMinor: 60000,
      currencyCode: 'INR',
      categoryId: 'cat-exp-food',
      categoryNameSnapshot: 'Food & Drink',
      paymentMethod: 'Card',
      transactionDate: '2026-11-15',
    });
    await repos.transactions.create({
      type: 'expense',
      title: 'USD Dinner',
      amountMinor: 1000,
      currencyCode: 'USD',
      categoryId: 'cat-exp-food',
      categoryNameSnapshot: 'Food & Drink',
      paymentMethod: 'Card',
      transactionDate: '2026-11-15',
    });

    const txs = await repos.transactions.getAll();
    const foodCat = await repos.categories.getById('cat-exp-food');
    const inrProgress = calculateBudgetProgress({
      budget: inrBudget,
      transactions: txs,
      category: foodCat,
    });
    expect(inrProgress.spentMinor).toBe(60000);
    expect(inrProgress.isExceeded).toBe(true);

    const usdProgress = calculateBudgetProgress({
      budget: usdBudget,
      transactions: txs,
      category: foodCat,
    });
    expect(usdProgress.spentMinor).toBe(1000);
    expect(usdProgress.isExceeded).toBe(false);
  });

  test('exports V2 backup, restores V1/V2 backups without duplicates, and manages notifications', async () => {
    await repos.settings.update({
      currencyCode: 'INR',
      openingBalanceMinor: 10000,
      openingBalanceCurrencyCode: 'INR',
      onboardingCompleted: true,
    });
    const tag = await repos.tags.create({ name: 'Essential', color: '#10B981' });
    await repos.transactions.create({
      type: 'expense',
      title: 'Cab',
      amountMinor: 3500,
      currencyCode: 'INR',
      categoryId: 'cat-exp-transport',
      categoryNameSnapshot: 'Transport',
      paymentMethodId: 'pm-cash',
      paymentMethod: 'Cash',
      tagIds: [tag.id],
      transactionDate: '2026-11-05',
    });

    const n1 = await repos.notifications.create({
      type: 'backup',
      title: 'Exported',
      body: 'Saved locally',
    });
    const n2 = await repos.notifications.create({
      type: 'system',
      title: 'Keep Me',
      body: 'Second alert',
    });
    expect(n1.isRead).toBe(false);
    await repos.notifications.markAllAsRead();
    let notifs = await repos.notifications.getAll();
    expect(notifs.every((n) => n.isRead)).toBe(true);

    await repos.notifications.markAsUnread(n1.id);
    notifs = await repos.notifications.getAll();
    expect(notifs.find((n) => n.id === n1.id)?.isRead).toBe(false);

    await repos.notifications.delete(n1.id);
    notifs = await repos.notifications.getAll();
    expect(notifs.map((n) => n.id)).toEqual([n2.id]);

    const exported = await repos.backup.exportAll('2.0.0');
    expect(exported.schemaVersion).toBe(2);
    expect(exported.transactions.length).toBe(1);
    expect(exported.transactions[0].tagIds).toEqual([tag.id]);

    const mergeResult = await repos.backup.restoreFromBackup(exported, 'merge');
    expect(mergeResult.transactionsInserted).toBe(0);
    expect(mergeResult.transactionsSkipped).toBe(1);

    await repos.backup.clearAllData();
    const txsAfterClear = await repos.transactions.getAll();
    const catsAfterClear = await repos.categories.getAll();
    expect(txsAfterClear.length).toBe(0);
    expect(catsAfterClear.length).toBe(
      DEFAULT_EXPENSE_CATEGORIES.length + DEFAULT_INCOME_CATEGORIES.length,
    );
  });

  test('failed replace restore rolls back atomically without deleting existing data', async () => {
    const originalTx = await repos.transactions.create({
      type: 'income',
      title: 'Existing Salary',
      amountMinor: 400000,
      currencyCode: 'INR',
      categoryId: 'cat-inc-salary',
      categoryNameSnapshot: 'Salary',
      paymentMethodId: 'pm-bank',
      paymentMethod: 'Bank Transfer',
      transactionDate: '2026-11-01',
    });

    const invalidPayload = {
      schemaVersion: 2,
      exportedAt: '2026-11-25T00:00:00.000Z',
      appVersion: '2.0.0',
      settings: {
        id: 1,
        currencyCode: 'INR',
        openingBalanceMinor: 0,
        openingBalanceCurrencyCode: 'INR',
        theme: 'invalid-theme' as 'system',
        dateFormat: 'DD MMM YYYY' as const,
        onboardingCompleted: true,
        profileName: null,
        profileBio: null,
        profileAvatar: null,
        currencyInitialized: false,
      },
      categories: [],
      tags: [],
      paymentMethods: [],
      budgets: [],
      transactions: [],
    };

    let failed = false;
    try {
      await repos.backup.restoreFromBackup(invalidPayload, 'replace');
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);

    const stillPresent = await repos.transactions.getById(originalTx.id);
    expect(stillPresent?.title).toBe('Existing Salary');

    const period = calculatePeriodSummary({
      transactions: [originalTx],
      categories: await repos.categories.getAll(),
      currencyCode: 'INR',
      startDate: '2026-11-01',
      endDate: '2026-11-30',
    });
    expect(period.totalIncomeMinor).toBe(400000);

    const summary = summarizeTransactions([originalTx], 0, 'INR', 'INR');
    expect(summary.totalIncomeMinor).toBe(400000);
  });
});
