import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  AppButton,
  AppCard,
  AppHeader,
  AppScreen,
} from '@/components/common';
import { DobPickerField } from '@/components/forms';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';
import type { UpdateSettingsInput } from '@/types/database';
import type { GenderOption } from '@/types/models';
import { validateDateOfBirth } from '@/utils/date';
import {
  evaluateProfileCompletion,
  sanitizeSelectableGender,
  SELECTABLE_GENDER_OPTIONS,
} from '@/utils/profile';

export default function CompleteProfileScreen() {
  const theme = useTheme();
  const router = useRouter();

  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);

  const completion = evaluateProfileCompletion(settings);

  const [gender, setGender] = useState<GenderOption | null>(() =>
    sanitizeSelectableGender(settings.gender),
  );
  const [dateOfBirth, setDateOfBirth] = useState(settings.dateOfBirth ?? '');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!completion.missingGender && !completion.missingDateOfBirth) {
      router.replace('/(tabs)');
    }
  }, [completion.missingGender, completion.missingDateOfBirth, router]);

  if (!completion.missingGender && !completion.missingDateOfBirth) {
    return null;
  }

  const handleSave = async () => {
    if (saving) return;
    setErrorMsg(null);

    const patch: UpdateSettingsInput = {
      profileCompletedAt: new Date().toISOString(),
    };

    if (completion.missingGender) {
      patch.gender = sanitizeSelectableGender(gender);
    }

    if (completion.missingDateOfBirth) {
      const dobCheck = validateDateOfBirth(dateOfBirth);
      if (!dobCheck.valid) {
        setErrorMsg(dobCheck.error ?? 'Please select a valid Date of Birth.');
        return;
      }
      patch.dateOfBirth = dobCheck.value;
    }

    setSaving(true);
    try {
      await updateSettings(patch);
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
      </View>

      {completion.missingGender ? (
        <AppCard>
          <Text style={[styles.fieldLabel, { color: theme.text }]}>
            Gender
          </Text>
          <View style={styles.chipWrap}>
            {SELECTABLE_GENDER_OPTIONS.map((opt) => {
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
      ) : null}

      {completion.missingDateOfBirth ? (
        <AppCard>
          <DobPickerField
            label="Date of Birth"
            value={dateOfBirth}
            dateFormat={settings.dateFormat}
            onChange={(nextIso) => {
              setDateOfBirth(nextIso);
              if (errorMsg) setErrorMsg(null);
            }}
            error={errorMsg}
          />
        </AppCard>
      ) : null}
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
