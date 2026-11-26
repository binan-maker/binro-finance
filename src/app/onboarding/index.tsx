import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton, AppCard, AppScreen } from '@/components/common';
import { DEFAULT_CURRENCY_CODE, getCurrencyConfig } from '@/constants/currencies';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isGoogleSignInConfigured, isSupabaseConfigured } from '@/services/supabase/config';
import { useAppStore } from '@/store/app-store';

export default function OnboardingScreen() {
  const theme = useTheme();
  const router = useRouter();

  const settings = useAppStore((s) => s.settings);
  const currencies = useAppStore((s) => s.currencies);
  const onboardingCurrencyCode = useAppStore((s) => s.onboardingCurrencyCode);
  const setOnboardingCurrencyCode = useAppStore((s) => s.setOnboardingCurrencyCode);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const signInWithGoogle = useAppStore((s) => s.signInWithGoogle);
  const authBusy = useAppStore((s) => s.authBusy);

  const currencyCode =
    onboardingCurrencyCode || settings.currencyCode || DEFAULT_CURRENCY_CODE;
  const selectedCurrency = getCurrencyConfig(currencyCode, currencies);
  const cloudConfigured = isSupabaseConfigured() && isGoogleSignInConfigured();

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleGetStarted = async () => {
    if (submitting || authBusy) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      await completeOnboarding({
        currencyCode,
        openingBalanceMinor: 0,
      });
      router.replace('/(tabs)');
    } catch {
      setSubmitError('Could not finish setup. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleContinueWithGoogle = async () => {
    if (submitting || authBusy) return;
    setSubmitError(null);

    const result = await signInWithGoogle();
    if (result.status === 'cancelled') {
      return;
    }
    if (result.status === 'error') {
      setSubmitError(result.message);
      return;
    }

    const latestState = useAppStore.getState();
    if (latestState.accountSwitchConflict) {
      return;
    }

    if (!latestState.settings.onboardingCompleted) {
      try {
        await completeOnboarding({
          currencyCode,
          openingBalanceMinor: 0,
        });
      } catch {
        setSubmitError('Signed in, but could not complete setup. Please try again.');
        return;
      }
    }

    const afterOnboarding = useAppStore.getState();
    if (!afterOnboarding.settings.profileCompletedAt) {
      router.replace('/profile/complete');
    } else {
      router.replace('/(tabs)');
    }
  };

  const busy = submitting || authBusy;

  return (
    <AppScreen
      edges={['top', 'bottom', 'left', 'right']}
      contentContainerStyle={styles.screenContent}
      footer={
        <View style={styles.footerWrap}>
          {submitError ? (
            <Text style={[styles.submitError, { color: theme.danger }]}>
              {submitError}
            </Text>
          ) : null}

          <AppButton
            label="Get started"
            onPress={() => void handleGetStarted()}
            loading={submitting}
            disabled={busy}
            size="lg"
            fullWidth
          />

          <AppButton
            label="Continue with Google"
            variant="outline"
            icon={<Ionicons name="logo-google" size={18} color={theme.text} />}
            onPress={() => void handleContinueWithGoogle()}
            loading={authBusy}
            disabled={busy}
            size="lg"
            fullWidth
          />

          {!cloudConfigured ? (
            <Text style={[styles.configHint, { color: theme.textMuted }]}>
              Local mode works immediately. Add Supabase & Google keys in .env to enable cloud sync.
            </Text>
          ) : null}
        </View>
      }>
      <View style={styles.topBrand}>
        <View style={[styles.brandBadge, { backgroundColor: theme.primarySoft }]}>
          <Ionicons name="wallet" size={26} color={theme.primary} />
        </View>
        <Text style={[styles.brandWordmark, { color: theme.text }]}>
          BinRo Finance
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Track your income, spending, and budgets privately on your device, with optional Google cloud backup.
        </Text>
      </View>

      <AppCard style={styles.currencyCard}>
        <View style={styles.currencyCardTop}>
          <View style={styles.flex1}>
            <Text style={[styles.currencyLabel, { color: theme.textSecondary }]}>
              Default currency
            </Text>
            <Text style={[styles.currencyName, { color: theme.text }]} numberOfLines={1}>
              {selectedCurrency.name}
            </Text>
          </View>

          <Pressable
            onPress={() => {
              setOnboardingCurrencyCode(currencyCode);
              setSubmitError(null);
              router.push('/currency?mode=onboarding');
            }}
            accessibilityRole="button"
            accessibilityLabel="Change default currency"
            style={({ pressed }) => [
              styles.currencyPill,
              {
                backgroundColor: theme.primarySoft,
                borderColor: theme.primary,
              },
              pressed && styles.pressed,
            ]}>
            <Text style={[styles.currencyPillText, { color: theme.primary }]}>
              {selectedCurrency.code} ({selectedCurrency.symbol})
            </Text>
            <Text style={[styles.currencyPillAction, { color: theme.primary }]}>
              · Change
            </Text>
          </Pressable>
        </View>

        <Text style={[styles.currencyHelper, { color: theme.textMuted }]}>
          You can add an opening balance or pick any currency per transaction anytime in Settings.
        </Text>
      </AppCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingTop: Spacing.five,
    paddingBottom: Spacing.three,
  },
  topBrand: {
    gap: Spacing.three,
  },
  brandBadge: {
    width: 56,
    height: 56,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandWordmark: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
  },
  currencyCard: {
    gap: Spacing.two,
  },
  currencyCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  flex1: {
    flex: 1,
  },
  currencyLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  currencyName: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 2,
  },
  currencyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.one + 4,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  currencyPillText: {
    fontSize: 14,
    fontWeight: '700',
  },
  currencyPillAction: {
    fontSize: 13,
    fontWeight: '600',
  },
  currencyHelper: {
    fontSize: 12,
    lineHeight: 17,
  },
  footerWrap: {
    gap: Spacing.two + 2,
  },
  submitError: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  configHint: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
  },
  pressed: {
    opacity: 0.78,
  },
});
