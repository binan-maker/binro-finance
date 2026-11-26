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
import type { GenderOption } from '@/types/models';
import { isValidISODate } from '@/utils/date';

const GENDER_OPTIONS: readonly { label: string; value: GenderOption }[] = [
  { label: 'Prefer not to say', value: 'prefer_not_to_say' },
  { label: 'Female', value: 'female' },
  { label: 'Male', value: 'male' },
  { label: 'Non-binary', value: 'non_binary' },
  { label: 'Other', value: 'other' },
];

export default function CompleteProfileScreen() {
  const theme = useTheme();
  const router = useRouter();

  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);

  const [gender, setGender] = useState<GenderOption | null>(settings.gender ?? null);
  const [dateOfBirth, setDateOfBirth] = useState(settings.dateOfBirth ?? '');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (saving) return;
    setErrorMsg(null);

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
    try {
      await updateSettings({
        gender,
        dateOfBirth: trimmedDob || null,
        profileCompletedAt: new Date().toISOString(),
      });
      router.replace('/(tabs)');
    } catch {
      setErrorMsg('Unable to save profile details right now.');
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await updateSettings({
        profileCompletedAt: new Date().toISOString(),
      });
      router.replace('/(tabs)');
    } catch {
      router.replace('/(tabs)');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppScreen
      keyboardAvoiding
      edges={['top', 'bottom', 'left', 'right']}
      footer={
        <View style={styles.footerRow}>
          <View style={styles.flex1}>
            <AppButton
              label="Skip"
              variant="outline"
              onPress={() => void handleSkip()}
              disabled={saving}
              fullWidth
            />
          </View>
          <View style={styles.flex2}>
            <AppButton
              label="Save & Continue"
              onPress={() => void handleSave()}
              loading={saving}
              fullWidth
            />
          </View>
        </View>
      }>
      <AppHeader title="Complete Profile" />

      <View style={styles.hero}>
        <View style={[styles.badge, { backgroundColor: theme.primarySoft }]}>
          <Ionicons name="person-outline" size={24} color={theme.primary} />
        </View>
        <Text style={[styles.title, { color: theme.text }]}>
          Personalize your account
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Both details below are optional and stay private to your workspace.
        </Text>
      </View>

      <AppCard>
        <Text style={[styles.fieldLabel, { color: theme.text }]}>
          Gender (Optional)
        </Text>
        <View style={styles.chipWrap}>
          {GENDER_OPTIONS.map((opt) => {
            const selected = gender === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => setGender(selected ? null : opt.value)}
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
      </AppCard>

      <AppCard>
        <AppInput
          label="Date of Birth (Optional)"
          value={dateOfBirth}
          onChangeText={(text) => {
            setDateOfBirth(text);
            if (errorMsg) setErrorMsg(null);
          }}
          placeholder="YYYY-MM-DD"
          maxLength={10}
          keyboardType="numbers-and-punctuation"
          helperText="Example: 1998-05-14"
          error={errorMsg}
        />
      </AppCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  hero: {
    gap: Spacing.two,
    paddingTop: Spacing.one,
  },
  badge: {
    width: 48,
    height: 48,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  fieldLabel: {
    fontSize: 14,
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
  footerRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  flex1: {
    flex: 1,
  },
  flex2: {
    flex: 2,
  },
});
