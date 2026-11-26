import * as Network from 'expo-network';

import { getSupabaseClient } from '@/services/supabase/client';

const MEDIA_BUCKET = 'binro-media';
const USER_MEDIA_FOLDERS = ['profile', 'categories', 'payment_methods'] as const;

const USER_OWNED_TABLES_DELETE_ORDER = [
  'transaction_tags',
  'budgets',
  'transactions',
  'tags',
  'categories',
  'payment_methods',
  'user_settings',
  'profiles',
] as const;

function isMissingRpcFunctionError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('could not find the function') ||
    lower.includes('function public.delete_own_account') ||
    lower.includes('does not exist') ||
    lower.includes('pgrst202')
  );
}

async function deleteUserMediaObjects(userId: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const bucket = supabase.storage.from(MEDIA_BUCKET) as unknown as {
    list?: (
      path?: string,
      options?: { limit?: number },
    ) => Promise<{ data: { name: string }[] | null; error: { message: string } | null }>;
    remove?: (paths: string[]) => Promise<{ error: { message: string } | null }>;
  };

  if (typeof bucket.list !== 'function' || typeof bucket.remove !== 'function') {
    return;
  }

  for (const folder of USER_MEDIA_FOLDERS) {
    const prefix = `${userId}/${folder}`;
    try {
      const { data, error } = await bucket.list(prefix, { limit: 100 });
      if (error || !data || data.length === 0) continue;
      const paths = data
        .map((item) => item?.name)
        .filter((name): name is string => Boolean(name && name.trim()))
        .map((name) => `${prefix}/${name}`);
      if (paths.length > 0) {
        await bucket.remove(paths);
      }
    } catch {
      // Best-effort storage cleanup before account deletion
    }
  }
}

async function deleteUserRowsViaRlsFallback(userId: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error('Cloud client is unavailable.');
  }

  for (const table of USER_OWNED_TABLES_DELETE_ORDER) {
    const query = supabase.from(table) as unknown as {
      delete?: () => {
        eq: (col: string, val: unknown) => Promise<{ error: { message: string } | null }>;
      };
    };
    if (typeof query.delete !== 'function') {
      continue;
    }
    const { error } = await query.delete().eq('user_id', userId);
    if (error) {
      throw new Error(error.message || `Failed to delete remote ${table}.`);
    }
  }
}

export async function deleteRemoteUserAccount(
  userId: string,
): Promise<{ mode: 'rpc' | 'rls_fallback' | 'local_only' }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { mode: 'local_only' };
  }

  const net = await Network.getNetworkStateAsync();
  if (!net.isConnected || net.isInternetReachable === false) {
    throw new Error('An internet connection is required to delete your cloud account.');
  }

  await deleteUserMediaObjects(userId);

  const clientWithRpc = supabase as unknown as {
    rpc?: (
      fn: string,
    ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
  };

  if (typeof clientWithRpc.rpc === 'function') {
    const { error } = await clientWithRpc.rpc('delete_own_account');
    if (!error) {
      return { mode: 'rpc' };
    }
    if (!isMissingRpcFunctionError(`${error.code ?? ''} ${error.message}`)) {
      throw new Error(error.message || 'Unable to delete your cloud account right now.');
    }
  }

  // Fallback when Supabase migration 004 has not yet been applied
  await deleteUserRowsViaRlsFallback(userId);
  return { mode: 'rls_fallback' };
}
