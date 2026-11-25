export const DATABASE_NAME = 'binro_finance.db';

export const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  icon TEXT,
  color TEXT,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  title TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  category_id TEXT,
  category_name_snapshot TEXT,
  payment_method TEXT,
  transaction_date TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  period TEXT NOT NULL CHECK (period IN ('monthly')),
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INTEGER NOT NULL CHECK (year >= 1970),
  category_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
  currency_code TEXT NOT NULL,
  opening_balance_minor INTEGER NOT NULL DEFAULT 0,
  theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('system', 'light', 'dark')),
  date_format TEXT NOT NULL DEFAULT 'DD MMM YYYY',
  onboarding_completed INTEGER NOT NULL DEFAULT 0 CHECK (onboarding_completed IN (0, 1))
);
`;

export const CREATE_INDEXES_SQL = `
CREATE INDEX IF NOT EXISTS idx_transactions_date
  ON transactions(transaction_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_type_date
  ON transactions(type, transaction_date);

CREATE INDEX IF NOT EXISTS idx_transactions_category
  ON transactions(category_id);

CREATE INDEX IF NOT EXISTS idx_categories_type_archived
  ON categories(type, is_archived);

CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_unique_name_type
  ON categories(LOWER(name), type);

CREATE INDEX IF NOT EXISTS idx_budgets_period
  ON budgets(year, month, category_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_unique_scope
  ON budgets(period, year, month, COALESCE(category_id, ''));
`;
