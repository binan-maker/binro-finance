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
import { DobPickerField } from '@/components/forms';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  deleteStoredImage,
  pickAndSaveSquareImage,
  resolveLocalImageUri,
} from '@/services/images/localImageStorage';
import { useAppStore } from '@/store/app-store';
import { validateDateOfBirth } from '@/utils/date';
import {
  getBioPreview,
  getProfileInitials,
  PROFILE_AVATAR_COLOR,
} from '@/utils/profile';

export { getProfileInitials } from '@/utils/profile';

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
  const [bioDraft, setBioDraft] = useState(settings.profileBio ?? '');
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [savingBio, setSavingBio] = useState(false);

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
  const bioPreview = getBioPreview(bio);

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

  const handleOpenBioEditor = () => {
    setBioDraft(bio);
    setIsEditingBio(true);
    setSavedNotice(false);
    setErrorMsg(null);
  };

  const handleCancelBioEditor = () => {
    setBioDraft(bio);
    setIsEditingBio(false);
  };

  const handleSaveBioInline = async () => {
    if (savingBio || saving) return;
    const trimmed = bioDraft.trim();
    setSavingBio(true);
    setErrorMsg(null);
    try {
      await updateSettings({
        profileBio: trimmed || null,
      });
      setBio(trimmed);
      setBioDraft(trimmed);
      setIsEditingBio(false);
    } catch {
      setErrorMsg('Unable to update note. Please try again.');
    } finally {
      setSavingBio(false);
    }
  };

  const handleSave = async () => {
    if (saving) return;
    setErrorMsg(null);
    setSavedNotice(false);

    const dobCheck = validateDateOfBirth(dateOfBirth);
    if (!dobCheck.valid) {
      setErrorMsg(dobCheck.error ?? 'Please select a valid Date of Birth.');
      return;
    }

    const activeBio = (isEditingBio ? bioDraft : bio).trim();
    setSaving(true);
    const previousSavedAvatar = settings.profileAvatar;

    try {
      await updateSettings({
        profileName: displayName.trim() || null,
        profileBio: activeBio || null,
        profileAvatar: avatarPath,
        dateOfBirth: dobCheck.value,
        profileCompletedAt: settings.profileCompletedAt ?? new Date().toISOString(),
      });

      if (previousSavedAvatar && previousSavedAvatar !== avatarPath) {
        deleteStoredImage(previousSavedAvatar);
      }
      unsavedUploadRef.current = null;
      setBio(activeBio);
      setBioDraft(activeBio);
      setIsEditingBio(false);

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

        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: theme.text }]}>
            Bio / Note
          </Text>

          {isEditingBio ? (
            <View style={styles.bioEditorBlock}>
              <AppInput
                value={bioDraft}
                onChangeText={setBioDraft}
                placeholder="Personal finance goal or note"
                maxLength={120}
                multiline
                numberOfLines={3}
                style={styles.bioInput}
              />
              <View style={styles.bioActionsRow}>
                <AppButton
                  label="Cancel"
                  variant="outline"
                  size="sm"
                  onPress={handleCancelBioEditor}
                  disabled={savingBio}
                />
                <AppButton
                  label="Save"
                  size="sm"
                  onPress={() => void handleSaveBioInline()}
                  loading={savingBio}
                />
              </View>
            </View>
          ) : (
            <Pressable
              onPress={handleOpenBioEditor}
              accessibilityRole="button"
              accessibilityLabel={bioPreview ? 'Edit note' : 'Add a note'}
              style={({ pressed }) => [
                styles.bioCollapsedRow,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                },
                pressed && styles.pressed,
              ]}>
              <Text
                style={[
                  styles.bioCollapsedText,
                  { color: bioPreview ? theme.text : theme.textMuted },
                ]}
                numberOfLines={1}>
                {bioPreview ?? 'Add a note'}
              </Text>
              <View style={styles.bioCollapsedAction}>
                <Ionicons
                  name={bioPreview ? 'create-outline' : 'add-outline'}
                  size={16}
                  color={theme.primary}
                />
                <Text style={[styles.bioActionLabel, { color: theme.primary }]}>
                  {bioPreview ? 'Edit' : 'Add'}
                </Text>
              </View>
            </Pressable>
          )}
        </View>

        <DobPickerField
          label="Date of Birth"
          value={dateOfBirth}
          dateFormat={settings.dateFormat}
          onChange={(nextIso) => {
            setDateOfBirth(nextIso);
            setSavedNotice(false);
            if (errorMsg) setErrorMsg(null);
          }}
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
  photoActionsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  flex1: {
    flex: 1,
  },
  fieldGroup: {
    gap: Spacing.one + 2,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  bioCollapsedRow: {
    minHeight: 46,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three - 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  bioCollapsedText: {
    fontSize: 14,
    flex: 1,
  },
  bioCollapsedAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  bioActionLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  bioEditorBlock: {
    gap: Spacing.two,
  },
  bioInput: {
    minHeight: 84,
    textAlignVertical: 'top',
  },
  bioActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
  },
  pressed: {
    opacity: 0.75,
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
