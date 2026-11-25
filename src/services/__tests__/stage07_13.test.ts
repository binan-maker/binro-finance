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
  buildFinancialTrendPoints,
  calculateBudgetProgress,
  calculatePeriodComparison,
  calculatePeriodSummary,
  getDashboardPeriodRanges,
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

describe('V2 Analytics, Period Comparison, Multi-Currency CSV & Backup', () => {
  let db: SqlDatabaseAdapter;
  let repos: ReturnType<typeof createRepositories>;

  beforeEach(async () => {
    db = createBunSqliteAdapter();
    await runMigrations(db);
    repos = createRepositories(async () => db);
  });

  test('isolates analytics per currency and builds accurate trend lines & period comparisons', async () => {
    await repos.transactions.create({
      type: 'income',
      title: 'Oct Salary',
      amountMinor: 200000,
      currencyCode: 'INR',
      categoryId: 'cat-inc-salary',
      categoryNameSnapshot: 'Salary',
      paymentMethod: 'Bank Transfer',
      transactionDate: '2026-10-10',
    });
    await repos.transactions.create({
      type: 'income',
      title: 'Nov Salary',
      amountMinor: 300000,
      currencyCode: 'INR',
      categoryId: 'cat-inc-salary',
      categoryNameSnapshot: 'Salary',
      paymentMethod: 'Bank Transfer',
      transactionDate: '2026-11-01',
    });
    await repos.transactions.create({
      type: 'expense',
      title: 'Nov Rent',
      amountMinor: 100000,
      currencyCode: 'INR',
      categoryId: 'cat-exp-rent',
      categoryNameSnapshot: 'Rent',
      paymentMethod: 'Bank Transfer',
      transactionDate: '2026-11-05',
    });
    await repos.transactions.create({
      type: 'expense',
      title: 'Nov USD SaaS',
      amountMinor: 5000,
      currencyCode: 'USD',
      categoryId: 'cat-exp-bills',
      categoryNameSnapshot: 'Utilities',
      paymentMethod: 'Card',
      transactionDate: '2026-11-05',
    });

    const txs = await repos.transactions.getAll();
    const cats = await repos.categories.getAll();

    const novInr = calculatePeriodSummary({
      transactions: txs,
      categories: cats,
      currencyCode: 'INR',
      startDate: '2026-11-01',
      endDate: '2026-11-30',
    });
    expect(novInr.totalIncomeMinor).toBe(300000);
    expect(novInr.totalExpensesMinor).toBe(100000);
    expect(novInr.netMovementMinor).toBe(200000);

    const ranges = getDashboardPeriodRanges('this_month', '2026-11-15', txs);
    const cmp = calculatePeriodComparison({
      transactions: txs,
      currencyCode: 'INR',
      startDate: ranges.startDate,
      endDate: ranges.endDate,
      previousStartDate: ranges.previousStartDate,
      previousEndDate: ranges.previousEndDate,
      comparisonLabel: ranges.comparisonLabel,
    });
    expect(cmp.currentValueMinor).toBe(200000);
    expect(cmp.previousValueMinor).toBe(200000);
    expect(cmp.percentageChange).toBe(0);
    expect(cmp.direction).toBe('flat');

    const trend = buildFinancialTrendPoints({
      transactions: txs,
      currencyCode: 'INR',
      openingBalanceMinor: 50000,
      openingBalanceCurrencyCode: 'INR',
      startDate: '2026-11-01',
      endDate: '2026-11-05',
    });
    expect(trend[0].valueMinor).toBe(550000); // 50k opening + 200k Oct + 300k Nov 1
    expect(trend[trend.length - 1].valueMinor).toBe(450000); // minus 100k Nov 5

    // Zero baseline check returns null percentageChange without NaN/Infinity
    const zeroBase = calculatePeriodComparison({
      transactions: txs,
      currencyCode: 'USD',
      startDate: '2026-11-01',
      endDate: '2026-11-15',
      previousStartDate: '2026-10-01',
      previousEndDate: '2026-10-15',
      comparisonLabel: 'from last month',
    });
    expect(zeroBase.percentageChange).toBeNull();
    expect(zeroBase.direction).toBe('down');
  });

  test('preserves historical balances & budgets with tags and archived categories', async () => {
    const tag = await repos.tags.create({ name: 'Fixed', color: '#10B981' });
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
      currencyCode: 'INR',
      categoryId: customCat.id,
      categoryNameSnapshot: customCat.name,
      paymentMethod: 'UPI',
      tagIds: [tag.id],
      transactionDate: '2026-11-20',
    });

    await repos.categories.update(customCat.id, { isArchived: true });
    const txs = await repos.transactions.getAll();
    const summary = summarizeTransactions(txs, 50000, 'INR', 'INR');
    expect(summary.currentBalanceMinor).toBe(35000);

    const budget = await repos.budgets.upsert({
      amountMinor: 20000,
      currencyCode: 'INR',
      month: 11,
      year: 2026,
      categoryId: null,
    });
    const progress = calculateBudgetProgress({ budget, transactions: txs, category: null });
    expect(progress.spentMinor).toBe(15000);
    expect(progress.remainingMinor).toBe(5000);
  });

  test('exports multi-currency CSV with tags and restores V2 JSON backups safely', async () => {
    const tag = await repos.tags.create({ name: 'TeamLunch', color: '#0891B2' });
    const existingUsd = await repos.transactions.create({
      type: 'expense',
      title: 'Lunch, "Bistro"',
      amountMinor: 2550,
      currencyCode: 'USD',
      categoryId: 'cat-exp-food',
      categoryNameSnapshot: 'Food & Drink',
      paymentMethod: 'Card',
      tagIds: [tag.id],
      transactionDate: '2026-11-24',
      note: '=SUM(A1:A2)',
    });
    const existingJpy = await repos.transactions.create({
      type: 'expense',
      title: 'Metro',
      amountMinor: 420,
      currencyCode: 'JPY',
      categoryId: 'cat-exp-transport',
      categoryNameSnapshot: 'Transport',
      paymentMethod: 'Cash',
      transactionDate: '2026-11-24',
    });

    const csv = buildTransactionsCsv([existingUsd, existingJpy], 'INR', [tag]);
    expect(csv.includes('"Lunch, ""Bistro"""')).toBe(true);
    expect(csv.includes("'=SUM(A1:A2)")).toBe(true);
    expect(csv.includes('25.50,USD')).toBe(true);
    expect(csv.includes('420,JPY')).toBe(true);
    expect(csv.includes('TeamLunch')).toBe(true);

    const exported = await repos.backup.exportAll('2.0.0');
    const serialized = serializeBackupPayload(exported);
    const parsed = parseAndValidateBackupJson(serialized);
    expect(parsed.valid).toBe(true);

    await repos.transactions.update(existingUsd.id, { title: 'Updated Local Lunch' });
    const mergeRes = await repos.backup.restoreFromBackup(parsed.payload!, 'merge');
    expect(mergeRes.transactionsInserted).toBe(0);
    expect(mergeRes.transactionsSkipped).toBe(2);

    const afterMerge = await repos.transactions.getById(existingUsd.id);
    expect(afterMerge?.title).toBe('Updated Local Lunch');
  });
});
