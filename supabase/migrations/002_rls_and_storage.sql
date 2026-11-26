-- ==============================================================================
-- BinRo Finance — Supabase Migration 002: Row Level Security & Private Storage
-- ==============================================================================
-- Enforces strict per-user isolation on every user-owned table and locks down
-- the private `binro-media` storage bucket to `{user_id}/...`.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- Enable Row Level Security on every user-owned table
-- ------------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- Helper macro-like explicit policies for every table (SELECT / INSERT / UPDATE / DELETE)
-- ------------------------------------------------------------------------------

-- profiles
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS profiles_delete_own ON public.profiles;
CREATE POLICY profiles_delete_own ON public.profiles
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- user_settings
DROP POLICY IF EXISTS user_settings_select_own ON public.user_settings;
CREATE POLICY user_settings_select_own ON public.user_settings
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS user_settings_insert_own ON public.user_settings;
CREATE POLICY user_settings_insert_own ON public.user_settings
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS user_settings_update_own ON public.user_settings;
CREATE POLICY user_settings_update_own ON public.user_settings
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS user_settings_delete_own ON public.user_settings;
CREATE POLICY user_settings_delete_own ON public.user_settings
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- categories
DROP POLICY IF EXISTS categories_select_own ON public.categories;
CREATE POLICY categories_select_own ON public.categories
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS categories_insert_own ON public.categories;
CREATE POLICY categories_insert_own ON public.categories
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS categories_update_own ON public.categories;
CREATE POLICY categories_update_own ON public.categories
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS categories_delete_own ON public.categories;
CREATE POLICY categories_delete_own ON public.categories
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- payment_methods
DROP POLICY IF EXISTS payment_methods_select_own ON public.payment_methods;
CREATE POLICY payment_methods_select_own ON public.payment_methods
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS payment_methods_insert_own ON public.payment_methods;
CREATE POLICY payment_methods_insert_own ON public.payment_methods
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS payment_methods_update_own ON public.payment_methods;
CREATE POLICY payment_methods_update_own ON public.payment_methods
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS payment_methods_delete_own ON public.payment_methods;
CREATE POLICY payment_methods_delete_own ON public.payment_methods
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- tags
DROP POLICY IF EXISTS tags_select_own ON public.tags;
CREATE POLICY tags_select_own ON public.tags
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS tags_insert_own ON public.tags;
CREATE POLICY tags_insert_own ON public.tags
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS tags_update_own ON public.tags;
CREATE POLICY tags_update_own ON public.tags
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS tags_delete_own ON public.tags;
CREATE POLICY tags_delete_own ON public.tags
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- transactions
DROP POLICY IF EXISTS transactions_select_own ON public.transactions;
CREATE POLICY transactions_select_own ON public.transactions
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS transactions_insert_own ON public.transactions;
CREATE POLICY transactions_insert_own ON public.transactions
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS transactions_update_own ON public.transactions;
CREATE POLICY transactions_update_own ON public.transactions
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS transactions_delete_own ON public.transactions;
CREATE POLICY transactions_delete_own ON public.transactions
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- transaction_tags
DROP POLICY IF EXISTS transaction_tags_select_own ON public.transaction_tags;
CREATE POLICY transaction_tags_select_own ON public.transaction_tags
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS transaction_tags_insert_own ON public.transaction_tags;
CREATE POLICY transaction_tags_insert_own ON public.transaction_tags
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS transaction_tags_update_own ON public.transaction_tags;
CREATE POLICY transaction_tags_update_own ON public.transaction_tags
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS transaction_tags_delete_own ON public.transaction_tags;
CREATE POLICY transaction_tags_delete_own ON public.transaction_tags
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- budgets
DROP POLICY IF EXISTS budgets_select_own ON public.budgets;
CREATE POLICY budgets_select_own ON public.budgets
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS budgets_insert_own ON public.budgets;
CREATE POLICY budgets_insert_own ON public.budgets
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS budgets_update_own ON public.budgets;
CREATE POLICY budgets_update_own ON public.budgets
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS budgets_delete_own ON public.budgets;
CREATE POLICY budgets_delete_own ON public.budgets
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ------------------------------------------------------------------------------
-- Private Storage Bucket (`binro-media`) and folder-scoped RLS policies
-- Path convention:
--   {user_id}/profile/{fileName}
--   {user_id}/categories/{fileName}
--   {user_id}/payment_methods/{fileName}
-- ------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'binro-media',
  'binro-media',
  FALSE,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = FALSE,
  file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

DROP POLICY IF EXISTS binro_media_select_own ON storage.objects;
CREATE POLICY binro_media_select_own ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'binro-media'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS binro_media_insert_own ON storage.objects;
CREATE POLICY binro_media_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'binro-media'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS binro_media_update_own ON storage.objects;
CREATE POLICY binro_media_update_own ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'binro-media'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'binro-media'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS binro_media_delete_own ON storage.objects;
CREATE POLICY binro_media_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'binro-media'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );
