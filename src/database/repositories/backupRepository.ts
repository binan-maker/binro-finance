import type { SqlDatabaseAdapter } from '@/database/driver';
import { seedDefaultCategories, seedDefaultSettings } from '@/database/migrations/001_initial';
import type {
  BackupPayload,
  BudgetRow,
  CategoryRow,
  IBackupRepository,
  RestoreResult,
  TransactionRow,
} from '@/types/database';

import { mapBudgetRow, mapCategoryRow, mapTransactionRow } from './mappers';
import { SQLiteSettingsRepository } from './settingsRepository';

export class SQLiteBackupRepository implements IBackupRepository {
  private readonly settingsRepo: SQLiteSettingsRepository;

  constructor(private readonly getDb: () => Promise<SqlDatabaseAdapter>) {
    this.settingsRepo = new SQLiteSettingsRepository(getDb);
  }

  async exportAll(appVersion: string): Promise<BackupPayload> {
    const db = await this.getDb();
    const settings = await this.settingsRepo.get();
    const categoryRows = await db.getAllAsync<CategoryRow>('SELECT * FROM categories');
    const budgetRows = await db.getAllAsync<BudgetRow>('SELECT * FROM budgets');
    const transactionRows = await db.getAllAsync<TransactionRow>(
      'SELECT * FROM transactions ORDER BY transaction_date DESC, created_at DESC',
    );

    return {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      appVersion,
      settings,
      categories: categoryRows.map(mapCategoryRow),
      budgets: budgetRows.map(mapBudgetRow),
      transactions: transactionRows.map(mapTransactionRow),
    };
  }

  async restoreFromBackup(
    payload: BackupPayload,
    mode: 'merge' | 'replace',
  ): Promise<RestoreResult> {
    const db = await this.getDb();
    const result: RestoreResult = {
      categoriesInserted: 0,
      categoriesSkipped: 0,
      budgetsInserted: 0,
      budgetsSkipped: 0,
      transactionsInserted: 0,
      transactionsSkipped: 0,
    };

    await db.withTransactionAsync(async () => {
      if (mode === 'replace') {
        await db.runAsync('DELETE FROM transactions');
        await db.runAsync('DELETE FROM budgets');
        await db.runAsync('DELETE FROM categories');
        await db.runAsync('DELETE FROM app_settings');

        await db.runAsync(
          `INSERT INTO app_settings (
            id, currency_code, opening_balance_minor, theme, date_format, onboarding_completed
          ) VALUES (1, ?, ?, ?, ?, ?)`,
          payload.settings.currencyCode,
          payload.settings.openingBalanceMinor,
          payload.settings.theme,
          payload.settings.dateFormat,
          payload.settings.onboardingCompleted ? 1 : 0,
        );
      }

      for (const cat of payload.categories) {
        const res = await db.runAsync(
          `INSERT OR IGNORE INTO categories (
            id, name, type, icon, color, is_default, is_archived, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          cat.id,
          cat.name,
          cat.type,
          cat.icon,
          cat.color,
          cat.isDefault ? 1 : 0,
          cat.isArchived ? 1 : 0,
          cat.createdAt,
          cat.updatedAt,
        );
        if (res.changes > 0) {
          result.categoriesInserted += 1;
        } else {
          result.categoriesSkipped += 1;
        }
      }

      for (const b of payload.budgets) {
        const res = await db.runAsync(
          `INSERT OR IGNORE INTO budgets (
            id, amount_minor, period, month, year, category_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          b.id,
          b.amountMinor,
          b.period,
          b.month,
          b.year,
          b.categoryId,
          b.createdAt,
          b.updatedAt,
        );
        if (res.changes > 0) {
          result.budgetsInserted += 1;
        } else {
          result.budgetsSkipped += 1;
        }
      }

      for (const tx of payload.transactions) {
        const res = await db.runAsync(
          `INSERT OR IGNORE INTO transactions (
            id, type, title, amount_minor, category_id, category_name_snapshot,
            payment_method, transaction_date, note, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          tx.id,
          tx.type,
          tx.title,
          tx.amountMinor,
          tx.categoryId,
          tx.categoryNameSnapshot,
          tx.paymentMethod,
          tx.transactionDate,
          tx.note,
          tx.createdAt,
          tx.updatedAt,
        );
        if (res.changes > 0) {
          result.transactionsInserted += 1;
        } else {
          result.transactionsSkipped += 1;
        }
      }

      // Guarantee baseline seeds exist even after a partial backup restore
      await seedDefaultSettings(db);
      await seedDefaultCategories(db);
    });

    return result;
  }

  async clearAllData(): Promise<void> {
    const db = await this.getDb();
    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM transactions');
      await db.runAsync('DELETE FROM budgets');
      await db.runAsync('DELETE FROM categories');
      await db.runAsync('DELETE FROM app_settings');
      await seedDefaultSettings(db);
      await seedDefaultCategories(db);
    });
  }
}
