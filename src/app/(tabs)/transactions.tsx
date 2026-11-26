import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  Platform,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import {
  AppScreen,
  EmptyState,
  SegmentedControl,
  SignInReminderCard,
  type SegmentOption,
} from '@/components/common';
import { TransactionRowItem } from '@/components/transactions/TransactionRowItem';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { filterAndSortTransactions } from '@/services/calculations/financialCalculations';
import { useAppStore } from '@/store/app-store';
import type { Transaction, TransactionType } from '@/types/models';
import { formatRelativeDateLabel, getTodayISODate } from '@/utils/date';
import { formatMoney } from '@/utils/money';
import { shouldPromptProfileCompletion } from '@/utils/profile';
import {
  injectTransactionsSignInReminder,
  type TransactionsDailyNet,
  type TransactionsListItem,
  type TransactionsSectionSource,
  type TransactionsSectionWithReminder,
} from '@/utils/transactionReminder';

type TypeFilter = 'all' | TransactionType;

export default function TransactionsScreen() {
  const theme = useTheme();
  const router = useRouter();

  const settings = useAppStore((s) => s.settings);
  const categories = useAppStore((s) => s.categories);
  const tags = useAppStore((s) => s.tags);
  const paymentMethods = useAppStore((s) => s.paymentMethods);
  const currencies = useAppStore((s) => s.currencies);
  const transactions = useAppStore((s) => s.transactions);
  const transactionFilters = useAppStore((s) => s.transactionFilters);
  const resetTransactionFilters = useAppStore((s) => s.resetTransactionFilters);
  const authUser = useAppStore((s) => s.authUser);
  const authBusy = useAppStore((s) => s.authBusy);
  const signInWithGoogle = useAppStore((s) => s.signInWithGoogle);
  const transactionsSignInReminderDismissed = useAppStore(
    (s) => s.transactionsSignInReminderDismissed,
  );
  const dismissTransactionsSignInReminder = useAppStore(
    (s) => s.dismissTransactionsSignInReminder,
  );

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [scrolledDown, setScrolledDown] = useState(false);
  const [reminderError, setReminderError] = useState<string | null>(null);

  const lastScrollY = useRef(0);
  const [ctaAnim] = useState(() => new Animated.Value(1));

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const subShow = Keyboard.addListener(showEvent, () => setKeyboardOpen(true));
    const subHide = Keyboard.addListener(hideEvent, () => setKeyboardOpen(false));
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  const ctaVisible = !keyboardOpen && !scrolledDown;

  useEffect(() => {
    Animated.timing(ctaAnim, {
      toValue: ctaVisible ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [ctaVisible, ctaAnim]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const diff = y - lastScrollY.current;
    if (y <= 12) {
      if (scrolledDown) setScrolledDown(false);
    } else if (diff > 10 && !scrolledDown) {
      setScrolledDown(true);
    } else if (diff < -10 && scrolledDown) {
      setScrolledDown(false);
    }
    lastScrollY.current = y;
  };

  const typeOptions = useMemo<readonly SegmentOption<TypeFilter>[]>(
    () => [
      {
        label: 'All',
        value: 'all',
        activeColor: theme.primary,
        activeTextColor: '#FFFFFF',
      },
      {
        label: 'Income',
        value: 'income',
        activeColor: theme.income,
        activeTextColor: '#FFFFFF',
      },
      {
        label: 'Expense',
        value: 'expense',
        activeColor: theme.expense,
        activeTextColor: '#FFFFFF',
      },
    ],
    [theme.primary, theme.income, theme.expense],
  );

  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const activeFilterCount =
    (transactionFilters.datePreset !== 'all_time' ? 1 : 0) +
    (transactionFilters.selectedYears.length > 0 ? 1 : 0) +
    (transactionFilters.categoryIds.length > 0 ? 1 : 0) +
    (transactionFilters.paymentMethodIds.length > 0 ? 1 : 0) +
    (transactionFilters.tagIds.length > 0 ? 1 : 0) +
    (transactionFilters.currencyCode !== 'all' ? 1 : 0) +
    (transactionFilters.sortBy !== 'newest' ? 1 : 0);

  const filteredTransactions = useMemo(
    () =>
      filterAndSortTransactions({
        transactions,
        categories,
        paymentMethods,
        tags,
        typeFilter,
        searchQuery,
        filters: transactionFilters,
      }),
    [
      transactions,
      categories,
      paymentMethods,
      tags,
      typeFilter,
      searchQuery,
      transactionFilters,
    ],
  );

  const sections = useMemo<TransactionsSectionSource[]>(() => {
    const todayISO = getTodayISODate();
    const groups = new Map<string, Transaction[]>();
    for (const tx of filteredTransactions) {
      const list = groups.get(tx.transactionDate) ?? [];
      list.push(tx);
      groups.set(tx.transactionDate, list);
    }

    return Array.from(groups.entries()).map(([date, list]) => {
      const netByCurrency = new Map<string, number>();
      for (const tx of list) {
        const delta = tx.type === 'income' ? tx.amountMinor : -tx.amountMinor;
        netByCurrency.set(
          tx.currencyCode,
          (netByCurrency.get(tx.currencyCode) ?? 0) + delta,
        );
      }

      const dailyNets: TransactionsDailyNet[] = Array.from(netByCurrency.entries()).map(
        ([currencyCode, netMinor]) => ({ currencyCode, netMinor }),
      );

      return {
        date,
        title: formatRelativeDateLabel(date, settings.dateFormat, todayISO),
        dailyNets,
        data: list,
      };
    });
  }, [filteredTransactions, settings.dateFormat]);

  const sectionsWithReminder = useMemo(
    () =>
      injectTransactionsSignInReminder(
        sections,
        !authUser && !transactionsSignInReminderDismissed,
      ),
    [sections, authUser, transactionsSignInReminderDismissed],
  );

  const handleInlineGoogleSignIn = async () => {
    if (authBusy) return;
    setReminderError(null);
    try {
      const result = await signInWithGoogle();
      if (result.status === 'error') {
        setReminderError(result.message);
        return;
      }
      if (result.status === 'success') {
        const latest = useAppStore.getState();
        if (
          !latest.accountSwitchConflict &&
          shouldPromptProfileCompletion(latest.settings)
        ) {
          router.push('/profile/complete');
        }
      }
    } catch {
      setReminderError('Unable to complete Google sign-in. Please try again.');
    }
  };

  const handleResetAll = () => {
    setTypeFilter('all');
    setSearchQuery('');
    resetTransactionFilters();
  };

  return (
    <AppScreen scrollable={false} contentStyle={styles.screenZeroPadding}>
      <View style={styles.root}>
        <View style={styles.topSection}>
          {/* Header: Filter icon left -> /transactions/filters, Transactions centered, Search icon right */}
          <View style={styles.header}>
            <Pressable
              onPress={() => router.push('/transactions/filters')}
              accessibilityRole="button"
              accessibilityLabel="Open transaction filters"
              style={({ pressed }) => [
                styles.iconButton,
                {
                  backgroundColor:
                    activeFilterCount > 0 ? theme.primarySoft : theme.surface,
                  borderColor: activeFilterCount > 0 ? theme.primary : theme.border,
                },
                pressed && styles.pressed,
              ]}>
              <Ionicons
                name="options-outline"
                size={20}
                color={activeFilterCount > 0 ? theme.primary : theme.text}
              />
              {activeFilterCount > 0 ? (
                <View style={[styles.filterDot, { backgroundColor: theme.primary }]} />
              ) : null}
            </Pressable>

            <Text style={[styles.headerTitle, { color: theme.text }]}>
              Transactions
            </Text>

            <Pressable
              onPress={() => {
                if (searchVisible && searchQuery.length > 0) {
                  setSearchQuery('');
                }
                setSearchVisible((v) => !v);
              }}
              accessibilityRole="button"
              accessibilityLabel="Search transactions"
              style={({ pressed }) => [
                styles.iconButton,
                {
                  backgroundColor:
                    searchVisible || searchQuery.length > 0
                      ? theme.primarySoft
                      : theme.surface,
                  borderColor:
                    searchVisible || searchQuery.length > 0
                      ? theme.primary
                      : theme.border,
                },
                pressed && styles.pressed,
              ]}>
              <Ionicons
                name={searchVisible ? 'close' : 'search'}
                size={20}
                color={
                  searchVisible || searchQuery.length > 0 ? theme.primary : theme.text
                }
              />
            </Pressable>
          </View>

          {searchVisible ? (
            <View
              style={[
                styles.searchBar,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}>
              <Ionicons name="search" size={18} color={theme.textMuted} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search title, tags, category, note..."
                placeholderTextColor={theme.textMuted}
                autoFocus
                style={[styles.searchInput, { color: theme.text }]}
              />
              {searchQuery.length > 0 ? (
                <Pressable onPress={() => setSearchQuery('')} hitSlop={6}>
                  <Ionicons name="close-circle" size={18} color={theme.textMuted} />
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <SegmentedControl
            options={typeOptions}
            value={typeFilter}
            onChange={setTypeFilter}
          />
        </View>

        <View style={styles.listArea}>
          {sectionsWithReminder.length === 0 ? (
            <View style={styles.emptyWrap}>
              {transactions.length === 0 ? (
                <EmptyState
                  icon="receipt-outline"
                  title="No transactions yet"
                  description="Tap Add Transaction below to record your first income or expense."
                />
              ) : (
                <EmptyState
                  icon="search-outline"
                  title="No matching transactions"
                  description="Try clearing your search or adjusting filters."
                  actionLabel="Reset Filters"
                  onAction={handleResetAll}
                />
              )}
            </View>
          ) : (
            <SectionList<TransactionsListItem, TransactionsSectionWithReminder>
              sections={sectionsWithReminder}
              keyExtractor={(item) => item.id}
              stickySectionHeadersEnabled={false}
              showsVerticalScrollIndicator={false}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              contentContainerStyle={styles.listContent}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              renderSectionHeader={({ section }) => (
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionDate, { color: theme.textSecondary }]}>
                    {section.title}
                  </Text>
                  <View style={styles.sectionNets}>
                    {section.dailyNets.map((dn) => (
                      <Text
                        key={dn.currencyCode}
                        style={[
                          styles.sectionNet,
                          { color: dn.netMinor >= 0 ? theme.income : theme.expense },
                        ]}>
                        {formatMoney(dn.netMinor, dn.currencyCode, {
                          showSign: true,
                          catalog: currencies,
                        })}
                      </Text>
                    ))}
                  </View>
                </View>
              )}
              renderItem={({ item }) => {
                if (item.kind === 'signin_reminder') {
                  return (
                    <SignInReminderCard
                      loading={authBusy}
                      errorMessage={reminderError}
                      onSignInPress={() => void handleInlineGoogleSignIn()}
                      onDismiss={() => {
                        setReminderError(null);
                        void dismissTransactionsSignInReminder();
                      }}
                    />
                  );
                }
                const tx = item.transaction;
                return (
                  <TransactionRowItem
                    transaction={tx}
                    category={tx.categoryId ? categoryMap.get(tx.categoryId) : undefined}
                    catalog={currencies}
                    onPress={() => router.push(`/transactions/${tx.id}`)}
                  />
                );
              }}
            />
          )}
        </View>

        {/* Full-Width "+ Add Transaction" CTA Docked Above Bottom Navigation */}
        <Animated.View
          pointerEvents={ctaVisible ? 'auto' : 'none'}
          style={[
            styles.ctaContainer,
            {
              opacity: ctaAnim,
              transform: [
                {
                  translateY: ctaAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [28, 0],
                  }),
                },
              ],
            },
          ]}>
          <Pressable
            onPress={() => router.push('/transactions/add')}
            accessibilityRole="button"
            accessibilityLabel="Add Transaction"
            style={({ pressed }) => [
              styles.addCtaButton,
              { backgroundColor: theme.primary },
              pressed && styles.ctaPressed,
            ]}>
            <Text style={[styles.addCtaText, { color: theme.primaryText }]}>
              + Add Transaction
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screenZeroPadding: {
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  root: {
    flex: 1,
  },
  topSection: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    gap: Spacing.two + 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.one,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
  filterDot: {
    position: 'absolute',
    top: 7,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  searchBar: {
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
    fontSize: 14,
    paddingVertical: 8,
  },
  listArea: {
    flex: 1,
  },
  emptyWrap: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
  },
  listContent: {
    paddingHorizontal: Spacing.three,
    paddingBottom: 92,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.three,
    paddingBottom: Spacing.one + 2,
    gap: Spacing.two,
  },
  sectionDate: {
    fontSize: 13,
    fontWeight: '700',
  },
  sectionNets: {
    flexDirection: 'row',
    gap: Spacing.two,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  sectionNet: {
    fontSize: 13,
    fontWeight: '700',
  },
  separator: {
    height: Spacing.two,
  },
  ctaContainer: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    bottom: Spacing.three - 2,
  },
  addCtaButton: {
    minHeight: 48,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  ctaPressed: {
    opacity: 0.88,
  },
  addCtaText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
});
