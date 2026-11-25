import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import {
  AppCard,
  AppHeader,
  AppScreen,
  BottomSheetModal,
  CategoryIcon,
  EmptyState,
  SegmentedControl,
  type SegmentOption,
} from '@/components/common';
import { DateRangePicker } from '@/components/forms/DateRangePicker';
import {
  CategoryDonutChart,
  DynamicSpendingTrendChart,
  IncomeExpenseComparisonChart,
} from '@/components/reports/Charts';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  buildReportAnalytics,
  getDistinctTransactionCurrencies,
} from '@/services/calculations/financialCalculations';
import { useAppStore } from '@/store/app-store';
import type { ReportGranularity, ReportPeriodPreset } from '@/types/reports';
import {
  addDaysToISODate,
  formatDateForDisplay,
  getTodayISODate,
  resolveDatePresetRange,
} from '@/utils/date';
import { formatMoney } from '@/utils/money';

const PERIOD_PRESETS: readonly { value: ReportPeriodPreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'last_7', label: 'Last 7 Days' },
  { value: 'last_30', label: 'Last 30 Days' },
  { value: 'this_month', label: 'This Month' },
  { value: 'this_year', label: 'This Year' },
  { value: 'all_time', label: 'All Time' },
  { value: 'custom', label: 'Custom' },
];

const GRANULARITY_OPTIONS: readonly SegmentOption<ReportGranularity>[] = [
  { label: 'Daily', value: 'daily' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'Monthly', value: 'monthly' },
];

