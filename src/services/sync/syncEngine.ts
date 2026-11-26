import * as Network from 'expo-network';

import { repositories } from '@/database/repositories';
import type { RemoteSyncPullBundle } from '@/database/repositories/syncRepository';
import { clearAllStoredImages } from '@/services/images/localImageStorage';
import { getSupabaseClient } from '@/services/supabase/client';
import type { SyncOutboxRow } from '@/types/database';
import type {
  BudgetPeriod,
  CategoryType,
  DateFormatPreference,
  GenderOption,
  SyncEntityType,
  SyncStateSnapshot,
  ThemePreference,
  TransactionType,
} from '@/types/models';

import {
  ensureLocalMediaForRemotePath,
  resolveRemotePathForLocalImage,
  syncPendingMediaForUser,
} from './mediaSyncService';

const KEYSET_PAGE_SIZE = 200;
const PUSH_BATCH_SIZE = 100;
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 60 * 60 * 1000;

export type AccountLinkCheckResult =
  | { status: 'ready' }
  | { status: 'needs_link' }
  | {
      status: 'account_mismatch';
      previousUserId: string;
      previousUserEmail: string | null;
      hasLocalData: boolean;
      pendingOutboxCount: number;
    };

export interface SyncRunResult {
  status: 'synced' | 'offline' | 'skipped' | 'error';
  pushedCount: number;
  pulledCount: number;
  error?: string;
}

const ENTITY_PUSH_ORDER: readonly SyncEntityType[] = [
  'profile',
  'settings',
  'category',
  'payment_method',
  'tag',
  'budget',
  'transaction',
  'transaction_tag',
];

function computeNextRetryIso(retryCount: number): string {
  const delayMs = Math.min(BASE_BACKOFF_MS * Math.pow(2, retryCount), MAX_BACKOFF_MS);
  return new Date(Date.now() + delayMs).toISOString();
}

let inFlightSyncPromise: Promise<SyncRunResult> | null = null;

export async function inspectAccountLinkState(
  userId: string,
): Promise<AccountLinkCheckResult> {
  const syncState = await repositories.sync.getSyncState();
  if (!syncState.linkedUserId) {
    return { status: 'needs_link' };
  }
  if (syncState.linkedUserId === userId) {
    return { status: 'ready' };
  }

  const hasLocalData = await repositories.sync.hasUserFinancialData();
  const pendingOutboxCount = await repositories.sync.getPendingOutboxCount(
    syncState.linkedUserId,
  );
  return {
    status: 'account_mismatch',
    previousUserId: syncState.linkedUserId,
    previousUserEmail: syncState.linkedUserEmail,
    hasLocalData,
    pendingOutboxCount,
  };
}

export async function linkLocalWorkspaceToUser(params: {
  userId: string;
  email: string | null;
}): Promise<SyncRunResult> {
  const check = await inspectAccountLinkState(params.userId);
  if (check.status === 'account_mismatch') {
    throw new Error(
      'This device already holds financial data from a different signed-in Google account.',
    );
  }

  await repositories.sync.updateSyncState({
    linkedUserId: params.userId,
    linkedUserEmail: params.email,
    syncStatus: 'syncing',
    lastError: null,
  });

  await repositories.sync.enqueueFullWorkspaceForMigration(params.userId);
  const result = await runSyncCycle(params.userId);
  if (result.status === 'synced') {
    await repositories.sync.updateSyncState({
      migrationCompletedAt: new Date().toISOString(),
    });
  }
  return result;
}

export async function switchWorkspaceAccountAndSync(params: {
  userId: string;
  email: string | null;
}): Promise<SyncRunResult> {
  clearAllStoredImages();
  await repositories.sync.resetWorkspaceForAccountSwitch({
    userId: params.userId,
    email: params.email,
  });
  const result = await runSyncCycle(params.userId);
  if (result.status === 'synced') {
    await repositories.sync.updateSyncState({
      migrationCompletedAt: new Date().toISOString(),
    });
  }
  return result;
}

