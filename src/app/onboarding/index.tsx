import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton, AppCard, AppInput, AppScreen } from '@/components/common';
import {
  DEFAULT_CURRENCY_CODE,
  SUPPORTED_CURRENCIES,
  getCurrencyConfig,
} from '@/constants/currencies';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';
import { validateNonNegativeAmountInput } from '@/utils/validation';

export default function OnboardingScreen() {
  const theme = useTheme();
  const router = useRouter();
  const settings = useAppStore((s) => s.settings);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);

  const [currencyCode, setCurrencyCode] = useState(
    settings.currencyCode || DEFAULT_CURRENCY_CODE,
  );
  const [openingBalanceText, setOpeningBalanceText] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedCurrency = getCurrencyConfig(currencyCode);

  const handleContinue = async () => {
    if (submitting) return;
    setAmountError(null);
    setSubmitError(null);

    const validation = validateNonNegativeAmountInput(openingBalanceText, currencyCode);
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
    <AppScreen keyboardAvoiding edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.hero}>
        <View style={[styles.badge, { backgroundColor: theme.primarySoft }]}>
          <Ionicons name="wallet-outline" size={28} color={theme.primary} />
        </View>
        <Text style={[styles.title, { color: theme.text }]}>
          Welcome to BinRo Finance
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Track your income, expenses, and monthly budgets privately on your device. No account or internet connection required.
        </Text>
      </View>

      <AppCard>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          1. Select Your Currency
        </Text>
        <Text style={[styles.sectionHint, { color: theme.textSecondary }]}>
          You can change this anytime in Settings.
        </Text>

        <View style={styles.currencyGrid}>
          {SUPPORTED_CURRENCIES.map((currency) => {
            const isSelected = currency.code === currencyCode;
            return (
              <Pressable
                key={currency.code}
                onPress={() => {
                  setCurrencyCode(currency.code);
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
                  ]}>
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
      </AppCard>

      <AppCard>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          2. Opening Balance (Optional)
        </Text>
        <Text style={[styles.sectionHint, { color: theme.textSecondary }]}>
          Enter how much money you currently have available. Leave blank to start at{' '}
          {selectedCurrency.symbol}0.
        </Text>

        <AppInput
          label="Opening Balance"
          prefix={selectedCurrency.symbol}
          value={openingBalanceText}
          onChangeText={(text) => {
            setOpeningBalanceText(text);
            if (amountError) setAmountError(null);
          }}
          keyboardType={selectedCurrency.minorUnits === 0 ? 'number-pad' : 'decimal-pad'}
          placeholder={selectedCurrency.minorUnits === 0 ? '0' : '0.00'}
          error={amountError}
          helperText="Opening balance is tracked separately from your recorded income."
        />
      </AppCard>

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
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  sectionHint: {
    fontSize: 13,
    lineHeight: 18,
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
    minWidth: 26,
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
  submitError: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
});
