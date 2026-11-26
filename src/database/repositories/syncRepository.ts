import type { SqlDatabaseAdapter } from '@/database/driver';
import { seedDefaultSettings } from '@/database/migrations/001_initial';
import {
  seedDefaultCurrencies,
  seedDefaultPaymentMethods,
  seedV2DefaultCategoriesSafely,
} from '@/database/migrations/002_v2_redesign';
import type {
  AppSettingsRow,
  BudgetRow,
  CategoryRow,
  EntitlementCacheRow,
  ISyncRepository,
  MediaSyncMapRow,
  PaymentMethodRow,
  SyncOutboxRow,
  SyncStateRow,
  TagRow,
  TransactionRow,
  TransactionTagRow,
} from '@/types/database';
import type {
  AppSettings,
  Budget,
  Category,
  PaymentMethodRecord,
  SyncEntityType,
  SyncOperationType,
  SyncStateSnapshot,
  Tag,
  Transaction,
  UserEntitlement,
} from '@/types/models';
import { generateUUID } from '@/utils/uuid';

import {
  mapBudgetRow,
  mapCategoryRow,
  mapPaymentMethodRow,
  mapSettingsRow,
  mapTagRow,
  mapTransactionRow,
} from './mappers';

export interface OutboxEnqueueInput {
  entityType: SyncEntityType;
  entityId: string;
  operation: SyncOperationType;
  payloadJson?: string | null;
  localUpdatedAt: string;
}

export interface RemoteSyncPullBundle {
  profile?: {
    profileName: string | null;
    profileBio: string | null;
    profileAvatarPath: string | null;
    gender: AppSettings['gender'];
    dateOfBirth: string | null;
    googleName: string | null;
    googleEmail: string | null;
    googleAvatarUrl: string | null;
    profileCompletedAt: string | null;
    updatedAt: string;
  } | null;
  settings?: {
    currencyCode: string;
    openingBalanceMinor: number;
    openingBalanceCurrencyCode: string;
    theme: AppSettings['theme'];
    dateFormat: AppSettings['dateFormat'];
    onboardingCompleted: boolean;
    currencyInitialized: boolean;
    showHomeBudgetShortcut: boolean;
    updatedAt: string;
  } | null;
  categories: (Category & { deletedAt: string | null })[];
  paymentMethods: (PaymentMethodRecord & { deletedAt: string | null })[];
  tags: (Tag & { deletedAt: string | null })[];
  transactions: (Omit<Transaction, 'tagIds'> & { deletedAt: string | null })[];
  transactionTags: {
    transactionId: string;
    tagId: string;
    deletedAt: string | null;
    updatedAt: string;
  }[];
  budgets: (Budget & { deletedAt: string | null })[];
}

export async function enqueueOutboxChangeIfLinked(
  db: SqlDatabaseAdapter,
  input: OutboxEnqueueInput,
): Promise<void> {
  const syncRow = await db.getFirstAsync<Pick<SyncStateRow, 'linked_user_id'>>(
    'SELECT linked_user_id FROM sync_state WHERE id = 1 LIMIT 1',
  );
  const userId = syncRow?.linked_user_id;
  if (!userId) {
    return;
  }

  const now = new Date().toISOString();
  const outboxId = generateUUID();

  await db.runAsync(
    `INSERT INTO sync_outbox (
      id, workspace_user_id, entity_type, entity_id, operation,
      payload_json, local_updated_at, retry_count, next_retry_at, last_error, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, 'pending', ?)
    ON CONFLICT(COALESCE(workspace_user_id, ''), entity_type, entity_id)
    DO UPDATE SET
      operation = excluded.operation,
      payload_json = excluded.payload_json,
      local_updated_at = excluded.local_updated_at,
      retry_count = 0,
      next_retry_at = NULL,
      last_error = NULL,
      status = 'pending'`,
    outboxId,
    userId,
    input.entityType,
    input.entityId,
    input.operation,
    input.payloadJson ?? null,
    input.localUpdatedAt,
    now,
  );
}

