import * as Crypto from 'expo-crypto';
import * as Network from 'expo-network';
import {
  GoogleOneTapSignIn,
  isCancelledResponse,
  isErrorWithCode,
  isNoSavedCredentialFoundResponse,
  isSuccessResponse,
  statusCodes,
} from 'react-native-nitro-google-signin';

import {
  getSupabaseClient,
} from '@/services/supabase/client';
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
}

export type GoogleSignInFlowResult =
  | { status: 'success'; profile: GoogleAuthUserProfile }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

export async function signInWithGoogleAccount(): Promise<GoogleSignInFlowResult> {
  if (!isSupabaseConfigured() || !isGoogleSignInConfigured()) {
    return {
      status: 'error',
      message:
        'Cloud sync is not configured yet. Add your Supabase and Google credentials in .env to enable sign-in.',
    };
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return {
      status: 'error',
      message: 'Supabase client is unavailable.',
    };
  }

  const netState = await Network.getNetworkStateAsync();
  if (!netState.isConnected || netState.isInternetReachable === false) {
    return {
      status: 'error',
      message: 'An internet connection is required to sign in with Google.',
    };
  }

  try {
    const { googleWebClientId } = getPublicEnvConfig();
    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce,
    );

    GoogleOneTapSignIn.configure({
      webClientId: googleWebClientId,
      nonce: hashedNonce,
      autoSelectOnSignIn: false,
    });

    await GoogleOneTapSignIn.checkPlayServices(true);

    let response = await GoogleOneTapSignIn.signIn();
    if (isNoSavedCredentialFoundResponse(response)) {
      response = await GoogleOneTapSignIn.createAccount();
    }
    if (isNoSavedCredentialFoundResponse(response)) {
      response = await GoogleOneTapSignIn.presentExplicitSignIn();
    }

    if (isCancelledResponse(response) || !isSuccessResponse(response)) {
      return { status: 'cancelled' };
    }

    const { idToken, user } = response.data;
    if (!idToken) {
      return {
        status: 'error',
        message: 'Google did not return an identity token. Please try again.',
      };
    }

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
      nonce: rawNonce,
    });

    if (error || !data.user) {
      return {
        status: 'error',
        message: error?.message ?? 'Unable to verify Google sign-in with Supabase.',
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
      },
    };
  } catch (err) {
    if (isErrorWithCode(err)) {
      if (err.code === statusCodes.SIGN_IN_CANCELLED) {
        return { status: 'cancelled' };
      }
      if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        return {
          status: 'error',
          message: 'Google Play Services is required on this device to sign in.',
        };
      }
      if (err.code === statusCodes.IN_PROGRESS) {
        return {
          status: 'error',
          message: 'Google sign-in is already in progress.',
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
    if (msg.toLowerCase().includes('nitro') || msg.toLowerCase().includes('native')) {
      return {
        status: 'error',
        message:
          'Native Google Sign-In requires a custom Android development build (not Expo Go).',
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
    await GoogleOneTapSignIn.signOut();
  } catch {
    // Non-fatal if user had no cached native Credential Manager session
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
  const patch: UpdateSettingsInput = {
    googleName: profile.googleName,
    googleEmail: profile.email,
    googleAvatarUrl: profile.googleAvatarUrl,
  };

  if (!currentSettings.profileName?.trim() && profile.googleName?.trim()) {
    patch.profileName = profile.googleName.trim();
  }

  return patch;
}

export function extractAuthProfileFromSessionUser(user: {
  id: string;
  email?: string | null;
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
  };
}
