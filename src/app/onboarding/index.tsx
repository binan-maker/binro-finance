import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton, AppCard, AppInput, AppScreen } from '@/components/common';
import {
  DEFAULT_CURRENCY_CODE,
  getCurrencyConfig,
} from '@/constants/currencies';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';
import { validateNonNegativeAmountInput } from '@/utils/validation';

const FEATURED_CODES = ['INR', 'USD', 'EUR', 'GBP', 'JPY', 'AED'];

export default function OnboardingScreen() {
  const theme = useTheme();
  const router = useRouter();
  const settings = useAppStore((s) => s.settings);
  const currencies = useAppStore((s) => s.currencies);
  const onboardingCurrencyCode = useAppStore((s) => s.onboardingCurrencyCode);
  const setOnboardingCurrencyCode = useAppStore((s) => s.setOnboardingCurrencyCode);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);

  const currencyCode = onboardingCurrencyCode || settings.currencyCode || DEFAULT_CURRENCY_CODE;
  const [openingBalanceText, setOpeningBalanceText] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedCurrency = getCurrencyConfig(currencyCode, currencies);

  const featuredCurrencies = useMemo(() => {
    const base = FEATURED_CODES.map((code) => getCurrencyConfig(code, currencies));
    if (!FEATURED_CODES.includes(selectedCurrency.code)) {
      return [selectedCurrency, ...base.slice(0, 5)];
    }
    return base;
  }, [currencies, selectedCurrency]);

  const handleContinue = async () => {
    if (submitting) return;
    setAmountError(null);
    setSubmitError(null);

    const validation = validateNonNegativeAmountInput(
      openingBalanceText,
      currencyCode,
      currencies,
    );
    if (!validation.valid || validation.value === undefined) {
      setAmountError(validation.error ?? 'Enter a valid opening balance.');
      return;
    }

    setSubmitting(true);
    try {
      await completeOnboarding({
        currencyCode,
        openingBalanceMinor: validation.value,
      });
      router.replace('/(tabs)');
    } catch {
      setSubmitError('Could not save your setup. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppScreen
      keyboardAvoiding
      edges={['top', 'bottom', 'left', 'right']}
      footer={
        <View style={styles.footerWrap}>
          {submitError ? (
            <Text style={[styles.submitError, { color: theme.danger }]}>{submitError}</Text>
          ) : null}
          <AppButton
            label="Continue to Dashboard"
            onPress={() => void handleContinue()}
            loading={submitting}
            size="lg"
            fullWidth
          />
        </View>
      }>
      <View style={styles.hero}>
        <View style={[styles.badge, { backgroundColor: theme.primarySoft }]}>
          <Ionicons name="wallet" size={28} color={theme.primary} />
        </View>
        <Text style={[styles.title, { color: theme.text }]}>
          Welcome to BinRo Finance
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Track your income, expenses, tags, and multi-currency activity privately on your device. No account or internet connection required.
        </Text>
      </View>

      <AppCard>
        <View style={styles.sectionHeaderRow}>
          <View style={styles.flex1}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              1. Select Default Currency
            </Text>
            <Text style={[styles.sectionHint, { color: theme.textSecondary }]}>
              You can also choose any currency per transaction.
            </Text>
          </View>
        </View>

        <View style={styles.currencyGrid}>
          {featuredCurrencies.map((currency) => {
            const isSelected = currency.code === currencyCode;
            return (
              <Pressable
                key={currency.code}
                onPress={() => {
                  setOnboardingCurrencyCode(currency.code);
                  setAmountError(null);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                style={[
                  styles.currencyChip,
                  {
                    backgroundColor: isSelected
                      ? theme.primarySoft
                      : theme.surfaceElevated,
                    borderColor: isSelected ? theme.primary : theme.border,
                  },
                ]}>
                <Text
                  style={[
                    styles.currencySymbol,
                    { color: isSelected ? theme.primary : theme.text },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit>
                  {currency.symbol}
                </Text>
                <View style={styles.currencyTextWrap}>
                  <Text
                    style={[
                      styles.currencyCode,
                      { color: isSelected ? theme.primary : theme.text },
                    ]}>
                    {currency.code}
                  </Text>
                  <Text
                    style={[styles.currencyName, { color: theme.textSecondary }]}
                    numberOfLines={1}>
                    {currency.name}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={() => {
            setOnboardingCurrencyCode(currencyCode);
            setAmountError(null);
            router.push('/currency?mode=onboarding');
          }}
          accessibilityRole="button"
          style={[
            styles.browseBtn,
            { backgroundColor: theme.surfaceElevated, borderColor: theme.border },
          ]}>
          <View style={styles.browseLeft}>
            <Ionicons name="globe-outline" size={18} color={theme.primary} />
            <Text style={[styles.browseText, { color: theme.text }]}>
              Browse All Currencies ({currencies.length}+)
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
        </Pressable>
      </AppCard>

      <AppCard>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          2. Opening Balance (Optional)
        </Text>
        <Text style={[styles.sectionHint, { color: theme.textSecondary }]}>
          Enter how much money you currently have available in {selectedCurrency.code}. Leave blank to start at {selectedCurrency.symbol}0.
        </Text>

        <AppInput
          label={`Opening Balance (${selectedCurrency.code})`}
          prefix={selectedCurrency.symbol}
          value={openingBalanceText}
          onChangeText={(text) => {
            setOpeningBalanceText(text);
            if (amountError) setAmountError(null);
          }}
          keyboardType={selectedCurrency.minorUnits === 0 ? 'number-pad' : 'decimal-pad'}
          placeholder={selectedCurrency.minorUnits === 0 ? '0' : '0.00'}
          error={amountError}
          helperText="Opening balance is tracked in its own currency separately from your income."
        />
      </AppCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'flex-start',
    gap: Spacing.two,
    paddingTop: Spacing.two,
  },
  badge: {
    width: 56,
    height: 56,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    lineHeight: 32,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  flex1: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  sectionHint: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  currencyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  currencyChip: {
    width: '48%',
    flexGrow: 1,
    minWidth: 140,
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.two + 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  currencySymbol: {
    fontSize: 18,
    fontWeight: '700',
    minWidth: 28,
    textAlign: 'center',
  },
  currencyTextWrap: {
    flex: 1,
  },
  currencyCode: {
    fontSize: 14,
    fontWeight: '700',
  },
  currencyName: {
    fontSize: 11,
  },
  browseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.two + 3,
    marginTop: Spacing.one,
  },
  browseLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  browseText: {
    fontSize: 14,
    fontWeight: '600',
  },
  footerWrap: {
    gap: Spacing.two,
  },
  submitError: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
});
