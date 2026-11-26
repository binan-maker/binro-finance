-- ==============================================================================
-- BinRo Finance — Supabase Migration 003: Privacy-Preserving Analytics & Entitlements
-- ==============================================================================
-- 1. analytics_events:
--    - Append-only INSERT by app clients (anonymous_install_id + optional auth user_id)
--    - Strictly forbids financial fields (amounts, balances, notes, titles, budgets, PII)
--    - ZERO client SELECT/UPDATE/DELETE access
--    - Aggregated solely inside `internal_analytics` schema (no auth.users exposure)
--
-- 2. user_entitlements:
--    - Read-only SELECT for the owning authenticated user
--    - Mutations restricted exclusively to privileged server / service-role workflows
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Privacy-preserving analytics_events
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anonymous_install_id TEXT NOT NULL CHECK (char_length(anonymous_install_id) BETWEEN 8 AND 128),
  user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL CHECK (
    event_name IN (
      'app_opened',
      'onboarding_completed',
      'transaction_created',
      'backup_completed',
      'sync_started',
      'sync_completed',
      'sync_failed',
      'google_sign_in_completed',
      'feature_opened'
    )
  ),
  app_version TEXT NOT NULL CHECK (char_length(app_version) BETWEEN 1 AND 32),
  platform TEXT NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_analytics_metadata_is_object
    CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT chk_analytics_metadata_size
    CHECK (pg_column_size(metadata) <= 2048),
  CONSTRAINT chk_analytics_no_private_finance_keys
    CHECK (
      NOT (
        metadata ?| ARRAY[
          'amount',
          'amount_minor',
          'amountMinor',
          'balance',
          'opening_balance',
          'opening_balance_minor',
          'openingBalanceMinor',
          'title',
          'merchant',
          'note',
          'notes',
          'description',
          'budget',
          'budget_amount',
          'category_name',
          'payment_method_name',
          'tag_name',
          'email',
          'name',
          'display_name',
          'phone',
          'date_of_birth'
        ]
      )
    )
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_created_name
  ON public.analytics_events (created_at DESC, event_name);

CREATE INDEX IF NOT EXISTS idx_analytics_events_install
  ON public.analytics_events (anonymous_install_id, created_at DESC);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Clients can insert anonymous or own-user events only; never read, update, or delete.
REVOKE ALL ON public.analytics_events FROM anon, authenticated;
GRANT INSERT ON public.analytics_events TO anon, authenticated;

DROP POLICY IF EXISTS analytics_insert_anon_or_own ON public.analytics_events;
CREATE POLICY analytics_insert_anon_or_own ON public.analytics_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    (auth.uid() IS NULL AND user_id IS NULL)
    OR (auth.uid() IS NOT NULL AND (user_id IS NULL OR user_id = (SELECT auth.uid())))
  );

-- Internal-only reporting schema (never exposed to PostgREST / anon / authenticated roles)
CREATE SCHEMA IF NOT EXISTS internal_analytics;
REVOKE ALL ON SCHEMA internal_analytics FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE VIEW internal_analytics.daily_event_counts AS
SELECT
  date_trunc('day', created_at)::date AS event_day,
  event_name,
  platform,
  COUNT(*) AS total_events,
  COUNT(DISTINCT anonymous_install_id) AS unique_installs
FROM public.analytics_events
GROUP BY 1, 2, 3
ORDER BY 1 DESC, 4 DESC;

REVOKE ALL ON internal_analytics.daily_event_counts FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 2. Subscription Entitlement Foundation (`user_entitlements`)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_entitlements (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'pro')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'inactive', 'grace_period', 'expired')
  ),
  expires_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'default',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_entitlements ENABLE ROW LEVEL SECURITY;

-- Clients may ONLY read their own entitlement row; only service-role / server webhooks write.
REVOKE ALL ON public.user_entitlements FROM anon, authenticated;
GRANT SELECT ON public.user_entitlements TO authenticated;

DROP POLICY IF EXISTS entitlements_select_own ON public.user_entitlements;
CREATE POLICY entitlements_select_own ON public.user_entitlements
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
