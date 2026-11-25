import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  AppButton,
  AppCard,
  AppScreen,
  EmptyState,
} from '@/components/common';
import {
  CategoryDonutChart,
  FinancialTrendLineChart,
} from '@/components/reports/Charts';
import { TransactionRowItem } from '@/components/transactions/TransactionRowItem';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  buildFinancialTrendPoints,
  calculatePeriodComparison,
  calculatePeriodSummary,
  getDashboardPeriodRanges,
  getDistinctTransactionCurrencies,
  summarizeByCurrency,
  summarizeTransactions,
} from '@/services/calculations/financialCalculations';
import { useAppStore } from '@/store/app-store';
import type { Transaction } from '@/types/models';
import type { DashboardPeriod } from '@/types/reports';
import { formatRelativeDateLabel, getTodayISODate } from '@/utils/date';
import { formatMoney } from '@/utils/money';

const DASHBOARD_PERIODS: readonly { label: string; value: DashboardPeriod }[] = [
  { label: 'This Week', value: 'this_week' },
  { label: 'This Month', value: 'this_month' },
  { label: 'Last 30 Days', value: 'last_30' },
  { label: 'This Year', value: 'this_year' },
  { label: 'All Time', value: 'all_time' },
];

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();

  const settings = useAppStore((s) => s.settings);
  const categories = useAppStore((s) => s.categories);
  const currencies = useAppStore((s) => s.currencies);
  const transactions = useAppStore((s) => s.transactions);
  const notifications = useAppStore((s) => s.notifications);

  const [period, setPeriod] = useState<DashboardPeriod>('this_month');
  const [selectedCurrency, setSelectedCurrency] = useState<string | null>(null);
  const [periodModalVisible, setPeriodModalVisible] = useState(false);
  const [infoModalKind, setInfoModalKind] = useState<'income' | 'expense' | null>(null);

  const todayISO = getTodayISODate();
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

  const trendPoints = useMemo(
    () =>
      buildFinancialTrendPoints({
        transactions,
        currencyCode: activeCurrencyCode,
        openingBalanceMinor: settings.openingBalanceMinor,
        openingBalanceCurrencyCode: settings.openingBalanceCurrencyCode,
        startDate: periodRange.startDate,
        endDate: periodRange.endDate,
      }),
    [
      transactions,
      activeCurrencyCode,
      settings.openingBalanceMinor,
      settings.openingBalanceCurrencyCode,
      periodRange,
    ],
  );

  const allCurrencySummaries = useMemo(
    () => summarizeByCurrency(transactions, settings),
    [transactions, settings],
  );

  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const recentGroups = useMemo(() => {
    const recent = transactions.slice(0, 5);
    const groups = new Map<string, Transaction[]>();
    for (const tx of recent) {
      const list = groups.get(tx.transactionDate) ?? [];
      list.push(tx);
      groups.set(tx.transactionDate, list);
    }
    return Array.from(groups.entries()).map(([date, list]) => ({
      date,
      label: formatRelativeDateLabel(date, settings.dateFormat, todayISO),
      items: list,
    }));
  }, [transactions, settings.dateFormat, todayISO]);

  const comparisonColor =
    periodComparison.direction === 'up'
      ? theme.income
      : periodComparison.direction === 'down'
        ? theme.expense
        : theme.textSecondary;

  const comparisonIcon: keyof typeof Ionicons.glyphMap =
    periodComparison.direction === 'up'
      ? 'arrow-up'
      : periodComparison.direction === 'down'
        ? 'arrow-down'
        : 'remove';

  return (
    <AppScreen>
      {/* Top Brand Header */}
      <View style={styles.brandHeader}>
        <View style={styles.headerSideSpacer} />
        <View style={styles.brandTitleWrap}>
          <Text style={[styles.brandPrimaryText, { color: theme.text }]}>BinRo </Text>
          <Text style={[styles.brandAccentText, { color: theme.primary }]}>Finance</Text>
        </View>
        <Pressable
          onPress={() => router.push('/notifications')}
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          style={[
            styles.bellButton,
            { backgroundColor: theme.surface, borderColor: theme.border },
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

      {/* Total Balance + Trend Card */}
      <AppCard>
        <View style={styles.cardTopRow}>
          <Text style={[styles.cardLabel, { color: theme.textSecondary }]}>
            Total Balance
          </Text>
          <Pressable
            onPress={() => setPeriodModalVisible(true)}
            accessibilityRole="button"
            style={[
              styles.periodPill,
              { backgroundColor: theme.surfaceElevated, borderColor: theme.border },
            ]}>
            <Text style={[styles.periodPillText, { color: theme.text }]}>
              {periodRange.label}
            </Text>
            <Ionicons name="chevron-down" size={14} color={theme.textSecondary} />
          </Pressable>
        </View>

        <Text
          style={[styles.balanceValue, { color: theme.text }]}
          numberOfLines={1}
          adjustsFontSizeToFit>
          {formatMoney(overallSummary.currentBalanceMinor, activeCurrencyCode, {
            catalog: currencies,
          })}
        </Text>

        <View style={styles.comparisonRow}>
          <View
            style={[
              styles.comparisonBadge,
              {
                backgroundColor:
                  periodComparison.direction === 'up'
                    ? theme.incomeSoft
                    : periodComparison.direction === 'down'
                      ? theme.expenseSoft
                      : theme.surfaceElevated,
              },
            ]}>
            <Ionicons name={comparisonIcon} size={13} color={comparisonColor} />
            <Text style={[styles.comparisonPct, { color: comparisonColor }]}>
              {periodComparison.percentageChange !== null
                ? `${Math.abs(periodComparison.percentageChange).toFixed(1)}%`
                : periodComparison.currentValueMinor === 0
                  ? '0.0%'
                  : 'New'}
            </Text>
          </View>
          <Text style={[styles.comparisonLabel, { color: theme.textSecondary }]}>
            {periodComparison.comparisonLabel}
          </Text>
        </View>

        <View style={styles.trendContainer}>
          <FinancialTrendLineChart
            points={trendPoints}
            currencyCode={activeCurrencyCode}
            catalog={currencies}
          />
        </View>
      </AppCard>

      {/* Side-by-side Total Income & Total Expense Cards */}
      <View style={styles.splitRow}>
        <AppCard style={styles.splitCard}>
          <View style={styles.splitTopRow}>
            <View style={[styles.flowIconBadge, { backgroundColor: theme.incomeSoft }]}>
              <Ionicons name="arrow-down" size={16} color={theme.income} />
            </View>
            <Pressable
              onPress={() => setInfoModalKind('income')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Income breakdown">
              <Ionicons
                name="information-circle-outline"
                size={18}
                color={theme.textMuted}
              />
            </Pressable>
          </View>
          <Text style={[styles.splitLabel, { color: theme.textSecondary }]}>
            Total Income
          </Text>
          <Text
            style={[styles.splitAmount, { color: theme.income }]}
            numberOfLines={1}
            adjustsFontSizeToFit>
            {formatMoney(periodSummary.totalIncomeMinor, activeCurrencyCode, {
              catalog: currencies,
            })}
          </Text>
        </AppCard>

        <AppCard style={styles.splitCard}>
          <View style={styles.splitTopRow}>
            <View style={[styles.flowIconBadge, { backgroundColor: theme.expenseSoft }]}>
              <Ionicons name="arrow-up" size={16} color={theme.expense} />
            </View>
            <Pressable
              onPress={() => setInfoModalKind('expense')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Expense breakdown">
              <Ionicons
                name="information-circle-outline"
                size={18}
                color={theme.textMuted}
              />
            </Pressable>
          </View>
          <Text style={[styles.splitLabel, { color: theme.textSecondary }]}>
            Total Expense
          </Text>
          <Text
            style={[styles.splitAmount, { color: theme.expense }]}
            numberOfLines={1}
            adjustsFontSizeToFit>
            {formatMoney(periodSummary.totalExpensesMinor, activeCurrencyCode, {
              catalog: currencies,
            })}
          </Text>
        </AppCard>
      </View>

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

      {/* Recent Transactions */}
      <View style={styles.recentHeader}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          Recent Transactions
        </Text>
        {transactions.length > 0 ? (
          <Pressable
            onPress={() => router.push('/(tabs)/transactions')}
            hitSlop={8}
            accessibilityRole="button">
            <Text style={[styles.viewAllText, { color: theme.primary }]}>View All</Text>
          </Pressable>
        ) : null}
      </View>

      {recentGroups.length === 0 ? (
        <EmptyState
          icon="receipt-outline"
          title="No transactions recorded yet"
          description="Tap the green + button below to record your first income or expense."
        />
      ) : (
        <View style={styles.recentGroups}>
          {recentGroups.map((group) => (
            <View key={group.date} style={styles.recentGroup}>
              <Text style={[styles.dateGroupLabel, { color: theme.textSecondary }]}>
                {group.label}
              </Text>
              <View style={styles.groupList}>
                {group.items.map((tx) => (
                  <TransactionRowItem
                    key={tx.id}
                    transaction={tx}
                    category={tx.categoryId ? categoryMap.get(tx.categoryId) : undefined}
                    catalog={currencies}
                    onPress={() => router.push(`/transactions/${tx.id}`)}
                  />
                ))}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Period Selector Modal */}
      <Modal
        visible={periodModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPeriodModalVisible(false)}>
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setPeriodModalVisible(false)}>
          <Pressable
            style={[
              styles.modalCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
            onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              Select Period
            </Text>
            <View style={styles.periodOptionList}>
              {DASHBOARD_PERIODS.map((opt) => {
                const selected = opt.value === period;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => {
                      setPeriod(opt.value);
                      setPeriodModalVisible(false);
                    }}
                    style={[
                      styles.periodOptionRow,
                      {
                        backgroundColor: selected ? theme.primarySoft : 'transparent',
                        borderColor: selected ? theme.primary : theme.border,
                      },
                    ]}>
                    <Text
                      style={[
                        styles.periodOptionText,
                        { color: selected ? theme.primary : theme.text },
                      ]}>
                      {opt.label}
                    </Text>
                    {selected ? (
                      <Ionicons name="checkmark" size={18} color={theme.primary} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Income / Expense Full Value Breakdown Modal */}
      <Modal
        visible={infoModalKind !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setInfoModalKind(null)}>
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setInfoModalKind(null)}>
          <Pressable
            style={[
              styles.modalCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
            onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              {infoModalKind === 'income' ? 'Total Income' : 'Total Expense'} ({periodRange.label})
            </Text>
            <Text style={[styles.infoSub, { color: theme.textSecondary }]}>
              Active currency ({activeCurrencyCode}):
            </Text>
            <Text
              style={[
                styles.infoBigValue,
                {
                  color:
                    infoModalKind === 'income' ? theme.income : theme.expense,
                },
              ]}>
              {formatMoney(
                infoModalKind === 'income'
                  ? periodSummary.totalIncomeMinor
                  : periodSummary.totalExpensesMinor,
                activeCurrencyCode,
                { catalog: currencies },
              )}
            </Text>

            {allCurrencySummaries.length > 1 ? (
              <View style={styles.currencyBreakdown}>
                <Text style={[styles.infoSub, { color: theme.textSecondary }]}>
                  All recorded currencies (all time, uncombined):
                </Text>
                {allCurrencySummaries.map((cs) => {
                  const val =
                    infoModalKind === 'income'
                      ? cs.totalIncomeMinor
                      : cs.totalExpensesMinor;
                  return (
                    <View key={cs.currencyCode} style={styles.breakdownRow}>
                      <Text style={[styles.breakdownCode, { color: theme.text }]}>
                        {cs.currencyCode}
                      </Text>
                      <Text
                        style={[
                          styles.breakdownAmt,
                          {
                            color:
                              infoModalKind === 'income'
                                ? theme.income
                                : theme.expense,
                          },
                        ]}>
                        {formatMoney(val, cs.currencyCode, { catalog: currencies })}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : null}

            <AppButton label="Close" onPress={() => setInfoModalKind(null)} fullWidth />
          </Pressable>
        </Pressable>
      </Modal>
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
  headerSideSpacer: {
    width: 40,
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
  bellButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  periodPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.two + 4,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  periodPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  balanceValue: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  comparisonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  comparisonBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  comparisonPct: {
    fontSize: 12,
    fontWeight: '700',
  },
  comparisonLabel: {
    fontSize: 12,
  },
  trendContainer: {
    marginTop: Spacing.one,
  },
  splitRow: {
    flexDirection: 'row',
    gap: Spacing.two + 2,
  },
  splitCard: {
    flex: 1,
  },
  splitTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  flowIconBadge: {
    width: 30,
    height: 30,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splitLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  splitAmount: {
    fontSize: 19,
    fontWeight: '800',
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
  recentGroups: {
    gap: Spacing.three,
  },
  recentGroup: {
    gap: Spacing.one + 2,
  },
  dateGroupLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  groupList: {
    gap: Spacing.two,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  periodOptionList: {
    gap: Spacing.two,
  },
  periodOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 4,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  periodOptionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  infoSub: {
    fontSize: 13,
  },
  infoBigValue: {
    fontSize: 26,
    fontWeight: '800',
  },
  currencyBreakdown: {
    gap: Spacing.two,
    paddingTop: Spacing.one,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownCode: {
    fontSize: 14,
    fontWeight: '700',
  },
  breakdownAmt: {
    fontSize: 14,
    fontWeight: '700',
  },
});
