import {
  GoogleSignin,
  isCancelledResponse,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import * as Network from 'expo-network';

import { getSupabaseClient } from '@/services/supabase/client';
import {
  getPublicEnvConfig,
  isGoogleSignInConfigured,
  isSupabaseConfigured,
} from '@/services/supabase/config';
import type { UpdateSettingsInput } from '@/types/database';
import type { AppSettings } from '@/types/models';

export interface GoogleAuthUserProfile {
  userId: string;
  email: string | null;
  googleName: string | null;
  googleAvatarUrl: string | null;
  createdAt?: string | null;
  lastSignInAt?: string | null;
}

export type GoogleSignInFlowResult =
  | { status: 'success'; profile: GoogleAuthUserProfile }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

let configuredWebClientId: string | null = null;

function logAuthDiagnostic(stage: string, detail?: string): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.warn(`[GoogleAuth] ${stage}${detail ? `: ${detail}` : ''}`);
  }
}

export function ensureGoogleSignInConfigured(webClientId: string): void {
  if (configuredWebClientId === webClientId) {
    return;
  }
  GoogleSignin.configure({
    webClientId,
    offlineAccess: false,
  });
  configuredWebClientId = webClientId;
}

export function resetGoogleSignInConfigCacheForTests(): void {
  configuredWebClientId = null;
}

function decodeBase64UrlToUtf8(input: string): string | null {
  try {
    const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
    const padLength = (4 - (normalized.length % 4)) % 4;
    const padded = normalized + '='.repeat(padLength);
    if (typeof globalThis.atob === 'function') {
      const binary = globalThis.atob(padded);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      if (typeof TextDecoder !== 'undefined') {
        return new TextDecoder().decode(bytes);
      }
      return binary;
    }
    return null;
  } catch {
    return null;
  }
}

function inspectIdTokenClaims(idToken: string): { validJwt: boolean; hasNonceClaim: boolean } {
  const parts = idToken.split('.');
  if (parts.length !== 3 || !parts[1]) {
    return { validJwt: false, hasNonceClaim: false };
  }
  const json = decodeBase64UrlToUtf8(parts[1]);
  if (!json) {
    return { validJwt: true, hasNonceClaim: false };
  }
  try {
    const payload = JSON.parse(json) as Record<string, unknown>;
    return {
      validJwt: true,
      hasNonceClaim: typeof payload.nonce === 'string' && payload.nonce.length > 0,
    };
  } catch {
    return { validJwt: false, hasNonceClaim: false };
  }
}

function formatSupabaseExchangeError(rawMessage: string | undefined): string {
  const msg = rawMessage?.trim() ?? '';
  const lower = msg.toLowerCase();
  if (lower.includes('nonce')) {
    return 'Google ID token nonce validation failed. Verify your Google provider configuration in Supabase.';
  }
  if (lower.includes('audience') || lower.includes('client_id') || lower.includes('unacceptable audience')) {
    return 'Supabase rejected the Google token audience. Add your Google Web Client ID to Supabase Authorized Client IDs.';
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'Network error while signing in with Supabase. Check your connection and try again.';
  }
  return msg || 'Unable to verify Google sign-in with Supabase.';
}

