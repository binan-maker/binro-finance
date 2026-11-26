import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton, AppCard, AppScreen } from '@/components/common';
import { DEFAULT_CURRENCY_CODE, getCurrencyConfig } from '@/constants/currencies';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isGoogleSignInConfigured, isSupabaseConfigured } from '@/services/supabase/config';
import { useAppStore } from '@/store/app-store';

const FEATURE_HIGHLIGHTS = [
  {
    icon: 'receipt-outline' as const,
    title: 'Track everyday spending',
    subtitle: 'Log expenses and income quickly, online or offline.',
  },
  {
    icon: 'pie-chart-outline' as const,
    title: 'Understand your habits',
    subtitle: 'Spot category patterns across weeks and months.',
  },
  {
    icon: 'wallet-outline' as const,
    title: 'Monitor your balance',
    subtitle: 'Keep budgets and cash flow clear at a glance.',
  },
] as const;

const ABSTRACT_BAR_GROUPS = [
  { key: 'a', primaryRatio: 0.72, secondaryRatio: 0.42 },
  { key: 'b', primaryRatio: 0.54, secondaryRatio: 0.68 },
  { key: 'c', primaryRatio: 0.88, secondaryRatio: 0.36 },
  { key: 'd', primaryRatio: 0.64, secondaryRatio: 0.52 },
] as const;

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
  const actionLockRef = useRef(false);

  const handleGetStarted = async () => {
    if (actionLockRef.current || submitting || authBusy) return;
    actionLockRef.current = true;
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
      actionLockRef.current = false;
    }
  };

  const handleContinueWithGoogle = async () => {
    if (actionLockRef.current || submitting || authBusy) return;
    actionLockRef.current = true;
    setSubmitError(null);

    try {
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
    } catch {
      setSubmitError('Unable to sign in with Google right now. Please try again.');
    } finally {
      actionLockRef.current = false;
    }
  };

  const busy = submitting || authBusy;

  return (
    <AppScreen
      edges={['top', 'bottom', 'left', 'right']}
      contentStyle={styles.screenContent}
      footer={
        <View style={styles.footerWrap}>
          {submitError ? (
            <View
              style={[
                styles.errorBanner,
                {
                  backgroundColor: theme.dangerSoft,
                  borderColor: theme.danger,
                },
              ]}>
              <Ionicons name="alert-circle-outline" size={16} color={theme.danger} />
              <Text style={[styles.submitError, { color: theme.danger }]}>
                {submitError}
              </Text>
            </View>
          ) : null}

          <AppButton
            label="Get started"
            onPress={() => void handleGetStarted()}
            loading={submitting}
            disabled={busy}
            preserveAppearanceWhenDisabled
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
            preserveAppearanceWhenDisabled
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
      <View style={styles.topSection}>
        <View style={styles.brandRow}>
          <View style={[styles.brandBadge, { backgroundColor: theme.primarySoft }]}>
            <Ionicons name="wallet" size={24} color={theme.primary} />
          </View>
          <View style={styles.brandTextWrap}>
            <Text style={[styles.brandName, { color: theme.primary }]}>
              BinRo Finance
            </Text>
            <Text style={[styles.brandTag, { color: theme.textSecondary }]}>
              Private offline-first ledger
            </Text>
          </View>
        </View>

        <Text style={[styles.welcomeHeading, { color: theme.text }]}>
          Your money, organized with clarity.
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Keep daily expenses, categories, and budgets stored safely on your device, with optional Google cloud sync.
        </Text>
      </View>

      <View style={styles.middleSection}>
        <AppCard style={styles.visualCard}>
          <View style={styles.visualHeader}>
            <View style={styles.visualTitleRow}>
              <View style={[styles.visualDot, { backgroundColor: theme.primary }]} />
              <Text style={[styles.visualCaption, { color: theme.textSecondary }]}>
                Everyday financial overview
              </Text>
            </View>
            <View
              style={[
                styles.visualChip,
                { backgroundColor: theme.primarySoft },
              ]}>
              <Ionicons name="lock-closed-outline" size={12} color={theme.primary} />
              <Text style={[styles.visualChipText, { color: theme.primary }]}>
                On-device
              </Text>
            </View>
          </View>

          <View style={styles.barsContainer}>
            {ABSTRACT_BAR_GROUPS.map((bar) => (
              <View key={bar.key} style={styles.barColumn}>
                <View
                  style={[
                    styles.barTrack,
                    { backgroundColor: theme.surfaceElevated },
                  ]}>
                  <View
                    style={[
                      styles.barFillPrimary,
                      {
                        height: `${Math.round(bar.primaryRatio * 100)}%`,
                        backgroundColor: theme.primary,
                      },
                    ]}
                  />
                </View>
                <View
                  style={[
                    styles.barTrackSecondary,
                    { backgroundColor: theme.surfaceElevated },
                  ]}>
                  <View
                    style={[
                      styles.barFillSecondary,
                      {
                        height: `${Math.round(bar.secondaryRatio * 100)}%`,
                        backgroundColor: theme.primaryBright,
                        opacity: 0.45,
                      },
                    ]}
                  />
                </View>
              </View>
            ))}
          </View>

          <View style={[styles.visualFooter, { borderTopColor: theme.border }]}>
            <View style={styles.visualLegendItem}>
              <Ionicons name="trending-up-outline" size={14} color={theme.income} />
              <Text style={[styles.visualLegendText, { color: theme.textSecondary }]}>
                Income
              </Text>
            </View>
            <View style={styles.visualLegendItem}>
              <Ionicons name="swap-vertical-outline" size={14} color={theme.primary} />
              <Text style={[styles.visualLegendText, { color: theme.textSecondary }]}>
                Spending
              </Text>
            </View>
            <View style={styles.visualLegendItem}>
              <Ionicons name="speedometer-outline" size={14} color={theme.textSecondary} />
              <Text style={[styles.visualLegendText, { color: theme.textSecondary }]}>
                Budgets
              </Text>
            </View>
          </View>
        </AppCard>

        <AppCard style={styles.currencyCard}>
          <View style={styles.currencyRow}>
            <View
              style={[
                styles.currencySymbolTile,
                {
                  backgroundColor: theme.primarySoft,
                  borderColor: theme.primary,
                },
              ]}>
              <Text
                style={[styles.currencySymbolText, { color: theme.primary }]}
                numberOfLines={1}
                adjustsFontSizeToFit>
                {selectedCurrency.symbol}
              </Text>
            </View>

            <View style={styles.currencyInfo}>
              <Text style={[styles.currencyLabel, { color: theme.textSecondary }]}>
                Default currency
              </Text>
              <Text style={[styles.currencyName, { color: theme.text }]} numberOfLines={1}>
                {selectedCurrency.name}
              </Text>
              <Text style={[styles.currencyCode, { color: theme.textMuted }]}>
                {selectedCurrency.code}
              </Text>
            </View>

            <Pressable
              onPress={() => {
                if (busy) return;
                setOnboardingCurrencyCode(currencyCode);
                setSubmitError(null);
                router.push('/currency?mode=onboarding');
              }}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Change default currency"
              style={({ pressed }) => [
                styles.changeButton,
                {
                  backgroundColor: theme.surfaceElevated,
                  borderColor: theme.border,
                },
                pressed && !busy && styles.pressed,
              ]}>
              <Text style={[styles.changeButtonText, { color: theme.primary }]}>
                Change
              </Text>
              <Ionicons name="chevron-forward" size={14} color={theme.primary} />
            </Pressable>
          </View>
        </AppCard>

        <View style={styles.highlightsWrap}>
          {FEATURE_HIGHLIGHTS.map((item) => (
            <View
              key={item.title}
              style={[
                styles.highlightRow,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                },
              ]}>
              <View
                style={[
                  styles.highlightIcon,
                  { backgroundColor: theme.primarySoft },
                ]}>
                <Ionicons name={item.icon} size={18} color={theme.primary} />
              </View>
              <View style={styles.highlightTextWrap}>
                <Text style={[styles.highlightTitle, { color: theme.text }]}>
                  {item.title}
                </Text>
                <Text style={[styles.highlightSub, { color: theme.textSecondary }]}>
                  {item.subtitle}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
  },
  topSection: {
    gap: Spacing.two + 2,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 4,
  },
  brandBadge: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTextWrap: {
    flex: 1,
    gap: 2,
  },
  brandName: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  brandTag: {
    fontSize: 12,
    fontWeight: '500',
  },
  welcomeHeading: {
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 34,
    letterSpacing: -0.6,
    marginTop: Spacing.one,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
  },
  middleSection: {
    gap: Spacing.two + 4,
  },
  visualCard: {
    gap: Spacing.two + 2,
    paddingVertical: Spacing.three - 2,
  },
  visualHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  visualTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  visualDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  visualCaption: {
    fontSize: 12,
    fontWeight: '600',
  },
  visualChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  visualChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  barsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.three,
    height: 56,
    paddingHorizontal: Spacing.one,
  },
  barColumn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 6,
    height: '100%',
  },
  barTrack: {
    width: 14,
    height: '100%',
    borderRadius: Radius.full,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFillPrimary: {
    width: '100%',
    borderRadius: Radius.full,
  },
  barTrackSecondary: {
    width: 10,
    height: '82%',
    borderRadius: Radius.full,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFillSecondary: {
    width: '100%',
    borderRadius: Radius.full,
  },
  visualFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.two,
    borderTopWidth: 1,
  },
  visualLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  visualLegendText: {
    fontSize: 12,
    fontWeight: '600',
  },
  currencyCard: {
    paddingVertical: Spacing.two + 4,
  },
  currencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 4,
  },
  currencySymbolTile: {
    width: 50,
    height: 50,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  currencySymbolText: {
    fontSize: 22,
    fontWeight: '800',
  },
  currencyInfo: {
    flex: 1,
    gap: 1,
  },
  currencyLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  currencyName: {
    fontSize: 16,
    fontWeight: '700',
  },
  currencyCode: {
    fontSize: 12,
    fontWeight: '600',
  },
  changeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: Spacing.two + 4,
    paddingVertical: Spacing.one + 4,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  changeButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  highlightsWrap: {
    gap: Spacing.two,
  },
  highlightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 4,
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.two + 2,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  highlightIcon: {
    width: 34,
    height: 34,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  highlightTextWrap: {
    flex: 1,
    gap: 1,
  },
  highlightTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  highlightSub: {
    fontSize: 12,
    lineHeight: 16,
  },
  footerWrap: {
    gap: Spacing.two + 2,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.two,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  submitError: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
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