export async function trackLocalMediaPendingUpload(
  db: SqlDatabaseAdapter,
  params: {
    localPath: string;
    entityType: 'profile' | 'category' | 'payment_method';
    entityId: string;
    userId?: string | null;
  },
): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO media_sync_map (
      local_path, entity_type, entity_id, remote_path, user_id, content_hash, sync_state, updated_at
    ) VALUES (?, ?, ?, NULL, ?, NULL, 'pending_upload', ?)
    ON CONFLICT(local_path) DO UPDATE SET
      entity_type = excluded.entity_type,
      entity_id = excluded.entity_id,
      user_id = COALESCE(excluded.user_id, media_sync_map.user_id),
      sync_state = 'pending_upload',
      updated_at = excluded.updated_at`,
    params.localPath,
    params.entityType,
    params.entityId,
    params.userId ?? null,
    now,
  );
}

export async function markLocalMediaPendingDelete(
  db: SqlDatabaseAdapter,
  localPath: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE media_sync_map
     SET sync_state = 'pending_delete', updated_at = ?
     WHERE local_path = ?`,
    now,
    localPath,
  );
}

function parseCursors(raw: string | null | undefined): Record<string, { serverUpdatedAt: string; id: string }> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const result: Record<string, { serverUpdatedAt: string; id: string }> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (v && typeof v === 'object') {
        const rec = v as Record<string, unknown>;
        if (typeof rec.serverUpdatedAt === 'string' && typeof rec.id === 'string') {
          result[k] = { serverUpdatedAt: rec.serverUpdatedAt, id: rec.id };
        }
      }
    }
    return result;
  } catch {
    return {};
  }
}

export class SQLiteSyncRepository implements ISyncRepository {
  constructor(private readonly getDb: () => Promise<SqlDatabaseAdapter>) {}

  async getSyncState(): Promise<SyncStateSnapshot> {
    const db = await this.getDb();
    let row = await db.getFirstAsync<SyncStateRow>('SELECT * FROM sync_state WHERE id = 1 LIMIT 1');
    if (!row) {
      await db.runAsync(
        `INSERT OR IGNORE INTO sync_state (
          id, linked_user_id, linked_user_email, migration_completed_at,
          last_synced_at, last_error, sync_status, cursors_json, anonymous_install_id
        ) VALUES (1, NULL, NULL, NULL, NULL, NULL, 'idle', '{}', ?)`,
        generateUUID(),
      );
      row = await db.getFirstAsync<SyncStateRow>('SELECT * FROM sync_state WHERE id = 1 LIMIT 1');
    }
    if (!row) {
      throw new Error('Failed to load sync state.');
    }

    let installId = row.anonymous_install_id?.trim() || '';
    if (!installId) {
      installId = generateUUID();
      await db.runAsync(
        'UPDATE sync_state SET anonymous_install_id = ? WHERE id = 1',
        installId,
      );
    }

    return {
      linkedUserId: row.linked_user_id ?? null,
      linkedUserEmail: row.linked_user_email ?? null,
      migrationCompletedAt: row.migration_completed_at ?? null,
      lastSyncedAt: row.last_synced_at ?? null,
      lastError: row.last_error ?? null,
      syncStatus: row.sync_status ?? 'idle',
      cursors: parseCursors(row.cursors_json),
      anonymousInstallId: installId,
    };
  }

  async updateSyncState(patch: Partial<SyncStateSnapshot>): Promise<SyncStateSnapshot> {
    const current = await this.getSyncState();
    const db = await this.getDb();
    const next: SyncStateSnapshot = {
      ...current,
      ...patch,
      cursors: patch.cursors !== undefined ? patch.cursors : current.cursors,
    };

    await db.runAsync(
      `UPDATE sync_state
       SET linked_user_id = ?,
           linked_user_email = ?,
           migration_completed_at = ?,
           last_synced_at = ?,
           last_error = ?,
           sync_status = ?,
           cursors_json = ?,
           anonymous_install_id = ?
       WHERE id = 1`,
      next.linkedUserId,
      next.linkedUserEmail,
      next.migrationCompletedAt,
      next.lastSyncedAt,
      next.lastError,
      next.syncStatus,
      JSON.stringify(next.cursors),
      next.anonymousInstallId,
    );
    return next;
  }

  async getPendingOutbox(userId: string, limit = 100): Promise<SyncOutboxRow[]> {
    const db = await this.getDb();
    const now = new Date().toISOString();
    return db.getAllAsync<SyncOutboxRow>(
      `SELECT * FROM sync_outbox
       WHERE workspace_user_id = ?
         AND status IN ('pending', 'failed')
         AND (next_retry_at IS NULL OR next_retry_at <= ?)
       ORDER BY created_at ASC
       LIMIT ?`,
      userId,
      now,
      limit,
    );
  }

