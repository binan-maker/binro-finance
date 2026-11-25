import { Database } from 'bun:sqlite';
import { beforeEach, describe, expect, test } from 'bun:test';

import type { SqlBindValue, SqlDatabaseAdapter } from '@/database/driver';
import { runMigrations } from '@/database/migrations';
import { createRepositories } from '@/database/repositories/factory';
import {
  parseAndValidateBackupJson,
  serializeBackupPayload,
} from '@/services/backup/backupPayload';
import {
  calculateBudgetProgress,
  calculatePeriodSummary,
  summarizeTransactions,
} from '@/services/calculations/financialCalculations';
import { buildTransactionsCsv } from '@/services/export/csvExport';

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

describe('Stages 07–13: transactions, analytics, categories, budgets, CSV & JSON backup', () => {
  let db: SqlDatabaseAdapter;
  let repos: ReturnType<typeof createRepositories>;

  beforeEach(async () => {
    db = createBunSqliteAdapter();
    await runMigrations(db);
    repos = createRepositories(async () => db);
  });

  test('archiving a category preserves historical transaction snapshot and balances', async () => {
    const customCat = await repos.categories.create({
      name: 'Coffee',
      type: 'expense',
      icon: 'coffee',
      color: '#4E342E',
    });

    await repos.transactions.create({
      type: 'expense',
      title: 'Espresso',
      amountMinor: 15000,
      categoryId: customCat.id,
      categoryNameSnapshot: customCat.name,
      paymentMethod: 'UPI',
      transactionDate: '2026-11-20',
    });

    await repos.categories.update(customCat.id, { isArchived: true });

    const activeCats = await repos.categories.getAll({ type: 'expense' });
    expect(activeCats.some((c) => c.id === customCat.id)).toBe(false);

    const txs = await repos.transactions.getAll();
    expect(txs.length).toBe(1);
    expect(txs[0].categoryNameSnapshot).toBe('Coffee');

    const summary = summarizeTransactions(txs, 50000);
    expect(summary.currentBalanceMinor).toBe(35000);
  });

  test('prevents duplicate category creation and rejects invalid transaction/budget amounts', async () => {
    let duplicateThrew = false;
    try {
      await repos.categories.create({
        name: 'food and dining',
        type: 'expense',
        icon: 'utensils',
        color: '#E65100',
      });
    } catch {
      duplicateThrew = true;
    }
    expect(duplicateThrew).toBe(true);

    let invalidTxThrew = false;
    try {
      await repos.transactions.create({
        type: 'expense',
        title: 'Zero',
        amountMinor: 0,
        categoryId: 'cat-exp-other',
        categoryNameSnapshot: 'Other',
        paymentMethod: 'Cash',
        transactionDate: '2026-11-20',
      });
    } catch {
      invalidTxThrew = true;
    }
    expect(invalidTxThrew).toBe(true);

    let invalidBudgetThrew = false;
    try {
      await repos.budgets.upsert({
        amountMinor: -100,
        month: 11,
        year: 2026,
        categoryId: null,
      });
    } catch {
      invalidBudgetThrew = true;
    }
    expect(invalidBudgetThrew).toBe(true);
  });

  test('computes multi-day analytics, boundary filtering, and budget calculations accurately', async () => {
    await repos.transactions.create({
      type: 'income',
      title: 'Paycheck',
      amountMinor: 300000,
      categoryId: 'cat-inc-salary',
      categoryNameSnapshot: 'Salary',
      paymentMethod: 'Bank transfer',
      transactionDate: '2026-11-01',
    });
    await repos.transactions.create({
      type: 'expense',
      title: 'Rent',
      amountMinor: 120000,
      categoryId: 'cat-exp-rent',
      categoryNameSnapshot: 'Rent',
      paymentMethod: 'Bank transfer',
      transactionDate: '2026-11-01',
    });
    await repos.transactions.create({
      type: 'expense',
      title: 'Out of month expense',
      amountMinor: 50000,
      categoryId: 'cat-exp-food',
      categoryNameSnapshot: 'Food and Dining',
      paymentMethod: 'Cash',
      transactionDate: '2026-12-01',
    });

    const txs = await repos.transactions.getAll();
    const cats = await repos.categories.getAll();

    const novSummary = calculatePeriodSummary({
      transactions: txs,
      categories: cats,
      startDate: '2026-11-01',
      endDate: '2026-11-30',
    });

    expect(novSummary.totalIncomeMinor).toBe(300000);
    expect(novSummary.totalExpensesMinor).toBe(120000);
    expect(novSummary.netMovementMinor).toBe(180000);
    expect(novSummary.dailyTotals.length).toBe(30);
    expect(novSummary.highestSpendingCategory?.categoryName).toBe('Rent');

    const budget = await repos.budgets.upsert({
      amountMinor: 150000,
      month: 11,
      year: 2026,
      categoryId: null,
    });
    const budgetProgress = calculateBudgetProgress({
      budget,
      transactions: txs,
      category: null,
    });
    expect(budgetProgress.spentMinor).toBe(120000);
    expect(budgetProgress.remainingMinor).toBe(30000);
    expect(budgetProgress.isExceeded).toBe(false);
  });

  test('exports safe CSV and validates + safe-merges JSON backups without overwriting existing records', async () => {
    const existing = await repos.transactions.create({
      type: 'expense',
      title: 'Lunch, "Bistro"',
      amountMinor: 2550,
      categoryId: 'cat-exp-food',
      categoryNameSnapshot: 'Food and Dining',
      paymentMethod: 'Card',
      transactionDate: '2026-11-24',
      note: '=SUM(A1:A2)',
    });

    const csv = buildTransactionsCsv([existing], 'USD');
    expect(csv.includes('"Lunch, ""Bistro"""')).toBe(true);
    expect(csv.includes("'=SUM(A1:A2)")).toBe(true);
    expect(csv.includes('25.50')).toBe(true);

    const exported = await repos.backup.exportAll('1.0.0');
    const serialized = serializeBackupPayload(exported);
    const parsed = parseAndValidateBackupJson(serialized);
    expect(parsed.valid).toBe(true);

    // Modify existing record title locally, then run merge restore: existing record must NOT be overwritten
    await repos.transactions.update(existing.id, { title: 'Updated Local Lunch' });
    const mergeRes = await repos.backup.restoreFromBackup(parsed.payload!, 'merge');
    expect(mergeRes.transactionsInserted).toBe(0);
    expect(mergeRes.transactionsSkipped).toBe(1);

    const afterMerge = await repos.transactions.getById(existing.id);
    expect(afterMerge?.title).toBe('Updated Local Lunch');

    // Invalid JSON should be rejected cleanly
    const badJson = parseAndValidateBackupJson('{not valid json');
    expect(badJson.valid).toBe(false);
  });
});