async function pushOutboxForUser(userId: string): Promise<number> {
  const supabase = getSupabaseClient();
  if (!supabase) return 0;

  let totalPushed = 0;

  while (true) {
    const batch = await repositories.sync.getPendingOutbox(userId, PUSH_BATCH_SIZE);
    if (batch.length === 0) break;

    const snapshot = await repositories.sync.getSnapshotForOutbox(batch);

    // Group in strict parent-before-child dependency order
    for (const entityType of ENTITY_PUSH_ORDER) {
      const group = batch.filter((item) => item.entity_type === entityType);
      if (group.length === 0) continue;

      try {
        if (entityType === 'profile' && snapshot.settings) {
          const avatarRemotePath = await resolveRemotePathForLocalImage(
            snapshot.settings.profileAvatar,
            repositories.sync,
          );
          const { error } = await supabase.from('profiles').upsert(
            {
              user_id: userId,
              display_name: snapshot.settings.profileName,
              bio: snapshot.settings.profileBio,
              avatar_remote_path: avatarRemotePath,
              google_name: snapshot.settings.googleName,
              google_email: snapshot.settings.googleEmail,
              google_avatar_url: snapshot.settings.googleAvatarUrl,
              gender: snapshot.settings.gender,
              date_of_birth: snapshot.settings.dateOfBirth,
              profile_completed_at: snapshot.settings.profileCompletedAt,
              updated_at: snapshot.settings.updatedAt,
            },
            { onConflict: 'user_id' },
          );
          if (error) throw new Error(error.message);
        } else if (entityType === 'settings' && snapshot.settings) {
          const { error } = await supabase.from('user_settings').upsert(
            {
              user_id: userId,
              currency_code: snapshot.settings.currencyCode,
              opening_balance_minor: snapshot.settings.openingBalanceMinor,
              opening_balance_currency_code:
                snapshot.settings.openingBalanceCurrencyCode,
              theme: snapshot.settings.theme,
              date_format: snapshot.settings.dateFormat,
              onboarding_completed: snapshot.settings.onboardingCompleted,
              currency_initialized: snapshot.settings.currencyInitialized,
              show_home_budget_shortcut:
                snapshot.settings.showHomeBudgetShortcut,
              updated_at: snapshot.settings.updatedAt,
            },
            { onConflict: 'user_id' },
          );
          if (error) throw new Error(error.message);
        } else if (entityType === 'category') {
          const rows = [];
          for (const item of group) {
            const cat = snapshot.categoriesById.get(item.entity_id);
            if (!cat) continue;
            const imageRemotePath = await resolveRemotePathForLocalImage(
              cat.imageUri,
              repositories.sync,
            );
            rows.push({
              user_id: userId,
              id: cat.id,
              name: cat.name,
              type: cat.type,
              parent_id: cat.parentId,
              icon: cat.icon,
              color: cat.color,
              image_remote_path: imageRemotePath,
              is_default: cat.isDefault,
              is_archived: cat.isArchived,
              deleted_at: cat.deletedAt,
              created_at: cat.createdAt,
              updated_at: cat.updatedAt,
            });
          }
          // Parents before children so same-user FK fk_categories_parent_same_user succeeds
          const roots = rows.filter((r) => !r.parent_id);
          const children = rows.filter((r) => Boolean(r.parent_id));
          if (roots.length > 0) {
            const { error } = await supabase
              .from('categories')
              .upsert(roots, { onConflict: 'user_id,id' });
            if (error) throw new Error(error.message);
          }
          if (children.length > 0) {
            const { error } = await supabase
              .from('categories')
              .upsert(children, { onConflict: 'user_id,id' });
            if (error) throw new Error(error.message);
          }
        } else if (entityType === 'payment_method') {
          const rows = [];
          for (const item of group) {
            const pm = snapshot.paymentMethodsById.get(item.entity_id);
            if (!pm) continue;
            const imageRemotePath = await resolveRemotePathForLocalImage(
              pm.imageUri,
              repositories.sync,
            );
            rows.push({
              user_id: userId,
              id: pm.id,
              name: pm.name,
              icon: pm.icon,
              image_remote_path: imageRemotePath,
              is_builtin: pm.isBuiltin,
              is_archived: pm.isArchived,
              deleted_at: pm.deletedAt,
              created_at: pm.createdAt,
              updated_at: pm.updatedAt,
            });
          }
          if (rows.length > 0) {
            const { error } = await supabase
              .from('payment_methods')
              .upsert(rows, { onConflict: 'user_id,id' });
            if (error) throw new Error(error.message);
          }
        } else if (entityType === 'tag') {
          const rows = group
            .map((item) => snapshot.tagsById.get(item.entity_id))
            .filter((t): t is NonNullable<typeof t> => Boolean(t))
            .map((t) => ({
              user_id: userId,
              id: t.id,
              name: t.name,
              color: t.color,
              is_archived: t.isArchived,
              deleted_at: t.deletedAt,
              created_at: t.createdAt,
              updated_at: t.updatedAt,
            }));
          if (rows.length > 0) {
            const { error } = await supabase
              .from('tags')
              .upsert(rows, { onConflict: 'user_id,id' });
            if (error) throw new Error(error.message);
          }
        } else if (entityType === 'budget') {
          const rows = group
            .map((item) => snapshot.budgetsById.get(item.entity_id))
            .filter((b): b is NonNullable<typeof b> => Boolean(b))
            .map((b) => ({
              user_id: userId,
              id: b.id,
              amount_minor: b.amountMinor,
              currency_code: b.currencyCode,
              period: b.period,
              month: b.month,
              year: b.year,
              start_date: b.startDate,
              category_id: b.categoryId,
              deleted_at: b.deletedAt,
              created_at: b.createdAt,
              updated_at: b.updatedAt,
            }));
          if (rows.length > 0) {
            const { error } = await supabase
              .from('budgets')
              .upsert(rows, { onConflict: 'user_id,id' });
            if (error) throw new Error(error.message);
          }
        } else if (entityType === 'transaction') {
          const rows = group
            .map((item) => snapshot.transactionsById.get(item.entity_id))
            .filter((tx): tx is NonNullable<typeof tx> => Boolean(tx))
            .map((tx) => ({
              user_id: userId,
              id: tx.id,
              type: tx.type,
              title: tx.title,
              amount_minor: tx.amountMinor,
              currency_code: tx.currencyCode,
              category_id: tx.categoryId,
              category_name_snapshot: tx.categoryNameSnapshot,
              payment_method_id: tx.paymentMethodId,
              payment_method: tx.paymentMethod,
              transaction_date: tx.transactionDate,
              note: tx.note,
              deleted_at: tx.deletedAt,
              created_at: tx.createdAt,
              updated_at: tx.updatedAt,
            }));
          if (rows.length > 0) {
            const { error } = await supabase
              .from('transactions')
              .upsert(rows, { onConflict: 'user_id,id' });
            if (error) throw new Error(error.message);
          }
        } else if (entityType === 'transaction_tag') {
          const rows = group
            .map((item) => snapshot.txTagsByKey.get(item.entity_id))
            .filter((tt): tt is NonNullable<typeof tt> => Boolean(tt))
            .map((tt) => ({
              user_id: userId,
              transaction_id: tt.transactionId,
              tag_id: tt.tagId,
              deleted_at: tt.deletedAt,
              updated_at: tt.updatedAt,
            }));
          if (rows.length > 0) {
            const { error } = await supabase
              .from('transaction_tags')
              .upsert(rows, { onConflict: 'user_id,transaction_id,tag_id' });
            if (error) throw new Error(error.message);
          }
        }

        await repositories.sync.removeOutboxItems(group.map((g) => g.id));
        totalPushed += group.length;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Push failed';
        for (const item of group) {
          await repositories.sync.markOutboxFailed(
            item.id,
            message,
            computeNextRetryIso(item.retry_count),
          );
        }
        throw err;
      }
    }

    if (batch.length < PUSH_BATCH_SIZE) break;
  }

  return totalPushed;
}

