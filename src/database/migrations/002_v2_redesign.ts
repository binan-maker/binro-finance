import { DEFAULT_CATEGORIES, DEFAULT_PAYMENT_METHODS } from '@/constants/categories';
import { DEFAULT_CURRENCY_CODE, FALLBACK_CURRENCIES } from '@/constants/currencies';

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

export const CREATE_V2_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#10B981',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_unique_name
  ON tags(LOWER(name));

CREATE TABLE IF NOT EXISTS transaction_tags (
  transaction_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (transaction_id, tag_id),
  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_transaction_tags_tag
  ON transaction_tags(tag_id);

CREATE TABLE IF NOT EXISTS payment_methods (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'wallet',
  is_builtin INTEGER NOT NULL DEFAULT 0 CHECK (is_builtin IN (0, 1)),
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_methods_unique_name
  ON payment_methods(LOWER(name));

CREATE TABLE IF NOT EXISTS currency_catalog (
  code TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  minor_units INTEGER NOT NULL DEFAULT 2,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('backup', 'budget_alert', 'system')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
  metadata_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_created
  ON notifications(created_at DESC);
`;

export async function seedDefaultPaymentMethods(db: SqlDatabaseAdapter): Promise<void> {
  const now = new Date().toISOString();
  for (const pm of DEFAULT_PAYMENT_METHODS) {
    const hasDeletedAt = await hasColumn(db, 'payment_methods', 'deleted_at');
    const existing = await db.getFirstAsync<{ id: string }>(
      hasDeletedAt
        ? 'SELECT id FROM payment_methods WHERE id = ? OR (LOWER(name) = LOWER(?) AND deleted_at IS NULL) LIMIT 1'
        : 'SELECT id FROM payment_methods WHERE id = ? OR LOWER(name) = LOWER(?) LIMIT 1',
      pm.id,
      pm.name,
    );
    if (!existing) {
      await db.runAsync(
        `INSERT INTO payment_methods (
          id, name, icon, is_builtin, is_archived, created_at, updated_at
        ) VALUES (?, ?, ?, 1, 0, ?, ?)`,
        pm.id,
        pm.name,
        pm.icon,
        now,
        now,
      );
    }
  }
}

export async function seedDefaultCurrencies(db: SqlDatabaseAdapter): Promise<void> {
  const now = new Date().toISOString();
  for (const curr of FALLBACK_CURRENCIES) {
    await db.runAsync(
      `INSERT OR IGNORE INTO currency_catalog (
        code, name, symbol, minor_units, updated_at
      ) VALUES (?, ?, ?, ?, ?)`,
      curr.code,
      curr.name,
      curr.symbol,
      curr.minorUnits,
      now,
    );
  }
}

export async function seedV2DefaultCategoriesSafely(db: SqlDatabaseAdapter): Promise<void> {
  const now = new Date().toISOString();
  const hasDeletedAt = await hasColumn(db, 'categories', 'deleted_at');
  for (const cat of DEFAULT_CATEGORIES) {
    const existing = await db.getFirstAsync<{ id: string }>(
      hasDeletedAt
        ? 'SELECT id FROM categories WHERE id = ? OR (LOWER(name) = LOWER(?) AND type = ? AND deleted_at IS NULL) LIMIT 1'
        : 'SELECT id FROM categories WHERE id = ? OR (LOWER(name) = LOWER(?) AND type = ?) LIMIT 1',
      cat.id,
      cat.name,
      cat.type,
    );
    if (!existing) {
      await db.runAsync(
        `INSERT INTO categories (
          id, name, type, parent_id, icon, color, is_default, is_archived, created_at, updated_at
        ) VALUES (?, ?, ?, NULL, ?, ?, 1, 0, ?, ?)`,
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
}

export const v2RedesignMigration: DatabaseMigration = {
  version: 2,
  name: '002_v2_redesign_multicurrency_tags_pm_notifications',
  up: async (db) => {
    await db.execAsync(CREATE_V2_TABLES_SQL);

    if (!(await hasColumn(db, 'categories', 'parent_id'))) {
      await db.execAsync(
        'ALTER TABLE categories ADD COLUMN parent_id TEXT REFERENCES categories(id) ON DELETE SET NULL;',
      );
    }

    if (!(await hasColumn(db, 'transactions', 'currency_code'))) {
      await db.execAsync('ALTER TABLE transactions ADD COLUMN currency_code TEXT;');
    }

    if (!(await hasColumn(db, 'transactions', 'payment_method_id'))) {
      await db.execAsync(
        'ALTER TABLE transactions ADD COLUMN payment_method_id TEXT REFERENCES payment_methods(id) ON DELETE SET NULL;',
      );
    }

    if (!(await hasColumn(db, 'app_settings', 'opening_balance_currency_code'))) {
      await db.execAsync('ALTER TABLE app_settings ADD COLUMN opening_balance_currency_code TEXT;');
    }

    if (!(await hasColumn(db, 'budgets', 'currency_code'))) {
      await db.execAsync('ALTER TABLE budgets ADD COLUMN currency_code TEXT;');
    }

    await db.execAsync('DROP INDEX IF EXISTS idx_budgets_unique_scope;');
    await db.execAsync(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_unique_scope_v2
      ON budgets(period, year, month, COALESCE(currency_code, ''), COALESCE(category_id, ''));
    `);
    await db.execAsync(
      'CREATE INDEX IF NOT EXISTS idx_transactions_currency_date ON transactions(currency_code, transaction_date DESC);',
    );
    await db.execAsync(
      'CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);',
    );

    const settingsRow = await db.getFirstAsync<{ currency_code: string }>(
      'SELECT currency_code FROM app_settings WHERE id = 1 LIMIT 1',
    );
    const activeCurrency = settingsRow?.currency_code || DEFAULT_CURRENCY_CODE;

    await db.runAsync(
      `UPDATE app_settings
       SET opening_balance_currency_code = currency_code
       WHERE opening_balance_currency_code IS NULL OR TRIM(opening_balance_currency_code) = ''`,
    );

    await db.runAsync(
      `UPDATE transactions
       SET currency_code = ?
       WHERE currency_code IS NULL OR TRIM(currency_code) = ''`,
      activeCurrency,
    );

    await db.runAsync(
      `UPDATE budgets
       SET currency_code = ?
       WHERE currency_code IS NULL OR TRIM(currency_code) = ''`,
      activeCurrency,
    );

    // Upgrade V1 default category labels cleanly without breaking existing IDs or creating duplicates
    const foodClash = await db.getFirstAsync<{ id: string }>(
      "SELECT id FROM categories WHERE LOWER(name) = 'food & drink' AND type = 'expense' LIMIT 1",
    );
    if (!foodClash) {
      await db.runAsync(
        `UPDATE categories
         SET name = 'Food & Drink', icon = 'utensils', color = '#059669'
         WHERE id = 'cat-exp-food' AND name = 'Food'`,
      );
    }

    const billsClash = await db.getFirstAsync<{ id: string }>(
      "SELECT id FROM categories WHERE LOWER(name) = 'utilities' AND type = 'expense' LIMIT 1",
    );
    if (!billsClash) {
      await db.runAsync(
        `UPDATE categories
         SET name = 'Utilities', icon = 'zap', color = '#14B8A6'
         WHERE id = 'cat-exp-bills' AND name = 'Bills'`,
      );
    }

    await seedDefaultPaymentMethods(db);
    await seedDefaultCurrencies(db);
    await seedV2DefaultCategoriesSafely(db);

    // Link existing transactions to built-in payment method records where matching
    await db.runAsync(
      `UPDATE transactions
       SET payment_method_id = 'pm-cash', payment_method = 'Cash'
       WHERE payment_method_id IS NULL AND LOWER(TRIM(COALESCE(payment_method, ''))) = 'cash'`,
    );
    await db.runAsync(
      `UPDATE transactions
       SET payment_method_id = 'pm-upi', payment_method = 'UPI'
       WHERE payment_method_id IS NULL AND LOWER(TRIM(COALESCE(payment_method, ''))) = 'upi'`,
    );
    await db.runAsync(
      `UPDATE transactions
       SET payment_method_id = 'pm-card', payment_method = 'Card'
       WHERE payment_method_id IS NULL AND LOWER(TRIM(COALESCE(payment_method, ''))) = 'card'`,
    );
    await db.runAsync(
      `UPDATE transactions
       SET payment_method_id = 'pm-bank', payment_method = 'Bank Transfer'
       WHERE payment_method_id IS NULL AND LOWER(TRIM(COALESCE(payment_method, ''))) = 'bank transfer'`,
    );
  },
};