  async getPendingOutboxCount(userId?: string | null): Promise<number> {
    const db = await this.getDb();
    const row = userId
      ? await db.getFirstAsync<{ cnt: number }>(
          'SELECT COUNT(*) AS cnt FROM sync_outbox WHERE workspace_user_id = ?',
          userId,
        )
      : await db.getFirstAsync<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM sync_outbox');
    return row?.cnt ?? 0;
  }

  async markOutboxFailed(id: string, error: string, nextRetryAt: string): Promise<void> {
    const db = await this.getDb();
    await db.runAsync(
      `UPDATE sync_outbox
       SET status = 'failed',
           retry_count = retry_count + 1,
           next_retry_at = ?,
           last_error = ?
       WHERE id = ?`,
      nextRetryAt,
      error.slice(0, 500),
      id,
    );
  }

  async removeOutboxItems(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    const db = await this.getDb();
    const placeholders = ids.map(() => '?').join(', ');
    await db.runAsync(`DELETE FROM sync_outbox WHERE id IN (${placeholders})`, ...ids);
  }

  async clearOutboxForOtherUser(activeUserId: string): Promise<void> {
    const db = await this.getDb();
    await db.runAsync(
      'DELETE FROM sync_outbox WHERE workspace_user_id IS NOT NULL AND workspace_user_id != ?',
      activeUserId,
    );
  }

  async enqueueFullWorkspaceForMigration(userId: string): Promise<void> {
    const db = await this.getDb();
    const now = new Date().toISOString();
    const settingsRow = await db.getFirstAsync<AppSettingsRow>(
      'SELECT * FROM app_settings WHERE id = 1 LIMIT 1',
    );
    const categories = await db.getAllAsync<CategoryRow>('SELECT * FROM categories');
    const pms = await db.getAllAsync<PaymentMethodRow>('SELECT * FROM payment_methods');
    const tags = await db.getAllAsync<TagRow>('SELECT * FROM tags');
    const transactions = await db.getAllAsync<TransactionRow>('SELECT * FROM transactions');
    const txTags = await db.getAllAsync<TransactionTagRow>('SELECT * FROM transaction_tags');
    const budgets = await db.getAllAsync<BudgetRow>('SELECT * FROM budgets');

    await db.withTransactionAsync(async () => {
      const enqueue = async (
        entityType: SyncEntityType,
        entityId: string,
        operation: SyncOperationType,
        localUpdatedAt: string,
      ) => {
        await db.runAsync(
          `INSERT INTO sync_outbox (
            id, workspace_user_id, entity_type, entity_id, operation,
            payload_json, local_updated_at, retry_count, next_retry_at, last_error, status, created_at
          ) VALUES (?, ?, ?, ?, ?, NULL, ?, 0, NULL, NULL, 'pending', ?)
          ON CONFLICT(COALESCE(workspace_user_id, ''), entity_type, entity_id)
          DO UPDATE SET
            operation = excluded.operation,
            local_updated_at = excluded.local_updated_at,
            status = 'pending',
            next_retry_at = NULL`,
          generateUUID(),
          userId,
          entityType,
          entityId,
          operation,
          localUpdatedAt,
          now,
        );
      };

      if (settingsRow) {
        await enqueue('profile', 'self', 'upsert', settingsRow.updated_at || now);
        await enqueue('settings', 'self', 'upsert', settingsRow.updated_at || now);
      }

      // Root categories first, then child categories
      const orderedCats = [...categories].sort((a, b) => {
        if (!a.parent_id && b.parent_id) return -1;
        if (a.parent_id && !b.parent_id) return 1;
        return 0;
      });
      for (const c of orderedCats) {
        await enqueue('category', c.id, c.deleted_at ? 'delete' : 'upsert', c.deleted_at ?? c.updated_at);
      }
      for (const pm of pms) {
        await enqueue('payment_method', pm.id, pm.deleted_at ? 'delete' : 'upsert', pm.deleted_at ?? pm.updated_at);
      }
      for (const tag of tags) {
        await enqueue('tag', tag.id, tag.deleted_at ? 'delete' : 'upsert', tag.deleted_at ?? tag.updated_at);
      }
      for (const b of budgets) {
        await enqueue('budget', b.id, b.deleted_at ? 'delete' : 'upsert', b.deleted_at ?? b.updated_at);
      }
      for (const tx of transactions) {
        await enqueue('transaction', tx.id, tx.deleted_at ? 'delete' : 'upsert', tx.deleted_at ?? tx.updated_at);
      }
      for (const tt of txTags) {
        await enqueue(
          'transaction_tag',
          `${tt.transaction_id}:${tt.tag_id}`,
          tt.deleted_at ? 'delete' : 'upsert',
          tt.deleted_at ?? tt.updated_at ?? now,
        );
      }
    });
  }

