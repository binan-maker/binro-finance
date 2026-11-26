-- ==============================================================================
-- BinRo Finance — Supabase Migration 001: Core Schema, Constraints, Indexes, Triggers
-- ==============================================================================
-- Preserves local-first TEXT record IDs (e.g., cat-exp-food, pm-upi, UUID strings),
-- BIGINT integer minor-unit monetary values, currency isolation, and soft-delete
-- tombstones (`deleted_at`) + monotonic `server_updated_at` for keyset sync.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Trigger helpers
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.binro_handle_timestamps()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    NEW.updated_at := COALESCE(NEW.updated_at, NEW.created_at, NOW());
    NEW.server_updated_at := NOW();
  ELSE
    NEW.created_at := OLD.created_at;
    NEW.updated_at := COALESCE(NEW.updated_at, NOW());
    NEW.server_updated_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.binro_handle_settings_timestamps()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := COALESCE(NEW.updated_at, NOW());
  NEW.server_updated_at := NOW();
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------
-- 1. profiles (1:1 per authenticated user)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  bio TEXT,
  avatar_remote_path TEXT,
  google_name TEXT,
  google_email TEXT,
  google_avatar_url TEXT,
  gender TEXT CHECK (
    gender IS NULL OR gender IN ('prefer_not_to_say', 'female', 'male', 'non_binary', 'other')
  ),
  date_of_birth DATE,
  profile_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  server_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_server_cursor
  ON public.profiles (user_id, server_updated_at);

DROP TRIGGER IF EXISTS trg_profiles_timestamps ON public.profiles;
CREATE TRIGGER trg_profiles_timestamps
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.binro_handle_timestamps();