interface RemoteProfileRow {
  display_name: string | null;
  bio: string | null;
  avatar_remote_path: string | null;
  google_name: string | null;
  google_email: string | null;
  google_avatar_url: string | null;
  gender: GenderOption | null;
  date_of_birth: string | null;
  profile_completed_at: string | null;
  updated_at: string;
  server_updated_at: string;
}

interface RemoteSettingsRow {
  currency_code: string;
  opening_balance_minor: number;
  opening_balance_currency_code: string;
  theme: ThemePreference;
  date_format: DateFormatPreference;
  onboarding_completed: boolean;
  currency_initialized: boolean;
  show_home_budget_shortcut: boolean;
  updated_at: string;
  server_updated_at: string;
}

interface RemoteCategoryRow {
  id: string;
  name: string;
  type: CategoryType;
  parent_id: string | null;
  icon: string | null;
  color: string | null;
  image_remote_path: string | null;
  is_default: boolean;
  is_archived: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  server_updated_at: string;
}

interface RemotePaymentMethodRow {
  id: string;
  name: string;
  icon: string | null;
  image_remote_path: string | null;
  is_builtin: boolean;
  is_archived: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  server_updated_at: string;
}

interface RemoteTagRow {
  id: string;
  name: string;
  color: string | null;
  is_archived: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  server_updated_at: string;
}

