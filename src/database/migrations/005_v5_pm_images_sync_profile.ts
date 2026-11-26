import { generateUUID } from '@/utils/uuid';

import type { SqlDatabaseAdapter } from '../driver';
import type { DatabaseMigration } from './types';

interface TableInfoRow {
  name: string;
}

async function hasColumn(
  db: SqlDatabaseAdapter,
  table: string,
  column: string,
): Promise<boolean> {
  const columns = await db.getAllAsync<TableInfoRow>(`PRAGMA table_info(${table});`);
  return columns.some((c) => c.name === column);
}

export const v5PmImagesSyncProfileMigration: DatabaseMigration = {
  version: 5,
  name: '005_v5_pm_images_sync_tombstones_profile',
  up: async (db) => {
    const now = new Date().toISOString();

    // 1. Payment method custom images + soft-delete tombstone column
    if (!(await hasColumn(db, 'payment_methods', 'image_uri'))) {
      await db.execAsync('ALTER TABLE payment_methods ADD COLUMN image_uri TEXT;');
    }
    if (!(await hasColumn(db, 'payment_methods', 'deleted_at'))) {
      await db.execAsync('ALTER TABLE payment_methods ADD COLUMN deleted_at TEXT;');
    }

    // 2. Soft-delete tombstones across remaining synced tables
    if (!(await hasColumn(db, 'categories', 'deleted_at'))) {
      await db.execAsync('ALTER TABLE categories ADD COLUMN deleted_at TEXT;');
    }
    if (!(await hasColumn(db, 'tags', 'deleted_at'))) {
      await db.execAsync('ALTER TABLE tags ADD COLUMN deleted_at TEXT;');
    }
    if (!(await hasColumn(db, 'transactions', 'deleted_at'))) {
      await db.execAsync('ALTER TABLE transactions ADD COLUMN deleted_at TEXT;');
    }
    if (!(await hasColumn(db, 'budgets', 'deleted_at'))) {
      await db.execAsync('ALTER TABLE budgets ADD COLUMN deleted_at TEXT;');
    }
    if (!(await hasColumn(db, 'transaction_tags', 'deleted_at'))) {
      await db.execAsync('ALTER TABLE transaction_tags ADD COLUMN deleted_at TEXT;');
    }
    if (!(await hasColumn(db, 'transaction_tags', 'updated_at'))) {
      await db.execAsync('ALTER TABLE transaction_tags ADD COLUMN updated_at TEXT;');
      await db.runAsync(
        'UPDATE transaction_tags SET updated_at = ? WHERE updated_at IS NULL;',
        now,
      );
    }

    // 3. Profile completion + Google identity metadata in app_settings
    if (!(await hasColumn(db, 'app_settings', 'gender'))) {
      await db.execAsync('ALTER TABLE app_settings ADD COLUMN gender TEXT;');
    }
    if (!(await hasColumn(db, 'app_settings', 'date_of_birth'))) {
      await db.execAsync('ALTER TABLE app_settings ADD COLUMN date_of_birth TEXT;');
    }
    if (!(await hasColumn(db, 'app_settings', 'google_name'))) {
      await db.execAsync('ALTER TABLE app_settings ADD COLUMN google_name TEXT;');
    }
    if (!(await hasColumn(db, 'app_settings', 'google_email'))) {
      await db.execAsync('ALTER TABLE app_settings ADD COLUMN google_email TEXT;');
    }
    if (!(await hasColumn(db, 'app_settings', 'google_avatar_url'))) {
      await db.execAsync('ALTER TABLE app_settings ADD COLUMN google_avatar_url TEXT;');
    }
    if (!(await hasColumn(db, 'app_settings', 'profile_completed_at'))) {
      await db.execAsync('ALTER TABLE app_settings ADD COLUMN profile_completed_at TEXT;');
    }
    if (!(await hasColumn(db, 'app_settings', 'updated_at'))) {
      await db.execAsync('ALTER TABLE app_settings ADD COLUMN updated_at TEXT;');
      await db.runAsync('UPDATE app_settings SET updated_at = ? WHERE updated_at IS NULL;', now);
    }

    // 4. Convert uniqueness indexes to partial unique indexes so tombstoned records
    // do not prevent re-creating a record with the same name/scope.
    await db.execAsync(`
      DROP INDEX IF EXISTS idx_categories_unique_name_type;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_unique_name_type
        ON categories(LOWER(name), type)
        WHERE deleted_at IS NULL;

      DROP INDEX IF EXISTS idx_tags_unique_name;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_unique_name
        ON tags(LOWER(name))
        WHERE deleted_at IS NULL;

      DROP INDEX IF EXISTS idx_payment_methods_unique_name;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_methods_unique_name
        ON payment_methods(LOWER(name))
        WHERE deleted_at IS NULL;

      DROP INDEX IF EXISTS idx_budgets_unique_scope;
      DROP INDEX IF EXISTS idx_budgets_unique_scope_v4;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_unique_scope_v5
        ON budgets(
          period,
          year,
          month,
          COALESCE(start_date, ''),
          COALESCE(currency_code, ''),
          COALESCE(category_id, '')
        )
        WHERE deleted_at IS NULL;
    `);

    // 5. Sync state, durable outbox, private media map, and cached entitlement tables
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS sync_state (
        id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
        linked_user_id TEXT,
        linked_user_email TEXT,
        migration_completed_at TEXT,
        last_synced_at TEXT,
        last_error TEXT,
        sync_status TEXT NOT NULL DEFAULT 'idle',
        cursors_json TEXT NOT NULL DEFAULT '{}',
        anonymous_install_id TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sync_outbox (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_user_id TEXT,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete')),
        payload_json TEXT,
        local_updated_at TEXT NOT NULL,
        retry_count INTEGER NOT NULL DEFAULT 0,
        next_retry_at TEXT,
        last_error TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'failed')),
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sync_outbox_pending
        ON sync_outbox(status, created_at ASC);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_outbox_coalesce
        ON sync_outbox(COALESCE(workspace_user_id, ''), entity_type, entity_id);

      CREATE TABLE IF NOT EXISTS media_sync_map (
        local_path TEXT PRIMARY KEY NOT NULL,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('profile', 'category', 'payment_method')),
        entity_id TEXT NOT NULL,
        remote_path TEXT,
        user_id TEXT,
        content_hash TEXT,
        sync_state TEXT NOT NULL DEFAULT 'pending_upload'
          CHECK (sync_state IN ('pending_upload', 'synced', 'pending_delete')),
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_media_sync_map_remote
        ON media_sync_map(remote_path);

      CREATE TABLE IF NOT EXISTS entitlement_cache (
        id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
        user_id TEXT,
        tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'pro')),
        status TEXT NOT NULL DEFAULT 'active'
          CHECK (status IN ('active', 'inactive', 'grace_period', 'expired')),
        expires_at TEXT,
        source TEXT NOT NULL DEFAULT 'default',
        updated_at TEXT
      );
    `);

    const existingSync = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM sync_state WHERE id = 1 LIMIT 1;',
    );
    if (!existingSync) {
      await db.runAsync(
        `INSERT OR IGNORE INTO sync_state (
          id, linked_user_id, linked_user_email, migration_completed_at,
          last_synced_at, last_error, sync_status, cursors_json, anonymous_install_id
        ) VALUES (1, NULL, NULL, NULL, NULL, NULL, 'idle', '{}', ?)`,
        generateUUID(),
      );
    }

    await db.runAsync(
      `INSERT OR IGNORE INTO entitlement_cache (
        id, user_id, tier, status, expires_at, source, updated_at
      ) VALUES (1, NULL, 'free', 'active', NULL, 'default', ?)`,
      now,
    );
  },
};
