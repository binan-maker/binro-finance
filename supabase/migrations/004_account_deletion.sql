-- ==============================================================================
-- BinRo Finance — Supabase Migration 004: Self-Service Account Deletion RPC
-- ==============================================================================
-- Allows an authenticated user to permanently delete their own Supabase account
-- and all cascaded user-owned cloud records (profiles, user_settings, categories,
-- payment_methods, tags, transactions, transaction_tags, budgets, user_entitlements).
--
-- Storage objects in private bucket `binro-media` should be removed via Storage API
-- by the client immediately before invoking `delete_own_account()`.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Disassociate non-PII analytics rows before deleting auth user
  UPDATE public.analytics_events
  SET user_id = NULL
  WHERE user_id = v_uid;

  -- Deleting the auth.users row cascades all user-owned tables via ON DELETE CASCADE
  DELETE FROM auth.users
  WHERE id = v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_own_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;
