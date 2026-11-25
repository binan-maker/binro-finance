import type { SqlDatabaseAdapter } from '@/database/driver';
import { seedDefaultSettings } from '@/database/migrations/001_initial';
import {
  seedDefaultCurrencies,
  seedDefaultPaymentMethods,
  seedV2DefaultCategoriesSafely,
} from '@/database/migrations/002_v2_redesign';
import type {
  BackupPayload,
  BudgetRow,
  CategoryRow,
  IBackupRepository,
  NotificationRow,
  PaymentMethodRow,
  RestoreResult,
  TagRow,
  TransactionRow,
  TransactionTagRow,
} from '@/types/database';

import {
  mapBudgetRow,
  mapCategoryRow,
  mapNotificationRow,
  mapPaymentMethodRow,
  mapTagRow,
  mapTransactionRow,
} from './mappers';
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
    const tagRows = await db.getAllAsync<TagRow>('SELECT * FROM tags ORDER BY name ASC');
    const pmRows = await db.getAllAsync<PaymentMethodRow>('SELECT * FROM payment_methods');
    const budgetRows = await db.getAllAsync<BudgetRow>('SELECT * FROM budgets');
    const transactionRows = await db.getAllAsync<TransactionRow>(
      'SELECT * FROM transactions ORDER BY transaction_date DESC, created_at DESC',
    );
    const txTagRows = await db.getAllAsync<TransactionTagRow>(
      'SELECT transaction_id, tag_id FROM transaction_tags',
    );
    const notificationRows = await db.getAllAsync<NotificationRow>(
      'SELECT * FROM notifications ORDER BY created_at DESC',
    );

    const tagsByTx = new Map<string, string[]>();
    for (const row of txTagRows) {
      const existing = tagsByTx.get(row.transaction_id) ?? [];
      existing.push(row.tag_id);
      tagsByTx.set(row.transaction_id, existing);
    }

    return {
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      appVersion,
      settings,
      categories: categoryRows.map(mapCategoryRow),
      tags: tagRows.map(mapTagRow),
      paymentMethods: pmRows.map(mapPaymentMethodRow),
      budgets: budgetRows.map((row) => mapBudgetRow(row, settings.currencyCode)),
      transactions: transactionRows.map((row) =>
        mapTransactionRow(row, settings.currencyCode, tagsByTx.get(row.id) ?? []),
      ),
      notifications: notificationRows.map(mapNotificationRow),
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
      tagsInserted: 0,
      tagsSkipped: 0,
      paymentMethodsInserted: 0,
      paymentMethodsSkipped: 0,
      budgetsInserted: 0,
      budgetsSkipped: 0,
      transactionsInserted: 0,
      transactionsSkipped: 0,
    };

    const backupDefaultCurrency = payload.settings.currencyCode.trim().toUpperCase();
    const backupOpeningCurrency = (
      payload.settings.openingBalanceCurrencyCode ?? backupDefaultCurrency
    )
      .trim()
      .toUpperCase();

    await db.withTransactionAsync(async () => {
      if (mode === 'replace') {
        await db.runAsync('DELETE FROM transaction_tags');
        await db.runAsync('DELETE FROM transactions');
        await db.runAsync('DELETE FROM budgets');
        await db.runAsync('DELETE FROM tags');
        await db.runAsync('DELETE FROM payment_methods');
        await db.runAsync('DELETE FROM categories');
        await db.runAsync('DELETE FROM notifications');
        await db.runAsync('DELETE FROM app_settings');

        await db.runAsync(
          `INSERT INTO app_settings (
            id, currency_code, opening_balance_minor, opening_balance_currency_code,
            theme, date_format, onboarding_completed
          ) VALUES (1, ?, ?, ?, ?, ?, ?)`,
          backupDefaultCurrency,
          payload.settings.openingBalanceMinor,
          backupOpeningCurrency,
          payload.settings.theme,
          payload.settings.dateFormat,
          payload.settings.onboardingCompleted ? 1 : 0,
        );
      }

      // 1. Categories (root categories first, then subcategories)
      const existingRows = await db.getAllAsync<Pick<CategoryRow, 'id' | 'name' | 'type'>>(
        'SELECT id, name, type FROM categories',
      );
      const existingCategoryIds = new Set<string>();
      const byNameType = new Map<string, string>();
      for (const row of existingRows) {
        existingCategoryIds.add(row.id);
        byNameType.set(`${row.type}:${row.name.trim().toLowerCase()}`, row.id);
      }

      const categoryIdMap = new Map<string, string>();
      const orderedCategories = [...payload.categories].sort((a, b) => {
        if (!a.parentId && b.parentId) return -1;
        if (a.parentId && !b.parentId) return 1;
        return 0;
      });

      for (const cat of orderedCategories) {
        const trimmedName = cat.name.trim();
        const nameKey = `${cat.type}:${trimmedName.toLowerCase()}`;

        if (existingCategoryIds.has(cat.id)) {
          categoryIdMap.set(cat.id, cat.id);
          result.categoriesSkipped += 1;
          continue;
        }

        const matchedByName = byNameType.get(nameKey);
        if (matchedByName) {
          categoryIdMap.set(cat.id, matchedByName);
          result.categoriesSkipped += 1;
          continue;
        }

        let resolvedParentId: string | null = null;
        if (cat.parentId) {
          const mappedParent = categoryIdMap.get(cat.parentId);
          if (mappedParent && existingCategoryIds.has(mappedParent)) {
            resolvedParentId = mappedParent;
          } else if (existingCategoryIds.has(cat.parentId)) {
            resolvedParentId = cat.parentId;
          }
        }

        const res = await db.runAsync(
          `INSERT OR IGNORE INTO categories (
            id, name, type, parent_id, icon, color, is_default, is_archived, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          cat.id,
          trimmedName,
          cat.type,
          resolvedParentId,
          cat.icon,
          cat.color,
          cat.isDefault ? 1 : 0,
          cat.isArchived ? 1 : 0,
          cat.createdAt,
          cat.updatedAt,
        );
        if (res.changes > 0) {
          existingCategoryIds.add(cat.id);
          byNameType.set(nameKey, cat.id);
          categoryIdMap.set(cat.id, cat.id);
          result.categoriesInserted += 1;
        } else {
          result.categoriesSkipped += 1;
        }
      }

      // 2. Tags
      const existingTagRows = await db.getAllAsync<Pick<TagRow, 'id' | 'name'>>(
        'SELECT id, name FROM tags',
      );
      const existingTagIds = new Set<string>();
      const tagByName = new Map<string, string>();
      for (const row of existingTagRows) {
        existingTagIds.add(row.id);
        tagByName.set(row.name.trim().toLowerCase(), row.id);
      }

      const tagIdMap = new Map<string, string>();
      for (const tag of payload.tags ?? []) {
        const trimmedName = tag.name.trim();
        const nameKey = trimmedName.toLowerCase();
        if (existingTagIds.has(tag.id)) {
          tagIdMap.set(tag.id, tag.id);
          result.tagsSkipped += 1;
          continue;
        }
        const matched = tagByName.get(nameKey);
        if (matched) {
          tagIdMap.set(tag.id, matched);
          result.tagsSkipped += 1;
          continue;
        }

        const res = await db.runAsync(
          `INSERT OR IGNORE INTO tags (id, name, color, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
          tag.id,
          trimmedName,
          tag.color,
          tag.createdAt,
          tag.updatedAt,
        );
        if (res.changes > 0) {
          existingTagIds.add(tag.id);
          tagByName.set(nameKey, tag.id);
          tagIdMap.set(tag.id, tag.id);
          result.tagsInserted += 1;
        } else {
          result.tagsSkipped += 1;
        }
      }

      // 3. Payment methods
      const existingPmRows = await db.getAllAsync<Pick<PaymentMethodRow, 'id' | 'name'>>(
        'SELECT id, name FROM payment_methods',
      );
      const existingPmIds = new Set<string>();
      const pmByName = new Map<string, string>();
      for (const row of existingPmRows) {
        existingPmIds.add(row.id);
        pmByName.set(row.name.trim().toLowerCase(), row.id);
      }

      const pmIdMap = new Map<string, string>();
      for (const pm of payload.paymentMethods ?? []) {
        const trimmedName = pm.name.trim();
        const nameKey = trimmedName.toLowerCase();
        if (existingPmIds.has(pm.id)) {
          pmIdMap.set(pm.id, pm.id);
          result.paymentMethodsSkipped += 1;
          continue;
        }
        const matched = pmByName.get(nameKey);
        if (matched) {
          pmIdMap.set(pm.id, matched);
          result.paymentMethodsSkipped += 1;
          continue;
        }

        const res = await db.runAsync(
          `INSERT OR IGNORE INTO payment_methods (
            id, name, icon, is_builtin, is_archived, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          pm.id,
          trimmedName,
          pm.icon,
          pm.isBuiltin ? 1 : 0,
          pm.isArchived ? 1 : 0,
          pm.createdAt,
          pm.updatedAt,
        );
        if (res.changes > 0) {
          existingPmIds.add(pm.id);
          pmByName.set(nameKey, pm.id);
          pmIdMap.set(pm.id, pm.id);
          result.paymentMethodsInserted += 1;
        } else {
          result.paymentMethodsSkipped += 1;
        }
      }

      // Guarantee baseline seeds exist before inserting budgets and transactions
      await seedDefaultSettings(db);
      await seedDefaultPaymentMethods(db);
      await seedDefaultCurrencies(db);
      await seedV2DefaultCategoriesSafely(db);

      const postSeedCategories = await db.getAllAsync<Pick<CategoryRow, 'id' | 'name' | 'type'>>(
        'SELECT id, name, type FROM categories',
      );
      for (const row of postSeedCategories) {
        existingCategoryIds.add(row.id);
        const key = `${row.type}:${row.name.trim().toLowerCase()}`;
        if (!byNameType.has(key)) {
          byNameType.set(key, row.id);
        }
      }

      const postSeedPms = await db.getAllAsync<Pick<PaymentMethodRow, 'id' | 'name'>>(
        'SELECT id, name FROM payment_methods',
      );
      for (const row of postSeedPms) {
        existingPmIds.add(row.id);
        const key = row.name.trim().toLowerCase();
        if (!pmByName.has(key)) {
          pmByName.set(key, row.id);
        }
      }

      // 4. Budgets
      for (const b of payload.budgets) {
        let resolvedCategoryId: string | null = null;
        if (b.categoryId !== null) {
          const mapped = categoryIdMap.get(b.categoryId);
          if (mapped && existingCategoryIds.has(mapped)) {
            resolvedCategoryId = mapped;
          } else if (existingCategoryIds.has(b.categoryId)) {
            resolvedCategoryId = b.categoryId;
          } else {
            result.budgetsSkipped += 1;
            continue;
          }
        }

        const budgetCurrency = (b.currencyCode ?? backupDefaultCurrency).trim().toUpperCase();
        const res = await db.runAsync(
          `INSERT OR IGNORE INTO budgets (
            id, amount_minor, currency_code, period, month, year, category_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          b.id,
          b.amountMinor,
          budgetCurrency,
          b.period,
          b.month,
          b.year,
          resolvedCategoryId,
          b.createdAt,
          b.updatedAt,
        );
        if (res.changes > 0) {
          result.budgetsInserted += 1;
        } else {
          result.budgetsSkipped += 1;
        }
      }

      // 5. Transactions + transaction_tags
      for (const tx of payload.transactions) {
        let resolvedCategoryId: string | null = null;
        if (tx.categoryId !== null) {
          const mapped = categoryIdMap.get(tx.categoryId);
          if (mapped && existingCategoryIds.has(mapped)) {
            resolvedCategoryId = mapped;
          } else if (existingCategoryIds.has(tx.categoryId)) {
            resolvedCategoryId = tx.categoryId;
          } else {
            resolvedCategoryId = null;
          }
        }

        let resolvedPmId: string | null = null;
        if (tx.paymentMethodId) {
          const mappedPm = pmIdMap.get(tx.paymentMethodId);
          if (mappedPm && existingPmIds.has(mappedPm)) {
            resolvedPmId = mappedPm;
          } else if (existingPmIds.has(tx.paymentMethodId)) {
            resolvedPmId = tx.paymentMethodId;
          }
        } else if (tx.paymentMethod) {
          resolvedPmId = pmByName.get(tx.paymentMethod.trim().toLowerCase()) ?? null;
        }

        const txCurrency = (tx.currencyCode ?? backupDefaultCurrency).trim().toUpperCase();

        const res = await db.runAsync(
          `INSERT OR IGNORE INTO transactions (
            id, type, title, amount_minor, currency_code, category_id, category_name_snapshot,
            payment_method_id, payment_method, transaction_date, note, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          tx.id,
          tx.type,
          tx.title.trim(),
          tx.amountMinor,
          txCurrency,
          resolvedCategoryId,
          tx.categoryNameSnapshot,
          resolvedPmId,
          tx.paymentMethod,
          tx.transactionDate,
          tx.note ?? null,
          tx.createdAt,
          tx.updatedAt,
        );
        if (res.changes > 0) {
          result.transactionsInserted += 1;
          for (const rawTagId of tx.tagIds ?? []) {
            const resolvedTagId = tagIdMap.get(rawTagId) ?? rawTagId;
            if (existingTagIds.has(resolvedTagId)) {
              await db.runAsync(
                'INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)',
                tx.id,
                resolvedTagId,
              );
            }
          }
        } else {
          result.transactionsSkipped += 1;
        }
      }

      // 6. Notifications (optional)
      for (const n of payload.notifications ?? []) {
        await db.runAsync(
          `INSERT OR IGNORE INTO notifications (
            id, type, title, body, is_read, metadata_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          n.id,
          n.type,
          n.title,
          n.body,
          n.isRead ? 1 : 0,
          n.metadataJson ?? null,
          n.createdAt,
        );
      }
    });

    return result;
  }

  async clearAllData(): Promise<void> {
    const db = await this.getDb();
    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM transaction_tags');
      await db.runAsync('DELETE FROM transactions');
      await db.runAsync('DELETE FROM budgets');
      await db.runAsync('DELETE FROM tags');
      await db.runAsync('DELETE FROM payment_methods');
      await db.runAsync('DELETE FROM categories');
      await db.runAsync('DELETE FROM notifications');
      await db.runAsync('DELETE FROM app_settings');
      await seedDefaultSettings(db);
      await seedDefaultPaymentMethods(db);
      await seedDefaultCurrencies(db);
      await seedV2DefaultCategoriesSafely(db);
    });
  }
}