export default function ReportsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const settings = useAppStore((s) => s.settings);
  const categories = useAppStore((s) => s.categories);
  const currencies = useAppStore((s) => s.currencies);
  const transactions = useAppStore((s) => s.transactions);

  const today = getTodayISODate();
  const [periodPreset, setPeriodPreset] = useState<ReportPeriodPreset>('this_month');
  const [customStart, setCustomStart] = useState(addDaysToISODate(today, -29));
  const [customEnd, setCustomEnd] = useState(today);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);
  const [periodPickerVisible, setPeriodPickerVisible] = useState(false);
  const [granularity, setGranularity] = useState<ReportGranularity>('daily');
  const [selectedCurrency, setSelectedCurrency] = useState<string | null>(null);
  const [breakdownExpanded, setBreakdownExpanded] = useState(false);

  const isCompact = width < 360;

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

  const earliestTxDate = useMemo(() => {
    let min = today;
    for (const tx of transactions) {
      if (tx.currencyCode.toUpperCase() === activeCurrencyCode.toUpperCase()) {
        if (tx.transactionDate < min) min = tx.transactionDate;
      }
    }
    return min;
  }, [transactions, activeCurrencyCode, today]);

  const { startDate, endDate } = useMemo(() => {
    const resolved = resolveDatePresetRange({
      preset: periodPreset,
      referenceToday: today,
      customStartDate: customStart,
      customEndDate: customEnd,
      earliestTransactionDate: earliestTxDate,
    });
    return {
      startDate: resolved.startDate ?? today,
      endDate: resolved.endDate ?? today,
    };
  }, [periodPreset, today, customStart, customEnd, earliestTxDate]);

  const analytics = useMemo(
    () =>
      buildReportAnalytics({
        transactions,
        categories,
        currencyCode: activeCurrencyCode,
        startDate,
        endDate,
        categoryId: selectedCategoryId,
        granularity,
      }),
    [
      transactions,
      categories,
      activeCurrencyCode,
      startDate,
      endDate,
      selectedCategoryId,
      granularity,
    ],
  );

  const selectedCategory = useMemo(
    () =>
      selectedCategoryId
        ? categories.find((c) => c.id === selectedCategoryId) ?? null
        : null,
    [categories, selectedCategoryId],
  );

  const orderedCategories = useMemo(
    () =>
      [...categories].sort((a, b) => {
        if (a.isArchived !== b.isArchived) return a.isArchived ? 1 : -1;
        return a.name.localeCompare(b.name);
      }),
    [categories],
  );

  const visibleBreakdown = breakdownExpanded
    ? analytics.categoryBreakdown
    : analytics.categoryBreakdown.slice(0, 5);

  const activePeriodLabel =
    PERIOD_PRESETS.find((p) => p.value === periodPreset)?.label ?? 'This Month';

  return (
    <AppScreen>
      <AppHeader
        title="Reports"
        leftAction={
          <View
            style={[
              styles.headerBadge,
              { backgroundColor: theme.primarySoft, borderColor: theme.border },
            ]}>
            <Ionicons name="stats-chart" size={17} color={theme.primary} />
          </View>
        }
        rightAction={
          <Pressable
            onPress={() => router.push('/calendar')}
            accessibilityRole="button"
            accessibilityLabel="Open Calendar"
            style={({ pressed }) => [
              styles.headerIconBtn,
              { backgroundColor: theme.surface, borderColor: theme.border },
              pressed && styles.pressed,
            ]}>
            <Ionicons name="calendar-outline" size={18} color={theme.text} />
          </Pressable>
        }
      />

      {availableCurrencies.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalRow}>
          {availableCurrencies.map((code) => {
            const selected = code === activeCurrencyCode;
            return (
              <Pressable
                key={code}
                onPress={() => setSelectedCurrency(code)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: selected ? theme.primary : theme.surface,
                    borderColor: selected ? theme.primary : theme.border,
                  },
                ]}>
                <Text
                  style={[
                    styles.chipText,
                    { color: selected ? theme.primaryText : theme.text },
                  ]}>
                  {code}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {/* Main Report Card */}
      <AppCard>
        <View style={styles.selectorRow}>
          <Pressable
            onPress={() => setPeriodPickerVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={`Period: ${activePeriodLabel}`}
            style={({ pressed }) => [
              styles.selectorTrigger,
              { backgroundColor: theme.surfaceElevated, borderColor: theme.border },
              pressed && styles.pressed,
            ]}>
            <Ionicons name="time-outline" size={15} color={theme.primary} />
            <Text style={[styles.selectorText, { color: theme.text }]} numberOfLines={1}>
              {activePeriodLabel}
            </Text>
            <Ionicons name="chevron-down" size={15} color={theme.textSecondary} />
          </Pressable>

          <Pressable
            onPress={() => setCategoryPickerVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Filter report by category"
            style={({ pressed }) => [
              styles.selectorTrigger,
              {
                backgroundColor: selectedCategory
                  ? theme.primarySoft
                  : theme.surfaceElevated,
                borderColor: selectedCategory ? theme.primary : theme.border,
              },
              pressed && styles.pressed,
            ]}>
            {selectedCategory ? (
              <View
                style={[styles.catDot, { backgroundColor: selectedCategory.color }]}
              />
            ) : (
              <Ionicons name="pricetag-outline" size={15} color={theme.textSecondary} />
            )}
            <Text
              style={[
                styles.selectorText,
                { color: selectedCategory ? theme.primary : theme.text },
              ]}
              numberOfLines={1}>
              {selectedCategory ? selectedCategory.name : 'All Categories'}
            </Text>
            <Ionicons
              name="chevron-down"
              size={15}
              color={selectedCategory ? theme.primary : theme.textSecondary}
            />
          </Pressable>
        </View>

        {periodPreset === 'custom' ? (
          <View style={styles.customRangeWrap}>
            <DateRangePicker
              startDate={customStart}
              endDate={customEnd}
              dateFormat={settings.dateFormat}
              onChange={({ startDate: s, endDate: e }) => {
                setCustomStart(s);
                setCustomEnd(e);
              }}
            />
          </View>
        ) : null}

        {analytics.transactionCount > 0 ? (
          <>
            <View style={[styles.summaryDividerH, { backgroundColor: theme.border }]} />
            <View style={styles.summaryRow}>
              <View style={styles.summaryTile}>
                <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>
                  Income
                </Text>
                <Text
                  style={[
                    styles.summaryValue,
                    { color: theme.income, fontSize: isCompact ? 15 : 17 },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.55}>
                  {formatMoney(analytics.totalIncomeMinor, activeCurrencyCode, {
                    catalog: currencies,
                  })}
                </Text>
              </View>

              <View style={[styles.summaryDivider, { backgroundColor: theme.border }]} />

              <View style={styles.summaryTile}>
                <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>
                  Expenses
                </Text>
                <Text
                  style={[
                    styles.summaryValue,
                    { color: theme.expense, fontSize: isCompact ? 15 : 17 },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.55}>
                  {formatMoney(analytics.totalExpensesMinor, activeCurrencyCode, {
                    catalog: currencies,
                  })}
                </Text>
              </View>

              <View style={[styles.summaryDivider, { backgroundColor: theme.border }]} />

              <View style={styles.summaryTile}>
                <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>
                  Balance
                </Text>
                <Text
                  style={[
                    styles.summaryValue,
                    {
                      color:
                        analytics.netMovementMinor >= 0
                          ? theme.income
                          : theme.expense,
                      fontSize: isCompact ? 15 : 17,
                    },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.55}>
                  {formatMoney(analytics.netMovementMinor, activeCurrencyCode, {
                    showSign: true,
                    catalog: currencies,
                  })}
                </Text>
              </View>
            </View>

            <View style={[styles.summaryDividerH, { backgroundColor: theme.border }]} />

            <IncomeExpenseComparisonChart
              buckets={analytics.comparisonBuckets}
              currencyCode={activeCurrencyCode}
              catalog={currencies}
            />
          </>
        ) : null}
      </AppCard>

      {analytics.transactionCount === 0 ? (
        <EmptyState
          icon="bar-chart-outline"
          title="No transactions in this report"
          description={
            selectedCategory
              ? `No ${activeCurrencyCode} records found for ${selectedCategory.name} in this period.`
              : `No ${activeCurrencyCode} records found in this date range.`
          }
          actionLabel={selectedCategory ? 'Show All Categories' : 'Add Transaction'}
          onAction={() => {
            if (selectedCategory) {
              setSelectedCategoryId(null);
            } else {
              router.push('/transactions/add');
            }
          }}
        />
      ) : (
        <>
          <SegmentedControl
            options={GRANULARITY_OPTIONS}
            value={granularity}
            onChange={setGranularity}
          />

          <AppCard>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Spending Trend
            </Text>
            <DynamicSpendingTrendChart
              trend={analytics.spendingTrend}
              currencyCode={activeCurrencyCode}
              catalog={currencies}
            />
          </AppCard>

          <AppCard>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                Category Breakdown
              </Text>
              {analytics.categoryBreakdown.length > 5 ? (
                <Pressable
                  onPress={() => setBreakdownExpanded((v) => !v)}
                  hitSlop={8}
                  accessibilityRole="button">
                  <Text style={[styles.seeAllText, { color: theme.primary }]}>
                    {breakdownExpanded ? 'Show Less' : 'See All'}
                  </Text>
                </Pressable>
              ) : null}
            </View>

            <CategoryDonutChart
              items={analytics.categoryBreakdown}
              totalMinor={analytics.totalExpensesMinor}
              currencyCode={activeCurrencyCode}
              catalog={currencies}
              hideLegend
            />

            {analytics.categoryBreakdown.length > 0 ? (
              <View style={styles.rankedList}>
                {visibleBreakdown.map((item) => {
                  const isCurrentCategory =
                    Boolean(item.categoryId) && item.categoryId === selectedCategoryId;
                  return (
                    <Pressable
                      key={item.categoryId ?? item.categoryName}
                      onPress={() => {
                        if (item.categoryId) {
                          setSelectedCategoryId((prev) =>
                            prev === item.categoryId ? null : item.categoryId,
                          );
                        }
                      }}
                      style={({ pressed }) => [
                        styles.rankedRow,
                        isCurrentCategory && {
                          backgroundColor: theme.primarySoft,
                          borderRadius: Radius.md,
                        },
                        pressed && styles.pressed,
                      ]}>
                      <CategoryIcon
                        icon={item.icon}
                        color={item.color}
                        size={34}
                      />
                      <View style={styles.rankedNameWrap}>
                        <Text
                          style={[styles.rankedName, { color: theme.text }]}
                          numberOfLines={1}>
                          {item.categoryName}
                        </Text>
                        <Text
                          style={[styles.rankedSub, { color: theme.textSecondary }]}>
                          {item.transactionCount}{' '}
                          {item.transactionCount === 1 ? 'expense' : 'expenses'}
                        </Text>
                      </View>
                      <View style={styles.rankedRight}>
                        <Text style={[styles.rankedAmt, { color: theme.text }]}>
                          {formatMoney(item.totalMinor, activeCurrencyCode, {
                            catalog: currencies,
                          })}
                        </Text>
                        <Text
                          style={[styles.rankedPct, { color: theme.textSecondary }]}>
                          {item.percentage.toFixed(1)}%
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </AppCard>

          <AppCard>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Insights</Text>
            <View style={styles.insightsList}>
              {analytics.highestSpendingCategory ? (
                <>
                  <InsightRow
                    label="Category"
                    value={`${analytics.highestSpendingCategory.categoryName} (${formatMoney(analytics.highestSpendingCategory.totalMinor, activeCurrencyCode, { catalog: currencies })})`}
                  />
                  <View style={[styles.divider, { backgroundColor: theme.border }]} />
                </>
              ) : null}

              {analytics.highestSpendingDay ? (
                <>
                  <InsightRow
                    label="Highest"
                    value={`${formatDateForDisplay(analytics.highestSpendingDay.date, settings.dateFormat)} (${formatMoney(analytics.highestSpendingDay.amountMinor, activeCurrencyCode, { catalog: currencies })})`}
                  />
                  <View style={[styles.divider, { backgroundColor: theme.border }]} />
                </>
              ) : null}

              <InsightRow
                label="Average"
                value={formatMoney(
                  analytics.averageDailyExpenseMinor,
                  activeCurrencyCode,
                  { catalog: currencies },
                )}
              />
              <View style={[styles.divider, { backgroundColor: theme.border }]} />

              <InsightRow
                label="Activity"
                value={`${analytics.incomeTransactionCount} income · ${analytics.expenseTransactionCount} expense`}
              />

              {analytics.largestExpenseTransaction ? (
                <>
                  <View style={[styles.divider, { backgroundColor: theme.border }]} />
                  <InsightRow
                    label="Largest"
                    value={`${analytics.largestExpenseTransaction.title} (${formatMoney(analytics.largestExpenseTransaction.amountMinor, activeCurrencyCode, { catalog: currencies })})`}
                  />
                </>
              ) : null}

              <View style={[styles.divider, { backgroundColor: theme.border }]} />
              <InsightRow
                label="Balance"
                value={formatMoney(analytics.netMovementMinor, activeCurrencyCode, {
                  showSign: true,
                  catalog: currencies,
                })}
                valueColor={
                  analytics.netMovementMinor >= 0 ? theme.income : theme.expense
                }
              />
            </View>
          </AppCard>
        </>
      )}

      {/* Period Picker Bottom Sheet */}
      <BottomSheetModal
        visible={periodPickerVisible}
        onClose={() => setPeriodPickerVisible(false)}>
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: theme.text }]}>Select Period</Text>
          <Pressable
            onPress={() => setPeriodPickerVisible(false)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close period selector">
            <Ionicons name="chevron-down" size={22} color={theme.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.sheetList}>
          {PERIOD_PRESETS.map((opt) => {
            const selected = opt.value === periodPreset;
            return (
              <Pressable
                key={opt.value}
                onPress={() => {
                  setPeriodPreset(opt.value);
                  setPeriodPickerVisible(false);
                }}
                style={[
                  styles.catOptionRow,
                  {
                    backgroundColor: selected ? theme.primarySoft : 'transparent',
                    borderColor: selected ? theme.primary : theme.border,
                  },
                ]}>
                <Text
                  style={[
                    styles.catOptionText,
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
      </BottomSheetModal>

      {/* Category Filter Bottom Sheet */}
      <BottomSheetModal
        visible={categoryPickerVisible}
        onClose={() => setCategoryPickerVisible(false)}>
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: theme.text }]}>
            Filter by Category
          </Text>
          <Pressable
            onPress={() => setCategoryPickerVisible(false)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close category selector">
            <Ionicons name="chevron-down" size={22} color={theme.textSecondary} />
          </Pressable>
        </View>

        <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
          <Pressable
            onPress={() => {
              setSelectedCategoryId(null);
              setCategoryPickerVisible(false);
            }}
            style={[
              styles.catOptionRow,
              {
                backgroundColor:
                  selectedCategoryId === null ? theme.primarySoft : 'transparent',
                borderColor:
                  selectedCategoryId === null ? theme.primary : theme.border,
              },
            ]}>
            <Text
              style={[
                styles.catOptionText,
                {
                  color: selectedCategoryId === null ? theme.primary : theme.text,
                },
              ]}>
              All Categories
            </Text>
            {selectedCategoryId === null ? (
              <Ionicons name="checkmark" size={18} color={theme.primary} />
            ) : null}
          </Pressable>

          {orderedCategories.map((cat) => {
            const selected = cat.id === selectedCategoryId;
            return (
              <Pressable
                key={cat.id}
                onPress={() => {
                  setSelectedCategoryId(cat.id);
                  setCategoryPickerVisible(false);
                }}
                style={[
                  styles.catOptionRow,
                  {
                    backgroundColor: selected ? theme.primarySoft : 'transparent',
                    borderColor: selected ? theme.primary : theme.border,
                  },
                ]}>
                <View style={styles.catOptionLeft}>
                  <CategoryIcon icon={cat.icon} color={cat.color} size={30} />
                  <Text
                    style={[
                      styles.catOptionText,
                      { color: selected ? theme.primary : theme.text },
                    ]}>
                    {cat.name}
                  </Text>
                </View>
                {selected ? (
                  <Ionicons name="checkmark" size={18} color={theme.primary} />
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheetModal>
    </AppScreen>
  );
}

function InsightRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.insightRow}>
      <Text style={[styles.insightLabel, { color: theme.textSecondary }]}>
        {label}
      </Text>
      <Text
        style={[styles.insightValue, { color: valueColor ?? theme.text }]}
        numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  horizontalRow: {
    gap: Spacing.two,
    paddingVertical: 2,
  },
  chip: {
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: 7,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  selectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  selectorTrigger: {
    flex: 1,
    minHeight: 40,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.two + 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  selectorText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  customRangeWrap: {
    marginTop: Spacing.one,
  },
  catDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  summaryDividerH: {
    height: 1,
    width: '100%',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryTile: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 4,
  },
  summaryDivider: {
    width: 1,
    height: 36,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  summaryValue: {
    fontWeight: '800',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: '700',
  },
  rankedList: {
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  rankedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  pressed: {
    opacity: 0.72,
  },
  rankedNameWrap: {
    flex: 1,
    gap: 2,
  },
  rankedName: {
    fontSize: 14,
    fontWeight: '600',
  },
  rankedSub: {
    fontSize: 11,
  },
  rankedRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  rankedAmt: {
    fontSize: 14,
    fontWeight: '700',
  },
  rankedPct: {
    fontSize: 11,
    fontWeight: '600',
  },
  insightsList: {
    gap: Spacing.two,
  },
  insightRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  insightLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  insightValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    width: '100%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  sheetList: {
    gap: Spacing.one,
  },
  modalScroll: {
    maxHeight: 400,
  },
  catOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.two + 2,
    borderRadius: Radius.md,
    borderWidth: 1,
    marginBottom: Spacing.two,
  },
  catOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
  },
  catOptionText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
