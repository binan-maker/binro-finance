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

export const v3ProfileTagsMigration: DatabaseMigration = {
  version: 3,
  name: '003_v3_profile_tags_archive',
  up: async (db) => {
    if (!(await hasColumn(db, 'app_settings', 'profile_name'))) {
      await db.execAsync('ALTER TABLE app_settings ADD COLUMN profile_name TEXT;');
    }
    if (!(await hasColumn(db, 'app_settings', 'profile_bio'))) {
      await db.execAsync('ALTER TABLE app_settings ADD COLUMN profile_bio TEXT;');
    }
    if (!(await hasColumn(db, 'app_settings', 'profile_avatar'))) {
      await db.execAsync('ALTER TABLE app_settings ADD COLUMN profile_avatar TEXT;');
    }
    if (!(await hasColumn(db, 'app_settings', 'currency_initialized'))) {
      await db.execAsync(
        'ALTER TABLE app_settings ADD COLUMN currency_initialized INTEGER NOT NULL DEFAULT 0;',
      );
    }

    // Preserve existing onboarded users' saved currency preference
    await db.runAsync(
      `UPDATE app_settings
       SET currency_initialized = 1
       WHERE onboarding_completed = 1`,
    );

    if (!(await hasColumn(db, 'tags', 'is_archived'))) {
      await db.execAsync(
        'ALTER TABLE tags ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1));',
      );
    }
  },
};