interface RemoteBudgetRow {
  id: string;
  amount_minor: number;
  currency_code: string;
  period: BudgetPeriod;
  month: number;
  year: number;
  start_date: string | null;
  category_id: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  server_updated_at: string;
}

interface RemoteTransactionRow {
  id: string;
  type: TransactionType;
  title: string;
  amount_minor: number;
  currency_code: string;
  category_id: string | null;
  category_name_snapshot: string | null;
  payment_method_id: string | null;
  payment_method: string | null;
  transaction_date: string;
  note: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  server_updated_at: string;
}

interface RemoteTransactionTagRow {
  transaction_id: string;
  tag_id: string;
  deleted_at: string | null;
  updated_at: string;
  server_updated_at: string;
}

async function fetchKeysetIdPages<T extends { id: string; server_updated_at: string }>(
  tableName: string,
  userId: string,
  initialCursor: { serverUpdatedAt: string; id: string } | undefined,
): Promise<{
  rows: T[];
  nextCursor: { serverUpdatedAt: string; id: string } | undefined;
}> {
  const supabase = getSupabaseClient();
  if (!supabase) return { rows: [], nextCursor: initialCursor };

  const collected: T[] = [];
  let cursor = initialCursor;

  while (true) {
    let query = supabase
      .from(tableName)
      .select('*')
      .eq('user_id', userId)
      .order('server_updated_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(KEYSET_PAGE_SIZE);

    if (cursor) {
      query = query.or(
        `server_updated_at.gt.${cursor.serverUpdatedAt},and(server_updated_at.eq.${cursor.serverUpdatedAt},id.gt.${cursor.id})`,
      );
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed pulling ${tableName}: ${error.message}`);
    }
    const page = (data ?? []) as T[];
    if (page.length === 0) break;

    collected.push(...page);
    const last = page[page.length - 1];
    cursor = {
      serverUpdatedAt: last.server_updated_at,
      id: last.id,
    };

    if (page.length < KEYSET_PAGE_SIZE) break;
  }

  return { rows: collected, nextCursor: cursor };
}

async function pullRemoteForUser(
  userId: string,
  syncState: SyncStateSnapshot,
): Promise<{
  pulledCount: number;
  nextCursors: Record<string, { serverUpdatedAt: string; id: string }>;
}> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { pulledCount: 0, nextCursors: syncState.cursors };
  }

  const nextCursors = { ...syncState.cursors };
  const bundle: RemoteSyncPullBundle = {
    categories: [],
    paymentMethods: [],
    tags: [],
    transactions: [],
    transactionTags: [],
    budgets: [],
  };

  let pulledCount = 0;

  // 1. profiles (1:1 per user)
  const profileCursor = nextCursors.profiles?.serverUpdatedAt;
  let profileQuery = supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .limit(1);
  if (profileCursor) {
    profileQuery = profileQuery.gt('server_updated_at', profileCursor);
  }
  const { data: profileData, error: profileErr } = await profileQuery;
  if (profileErr) throw new Error(`Failed pulling profile: ${profileErr.message}`);
  const profileRow = (profileData?.[0] as RemoteProfileRow | undefined) ?? null;
  if (profileRow) {
    pulledCount += 1;
    const localAvatarPath = await ensureLocalMediaForRemotePath({
      userId,
      remotePath: profileRow.avatar_remote_path,
      entityType: 'profile',
      entityId: 'self',
      syncRepo: repositories.sync,
    });
    bundle.profile = {
      profileName: profileRow.display_name,
      profileBio: profileRow.bio,
      profileAvatarPath: localAvatarPath,
      gender: profileRow.gender,
      dateOfBirth: profileRow.date_of_birth,
      googleName: profileRow.google_name,
      googleEmail: profileRow.google_email,
      googleAvatarUrl: profileRow.google_avatar_url,
      profileCompletedAt: profileRow.profile_completed_at,
      updatedAt: profileRow.updated_at,
    };
    nextCursors.profiles = { serverUpdatedAt: profileRow.server_updated_at, id: userId };
  }

  // 2. user_settings (1:1 per user)
  const settingsCursor = nextCursors.user_settings?.serverUpdatedAt;
  let settingsQuery = supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .limit(1);
  if (settingsCursor) {
    settingsQuery = settingsQuery.gt('server_updated_at', settingsCursor);
  }
  const { data: settingsData, error: settingsErr } = await settingsQuery;
  if (settingsErr) throw new Error(`Failed pulling settings: ${settingsErr.message}`);
  const settingsRow = (settingsData?.[0] as RemoteSettingsRow | undefined) ?? null;
  if (settingsRow) {
    pulledCount += 1;
    bundle.settings = {
      currencyCode: settingsRow.currency_code,
      openingBalanceMinor: Number(settingsRow.opening_balance_minor),
      openingBalanceCurrencyCode: settingsRow.opening_balance_currency_code,
      theme: settingsRow.theme,
      dateFormat: settingsRow.date_format,
      onboardingCompleted: settingsRow.onboarding_completed,
      currencyInitialized: settingsRow.currency_initialized,
      showHomeBudgetShortcut: settingsRow.show_home_budget_shortcut,
      updatedAt: settingsRow.updated_at,
    };
    nextCursors.user_settings = { serverUpdatedAt: settingsRow.server_updated_at, id: userId };
  }

  // 3. categories
  const catPull = await fetchKeysetIdPages<RemoteCategoryRow>(
    'categories',
    userId,
    nextCursors.categories,
  );
  for (const row of catPull.rows) {
    const localImage = await ensureLocalMediaForRemotePath({
      userId,
      remotePath: row.image_remote_path,
      entityType: 'category',
      entityId: row.id,
      syncRepo: repositories.sync,
    });
    bundle.categories.push({
      id: row.id,
      name: row.name,
      type: row.type,
      parentId: row.parent_id,
      icon: row.icon ?? 'pricetag',
      color: row.color ?? '#059669',
      imageUri: localImage,
      isDefault: row.is_default,
      isArchived: row.is_archived,
      deletedAt: row.deleted_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
  if (catPull.nextCursor) {
    nextCursors.categories = catPull.nextCursor;
  }
  pulledCount += catPull.rows.length;

  // 4. payment_methods
  const pmPull = await fetchKeysetIdPages<RemotePaymentMethodRow>(
    'payment_methods',
    userId,
    nextCursors.payment_methods,
  );
  for (const row of pmPull.rows) {
    const localImage = await ensureLocalMediaForRemotePath({
      userId,
      remotePath: row.image_remote_path,
      entityType: 'payment_method',
      entityId: row.id,
      syncRepo: repositories.sync,
    });
    bundle.paymentMethods.push({
      id: row.id,
      name: row.name,
      icon: row.icon ?? 'wallet',
      imageUri: localImage,
      isBuiltin: row.is_builtin,
      isArchived: row.is_archived,
      deletedAt: row.deleted_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
  if (pmPull.nextCursor) {
    nextCursors.payment_methods = pmPull.nextCursor;
  }
  pulledCount += pmPull.rows.length;

  // 5. tags
  const tagPull = await fetchKeysetIdPages<RemoteTagRow>('tags', userId, nextCursors.tags);
  bundle.tags = tagPull.rows.map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color ?? '#10B981',
    isArchived: row.is_archived,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
  if (tagPull.nextCursor) nextCursors.tags = tagPull.nextCursor;
  pulledCount += tagPull.rows.length;

  // 6. budgets
  const budgetPull = await fetchKeysetIdPages<RemoteBudgetRow>(
    'budgets',
    userId,
    nextCursors.budgets,
  );
  bundle.budgets = budgetPull.rows.map((row) => ({
    id: row.id,
    amountMinor: Number(row.amount_minor),
    currencyCode: row.currency_code,
    period: row.period,
    month: row.month,
    year: row.year,
    startDate: row.start_date,
    categoryId: row.category_id,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
  if (budgetPull.nextCursor) nextCursors.budgets = budgetPull.nextCursor;
  pulledCount += budgetPull.rows.length;

  // 7. transactions
  const txPull = await fetchKeysetIdPages<RemoteTransactionRow>(
    'transactions',
    userId,
    nextCursors.transactions,
  );
  bundle.transactions = txPull.rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    amountMinor: Number(row.amount_minor),
    currencyCode: row.currency_code,
    categoryId: row.category_id,
    categoryNameSnapshot: row.category_name_snapshot ?? 'Category',
    paymentMethodId: row.payment_method_id,
    paymentMethod: row.payment_method ?? 'Cash',
    transactionDate: row.transaction_date,
    note: row.note,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
  if (txPull.nextCursor) nextCursors.transactions = txPull.nextCursor;
  pulledCount += txPull.rows.length;

  // 8. transaction_tags (composite PK: transaction_id, tag_id)
  let ttCursor = nextCursors.transaction_tags;
  while (true) {
    let ttQuery = supabase
      .from('transaction_tags')
      .select('*')
      .eq('user_id', userId)
      .order('server_updated_at', { ascending: true })
      .order('transaction_id', { ascending: true })
      .order('tag_id', { ascending: true })
      .limit(KEYSET_PAGE_SIZE);

    if (ttCursor) {
      const [cursorTxId = '', cursorTagId = ''] = ttCursor.id.split(':');
      if (cursorTxId && cursorTagId) {
        ttQuery = ttQuery.or(
          `server_updated_at.gt.${ttCursor.serverUpdatedAt},and(server_updated_at.eq.${ttCursor.serverUpdatedAt},transaction_id.gt.${cursorTxId}),and(server_updated_at.eq.${ttCursor.serverUpdatedAt},transaction_id.eq.${cursorTxId},tag_id.gt.${cursorTagId})`,
        );
      } else {
        ttQuery = ttQuery.gt('server_updated_at', ttCursor.serverUpdatedAt);
      }
    }

    const { data, error } = await ttQuery;
    if (error) throw new Error(`Failed pulling transaction_tags: ${error.message}`);
    const page = (data ?? []) as RemoteTransactionTagRow[];
    if (page.length === 0) break;

    for (const row of page) {
      bundle.transactionTags.push({
        transactionId: row.transaction_id,
        tagId: row.tag_id,
        deletedAt: row.deleted_at,
        updatedAt: row.updated_at,
      });
    }
    pulledCount += page.length;
    const last = page[page.length - 1];
    const nextStamp = {
      serverUpdatedAt: last.server_updated_at,
      id: `${last.transaction_id}:${last.tag_id}`,
    };
    const samePageLoop =
      ttCursor &&
      ttCursor.serverUpdatedAt === nextStamp.serverUpdatedAt &&
      ttCursor.id === nextStamp.id;
    ttCursor = nextStamp;
    if (page.length < KEYSET_PAGE_SIZE || samePageLoop) break;
  }
  if (ttCursor) {
    nextCursors.transaction_tags = ttCursor;
  }

  if (pulledCount > 0) {
    await repositories.sync.applyRemoteBundle(bundle);
  }

  return { pulledCount, nextCursors };
}

export async function runSyncCycle(userId: string): Promise<SyncRunResult> {
  if (inFlightSyncPromise) {
    return inFlightSyncPromise;
  }

  const execute = async (): Promise<SyncRunResult> => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return { status: 'skipped', pushedCount: 0, pulledCount: 0 };
    }

    const syncState = await repositories.sync.getSyncState();
    if (syncState.linkedUserId && syncState.linkedUserId !== userId) {
      const msg = 'Account mismatch guard prevented syncing across different accounts.';
      await repositories.sync.updateSyncState({
        syncStatus: 'needs_account_switch',
        lastError: msg,
      });
      return { status: 'error', pushedCount: 0, pulledCount: 0, error: msg };
    }

    const net = await Network.getNetworkStateAsync();
    if (!net.isConnected || net.isInternetReachable === false) {
      await repositories.sync.updateSyncState({
        syncStatus: 'offline',
      });
      return { status: 'offline', pushedCount: 0, pulledCount: 0 };
    }

    await repositories.sync.updateSyncState({
      syncStatus: 'syncing',
      lastError: null,
    });

    try {
      await syncPendingMediaForUser(userId, repositories.sync);
      const pushedCount = await pushOutboxForUser(userId);
      const refreshedState = await repositories.sync.getSyncState();
      const { pulledCount, nextCursors } = await pullRemoteForUser(
        userId,
        refreshedState,
      );

      const nowIso = new Date().toISOString();
      await repositories.sync.updateSyncState({
        cursors: nextCursors,
        lastSyncedAt: nowIso,
        migrationCompletedAt: syncState.migrationCompletedAt ?? nowIso,
        lastError: null,
        syncStatus: 'idle',
      });

      return { status: 'synced', pushedCount, pulledCount };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sync failed.';
      await repositories.sync.updateSyncState({
        syncStatus: 'error',
        lastError: message,
      });
      return { status: 'error', pushedCount: 0, pulledCount: 0, error: message };
    }
  };

  inFlightSyncPromise = execute().finally(() => {
    inFlightSyncPromise = null;
  });

  return inFlightSyncPromise;
}

export function getOutboxEntityLabel(item: SyncOutboxRow): string {
  return `${item.entity_type}:${item.entity_id}`;
}