  async getSnapshotForOutbox(items: readonly SyncOutboxRow[]): Promise<{
    settings: AppSettings | null;
    categoriesById: Map<string, Category & { deletedAt: string | null }>;
    paymentMethodsById: Map<string, PaymentMethodRecord & { deletedAt: string | null }>;
    tagsById: Map<string, Tag & { deletedAt: string | null }>;
    transactionsById: Map<string, Omit<Transaction, 'tagIds'> & { deletedAt: string | null }>;
    txTagsByKey: Map<string, { transactionId: string; tagId: string; deletedAt: string | null; updatedAt: string }>;
    budgetsById: Map<string, Budget & { deletedAt: string | null }>;
  }> {
    const db = await this.getDb();
    const settingsRow = await db.getFirstAsync<AppSettingsRow>(
      'SELECT * FROM app_settings WHERE id = 1 LIMIT 1',
    );
    const settings = settingsRow ? mapSettingsRow(settingsRow) : null;
    const fallbackCurrency = settings?.currencyCode ?? 'USD';

    const categoriesById = new Map<string, Category & { deletedAt: string | null }>();
    const paymentMethodsById = new Map<string, PaymentMethodRecord & { deletedAt: string | null }>();
    const tagsById = new Map<string, Tag & { deletedAt: string | null }>();
    const transactionsById = new Map<string, Omit<Transaction, 'tagIds'> & { deletedAt: string | null }>();
    const txTagsByKey = new Map<
      string,
      { transactionId: string; tagId: string; deletedAt: string | null; updatedAt: string }
    >();
    const budgetsById = new Map<string, Budget & { deletedAt: string | null }>();

    const catIds = items.filter((i) => i.entity_type === 'category').map((i) => i.entity_id);
    if (catIds.length > 0) {
      const ph = catIds.map(() => '?').join(', ');
      const rows = await db.getAllAsync<CategoryRow>(`SELECT * FROM categories WHERE id IN (${ph})`, ...catIds);
      for (const r of rows) {
        categoriesById.set(r.id, { ...mapCategoryRow(r), deletedAt: r.deleted_at ?? null });
      }
    }

    const pmIds = items.filter((i) => i.entity_type === 'payment_method').map((i) => i.entity_id);
    if (pmIds.length > 0) {
      const ph = pmIds.map(() => '?').join(', ');
      const rows = await db.getAllAsync<PaymentMethodRow>(`SELECT * FROM payment_methods WHERE id IN (${ph})`, ...pmIds);
      for (const r of rows) {
        paymentMethodsById.set(r.id, { ...mapPaymentMethodRow(r), deletedAt: r.deleted_at ?? null });
      }
    }

    const tagIds = items.filter((i) => i.entity_type === 'tag').map((i) => i.entity_id);
    if (tagIds.length > 0) {
      const ph = tagIds.map(() => '?').join(', ');
      const rows = await db.getAllAsync<TagRow>(`SELECT * FROM tags WHERE id IN (${ph})`, ...tagIds);
      for (const r of rows) {
        tagsById.set(r.id, { ...mapTagRow(r), deletedAt: r.deleted_at ?? null });
      }
    }

    const txIds = items.filter((i) => i.entity_type === 'transaction').map((i) => i.entity_id);
    if (txIds.length > 0) {
      const ph = txIds.map(() => '?').join(', ');
      const rows = await db.getAllAsync<TransactionRow>(`SELECT * FROM transactions WHERE id IN (${ph})`, ...txIds);
      for (const r of rows) {
        const mapped = mapTransactionRow(r, fallbackCurrency, []);
        transactionsById.set(r.id, { ...mapped, deletedAt: r.deleted_at ?? null });
      }
    }

    const budgetIds = items.filter((i) => i.entity_type === 'budget').map((i) => i.entity_id);
    if (budgetIds.length > 0) {
      const ph = budgetIds.map(() => '?').join(', ');
      const rows = await db.getAllAsync<BudgetRow>(`SELECT * FROM budgets WHERE id IN (${ph})`, ...budgetIds);
      for (const r of rows) {
        budgetsById.set(r.id, { ...mapBudgetRow(r, fallbackCurrency), deletedAt: r.deleted_at ?? null });
      }
    }

    for (const item of items) {
      if (item.entity_type !== 'transaction_tag') continue;
      const [transactionId, tagId] = item.entity_id.split(':');
      if (!transactionId || !tagId) continue;
      const row = await db.getFirstAsync<TransactionTagRow>(
        'SELECT * FROM transaction_tags WHERE transaction_id = ? AND tag_id = ? LIMIT 1',
        transactionId,
        tagId,
      );
      if (row) {
        txTagsByKey.set(item.entity_id, {
          transactionId: row.transaction_id,
          tagId: row.tag_id,
          deletedAt: row.deleted_at ?? null,
          updatedAt: row.updated_at ?? item.local_updated_at,
        });
      }
    }

    return {
      settings,
      categoriesById,
      paymentMethodsById,
      tagsById,
      transactionsById,
      txTagsByKey,
      budgetsById,
    };
  }