-- ------------------------------------------------------------------------------
-- 2. user_settings (1:1 per authenticated user; replaces local singleton id=1)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  currency_code TEXT NOT NULL DEFAULT 'INR' CHECK (currency_code ~ '^[A-Z]{3}$'),
  opening_balance_minor BIGINT NOT NULL DEFAULT 0 CHECK (opening_balance_minor >= 0),
  opening_balance_currency_code TEXT NOT NULL DEFAULT 'INR' CHECK (
    opening_balance_currency_code ~ '^[A-Z]{3}$'
  ),
  theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('system', 'light', 'dark')),
  date_format TEXT NOT NULL DEFAULT 'DD MMM YYYY' CHECK (
    date_format IN ('YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'DD MMM YYYY')
  ),
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  currency_initialized BOOLEAN NOT NULL DEFAULT FALSE,
  show_home_budget_shortcut BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  server_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_settings_server_cursor
  ON public.user_settings (user_id, server_updated_at);

DROP TRIGGER IF EXISTS trg_user_settings_timestamps ON public.user_settings;
CREATE TRIGGER trg_user_settings_timestamps
  BEFORE INSERT OR UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.binro_handle_settings_timestamps();

-- ------------------------------------------------------------------------------
-- 3. categories
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.categories (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (char_length(trim(name)) > 0),
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  parent_id TEXT,
  icon TEXT,
  color TEXT,
  image_remote_path TEXT,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  server_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id),
  CONSTRAINT fk_categories_parent_same_user
    FOREIGN KEY (user_id, parent_id) REFERENCES public.categories(user_id, id) ON DELETE SET NULL,
  CONSTRAINT chk_categories_not_self_parent
    CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_user_unique_name_type
  ON public.categories (user_id, LOWER(name), type)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_categories_user_cursor
  ON public.categories (user_id, server_updated_at, id);

CREATE INDEX IF NOT EXISTS idx_categories_user_updated_deleted
  ON public.categories (user_id, updated_at, deleted_at);

DROP TRIGGER IF EXISTS trg_categories_timestamps ON public.categories;
CREATE TRIGGER trg_categories_timestamps
  BEFORE INSERT OR UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.binro_handle_timestamps();

-- ------------------------------------------------------------------------------
-- 4. payment_methods
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_methods (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (char_length(trim(name)) > 0),
  icon TEXT,
  image_remote_path TEXT,
  is_builtin BOOLEAN NOT NULL DEFAULT FALSE,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  server_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_methods_user_unique_name
  ON public.payment_methods (user_id, LOWER(name))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_payment_methods_user_cursor
  ON public.payment_methods (user_id, server_updated_at, id);

CREATE INDEX IF NOT EXISTS idx_payment_methods_user_updated_deleted
  ON public.payment_methods (user_id, updated_at, deleted_at);

DROP TRIGGER IF EXISTS trg_payment_methods_timestamps ON public.payment_methods;
CREATE TRIGGER trg_payment_methods_timestamps
  BEFORE INSERT OR UPDATE ON public.payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.binro_handle_timestamps();

-- ------------------------------------------------------------------------------
-- 5. tags
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tags (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (char_length(trim(name)) > 0),
  color TEXT,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  server_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_user_unique_name
  ON public.tags (user_id, LOWER(name))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tags_user_cursor
  ON public.tags (user_id, server_updated_at, id);

CREATE INDEX IF NOT EXISTS idx_tags_user_updated_deleted
  ON public.tags (user_id, updated_at, deleted_at);

DROP TRIGGER IF EXISTS trg_tags_timestamps ON public.tags;
CREATE TRIGGER trg_tags_timestamps
  BEFORE INSERT OR UPDATE ON public.tags
  FOR EACH ROW EXECUTE FUNCTION public.binro_handle_timestamps();

-- ------------------------------------------------------------------------------
-- 6. transactions
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transactions (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  title TEXT NOT NULL CHECK (char_length(trim(title)) > 0),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency_code TEXT NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  category_id TEXT,
  category_name_snapshot TEXT,
  payment_method_id TEXT,
  payment_method TEXT,
  transaction_date DATE NOT NULL,
  note TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  server_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id),
  CONSTRAINT fk_transactions_category_same_user
    FOREIGN KEY (user_id, category_id) REFERENCES public.categories(user_id, id) ON DELETE SET NULL,
  CONSTRAINT fk_transactions_pm_same_user
    FOREIGN KEY (user_id, payment_method_id) REFERENCES public.payment_methods(user_id, id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_date
  ON public.transactions (user_id, transaction_date DESC, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_user_category
  ON public.transactions (user_id, category_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_user_pm
  ON public.transactions (user_id, payment_method_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_user_cursor
  ON public.transactions (user_id, server_updated_at, id);

CREATE INDEX IF NOT EXISTS idx_transactions_user_updated_deleted
  ON public.transactions (user_id, updated_at, deleted_at);

DROP TRIGGER IF EXISTS trg_transactions_timestamps ON public.transactions;
CREATE TRIGGER trg_transactions_timestamps
  BEFORE INSERT OR UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.binro_handle_timestamps();

-- ------------------------------------------------------------------------------
-- 7. transaction_tags
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transaction_tags (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  deleted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  server_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, transaction_id, tag_id),
  CONSTRAINT fk_tx_tags_transaction_same_user
    FOREIGN KEY (user_id, transaction_id) REFERENCES public.transactions(user_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_tx_tags_tag_same_user
    FOREIGN KEY (user_id, tag_id) REFERENCES public.tags(user_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tx_tags_user_tag
  ON public.transaction_tags (user_id, tag_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tx_tags_user_cursor
  ON public.transaction_tags (user_id, server_updated_at, transaction_id, tag_id);

DROP TRIGGER IF EXISTS trg_transaction_tags_timestamps ON public.transaction_tags;
CREATE TRIGGER trg_transaction_tags_timestamps
  BEFORE INSERT OR UPDATE ON public.transaction_tags
  FOR EACH ROW EXECUTE FUNCTION public.binro_handle_settings_timestamps();

-- ------------------------------------------------------------------------------
-- 8. budgets
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.budgets (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency_code TEXT NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  period TEXT NOT NULL DEFAULT 'monthly' CHECK (period IN ('monthly', 'biweekly', 'yearly')),
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INTEGER NOT NULL CHECK (year >= 1970),
  start_date DATE,
  category_id TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  server_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id),
  CONSTRAINT fk_budgets_category_same_user
    FOREIGN KEY (user_id, category_id) REFERENCES public.categories(user_id, id) ON DELETE CASCADE,
  CONSTRAINT chk_budgets_biweekly_start_date
    CHECK (period <> 'biweekly' OR start_date IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_user_unique_scope
  ON public.budgets (
    user_id,
    period,
    year,
    month,
    COALESCE(start_date, DATE '1900-01-01'),
    currency_code,
    COALESCE(category_id, '')
  )
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_budgets_user_lookup
  ON public.budgets (user_id, period, year, month, category_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_budgets_user_cursor
  ON public.budgets (user_id, server_updated_at, id);

DROP TRIGGER IF EXISTS trg_budgets_timestamps ON public.budgets;
CREATE TRIGGER trg_budgets_timestamps
  BEFORE INSERT OR UPDATE ON public.budgets
  FOR EACH ROW EXECUTE FUNCTION public.binro_handle_timestamps();
