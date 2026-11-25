import { DEFAULT_CATEGORIES } from '@/constants/categories';
import { DEFAULT_CURRENCY_CODE } from '@/constants/currencies';

import type { SqlDatabaseAdapter } from '../driver';
import { CREATE_INDEXES_SQL, CREATE_TABLES_SQL } from '../schema';
import type { DatabaseMigration } from './types';

export async function seedDefaultCategories(db: SqlDatabaseAdapter): Promise<void> {
  const now = new Date().toISOString();
  for (const cat of DEFAULT_CATEGORIES) {
    await db.runAsync(
      `INSERT OR IGNORE INTO categories (
        id, name, type, icon, color, is_default, is_archived, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)`,
      cat.id,
      cat.name,
      cat.type,
      cat.icon,
      cat.color,
      now,
      now,
    );
  }
}

export async function seedDefaultSettings(db: SqlDatabaseAdapter): Promise<void> {
  await db.runAsync(
    `INSERT OR IGNORE INTO app_settings (
      id, currency_code, opening_balance_minor, theme, date_format, onboarding_completed
    ) VALUES (1, ?, 0, 'system', 'DD MMM YYYY', 0)`,
    DEFAULT_CURRENCY_CODE,
  );
}

export const initialMigration: DatabaseMigration = {
  version: 1,
  name: '001_initial_schema_and_seed',
  up: async (db) => {
    await db.execAsync(CREATE_TABLES_SQL);
    await db.execAsync(CREATE_INDEXES_SQL);
    await seedDefaultSettings(db);
    await seedDefaultCategories(db);
  },
};