  async applyRemoteBundle(bundle: RemoteSyncPullBundle): Promise<void> {
    const db = await this.getDb();

    await db.withTransactionAsync(async () => {
      if (bundle.profile) {
        const current = await db.getFirstAsync<AppSettingsRow>('SELECT * FROM app_settings WHERE id = 1 LIMIT 1');
        const currentUpdatedAt = current?.updated_at ?? '';
        if (!currentUpdatedAt || bundle.profile.updatedAt >= currentUpdatedAt) {
          await db.runAsync(
            `UPDATE app_settings
             SET profile_name = COALESCE(?, profile_name),
                 profile_bio = COALESCE(?, profile_bio),
                 profile_avatar = COALESCE(?, profile_avatar),
                 gender = COALESCE(?, gender),
                 date_of_birth = COALESCE(?, date_of_birth),
                 google_name = COALESCE(?, google_name),
                 google_email = COALESCE(?, google_email),
                 google_avatar_url = COALESCE(?, google_avatar_url),
                 profile_completed_at = COALESCE(?, profile_completed_at),
                 updated_at = ?
             WHERE id = 1`,
            bundle.profile.profileName,
            bundle.profile.profileBio,
            bundle.profile.profileAvatarPath,
            bundle.profile.gender,
            bundle.profile.dateOfBirth,
            bundle.profile.googleName,
            bundle.profile.googleEmail,
            bundle.profile.googleAvatarUrl,
            bundle.profile.profileCompletedAt,
            bundle.profile.updatedAt,
          );
        }
      }

      if (bundle.settings) {
        const current = await db.getFirstAsync<AppSettingsRow>('SELECT * FROM app_settings WHERE id = 1 LIMIT 1');
        const currentUpdatedAt = current?.updated_at ?? '';
        if (!currentUpdatedAt || bundle.settings.updatedAt >= currentUpdatedAt) {
          await db.runAsync(
            `UPDATE app_settings
             SET currency_code = ?,
                 opening_balance_minor = ?,
                 opening_balance_currency_code = ?,
                 theme = ?,
                 date_format = ?,
                 onboarding_completed = ?,
                 currency_initialized = ?,
                 show_home_budget_shortcut = ?,
                 updated_at = ?
             WHERE id = 1`,
            bundle.settings.currencyCode,
            bundle.settings.openingBalanceMinor,
            bundle.settings.openingBalanceCurrencyCode,
            bundle.settings.theme,
            bundle.settings.dateFormat,
            bundle.settings.onboardingCompleted ? 1 : 0,
            bundle.settings.currencyInitialized ? 1 : 0,
            bundle.settings.showHomeBudgetShortcut ? 1 : 0,
            bundle.settings.updatedAt,
          );
        }
      }

      // Root categories before subcategories
      const orderedCats = [...bundle.categories].sort((a, b) => {
        if (!a.parentId && b.parentId) return -1;
        if (a.parentId && !b.parentId) return 1;
        return 0;
      });
      for (const cat of orderedCats) {
        const existing = await db.getFirstAsync<Pick<CategoryRow, 'id' | 'updated_at' | 'deleted_at'>>(
          'SELECT id, updated_at, deleted_at FROM categories WHERE id = ? LIMIT 1',
          cat.id,
        );
        const existingStamp = existing ? (existing.deleted_at ?? existing.updated_at) : '';
        const incomingStamp = cat.deletedAt ?? cat.updatedAt;
        if (existing && existingStamp > incomingStamp) continue;

        await db.runAsync(
          `INSERT INTO categories (
            id, name, type, parent_id, icon, color, image_uri, is_default, is_archived, deleted_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            type = excluded.type,
            parent_id = excluded.parent_id,
            icon = excluded.icon,
            color = excluded.color,
            image_uri = excluded.image_uri,
            is_default = excluded.is_default,
            is_archived = excluded.is_archived,
            deleted_at = excluded.deleted_at,
            updated_at = excluded.updated_at`,
          cat.id,
          cat.name,
          cat.type,
          cat.parentId,
          cat.icon,
          cat.color,
          cat.imageUri,
          cat.isDefault ? 1 : 0,
          cat.isArchived ? 1 : 0,
          cat.deletedAt,
          cat.createdAt,
          cat.updatedAt,
        );
      }

      for (const pm of bundle.paymentMethods) {
        const existing = await db.getFirstAsync<Pick<PaymentMethodRow, 'id' | 'updated_at' | 'deleted_at'>>(
          'SELECT id, updated_at, deleted_at FROM payment_methods WHERE id = ? LIMIT 1',
          pm.id,
        );
        const existingStamp = existing ? (existing.deleted_at ?? existing.updated_at) : '';
        const incomingStamp = pm.deletedAt ?? pm.updatedAt;
        if (existing && existingStamp > incomingStamp) continue;

        await db.runAsync(
          `INSERT INTO payment_methods (
            id, name, icon, image_uri, is_builtin, is_archived, deleted_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            icon = excluded.icon,
            image_uri = excluded.image_uri,
            is_builtin = excluded.is_builtin,
            is_archived = excluded.is_archived,
            deleted_at = excluded.deleted_at,
            updated_at = excluded.updated_at`,
          pm.id,
          pm.name,
          pm.icon,
          pm.imageUri,
          pm.isBuiltin ? 1 : 0,
          pm.isArchived ? 1 : 0,
          pm.deletedAt,
          pm.createdAt,
          pm.updatedAt,
        );
      }

      for (const tag of bundle.tags) {
        const existing = await db.getFirstAsync<Pick<TagRow, 'id' | 'updated_at' | 'deleted_at'>>(
          'SELECT id, updated_at, deleted_at FROM tags WHERE id = ? LIMIT 1',
          tag.id,
        );
        const existingStamp = existing ? (existing.deleted_at ?? existing.updated_at) : '';
        const incomingStamp = tag.deletedAt ?? tag.updatedAt;
        if (existing && existingStamp > incomingStamp) continue;

        await db.runAsync(
          `INSERT INTO tags (
            id, name, color, is_archived, deleted_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            color = excluded.color,
            is_archived = excluded.is_archived,
            deleted_at = excluded.deleted_at,
            updated_at = excluded.updated_at`,
          tag.id,
          tag.name,
          tag.color,
          tag.isArchived ? 1 : 0,
          tag.deletedAt,
          tag.createdAt,
          tag.updatedAt,
        );
      }

      for (const b of bundle.budgets) {
        const existing = await db.getFirstAsync<Pick<BudgetRow, 'id' | 'updated_at' | 'deleted_at'>>(
          'SELECT id, updated_at, deleted_at FROM budgets WHERE id = ? LIMIT 1',
          b.id,
        );
        const existingStamp = existing ? (existing.deleted_at ?? existing.updated_at) : '';
        const incomingStamp = b.deletedAt ?? b.updatedAt;
        if (existing && existingStamp > incomingStamp) continue;

        await db.runAsync(
          `INSERT INTO budgets (
            id, amount_minor, currency_code, period, month, year, start_date, category_id, deleted_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            amount_minor = excluded.amount_minor,
            currency_code = excluded.currency_code,
            period = excluded.period,
            month = excluded.month,
            year = excluded.year,
            start_date = excluded.start_date,
            category_id = excluded.category_id,
            deleted_at = excluded.deleted_at,
            updated_at = excluded.updated_at`,
          b.id,
          b.amountMinor,
          b.currencyCode,
          b.period,
          b.month,
          b.year,
          b.startDate,
          b.categoryId,
          b.deletedAt,
          b.createdAt,
          b.updatedAt,
        );
      }

      for (const tx of bundle.transactions) {
        const existing = await db.getFirstAsync<Pick<TransactionRow, 'id' | 'updated_at' | 'deleted_at'>>(
          'SELECT id, updated_at, deleted_at FROM transactions WHERE id = ? LIMIT 1',
          tx.id,
        );
        const existingStamp = existing ? (existing.deleted_at ?? existing.updated_at) : '';
        const incomingStamp = tx.deletedAt ?? tx.updatedAt;
        if (existing && existingStamp > incomingStamp) continue;

        await db.runAsync(
          `INSERT INTO transactions (
            id, type, title, amount_minor, currency_code, category_id, category_name_snapshot,
            payment_method_id, payment_method, transaction_date, note, deleted_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            type = excluded.type,
            title = excluded.title,
            amount_minor = excluded.amount_minor,
            currency_code = excluded.currency_code,
            category_id = excluded.category_id,
            category_name_snapshot = excluded.category_name_snapshot,
            payment_method_id = excluded.payment_method_id,
            payment_method = excluded.payment_method,
            transaction_date = excluded.transaction_date,
            note = excluded.note,
            deleted_at = excluded.deleted_at,
            updated_at = excluded.updated_at`,
          tx.id,
          tx.type,
          tx.title,
          tx.amountMinor,
          tx.currencyCode,
          tx.categoryId,
          tx.categoryNameSnapshot,
          tx.paymentMethodId,
          tx.paymentMethod,
          tx.transactionDate,
          tx.note,
          tx.deletedAt,
          tx.createdAt,
          tx.updatedAt,
        );
      }

      for (const tt of bundle.transactionTags) {
        const existing = await db.getFirstAsync<Pick<TransactionTagRow, 'updated_at' | 'deleted_at'>>(
          'SELECT updated_at, deleted_at FROM transaction_tags WHERE transaction_id = ? AND tag_id = ? LIMIT 1',
          tt.transactionId,
          tt.tagId,
        );
        const existingStamp = existing ? (existing.deleted_at ?? existing.updated_at ?? '') : '';
        const incomingStamp = tt.deletedAt ?? tt.updatedAt;
        if (existing && existingStamp > incomingStamp) continue;

        await db.runAsync(
          `INSERT INTO transaction_tags (transaction_id, tag_id, deleted_at, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(transaction_id, tag_id) DO UPDATE SET
             deleted_at = excluded.deleted_at,
             updated_at = excluded.updated_at`,
          tt.transactionId,
          tt.tagId,
          tt.deletedAt,
          tt.updatedAt,
        );
      }
    });
  }

