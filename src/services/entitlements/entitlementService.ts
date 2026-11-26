import { repositories } from '@/database/repositories';
import { getSupabaseClient } from '@/services/supabase/client';
import type { EntitlementStatus, EntitlementTier, UserEntitlement } from '@/types/models';

export const DEFAULT_FREE_ENTITLEMENT: UserEntitlement = {
  userId: null,
  tier: 'free',
  status: 'active',
  expiresAt: null,
  source: 'default',
  updatedAt: null,
};

interface RemoteEntitlementRow {
  user_id: string;
  tier: EntitlementTier;
  status: EntitlementStatus;
  expires_at: string | null;
  source: string;
  updated_at: string;
}

export async function loadCachedEntitlement(): Promise<UserEntitlement> {
  try {
    return await repositories.sync.getEntitlementCache();
  } catch {
    return DEFAULT_FREE_ENTITLEMENT;
  }
}

export async function refreshUserEntitlement(
  userId: string | null,
): Promise<UserEntitlement> {
  if (!userId) {
    const free: UserEntitlement = {
      ...DEFAULT_FREE_ENTITLEMENT,
      updatedAt: new Date().toISOString(),
    };
    await repositories.sync.saveEntitlementCache(free);
    return free;
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return loadCachedEntitlement();
  }

  try {
    const { data, error } = await supabase
      .from('user_entitlements')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      return loadCachedEntitlement();
    }

    const row = data as RemoteEntitlementRow | null;
    const resolved: UserEntitlement = row
      ? {
          userId: row.user_id,
          tier: row.tier,
          status: row.status,
          expiresAt: row.expires_at,
          source: row.source,
          updatedAt: row.updated_at,
        }
      : {
          userId,
          tier: 'free',
          status: 'active',
          expiresAt: null,
          source: 'default',
          updatedAt: new Date().toISOString(),
        };

    await repositories.sync.saveEntitlementCache(resolved);
    return resolved;
  } catch {
    return loadCachedEntitlement();
  }
}

/**
 * Subscription entitlement foundation check.
 * Per BinRo Finance policy, all existing core features remain permanently unlocked.
 */
export function isProEntitlementActive(entitlement: UserEntitlement): boolean {
  if (entitlement.tier !== 'pro') return false;
  if (entitlement.status !== 'active' && entitlement.status !== 'grace_period') {
    return false;
  }
  if (entitlement.expiresAt && new Date(entitlement.expiresAt).getTime() < Date.now()) {
    return false;
  }
  return true;
}