export async function signInWithGoogleAccount(): Promise<GoogleSignInFlowResult> {
  if (!isSupabaseConfigured() || !isGoogleSignInConfigured()) {
    logAuthDiagnostic('config_missing', 'Supabase or Google Web Client ID missing/placeholder');
    return {
      status: 'error',
      message:
        'Cloud sync is not configured yet. Add your Supabase and Google credentials in .env to enable sign-in.',
    };
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    logAuthDiagnostic('supabase_unavailable');
    return {
      status: 'error',
      message: 'Supabase client is unavailable.',
    };
  }

  try {
    const netState = await Network.getNetworkStateAsync();
    if (!netState.isConnected || netState.isInternetReachable === false) {
      return {
        status: 'error',
        message: 'An internet connection is required to sign in with Google.',
      };
    }

    const { googleWebClientId } = getPublicEnvConfig();
    ensureGoogleSignInConfigured(googleWebClientId);

    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

    const response = await GoogleSignin.signIn();

    if (isCancelledResponse(response)) {
      logAuthDiagnostic('user_cancelled');
      return { status: 'cancelled' };
    }

    if (!isSuccessResponse(response)) {
      logAuthDiagnostic('non_success_response');
      return {
        status: 'error',
        message: 'Google sign-in did not complete. Please try again.',
      };
    }

    const { idToken, user } = response.data;
    if (!idToken || typeof idToken !== 'string' || !idToken.trim()) {
      logAuthDiagnostic('missing_id_token');
      return {
        status: 'error',
        message:
          'Google did not return an ID token. Verify that EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is your Web OAuth Client ID and Android SHA-1 is configured.',
      };
    }

    const tokenClaims = inspectIdTokenClaims(idToken);
    if (!tokenClaims.validJwt) {
      logAuthDiagnostic('malformed_id_token');
      return {
        status: 'error',
        message: 'Received an invalid Google ID token. Please try again.',
      };
    }

    if (tokenClaims.hasNonceClaim) {
      logAuthDiagnostic('unexpected_nonce_claim_in_android_token');
      return {
        status: 'error',
        message:
          'Google returned a nonce-bound ID token without a matching client nonce. Please retry sign-in.',
      };
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });

    if (error || !data.user || !data.session) {
      logAuthDiagnostic('supabase_exchange_failed', error?.message ?? 'missing user/session');
      return {
        status: 'error',
        message: formatSupabaseExchangeError(error?.message),
      };
    }

    const { data: persisted, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr || !persisted.session) {
      logAuthDiagnostic('session_persistence_failed', sessionErr?.message ?? 'no persisted session');
      return {
        status: 'error',
        message:
          'Authenticated with Google, but failed to store the session securely on this device. Please try again.',
      };
    }

    return {
      status: 'success',
      profile: {
        userId: data.user.id,
        email: data.user.email ?? user.email ?? null,
        googleName:
          user.name ??
          (typeof data.user.user_metadata?.full_name === 'string'
            ? data.user.user_metadata.full_name
            : null),
        googleAvatarUrl:
          user.photo ??
          (typeof data.user.user_metadata?.avatar_url === 'string'
            ? data.user.user_metadata.avatar_url
            : null),
        createdAt: typeof data.user.created_at === 'string' ? data.user.created_at : null,
        lastSignInAt:
          typeof data.user.last_sign_in_at === 'string' ? data.user.last_sign_in_at : null,
      },
    };
  } catch (err) {
    if (isErrorWithCode(err)) {
      const codeStr = String(err.code);
      logAuthDiagnostic('native_error', `code=${codeStr} message=${err.message}`);

      if (codeStr === String(statusCodes.SIGN_IN_CANCELLED)) {
        return { status: 'cancelled' };
      }
      if (codeStr === String(statusCodes.PLAY_SERVICES_NOT_AVAILABLE)) {
        return {
          status: 'error',
          message: 'Google Play Services is required on this device to sign in.',
        };
      }
      if (codeStr === String(statusCodes.IN_PROGRESS)) {
        return {
          status: 'error',
          message: 'Google sign-in is already in progress.',
        };
      }
      if (codeStr === String(statusCodes.SIGN_IN_REQUIRED)) {
        return {
          status: 'error',
          message: 'Please select a Google account to continue.',
        };
      }
      if (codeStr === String(statusCodes.NULL_PRESENTER)) {
        return {
          status: 'error',
          message: 'Unable to open Google account chooser right now. Please try again.',
        };
      }
      if (
        codeStr === '10' ||
        err.message.toUpperCase().includes('DEVELOPER_ERROR')
      ) {
        return {
          status: 'error',
          message:
            'Google OAuth configuration error (DEVELOPER_ERROR). Verify package name com.binro.finance, Android SHA-1 fingerprint, and Web Client ID.',
        };
      }
      if (
        codeStr === '7' ||
        err.message.toUpperCase().includes('NETWORK_ERROR')
      ) {
        return {
          status: 'error',
          message:
            'Network error while connecting to Google Sign-In. Check your connection and try again.',
        };
      }
      return {
        status: 'error',
        message:
          err.message ||
          'Google sign-in could not be completed. Verify your SHA-1 and Web Client ID.',
      };
    }

    const msg = err instanceof Error ? err.message : '';
    logAuthDiagnostic('unexpected_error', msg || 'unknown');

    if (
      msg.toLowerCase().includes('rngooglesignin') ||
      msg.toLowerCase().includes('native')
    ) {
      return {
        status: 'error',
        message:
          'Native Google Sign-In requires a custom Android development or release build (not Expo Go).',
      };
    }

    return {
      status: 'error',
      message: msg || 'Unable to sign in with Google right now.',
    };
  }
}

export async function signOutGoogleAndSupabase(): Promise<void> {
  try {
    await GoogleSignin.signOut();
  } catch {
    // Non-fatal if user had no cached native Google Sign-In session
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // Non-fatal local session cleanup
    }
  }
}

/**
 * Merges Google account metadata into local settings as fallback identity info
 * without overwriting custom local profile name or local custom avatar edits.
 */
export function buildGoogleFallbackProfilePatch(
  currentSettings: AppSettings,
  profile: GoogleAuthUserProfile,
): UpdateSettingsInput {
  const patch: UpdateSettingsInput = {};

  if (profile.googleName?.trim()) {
    patch.googleName = profile.googleName.trim();
  }
  if (profile.email?.trim()) {
    patch.googleEmail = profile.email.trim();
  }
  if (profile.googleAvatarUrl?.trim()) {
    patch.googleAvatarUrl = profile.googleAvatarUrl.trim();
  }

  if (!currentSettings.profileName?.trim() && profile.googleName?.trim()) {
    patch.profileName = profile.googleName.trim();
  }

  return patch;
}

export function extractAuthProfileFromSessionUser(user: {
  id: string;
  email?: string | null;
  created_at?: string | null;
  last_sign_in_at?: string | null;
  user_metadata?: Record<string, unknown>;
}): GoogleAuthUserProfile {
  const meta = user.user_metadata ?? {};
  const fullName =
    typeof meta.full_name === 'string'
      ? meta.full_name
      : typeof meta.name === 'string'
        ? meta.name
        : null;
  const avatarUrl =
    typeof meta.avatar_url === 'string'
      ? meta.avatar_url
      : typeof meta.picture === 'string'
        ? meta.picture
        : null;

  return {
    userId: user.id,
    email: user.email ?? null,
    googleName: fullName,
    googleAvatarUrl: avatarUrl,
    createdAt: typeof user.created_at === 'string' ? user.created_at : null,
    lastSignInAt: typeof user.last_sign_in_at === 'string' ? user.last_sign_in_at : null,
  };
}