  async resetWorkspaceForAccountSwitch(targetUser: {
    userId: string;
    email: string | null;
  }): Promise<void> {
    const db = await this.getDb();

    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM sync_outbox');
      await db.runAsync('DELETE FROM media_sync_map');
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

      await db.runAsync(
        `UPDATE sync_state
         SET linked_user_id = ?,
             linked_user_email = ?,
             migration_completed_at = NULL,
             last_synced_at = NULL,
             last_error = NULL,
             sync_status = 'idle',
             cursors_json = '{}'
         WHERE id = 1`,
        targetUser.userId,
        targetUser.email,
      );

      await db.runAsync(
        `UPDATE entitlement_cache
         SET user_id = ?, tier = 'free', status = 'active', expires_at = NULL, source = 'default', updated_at = NULL
         WHERE id = 1`,
        targetUser.userId,
      );
    });
  }

  async getMediaMapEntriesByState(
    syncState: 'pending_upload' | 'synced' | 'pending_delete',
  ): Promise<MediaSyncMapRow[]> {
    const db = await this.getDb();
    return db.getAllAsync<MediaSyncMapRow>(
      'SELECT * FROM media_sync_map WHERE sync_state = ?',
      syncState,
    );
  }

  async getMediaMapByLocalPath(localPath: string): Promise<MediaSyncMapRow | null> {
    const db = await this.getDb();
    return db.getFirstAsync<MediaSyncMapRow>(
      'SELECT * FROM media_sync_map WHERE local_path = ? LIMIT 1',
      localPath,
    );
  }

  async getMediaMapByRemotePath(remotePath: string): Promise<MediaSyncMapRow | null> {
    const db = await this.getDb();
    return db.getFirstAsync<MediaSyncMapRow>(
      'SELECT * FROM media_sync_map WHERE remote_path = ? LIMIT 1',
      remotePath,
    );
  }

  async upsertMediaMap(row: MediaSyncMapRow): Promise<void> {
    const db = await this.getDb();
    await db.runAsync(
      `INSERT INTO media_sync_map (
        local_path, entity_type, entity_id, remote_path, user_id, content_hash, sync_state, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(local_path) DO UPDATE SET
        entity_type = excluded.entity_type,
        entity_id = excluded.entity_id,
        remote_path = excluded.remote_path,
        user_id = excluded.user_id,
        content_hash = excluded.content_hash,
        sync_state = excluded.sync_state,
        updated_at = excluded.updated_at`,
      row.local_path,
      row.entity_type,
      row.entity_id,
      row.remote_path,
      row.user_id,
      row.content_hash,
      row.sync_state,
      row.updated_at,
    );
  }

  async deleteMediaMapEntry(localPath: string): Promise<void> {
    const db = await this.getDb();
    await db.runAsync('DELETE FROM media_sync_map WHERE local_path = ?', localPath);
  }

  async getEntitlementCache(): Promise<UserEntitlement> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<EntitlementCacheRow>(
      'SELECT * FROM entitlement_cache WHERE id = 1 LIMIT 1',
    );
    if (!row) {
      return {
        userId: null,
        tier: 'free',
        status: 'active',
        expiresAt: null,
        source: 'default',
        updatedAt: null,
      };
    }
    return {
      userId: row.user_id ?? null,
      tier: row.tier ?? 'free',
      status: row.status ?? 'active',
      expiresAt: row.expires_at ?? null,
      source: row.source ?? 'default',
      updatedAt: row.updated_at ?? null,
    };
  }

  async saveEntitlementCache(entitlement: UserEntitlement): Promise<void> {
    const db = await this.getDb();
    await db.runAsync(
      `INSERT INTO entitlement_cache (
        id, user_id, tier, status, expires_at, source, updated_at
      ) VALUES (1, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        user_id = excluded.user_id,
        tier = excluded.tier,
        status = excluded.status,
        expires_at = excluded.expires_at,
        source = excluded.source,
        updated_at = excluded.updated_at`,
      entitlement.userId,
      entitlement.tier,
      entitlement.status,
      entitlement.expiresAt,
      entitlement.source,
      entitlement.updatedAt ?? new Date().toISOString(),
    );
  }

  async hasUserFinancialData(): Promise<boolean> {
    const db = await this.getDb();
    const txCount = await db.getFirstAsync<{ cnt: number }>(
      'SELECT COUNT(*) AS cnt FROM transactions WHERE deleted_at IS NULL',
    );
    if ((txCount?.cnt ?? 0) > 0) return true;

    const budgetCount = await db.getFirstAsync<{ cnt: number }>(
      'SELECT COUNT(*) AS cnt FROM budgets WHERE deleted_at IS NULL',
    );
    if ((budgetCount?.cnt ?? 0) > 0) return true;

    const tagCount = await db.getFirstAsync<{ cnt: number }>(
      'SELECT COUNT(*) AS cnt FROM tags WHERE deleted_at IS NULL',
    );
    if ((tagCount?.cnt ?? 0) > 0) return true;

    const customCatCount = await db.getFirstAsync<{ cnt: number }>(
      'SELECT COUNT(*) AS cnt FROM categories WHERE is_default = 0 AND deleted_at IS NULL',
    );
    if ((customCatCount?.cnt ?? 0) > 0) return true;

    const customPmCount = await db.getFirstAsync<{ cnt: number }>(
      'SELECT COUNT(*) AS cnt FROM payment_methods WHERE is_builtin = 0 AND deleted_at IS NULL',
    );
    if ((customPmCount?.cnt ?? 0) > 0) return true;

    const settings = await db.getFirstAsync<Pick<AppSettingsRow, 'opening_balance_minor'>>(
      'SELECT opening_balance_minor FROM app_settings WHERE id = 1 LIMIT 1',
    );
    return (settings?.opening_balance_minor ?? 0) > 0;
  }
}
