import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  AppButton,
  AppCard,
  AppHeader,
  AppInput,
  AppScreen,
} from '@/components/common';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  deleteStoredImage,
  pickAndSaveSquareImage,
  resolveLocalImageUri,
} from '@/services/images/localImageStorage';
import { useAppStore } from '@/store/app-store';
import { getProfileInitials, PROFILE_AVATAR_COLOR } from '@/utils/profile';

export { getProfileInitials } from '@/utils/profile';

export default function ProfileScreen() {
  const theme = useTheme();
  const router = useRouter();

  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);

  const [displayName, setDisplayName] = useState(settings.profileName ?? '');
  const [bio, setBio] = useState(settings.profileBio ?? '');
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

  const initials = getProfileInitials(displayName);
  const resolvedAvatarUri = resolveLocalImageUri(avatarPath);
  const showPhoto = Boolean(
    resolvedAvatarUri && failedAvatarUri !== resolvedAvatarUri,
  );

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
    setSaving(true);
    setErrorMsg(null);
    setSavedNotice(false);

    const previousSavedAvatar = settings.profileAvatar;

    try {
      await updateSettings({
        profileName: displayName.trim() || null,
        profileBio: bio.trim() || null,
        profileAvatar: avatarPath,
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
            <Text style={[styles.localNote, { color: theme.textSecondary }]}>
              Stored locally on this device
            </Text>
          </View>
        </View>

        <View style={styles.photoActionsRow}>
          <View style={styles.flex1}>
            <AppButton
              label={showPhoto ? 'Replace Photo' : 'Upload Photo'}
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
  bioInput: {
    minHeight: 84,
    textAlignVertical: 'top',
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
