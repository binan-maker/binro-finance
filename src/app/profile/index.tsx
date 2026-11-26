import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  AppButton,
  AppCard,
  AppHeader,
  AppInput,
  AppScreen,
} from '@/components/common';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  deleteStoredImage,
  pickAndSaveSquareImage,
  resolveLocalImageUri,
} from '@/services/images/localImageStorage';
import { useAppStore } from '@/store/app-store';
import type { GenderOption } from '@/types/models';
import { isValidISODate } from '@/utils/date';
import { getProfileInitials, PROFILE_AVATAR_COLOR } from '@/utils/profile';

export { getProfileInitials } from '@/utils/profile';

const GENDER_OPTIONS: readonly { label: string; value: GenderOption }[] = [
  { label: 'Prefer not to say', value: 'prefer_not_to_say' },
  { label: 'Female', value: 'female' },
  { label: 'Male', value: 'male' },
  { label: 'Non-binary', value: 'non_binary' },
  { label: 'Other', value: 'other' },
];

export default function ProfileScreen() {
  const theme = useTheme();
  const router = useRouter();

  const settings = useAppStore((s) => s.settings);
  const authUser = useAppStore((s) => s.authUser);
  const updateSettings = useAppStore((s) => s.updateSettings);

  const [displayName, setDisplayName] = useState(
    settings.profileName ?? settings.googleName ?? '',
  );
  const [bio, setBio] = useState(settings.profileBio ?? '');
  const [gender, setGender] = useState<GenderOption | null>(settings.gender ?? null);
  const [dateOfBirth, setDateOfBirth] = useState(settings.dateOfBirth ?? '');
  const [avatarPath, setAvatarPath] = useState<string | null>(() =>
    resolveLocalImageUri(settings.profileAvatar) ? settings.profileAvatar : null,
  );
  const [failedAvatarUri, setFailedAvatarUri] = useState<string | null>(null);
  const [pickingPhoto, setPickingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  const unsavedUploadRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (unsavedUploadRef.current) {
        deleteStoredImage(unsavedUploadRef.current);
      }
    };
  }, []);

  const customAvatarUri = resolveLocalImageUri(avatarPath);
  const googleFallbackUri = resolveLocalImageUri(
    authUser?.googleAvatarUrl ?? settings.googleAvatarUrl,
  );
  const resolvedAvatarUri = customAvatarUri ?? googleFallbackUri;
  const showPhoto = Boolean(
    resolvedAvatarUri && failedAvatarUri !== resolvedAvatarUri,
  );
  const initials = getProfileInitials(displayName || settings.googleEmail);

  const handlePickPhoto = async () => {
    if (pickingPhoto || saving) return;
    setPickingPhoto(true);
    setErrorMsg(null);
    setSavedNotice(false);
    try {
      const result = await pickAndSaveSquareImage('profile');
      if (result.error) {
        setErrorMsg(result.error);
        return;
      }
      if (!result.canceled && result.relativePath) {
        if (unsavedUploadRef.current) {
          deleteStoredImage(unsavedUploadRef.current);
        }
        unsavedUploadRef.current = result.relativePath;
        setAvatarPath(result.relativePath);
        setFailedAvatarUri(null);
      }
    } finally {
      setPickingPhoto(false);
    }
  };

  const handleRemovePhoto = () => {
    if (unsavedUploadRef.current) {
      deleteStoredImage(unsavedUploadRef.current);
      unsavedUploadRef.current = null;
    }
    setAvatarPath(null);
    setFailedAvatarUri(null);
    setErrorMsg(null);
    setSavedNotice(false);
  };

  const handleSave = async () => {
    if (saving) return;
    setErrorMsg(null);
    setSavedNotice(false);

    const trimmedDob = dateOfBirth.trim();
    if (trimmedDob) {
      if (!isValidISODate(trimmedDob)) {
        setErrorMsg('Enter Date of Birth in YYYY-MM-DD format (e.g. 1998-05-14).');
        return;
      }
      const parsed = new Date(`${trimmedDob}T00:00:00Z`);
      if (parsed.getTime() > Date.now() || parsed.getUTCFullYear() < 1900) {
        setErrorMsg('Please enter a valid Date of Birth.');
        return;
      }
    }

    setSaving(true);
    const previousSavedAvatar = settings.profileAvatar;

    try {
      await updateSettings({
        profileName: displayName.trim() || null,
        profileBio: bio.trim() || null,
        profileAvatar: avatarPath,
        gender,
        dateOfBirth: trimmedDob || null,
        profileCompletedAt: settings.profileCompletedAt ?? new Date().toISOString(),
      });

      if (previousSavedAvatar && previousSavedAvatar !== avatarPath) {
        deleteStoredImage(previousSavedAvatar);
      }
      unsavedUploadRef.current = null;

      setSavedNotice(true);
      if (router.canGoBack()) {
        router.back();
      }
    } catch {
      setErrorMsg('Unable to save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const linkedEmail = authUser?.email ?? settings.googleEmail;

  return (
    <AppScreen
      keyboardAvoiding
      edges={['top', 'bottom', 'left', 'right']}
      footer={
        <AppButton
          label="Save Profile"
          onPress={() => void handleSave()}
          loading={saving}
          size="lg"
          fullWidth
        />
      }>
      <AppHeader title="Profile" showBack />

      <AppCard>
        <View style={styles.avatarHeader}>
          <View
            style={[
              styles.avatarCircle,
              { backgroundColor: PROFILE_AVATAR_COLOR },
            ]}>
            {showPhoto && resolvedAvatarUri ? (
              <Image
                source={{ uri: resolvedAvatarUri }}
                style={styles.avatarImage}
                contentFit="cover"
                onError={() => setFailedAvatarUri(resolvedAvatarUri)}
              />
            ) : (
              <Text style={styles.avatarInitials}>{initials}</Text>
            )}
          </View>
          <View style={styles.avatarMeta}>
            <Text style={[styles.avatarName, { color: theme.text }]} numberOfLines={1}>
              {displayName.trim() || 'Local Profile'}
            </Text>
            <Text style={[styles.localNote, { color: theme.textSecondary }]} numberOfLines={1}>
              {linkedEmail || 'Stored locally on this device'}
            </Text>
          </View>
        </View>

        {!customAvatarUri && googleFallbackUri ? (
          <Text style={[styles.fallbackHint, { color: theme.textMuted }]}>
            Using your Google photo by default. Upload a photo anytime to customize it.
          </Text>
        ) : null}

        <View style={styles.photoActionsRow}>
          <View style={styles.flex1}>
            <AppButton
              label={customAvatarUri ? 'Replace Photo' : 'Upload Photo'}
              variant="outline"
              size="sm"
              loading={pickingPhoto}
              icon={<Ionicons name="image-outline" size={16} color={theme.text} />}
              onPress={() => void handlePickPhoto()}
              fullWidth
            />
          </View>
          {avatarPath ? (
            <View style={styles.flex1}>
              <AppButton
                label="Remove Photo"
                variant="outline"
                size="sm"
                icon={<Ionicons name="trash-outline" size={16} color={theme.danger} />}
                onPress={handleRemovePhoto}
                fullWidth
              />
            </View>
          ) : null}
        </View>
      </AppCard>

      <AppCard>
        <AppInput
          label="Display Name"
          value={displayName}
          onChangeText={(text) => {
            setDisplayName(text);
            setSavedNotice(false);
            if (errorMsg) setErrorMsg(null);
          }}
          placeholder="Your name"
          maxLength={40}
        />

        <AppInput
          label="Bio / Note"
          value={bio}
          onChangeText={(text) => {
            setBio(text);
            setSavedNotice(false);
            if (errorMsg) setErrorMsg(null);
          }}
          placeholder="Personal finance goal or note"
          maxLength={120}
          multiline
          numberOfLines={3}
          style={styles.bioInput}
        />

        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: theme.text }]}>
            Gender (Optional)
          </Text>
          <View style={styles.chipWrap}>
            {GENDER_OPTIONS.map((opt) => {
              const selected = gender === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => {
                    setGender(selected ? null : opt.value);
                    setSavedNotice(false);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: selected
                        ? theme.primarySoft
                        : theme.surfaceElevated,
                      borderColor: selected ? theme.primary : theme.border,
                    },
                  ]}>
                  <Text
                    style={[
                      styles.chipText,
                      { color: selected ? theme.primary : theme.text },
                    ]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <AppInput
          label="Date of Birth (Optional)"
          value={dateOfBirth}
          onChangeText={(text) => {
            setDateOfBirth(text);
            setSavedNotice(false);
            if (errorMsg) setErrorMsg(null);
          }}
          placeholder="YYYY-MM-DD"
          maxLength={10}
          keyboardType="numbers-and-punctuation"
          helperText="Format: YYYY-MM-DD (e.g. 1998-05-14)"
        />
      </AppCard>

      {errorMsg ? (
        <Text style={[styles.errorText, { color: theme.danger }]}>{errorMsg}</Text>
      ) : null}
      {savedNotice ? (
        <Text style={[styles.savedText, { color: theme.primary }]}>Profile updated.</Text>
      ) : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  avatarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  avatarCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarInitials: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
  },
  avatarMeta: {
    flex: 1,
    gap: 2,
  },
  avatarName: {
    fontSize: 18,
    fontWeight: '700',
  },
  localNote: {
    fontSize: 13,
  },
  fallbackHint: {
    fontSize: 12,
    lineHeight: 17,
  },
  photoActionsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  flex1: {
    flex: 1,
  },
  bioInput: {
    minHeight: 84,
    textAlignVertical: 'top',
  },
  fieldGroup: {
    gap: Spacing.two,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.one + 3,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  savedText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});
