import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppHeader, AppScreen } from '@/components/common';
import { FALLBACK_CURRENCIES, type CurrencyConfig } from '@/constants/currencies';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';

export default function CurrencyScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const mode = params.mode ?? 'default';
  const isDraftMode = mode === 'draft';
  const isOnboardingMode = mode === 'onboarding';
  const isOpeningBalanceMode = mode === 'openingBalance';

  const currencies = useAppStore((s) => s.currencies);
  const settings = useAppStore((s) => s.settings);
  const transactionDraft = useAppStore((s) => s.transactionDraft);
  const onboardingCurrencyCode = useAppStore((s) => s.onboardingCurrencyCode);
  const openingBalanceDraft = useAppStore((s) => s.openingBalanceDraft);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const patchTransactionDraft = useAppStore((s) => s.patchTransactionDraft);
  const setOnboardingCurrencyCode = useAppStore((s) => s.setOnboardingCurrencyCode);
  const setOpeningBalanceDraft = useAppStore((s) => s.setOpeningBalanceDraft);

  const [search, setSearch] = useState('');
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectedCode = (
    isDraftMode && transactionDraft?.currencyCode
      ? transactionDraft.currencyCode
      : isOnboardingMode && onboardingCurrencyCode
        ? onboardingCurrencyCode
        : isOpeningBalanceMode && openingBalanceDraft?.currencyCode
          ? openingBalanceDraft.currencyCode
          : settings.currencyCode
  ).toUpperCase();

  const filtered = useMemo(() => {
    const list = currencies.length > 0 ? currencies : FALLBACK_CURRENCIES;
    const term = search.trim().toLowerCase();

    if (!term) {
      return [...list].sort((a, b) => {
        if (a.code.toUpperCase() === selectedCode) return -1;
        if (b.code.toUpperCase() === selectedCode) return 1;
        const idxA = FALLBACK_CURRENCIES.findIndex((f) => f.code === a.code);
        const idxB = FALLBACK_CURRENCIES.findIndex((f) => f.code === b.code);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.code.localeCompare(b.code);
      });
    }

    return list.filter(
      (c) =>
        c.code.toLowerCase().includes(term) ||
        c.name.toLowerCase().includes(term) ||
        c.symbol.toLowerCase().includes(term),
    );
  }, [currencies, search, selectedCode]);

  const handleSelect = async (currency: CurrencyConfig) => {
    if (savingCode) return;
    setErrorMsg(null);

    if (isDraftMode) {
      patchTransactionDraft({ currencyCode: currency.code });
      if (router.canGoBack()) {
        router.back();
      }
      return;
    }

    if (isOnboardingMode) {
      setOnboardingCurrencyCode(currency.code);
      if (router.canGoBack()) {
        router.back();
      }
      return;
    }

    if (isOpeningBalanceMode) {
      setOpeningBalanceDraft({
        currencyCode: currency.code,
        amountText: openingBalanceDraft?.amountText ?? '',
        reopenOnFocus: true,
      });
      if (router.canGoBack()) {
        router.back();
      }
      return;
    }

    setSavingCode(currency.code);
    try {
      await updateSettings({
        currencyCode: currency.code,
        currencyInitialized: true,
      });
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)/settings');
      }
    } catch {
      setErrorMsg('Unable to update currency.');
    } finally {
      setSavingCode(null);
    }
  };

  const screenTitle =
    isDraftMode || isOpeningBalanceMode ? 'Select Currency' : 'Default Currency';

  return (
    <AppScreen scrollable={false} edges={['top', 'bottom', 'left', 'right']}>
      <AppHeader
        title={screenTitle}
        showBack
      />

      <View
        style={[
          styles.searchBox,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}>
        <Ionicons name="search" size={18} color={theme.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search currency"
          placeholderTextColor={theme.textMuted}
          style={[styles.searchInput, { color: theme.text }]}
          autoCorrect={false}
        />
        {search.length > 0 ? (
          <Pressable onPress={() => setSearch('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={theme.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {errorMsg ? (
        <Text style={[styles.errorText, { color: theme.danger }]}>{errorMsg}</Text>
      ) : null}

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.code}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            No matching currencies found.
          </Text>
        }
        renderItem={({ item }) => {
          const selected = item.code.toUpperCase() === selectedCode;
          return (
            <Pressable
              onPress={() => void handleSelect(item)}
              disabled={Boolean(savingCode)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: selected ? theme.primarySoft : theme.surface,
                  borderColor: selected ? theme.primary : theme.border,
                },
                pressed && styles.pressed,
              ]}>
              <View
                style={[
                  styles.symbolBadge,
                  {
                    backgroundColor: selected ? theme.primary : theme.surfaceElevated,
                  },
                ]}>
                <Text
                  style={[
                    styles.symbolText,
                    { color: selected ? theme.primaryText : theme.text },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit>
                  {item.symbol}
                </Text>
              </View>

              <View style={styles.rowText}>
                <Text style={[styles.rowName, { color: theme.text }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[styles.rowSub, { color: theme.textSecondary }]}>
                  {item.code} · {item.minorUnits} {item.minorUnits === 1 ? 'decimal' : 'decimals'}
                </Text>
              </View>

              {selected ? (
                <Ionicons name="checkmark-circle" size={21} color={theme.primary} />
              ) : null}
            </Pressable>
          );
        }}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three - 2,
    minHeight: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 8,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
  },
  listContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.five,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    padding: Spacing.two + 3,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  symbolBadge: {
    width: 42,
    height: 42,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  symbolText: {
    fontSize: 15,
    fontWeight: '700',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    fontSize: 15,
    fontWeight: '600',
  },
  rowSub: {
    fontSize: 12,
    fontWeight: '500',
  },
  emptyText: {
    textAlign: 'center',
    paddingVertical: Spacing.five,
    fontSize: 14,
  },
  pressed: {
    opacity: 0.78,
  },
});
