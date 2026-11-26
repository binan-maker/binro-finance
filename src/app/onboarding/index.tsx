import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  AppButton,
  AppCard,
  AppInput,
  AppScreen,
  GoogleSignInButton,
} from '@/components/common';
import { DEFAULT_CURRENCY_CODE, getCurrencyConfig } from '@/constants/currencies';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';
import { formatMinorToMajorInput } from '@/utils/money';
import { shouldPromptProfileCompletion } from '@/utils/profile';
import { validateNonNegativeAmountInput } from '@/utils/validation';

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

  const [openingBalanceInput, setOpeningBalanceInput] = useState(() =>
    settings.openingBalanceMinor > 0
      ? formatMinorToMajorInput(
          settings.openingBalanceMinor,
          settings.openingBalanceCurrencyCode || settings.currencyCode,
          currencies,
        )
      : '',
  );
  const [balanceDirty, setBalanceDirty] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const actionLockRef = useRef(false);

  const resolveOpeningBalanceUpdate = (): {
    valid: boolean;
    openingBalanceMinor?: number;
  } => {
    const trimmed = openingBalanceInput.trim();
    if (!balanceDirty || !trimmed) {
      return { valid: true, openingBalanceMinor: undefined };
    }
    const validation = validateNonNegativeAmountInput(
      trimmed,
      currencyCode,
      currencies,
    );
    if (!validation.valid || validation.value === undefined) {
      setBalanceError(validation.error ?? 'Enter a valid non-negative balance.');
      return { valid: false };
    }
    return { valid: true, openingBalanceMinor: validation.value };
  };

  const handleSkip = async () => {
    if (actionLockRef.current || submitting || authBusy) return;
    actionLockRef.current = true;
    setSubmitError(null);
    setBalanceError(null);
    setSubmitting(true);
    try {
      await completeOnboarding({ currencyCode });
      router.replace('/(tabs)');
    } catch {
      setSubmitError('Could not finish setup. Please try again.');
    } finally {
      setSubmitting(false);
      actionLockRef.current = false;
    }
  };

  const handleGetStarted = async () => {
    if (actionLockRef.current || submitting || authBusy) return;
    setSubmitError(null);
    setBalanceError(null);

    const parsedBalance = resolveOpeningBalanceUpdate();
    if (!parsedBalance.valid) return;

    actionLockRef.current = true;
    setSubmitting(true);
    try {
      await completeOnboarding({
        currencyCode,
        openingBalanceMinor: parsedBalance.openingBalanceMinor,
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
    setSubmitError(null);
    setBalanceError(null);

    const parsedBalance = resolveOpeningBalanceUpdate();
    if (!parsedBalance.valid) return;

    actionLockRef.current = true;
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
            openingBalanceMinor: parsedBalance.openingBalanceMinor,
          });
        } catch {
          setSubmitError('Signed in, but could not complete setup. Please try again.');
          return;
        }
      }

      const afterOnboarding = useAppStore.getState();
      if (shouldPromptProfileCompletion(afterOnboarding.settings)) {
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
      keyboardAvoiding
      contentStyle={styles.screenContent}>
      <View style={styles.topHeaderBar}>
        <View style={styles.topSideSlot}>
          <Pressable
            onPress={() => void handleSkip()}
            disabled={busy}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Skip"
            style={({ pressed }) => [
              styles.skipButton,
              pressed && !busy && styles.pressed,
            ]}>
            <Text style={[styles.skipText, { color: theme.textSecondary }]}>
              Skip
            </Text>
          </Pressable>
        </View>

        <View style={styles.brandCenter}>
          <Image
            source={require('@/assets/images/icon.png')}
            style={styles.brandIcon}
            contentFit="cover"
          />
          <Text
            style={[styles.brandName, { color: theme.text }]}
            numberOfLines={1}>
            BinRo Finance
          </Text>
        </View>

        <View style={styles.topSideSlot} />
      </View>

      <View style={styles.centerSection}>
        <View style={styles.fieldGroup}>
          <Text style={[styles.fieldLabel, { color: theme.text }]}>
            Default Currency
          </Text>
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
                  setBalanceError(null);
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
        </View>

        <AppInput
          label="Opening Balance"
          prefix={selectedCurrency.symbol}
          value={openingBalanceInput}
          onChangeText={(text) => {
            setOpeningBalanceInput(text);
            setBalanceDirty(true);
            if (balanceError) setBalanceError(null);
            if (submitError) setSubmitError(null);
          }}
          placeholder={selectedCurrency.minorUnits === 0 ? '0' : '0.00'}
          keyboardType={
            selectedCurrency.minorUnits === 0 ? 'number-pad' : 'decimal-pad'
          }
          editable={!busy}
          error={balanceError}
        />

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

        <View style={styles.actionsWrap}>
          <AppButton
            label="Get Started"
            onPress={() => void handleGetStarted()}
            loading={submitting}
            disabled={busy}
            preserveAppearanceWhenDisabled
            size="lg"
            fullWidth
          />

          <GoogleSignInButton
            label="Continue with Google"
            onPress={() => void handleContinueWithGoogle()}
            loading={authBusy}
            disabled={busy}
            preserveAppearanceWhenDisabled
            size="lg"
            fullWidth
          />
        </View>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    flexGrow: 1,
    paddingTop: Spacing.two + 4,
    paddingBottom: Spacing.four,
  },
  topHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 40,
  },
  topSideSlot: {
    width: 64,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  skipButton: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.one,
  },
  skipText: {
    fontSize: 15,
    fontWeight: '600',
  },
  brandCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  brandIcon: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
  },
  brandName: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  centerSection: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.four,
  },
  fieldGroup: {
    gap: Spacing.one + 2,
  },
  fieldLabel: {
    fontSize: 13,
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
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  currencySymbolText: {
    fontSize: 20,
    fontWeight: '800',
  },
  currencyInfo: {
    flex: 1,
    gap: 2,
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
  actionsWrap: {
    gap: Spacing.two + 2,
    marginTop: Spacing.one,
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
  pressed: {
    opacity: 0.78,
  },
});
