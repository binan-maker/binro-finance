import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
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
import { useAppStore } from '@/store/app-store';

interface AvatarPreset {
  id: string;
  icon: keyof typeof Ionicons.glyphMap | null;
  color: string;
}

const AVATAR_PRESETS: readonly AvatarPreset[] = [
  { id: 'initials:#10B981', icon: null, color: '#10B981' },
  { id: 'person:#059669', icon: 'person', color: '#059669' },
  { id: 'wallet:#0EA5E9', icon: 'wallet', color: '#0EA5E9' },
  { id: 'briefcase:#8B5CF6', icon: 'briefcase', color: '#8B5CF6' },
  { id: 'leaf:#16A34A', icon: 'leaf', color: '#16A34A' },
  { id: 'diamond:#F59E0B', icon: 'diamond', color: '#F59E0B' },
];

export function parseAvatarPreset(value: string | null): AvatarPreset {
  const match = AVATAR_PRESETS.find((p) => p.id === value);
  return match ?? AVATAR_PRESETS[0];
}

export function getProfileInitials(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return 'BF';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

export default function ProfileScreen() {
  const theme = useTheme();
  const router = useRouter();

  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);

  const [displayName, setDisplayName] = useState(settings.profileName ?? '');
  const [bio, setBio] = useState(settings.profileBio ?? '');
  const [avatarId, setAvatarId] = useState(
    settings.profileAvatar ?? AVATAR_PRESETS[0].id,
  );
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  const activePreset = parseAvatarPreset(avatarId);
  const initials = getProfileInitials(displayName);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setErrorMsg(null);
    setSavedNotice(false);

    try {
      await updateSettings({
        profileName: displayName.trim() || null,
        profileBio: bio.trim() || null,
        profileAvatar: avatarId,
      });
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
              { backgroundColor: activePreset.color },
            ]}>
            {activePreset.icon ? (
              <Ionicons name={activePreset.icon} size={34} color="#FFFFFF" />
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

        <Text style={[styles.label, { color: theme.text }]}>Avatar Style</Text>
        <View style={styles.presetsRow}>
          {AVATAR_PRESETS.map((preset) => {
            const selected = preset.id === avatarId;
            return (
              <Pressable
                key={preset.id}
                onPress={() => {
                  setAvatarId(preset.id);
                  setSavedNotice(false);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={[
                  styles.presetBtn,
                  {
                    backgroundColor: preset.color,
                    borderColor: selected ? theme.text : 'transparent',
                    borderWidth: selected ? 3 : 0,
                  },
                ]}>
                {preset.icon ? (
                  <Ionicons name={preset.icon} size={20} color="#FFFFFF" />
                ) : (
                  <Text style={styles.presetInitials}>{initials}</Text>
                )}
              </Pressable>
            );
          })}
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
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: Spacing.one,
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two + 2,
  },
  presetBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetInitials: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
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
