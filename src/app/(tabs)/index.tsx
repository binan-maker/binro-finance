import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import {
  AppCard,
  AppScreen,
  EmptyState,
  SignInReminderCard,
} from '@/components/common';
import { CategoryDonutChart } from '@/components/reports/Charts';
import { TransactionRowItem } from '@/components/transactions/TransactionRowItem';
import { Radius, Spacing } from '@/constants/theme';
import { useResolvedColorScheme, useTheme } from '@/hooks/use-theme';
import {
  calculatePeriodComparison,
  calculatePeriodSummary,
  getDashboardPeriodRanges,
  getDistinctTransactionCurrencies,
  summarizeTransactions,
} from '@/services/calculations/financialCalculations';
import { useAppStore } from '@/store/app-store';
import type { DashboardPeriod } from '@/types/reports';
import {
  formatTransactionDateTimeRowLabel,
  getTodayISODate,
} from '@/utils/date';
import { formatMoney } from '@/utils/money';
import { shouldPromptProfileCompletion } from '@/utils/profile';

const CYCLING_PERIODS: readonly DashboardPeriod[] = [
  'this_month',
  'this_year',
  'last_30',
  'all_time',
];

export default function HomeScreen() {
  const theme = useTheme();
  const resolvedScheme = useResolvedColorScheme();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const settings = useAppStore((s) => s.settings);
  const categories = useAppStore((s) => s.categories);
  const currencies = useAppStore((s) => s.currencies);
  const transactions = useAppStore((s) => s.transactions);
  const notifications = useAppStore((s) => s.notifications);
  const authUser = useAppStore((s) => s.authUser);
  const authBusy = useAppStore((s) => s.authBusy);
  const signInWithGoogle = useAppStore((s) => s.signInWithGoogle);
  const homeSignInReminderDismissed = useAppStore((s) => s.homeSignInReminderDismissed);
  const dismissHomeSignInReminder = useAppStore((s) => s.dismissHomeSignInReminder);

  const [period, setPeriod] = useState<DashboardPeriod>('this_month');
  const [selectedCurrency, setSelectedCurrency] = useState<string | null>(null);
  const [syncPromptError, setSyncPromptError] = useState<string | null>(null);

  const todayISO = getTodayISODate();
  const isCompact = width < 360;
  const isDark = resolvedScheme === 'dark';

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications],
  );

  const availableCurrencies = useMemo(
    () =>
      getDistinctTransactionCurrencies(
        transactions,
        settings.currencyCode,
        settings.openingBalanceCurrencyCode,
      ),
    [transactions, settings.currencyCode, settings.openingBalanceCurrencyCode],
  );

  const activeCurrencyCode =
    selectedCurrency && availableCurrencies.includes(selectedCurrency)
      ? selectedCurrency
      : settings.currencyCode;

  const periodRange = useMemo(
    () => getDashboardPeriodRanges(period, todayISO, transactions),
    [period, todayISO, transactions],
  );

  const overallSummary = useMemo(
    () =>
      summarizeTransactions(
        transactions,
        settings.openingBalanceMinor,
        activeCurrencyCode,
        settings.openingBalanceCurrencyCode,
      ),
    [
      transactions,
      settings.openingBalanceMinor,
      activeCurrencyCode,
      settings.openingBalanceCurrencyCode,
    ],
  );

  const periodSummary = useMemo(
    () =>
      calculatePeriodSummary({
        transactions,
        categories,
        currencyCode: activeCurrencyCode,
        startDate: periodRange.startDate,
        endDate: periodRange.endDate,
      }),
    [transactions, categories, activeCurrencyCode, periodRange],
  );

  const periodComparison = useMemo(
    () =>
      calculatePeriodComparison({
        transactions,
        currencyCode: activeCurrencyCode,
        startDate: periodRange.startDate,
        endDate: periodRange.endDate,
        previousStartDate: periodRange.previousStartDate,
        previousEndDate: periodRange.previousEndDate,
        comparisonLabel: periodRange.comparisonLabel,
      }),
    [transactions, activeCurrencyCode, periodRange],
  );

  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const recentTransactions = useMemo(
    () => transactions.slice(0, 5),
    [transactions],
  );

  const cyclePeriod = () => {
    const idx = CYCLING_PERIODS.indexOf(period);
    const next = CYCLING_PERIODS[(idx + 1) % CYCLING_PERIODS.length];
    setPeriod(next);
  };

  const handleHomeGoogleSignIn = async () => {
    if (authBusy) return;
    setSyncPromptError(null);
    try {
      const result = await signInWithGoogle();
      if (result.status === 'error') {
        setSyncPromptError(result.message);
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
      setSyncPromptError('Unable to complete Google sign-in. Please try again.');
    }
  };

  const hasPreviousPeriod =
    periodRange.previousStartDate !== null && periodRange.previousEndDate !== null;

  const comparisonColor =
    periodComparison.direction === 'up'
      ? theme.income
      : periodComparison.direction === 'down'
        ? theme.expense
        : theme.textSecondary;

  const comparisonArrow =
    periodComparison.direction === 'up'
      ? '↑'
      : periodComparison.direction === 'down'
        ? '↓'
        : '';

  const formattedPct =
    periodComparison.percentageChange !== null
      ? `${Number(Math.abs(periodComparison.percentageChange).toFixed(2))}%`
      : null;

  const balanceCardBg = isDark ? '#1A1F24' : theme.surface;
  const balanceCardBorder = isDark ? '#2A3138' : theme.border;
  const periodTextColor = isDark ? '#FFFFFF' : theme.text;
  const splitAmountColor = isDark ? '#FFFFFF' : theme.text;
  const mutedLabelColor = isDark ? '#9CA3AF' : theme.textSecondary;
  const viewAllBlue = isDark ? '#60A5FA' : '#2563EB';
  const balanceIconBg = '#10B981';
  const incomeIconBg = '#16A34A';
  const expenseIconBg = '#E11D48';

  return (
    <AppScreen>
      {/* Top Header */}
      <View style={styles.brandHeader}>
        <Pressable
          onPress={() => router.push('/transactions/add')}
          accessibilityRole="button"
          accessibilityLabel="New Transaction"
          style={({ pressed }) => [
            styles.headerIconButton,
            { backgroundColor: theme.surface, borderColor: theme.border },
            pressed && styles.pressed,
          ]}>
          <Ionicons name="menu-outline" size={22} color={theme.text} />
        </Pressable>

        <View style={styles.brandTitleWrap}>
          <Text style={[styles.brandPrimaryText, { color: theme.text }]}>BinRo </Text>
          <Text style={[styles.brandAccentText, { color: theme.primary }]}>Finance</Text>
        </View>

        <Pressable
          onPress={() => router.push('/notifications')}
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          style={({ pressed }) => [
            styles.headerIconButton,
            { backgroundColor: theme.surface, borderColor: theme.border },
            pressed && styles.pressed,
          ]}>
          <Ionicons name="notifications-outline" size={20} color={theme.text} />
          {unreadCount > 0 ? (
            <View style={[styles.unreadDot, { backgroundColor: theme.primary }]} />
          ) : null}
        </Pressable>
      </View>

      {/* Multi-currency switcher (only when >1 currency is active) */}
      {availableCurrencies.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.currencyTabs}>
          {availableCurrencies.map((code) => {
            const selected = code === activeCurrencyCode;
            return (
              <Pressable
                key={code}
                onPress={() => setSelectedCurrency(code)}
                style={[
                  styles.currencyTab,
                  {
                    backgroundColor: selected ? theme.primarySoft : theme.surface,
                    borderColor: selected ? theme.primary : theme.border,
                  },
                ]}>
                <Text
                  style={[
                    styles.currencyTabText,
                    { color: selected ? theme.primary : theme.textSecondary },
                  ]}>
                  {code}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {/* Total Balance Card */}
      <AppCard
        style={[
          styles.balanceCard,
          {
            backgroundColor: balanceCardBg,
            borderColor: balanceCardBorder,
          },
        ]}>
        <View style={styles.cardTopRow}>
          <Text style={[styles.cardLabel, { color: periodTextColor }]}>
            Total Balance
          </Text>
          <Pressable
            onPress={cyclePeriod}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`Period: ${periodRange.label}. Tap to switch period.`}
            style={({ pressed }) => [
              styles.periodSelectorRow,
              pressed && styles.pressed,
            ]}>
            <Text style={[styles.periodSelectorText, { color: periodTextColor }]}>
              {periodRange.label}
            </Text>
            <Ionicons name="chevron-down" size={14} color={periodTextColor} />
          </Pressable>
        </View>

        <Text
          style={[
            styles.balanceValue,
            {
              color: theme.text,
              fontSize: isCompact ? 28 : 34,
            },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.55}>
          {formatMoney(overallSummary.currentBalanceMinor, activeCurrencyCode, {
            catalog: currencies,
            symbolSpace: true,
          })}
        </Text>

        <View style={styles.balanceBottomRow}>
          <View style={styles.comparisonRow}>
            {hasPreviousPeriod ? (
              formattedPct !== null ? (
                <>
                  <Text style={[styles.comparisonMetric, { color: comparisonColor }]}>
                    {comparisonArrow ? `${comparisonArrow} ` : ''}
                    {formattedPct}
                  </Text>
                  <Text
                    style={[styles.comparisonLabel, { color: mutedLabelColor }]}
                    numberOfLines={1}>
                    {periodComparison.comparisonLabel}
                  </Text>
                </>
              ) : periodComparison.currentValueMinor === 0 ? (
                <>
                  <Text style={[styles.comparisonMetric, { color: mutedLabelColor }]}>
                    0%
                  </Text>
                  <Text
                    style={[styles.comparisonLabel, { color: mutedLabelColor }]}
                    numberOfLines={1}>
                    {periodComparison.comparisonLabel}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={[styles.comparisonMetric, { color: comparisonColor }]}>
                    {comparisonArrow}
                  </Text>
                  <Text
                    style={[styles.comparisonLabel, { color: mutedLabelColor }]}
                    numberOfLines={1}>
                    No prior baseline {periodComparison.comparisonLabel}
                  </Text>
                </>
              )
            ) : (
              <Text
                style={[styles.comparisonLabel, { color: mutedLabelColor }]}
                numberOfLines={1}>
                {periodComparison.comparisonLabel}
              </Text>
            )}
          </View>

          <View style={[styles.balanceIconSquare, { backgroundColor: balanceIconBg }]}>
            <Ionicons name="stats-chart" size={18} color="#FFFFFF" />
          </View>
        </View>
      </AppCard>

      {/* Equal-Sized Horizontal Total Income & Total Expense Cards */}
      <View style={styles.splitRow}>
        <AppCard style={[styles.splitCard, isCompact && styles.splitCardCompact]}>
          <View style={styles.splitHorizontal}>
            <View
              style={[
                styles.flowIconSquare,
                isCompact && styles.flowIconSquareCompact,
                { backgroundColor: incomeIconBg },
              ]}>
              <Ionicons
                name="wallet"
                size={isCompact ? 18 : 20}
                color="#FFFFFF"
              />
            </View>
            <View style={styles.splitTextCol}>
              <Text
                style={[styles.splitLabel, { color: mutedLabelColor }]}
                numberOfLines={1}>
                Total Income
              </Text>
              <Text
                style={[
                  styles.splitAmount,
                  {
                    color: splitAmountColor,
                    fontSize: isCompact ? 15 : 17,
                  },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.45}>
                {formatMoney(periodSummary.totalIncomeMinor, activeCurrencyCode, {
                  catalog: currencies,
                  symbolSpace: true,
                })}
              </Text>
            </View>
          </View>
        </AppCard>

        <AppCard style={[styles.splitCard, isCompact && styles.splitCardCompact]}>
          <View style={styles.splitHorizontal}>
            <View
              style={[
                styles.flowIconSquare,
                isCompact && styles.flowIconSquareCompact,
                { backgroundColor: expenseIconBg },
              ]}>
              <Ionicons
                name="wallet-outline"
                size={isCompact ? 18 : 20}
                color="#FFFFFF"
              />
            </View>
            <View style={styles.splitTextCol}>
              <Text
                style={[styles.splitLabel, { color: mutedLabelColor }]}
                numberOfLines={1}>
                Total Expense
              </Text>
              <Text
                style={[
                  styles.splitAmount,
                  {
                    color: splitAmountColor,
                    fontSize: isCompact ? 15 : 17,
                  },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.45}>
                {formatMoney(periodSummary.totalExpensesMinor, activeCurrencyCode, {
                  catalog: currencies,
                  symbolSpace: true,
                })}
              </Text>
            </View>
          </View>
        </AppCard>
      </View>

      {/* Optional Discoverable Google Sign-In Card (Signed out & not dismissed) */}
      {!authUser && !homeSignInReminderDismissed ? (
        <SignInReminderCard
          loading={authBusy}
          errorMessage={syncPromptError}
          onSignInPress={() => void handleHomeGoogleSignIn()}
          onDismiss={() => {
            setSyncPromptError(null);
            void dismissHomeSignInReminder();
          }}
        />
      ) : null}

      {/* Compact Expense Overview Card */}
      <AppCard>
        <View style={styles.cardTopRow}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Expense Overview
          </Text>
          <Text style={[styles.periodCaption, { color: theme.textSecondary }]}>
            {periodRange.label}
          </Text>
        </View>
        <CategoryDonutChart
          items={periodSummary.categoryBreakdown}
          totalMinor={periodSummary.totalExpensesMinor}
          currencyCode={activeCurrencyCode}
          catalog={currencies}
          compact
          maxLegendItems={5}
        />
      </AppCard>

      {/* Optional Home Budget Shortcut (off by default, toggled in Settings -> Preferences) */}
      {settings.showHomeBudgetShortcut ? (
        <AppCard>
          <Pressable
            onPress={() => router.push('/budgets')}
            accessibilityRole="button"
            accessibilityLabel="Open Budgets"
            style={({ pressed }) => [
              styles.budgetShortcutRow,
              pressed && styles.pressed,
            ]}>
            <View style={styles.budgetShortcutLeft}>
              <View
                style={[
                  styles.budgetShortcutIcon,
                  { backgroundColor: theme.primarySoft },
                ]}>
                <Ionicons name="pie-chart-outline" size={18} color={theme.primary} />
              </View>
              <View style={styles.budgetShortcutTextWrap}>
                <Text style={[styles.budgetShortcutTitle, { color: theme.text }]}>
                  Budgets
                </Text>
                <Text
                  style={[styles.budgetShortcutSub, { color: theme.textSecondary }]}
                  numberOfLines={1}>
                  Monthly, paycheck & annual limits
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
          </Pressable>
        </AppCard>
      ) : null}

      {/* Recent Transactions (Flat 5-item list with inline date & time subtitle) */}
      <View style={styles.recentHeader}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          Recent Transactions
        </Text>
        {transactions.length > 0 ? (
          <Pressable
            onPress={() => router.push('/(tabs)/transactions')}
            hitSlop={8}
            accessibilityRole="button">
            <Text style={[styles.viewAllText, { color: viewAllBlue }]}>View All</Text>
          </Pressable>
        ) : null}
      </View>

      {recentTransactions.length === 0 ? (
        <EmptyState
          icon="receipt-outline"
          title="No transactions recorded yet"
          description="Tap the green + button below to record your first income or expense."
        />
      ) : (
        <View style={styles.recentList}>
          {recentTransactions.map((tx) => (
            <TransactionRowItem
              key={tx.id}
              transaction={tx}
              category={tx.categoryId ? categoryMap.get(tx.categoryId) : undefined}
              catalog={currencies}
              subtitle={formatTransactionDateTimeRowLabel(
                tx.transactionDate,
                tx.createdAt,
                settings.dateFormat,
                todayISO,
              )}
              onPress={() => router.push(`/transactions/${tx.id}`)}
            />
          ))}
        </View>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.one,
  },
  headerIconButton: {
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
  brandTitleWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  brandPrimaryText: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  brandAccentText: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  unreadDot: {
    position: 'absolute',
    top: 8,
    right: 9,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  currencyTabs: {
    gap: Spacing.two,
    paddingVertical: 2,
  },
  currencyTab: {
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  currencyTabText: {
    fontSize: 12,
    fontWeight: '700',
  },
  balanceCard: {
    gap: Spacing.two,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  cardLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  periodSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  periodSelectorText: {
    fontSize: 13,
    fontWeight: '600',
  },
  balanceValue: {
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  balanceBottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  comparisonRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  comparisonMetric: {
    fontSize: 13,
    fontWeight: '700',
  },
  comparisonLabel: {
    fontSize: 13,
    fontWeight: '500',
    flexShrink: 1,
  },
  balanceIconSquare: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: Spacing.two + 2,
  },
  splitCard: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    paddingVertical: Spacing.two + 6,
    paddingHorizontal: Spacing.two + 4,
  },
  splitCardCompact: {
    paddingVertical: Spacing.two + 4,
    paddingHorizontal: Spacing.two + 2,
  },
  splitHorizontal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
  },
  flowIconSquare: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  flowIconSquareCompact: {
    width: 34,
    height: 34,
  },
  splitTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  splitLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  splitAmount: {
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  periodCaption: {
    fontSize: 12,
    fontWeight: '600',
  },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '700',
  },
  recentList: {
    gap: Spacing.two,
  },
  budgetShortcutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  budgetShortcutLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    flex: 1,
  },
  budgetShortcutIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  budgetShortcutTextWrap: {
    flex: 1,
    gap: 1,
  },
  budgetShortcutTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  budgetShortcutSub: {
    fontSize: 12,
  },
});
