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

export const v4BudgetsImagesMigration: DatabaseMigration = {
  version: 4,
  name: '004_v4_budgets_timeframes_category_images_home_shortcut',
  up: async (db) => {
    if (!(await hasColumn(db, 'categories', 'image_uri'))) {
      await db.execAsync('ALTER TABLE categories ADD COLUMN image_uri TEXT;');
    }

    if (!(await hasColumn(db, 'app_settings', 'show_home_budget_shortcut'))) {
      await db.execAsync(
        'ALTER TABLE app_settings ADD COLUMN show_home_budget_shortcut INTEGER NOT NULL DEFAULT 0 CHECK (show_home_budget_shortcut IN (0, 1));',
      );
    }

    // Rebuild budgets cleanly so period CHECK permits monthly, biweekly, and yearly
    // while preserving 100% of existing monthly/category budgets untouched.
    await db.execAsync(`
      CREATE TABLE budgets_v4 (
        id TEXT PRIMARY KEY NOT NULL,
        amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
        currency_code TEXT,
        period TEXT NOT NULL DEFAULT 'monthly' CHECK (period IN ('monthly', 'biweekly', 'yearly')),
        month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
        year INTEGER NOT NULL CHECK (year >= 1970),
        start_date TEXT,
        category_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
      );

      INSERT INTO budgets_v4 (
        id, amount_minor, currency_code, period, month, year, start_date, category_id, created_at, updated_at
      )
      SELECT
        id,
        amount_minor,
        currency_code,
        COALESCE(period, 'monthly'),
        month,
        year,
        NULL,
        category_id,
        created_at,
        updated_at
      FROM budgets;

      DROP TABLE budgets;
      ALTER TABLE budgets_v4 RENAME TO budgets;

      CREATE INDEX IF NOT EXISTS idx_budgets_period
        ON budgets(period, year, month, category_id);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_unique_scope_v4
        ON budgets(period, year, month, COALESCE(start_date, ''), COALESCE(currency_code, ''), COALESCE(category_id, ''));
    `);
  },
};
