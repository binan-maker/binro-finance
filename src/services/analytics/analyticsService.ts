import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { repositories } from '@/database/repositories';
import { getSupabaseClient } from '@/services/supabase/client';

export type AllowedAnalyticsEventName =
  | 'app_opened'
  | 'onboarding_completed'
  | 'transaction_created'
  | 'backup_completed'
  | 'sync_started'
  | 'sync_completed'
  | 'sync_failed'
  | 'google_sign_in_completed'
  | 'feature_opened';

const FORBIDDEN_METADATA_KEYS = new Set([
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
  'date_of_birth',
]);

export type SafeAnalyticsPrimitive = string | number | boolean;

export function sanitizeAnalyticsMetadata(
  raw?: Record<string, unknown>,
): Record<string, SafeAnalyticsPrimitive> {
  if (!raw) return {};
  const out: Record<string, SafeAnalyticsPrimitive> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (FORBIDDEN_METADATA_KEYS.has(key)) continue;
    const lower = key.toLowerCase();
    if (
      lower.includes('amount') ||
      lower.includes('balance') ||
      lower.includes('email') ||
      lower.includes('note') ||
      lower.includes('title') ||
      lower.includes('name')
    ) {
      continue;
    }
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      out[key] = typeof value === 'string' ? value.slice(0, 80) : value;
    }
  }
  return out;
}

function getAnalyticsPlatform(): 'android' | 'ios' | 'web' {
  if (Platform.OS === 'android') return 'android';
  if (Platform.OS === 'ios') return 'ios';
  return 'web';
}

export async function trackAnalyticsEvent(
  eventName: AllowedAnalyticsEventName,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const syncState = await repositories.sync.getSyncState();
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id ?? null;

    const cleanMeta = sanitizeAnalyticsMetadata(metadata);
    const appVersion = Constants.expoConfig?.version ?? '1.0.0';

    await supabase.from('analytics_events').insert({
      anonymous_install_id: syncState.anonymousInstallId,
      user_id: userId,
      event_name: eventName,
      app_version: String(appVersion).slice(0, 32),
      platform: getAnalyticsPlatform(),
      metadata: cleanMeta,
    });
  } catch {
    // Non-blocking: analytics must never disrupt offline UX
  }
}
