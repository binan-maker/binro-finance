import type { UpdateSettingsInput } from '@/types/database';
import type { AppSettings, GenderOption } from '@/types/models';

import { validateDateOfBirth } from './date';

export const PROFILE_AVATAR_COLOR = '#10B981';

export const SELECTABLE_GENDER_OPTIONS: readonly {
  label: string;
  value: Extract<GenderOption, 'male' | 'female' | 'prefer_not_to_say'>;
}[] = [
  { label: 'Male', value: 'male' },
  { label: 'Female', value: 'female' },
  { label: 'Prefer not to say', value: 'prefer_not_to_say' },
];

/**
 * Normalizes saved gender values for UI selection.
 * Obsolete values (e.g. 'non_binary', 'other') safely map to null (unset)
 * without silently reassigning Male or Female.
 */
export function sanitizeSelectableGender(
  value: GenderOption | string | null | undefined,
): Extract<GenderOption, 'male' | 'female' | 'prefer_not_to_say'> | null {
  if (value === 'male' || value === 'female' || value === 'prefer_not_to_say') {
    return value;
  }
  return null;
}

export function normalizeDateOfBirthValue(
  value: string | null | undefined,
  referenceToday?: string,
): string | null {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return null;
  const candidate = trimmed.length > 10 && trimmed[10] === 'T' ? trimmed.slice(0, 10) : trimmed;
  const check = validateDateOfBirth(candidate, referenceToday);
  return check.valid ? check.value : null;
}

export interface ProfileCompletionState {
  hasGender: boolean;
  hasDateOfBirth: boolean;
  hasSkipped: boolean;
  missingGender: boolean;
  missingDateOfBirth: boolean;
  allRequiredFieldsSaved: boolean;
  needsPrompt: boolean;
}

/**
 * Evaluates gender and Date of Birth individually so returning users are never
 * re-asked for fields already saved locally or synced from their account.
 */
export function evaluateProfileCompletion(
  settings: Pick<AppSettings, 'gender' | 'dateOfBirth' | 'profileCompletedAt'>,
  referenceToday?: string,
): ProfileCompletionState {
  const hasGender = sanitizeSelectableGender(settings.gender) !== null;
  const hasDateOfBirth = normalizeDateOfBirthValue(settings.dateOfBirth, referenceToday) !== null;
  const hasSkipped = Boolean(settings.profileCompletedAt?.trim());
  const missingGender = !hasGender;
  const missingDateOfBirth = !hasDateOfBirth;
  const allRequiredFieldsSaved = hasGender && hasDateOfBirth;

  return {
    hasGender,
    hasDateOfBirth,
    hasSkipped,
    missingGender,
    missingDateOfBirth,
    allRequiredFieldsSaved,
    needsPrompt: !allRequiredFieldsSaved && !hasSkipped,
  };
}

export function shouldPromptProfileCompletion(
  settings: Pick<AppSettings, 'gender' | 'dateOfBirth' | 'profileCompletedAt'>,
  referenceToday?: string,
): boolean {
  return evaluateProfileCompletion(settings, referenceToday).needsPrompt;
}

export interface RemoteProfileSnapshot {
  profileName: string | null;
  profileBio: string | null;
  gender: GenderOption | string | null;
  dateOfBirth: string | null;
  googleName: string | null;
  googleEmail: string | null;
  googleAvatarUrl: string | null;
  profileCompletedAt: string | null;
  updatedAt?: string | null;
}

/**
 * Non-destructively reconciles local settings, optional remote cloud profile data,
 * and incoming Google identity metadata. Never overwrites saved fields with null/blank values.
 */
export function reconcileLocalAndRemoteProfile(params: {
  localSettings: AppSettings;
  remoteProfile?: RemoteProfileSnapshot | null;
  authProfile?: {
    email?: string | null;
    googleName?: string | null;
    googleAvatarUrl?: string | null;
  } | null;
}): UpdateSettingsInput {
  const { localSettings, remoteProfile, authProfile } = params;
  const patch: UpdateSettingsInput = {};

  const incomingGoogleName = authProfile?.googleName?.trim() || null;
  const remoteGoogleName = remoteProfile?.googleName?.trim() || null;
  const bestGoogleName = incomingGoogleName ?? remoteGoogleName;
  if (bestGoogleName && bestGoogleName !== localSettings.googleName) {
    patch.googleName = bestGoogleName;
  }

  const incomingGoogleEmail = authProfile?.email?.trim() || null;
  const remoteGoogleEmail = remoteProfile?.googleEmail?.trim() || null;
  const bestGoogleEmail = incomingGoogleEmail ?? remoteGoogleEmail;
  if (bestGoogleEmail && bestGoogleEmail !== localSettings.googleEmail) {
    patch.googleEmail = bestGoogleEmail;
  }

  const incomingGoogleAvatar = authProfile?.googleAvatarUrl?.trim() || null;
  const remoteGoogleAvatar = remoteProfile?.googleAvatarUrl?.trim() || null;
  const bestGoogleAvatar = incomingGoogleAvatar ?? remoteGoogleAvatar;
  if (bestGoogleAvatar && bestGoogleAvatar !== localSettings.googleAvatarUrl) {
    patch.googleAvatarUrl = bestGoogleAvatar;
  }

  if (!localSettings.profileName?.trim()) {
    const hydratedName =
      remoteProfile?.profileName?.trim() ||
      incomingGoogleName ||
      remoteGoogleName ||
      null;
    if (hydratedName) {
      patch.profileName = hydratedName;
    }
  }

  if (!localSettings.profileBio?.trim() && remoteProfile?.profileBio?.trim()) {
    patch.profileBio = remoteProfile.profileBio.trim();
  }

  const localGender = sanitizeSelectableGender(localSettings.gender);
  const remoteGender = sanitizeSelectableGender(remoteProfile?.gender);
  if (!localGender && remoteGender) {
    patch.gender = remoteGender;
  }

  const localDob = normalizeDateOfBirthValue(localSettings.dateOfBirth);
  const remoteDob = normalizeDateOfBirthValue(remoteProfile?.dateOfBirth);
  if (!localDob && remoteDob) {
    patch.dateOfBirth = remoteDob;
  }

  if (!localSettings.profileCompletedAt?.trim() && remoteProfile?.profileCompletedAt?.trim()) {
    patch.profileCompletedAt = remoteProfile.profileCompletedAt.trim();
  }

  return patch;
}

export function getBioPreview(bio: string | null | undefined): string | null {
  const collapsed = (bio ?? '').replace(/\s+/g, ' ').trim();
  return collapsed.length > 0 ? collapsed : null;
}

/**
 * Generates clean avatar initials from a user's display name:
 * - "Ahmed Sameer Binan" -> "AS"
 * - "John David" -> "JD"
 * - "Priya" -> "P"
 * - "" / null -> "BF"
 */
export function getProfileInitials(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return 'BF';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0][0].toUpperCase();
  }
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

