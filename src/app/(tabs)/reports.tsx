import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  AppButton,
  AppCard,
  AppHeader,
  AppScreen,
  EmptyState,
  SegmentedControl,
  type SegmentOption,
} from '@/components/common';
import { DatePickerField } from '@/components/forms/DatePickerField';
import {
  CategoryDonutChart,
  DailySpendingTrendChart,
  IncomeExpenseBarChart,
} from '@/components/reports/Charts';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  calculatePeriodSummary,
  getDistinctTransactionCurrencies,
} from '@/services/calculations/financialCalculations';
import { useAppStore } from '@/store/app-store';
import type { ReportPeriod } from '@/types/reports';
import {
  addDaysToISODate,
  formatDateForDisplay,
  getMonthLabel,
  getMonthRange,
  getTodayISODate,
  getWeekRange,
  getYearRange,
  parseISODateParts,
} from '@/utils/date';
import { formatMoney } from '@/utils/money';

const PERIOD_OPTIONS: readonly SegmentOption<ReportPeriod>[] = [
  { label: 'Day', value: 'daily' },
  { label: 'Week', value: 'weekly' },
  { label: 'Month', value: 'monthly' },
  { label: 'Year', value: 'yearly' },
  { label: 'Custom', value: 'custom' },
];

export default function ReportsScreen() {
  const theme = useTheme();
  const router = useRouter();

  const settings = useAppStore((s) => s.settings);
  const categories = useAppStore((s) => s.categories);
  const currencies = useAppStore((s) => s.currencies);
  const transactions = useAppStore((s) => s.transactions);

  const today = getTodayISODate();
  const [period, setPeriod] = useState<ReportPeriod>('monthly');
  const [anchorDate, setAnchorDate] = useState(today);
  const [customStart, setCustomStart] = useState(addDaysToISODate(today, -29));
  const [customEnd, setCustomEnd] = useState(today);
  const [selectedCurrency, setSelectedCurrency] = useState<string | null>(null);

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

  const { startDate, endDate, rangeTitle } = useMemo(() => {
    const parts = parseISODateParts(anchorDate);
    switch (period) {
      case 'daily':
        return {
          startDate: anchorDate,
          endDate: anchorDate,
          rangeTitle: formatDateForDisplay(anchorDate, settings.dateFormat),
        };
      case 'weekly': {
        const range = getWeekRange(anchorDate);
        return {
          ...range,
          rangeTitle: `${formatDateForDisplay(range.startDate, settings.dateFormat)} – ${formatDateForDisplay(range.endDate, settings.dateFormat)}`,
        };
      }
      case 'monthly': {
        const range = getMonthRange(parts.year, parts.month);
        return {
          ...range,
          rangeTitle: getMonthLabel(parts.year, parts.month),
        };
      }
      case 'yearly': {
        const range = getYearRange(parts.year);
        return {
          ...range,
          rangeTitle: String(parts.year),
        };
      }
      case 'custom':
      default: {
        const start = customStart <= customEnd ? customStart : customEnd;
        const end = customStart <= customEnd ? customEnd : customStart;
        return {
          startDate: start,
          endDate: end,
          rangeTitle: `${formatDateForDisplay(start, settings.dateFormat)} – ${formatDateForDisplay(end, settings.dateFormat)}`,
        };
      }
    }
  }, [period, anchorDate, customStart, customEnd, settings.dateFormat]);

  const stepPeriod = (delta: number) => {
    const parts = parseISODateParts(anchorDate);
    if (period === 'daily') {
      setAnchorDate(addDaysToISODate(anchorDate, delta));
    } else if (period === 'weekly') {
      setAnchorDate(addDaysToISODate(anchorDate, delta * 7));
    } else if (period === 'monthly') {
      let nextMonth = parts.month + delta;
      let nextYear = parts.year;
      if (nextMonth < 1) {
        nextMonth = 12;
        nextYear -= 1;
      } else if (nextMonth > 12) {
        nextMonth = 1;
        nextYear += 1;
      }
      setAnchorDate(
        `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-01`,
      );
    } else if (period === 'yearly') {
      const nextYear = parts.year + delta;
      setAnchorDate(`${String(nextYear).padStart(4, '0')}-01-01`);
    }
  };

  const summary = useMemo(
    () =>
      calculatePeriodSummary({
        transactions,
        categories,
        currencyCode: activeCurrencyCode,
        startDate,
        endDate,
      }),
    [transactions, categories, activeCurrencyCode, startDate, endDate],
  );

  return (
    <AppScreen>
      <AppHeader
        title="Reports"
        subtitle={`Analytics (${activeCurrencyCode})`}
        rightAction={
          <AppButton
            label="Calendar"
            variant="outline"
            size="sm"
            onPress={() => router.push('/calendar')}
          />
        }
      />

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

      <SegmentedControl
        options={PERIOD_OPTIONS}
        value={period}
        onChange={setPeriod}
      />

      {period === 'custom' ? (
        <AppCard>
          <View style={styles.customRangeRow}>
            <View style={styles.flex1}>
              <DatePickerField
                label="From"
                value={customStart}
                dateFormat={settings.dateFormat}
                onChange={setCustomStart}
              />
            </View>
            <View style={styles.flex1}>
              <DatePickerField
                label="To"
                value={customEnd}
                dateFormat={settings.dateFormat}
                onChange={setCustomEnd}
              />
            </View>
          </View>
        </AppCard>
      ) : (
        <AppCard>
          <View style={styles.navigatorRow}>
            <Pressable
              onPress={() => stepPeriod(-1)}
              accessibilityRole="button"
              style={[styles.navBtn, { borderColor: theme.border }]}>
              <Ionicons name="chevron-back" size={18} color={theme.text} />
            </Pressable>
            <Text style={[styles.rangeTitle, { color: theme.text }]} numberOfLines={1}>
              {rangeTitle}
            </Text>
            <Pressable
              onPress={() => stepPeriod(1)}
              accessibilityRole="button"
              style={[styles.navBtn, { borderColor: theme.border }]}>
              <Ionicons name="chevron-forward" size={18} color={theme.text} />
            </Pressable>
          </View>
        </AppCard>
      )}

      {summary.transactionCount === 0 ? (
        <EmptyState
          icon="bar-chart-outline"
          title={`No ${activeCurrencyCode} transactions in this period`}
          description="Try switching currency, choosing another date range, or recording a transaction."
          actionLabel="Add Transaction"
          onAction={() => router.push('/transactions/add')}
        />
      ) : (
        <>
          <AppCard>
            <View style={styles.kpiGrid}>
              <View style={[styles.kpiTile, { backgroundColor: theme.incomeSoft }]}>
                <Text style={[styles.kpiLabel, { color: theme.income }]}>
                  Total Income
                </Text>
                <Text
                  style={[styles.kpiValue, { color: theme.income }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit>
                  {formatMoney(summary.totalIncomeMinor, activeCurrencyCode, {
                    catalog: currencies,
                  })}
                </Text>
              </View>
              <View style={[styles.kpiTile, { backgroundColor: theme.expenseSoft }]}>
                <Text style={[styles.kpiLabel, { color: theme.expense }]}>
                  Total Expenses
                </Text>
                <Text
                  style={[styles.kpiValue, { color: theme.expense }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit>
                  {formatMoney(summary.totalExpensesMinor, activeCurrencyCode, {
                    catalog: currencies,
                  })}
                </Text>
              </View>
            </View>

            <View style={styles.metricsList}>
              <MetricRow
                label="Net Financial Movement"
                value={formatMoney(summary.netMovementMinor, activeCurrencyCode, {
                  showSign: true,
                  catalog: currencies,
                })}
                valueColor={
                  summary.netMovementMinor >= 0 ? theme.income : theme.expense
                }
              />
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
              <MetricRow
                label="Average Daily Expenses"
                value={formatMoney(
                  summary.averageDailyExpenseMinor,
                  activeCurrencyCode,
                  { catalog: currencies },
                )}
              />
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
              <MetricRow
                label="Highest Spending Category"
                value={
                  summary.highestSpendingCategory
                    ? `${summary.highestSpendingCategory.categoryName} (${formatMoney(summary.highestSpendingCategory.totalMinor, activeCurrencyCode, { catalog: currencies })})`
                    : 'None'
                }
              />
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
              <MetricRow
                label="Highest Spending Day"
                value={
                  summary.highestSpendingDay
                    ? `${formatDateForDisplay(summary.highestSpendingDay.date, settings.dateFormat)} (${formatMoney(summary.highestSpendingDay.amountMinor, activeCurrencyCode, { catalog: currencies })})`
                    : 'None'
                }
              />
            </View>
          </AppCard>

          <AppCard>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Income vs Expenses
            </Text>
            <IncomeExpenseBarChart
              incomeMinor={summary.totalIncomeMinor}
              expenseMinor={summary.totalExpensesMinor}
              currencyCode={activeCurrencyCode}
              catalog={currencies}
            />
          </AppCard>

          <AppCard>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Spending Trend
            </Text>
            <DailySpendingTrendChart
              dailyTotals={summary.dailyTotals}
              currencyCode={activeCurrencyCode}
              catalog={currencies}
            />
          </AppCard>

          <AppCard>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Category Spending Breakdown
            </Text>
            <CategoryDonutChart
              items={summary.categoryBreakdown}
              totalMinor={summary.totalExpensesMinor}
              currencyCode={activeCurrencyCode}
              catalog={currencies}
              maxLegendItems={12}
            />
          </AppCard>
        </>
      )}
    </AppScreen>
  );
}

function MetricRow({
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
    <View style={styles.metricRow}>
      <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>
        {label}
      </Text>
      <Text
        style={[styles.metricValue, { color: valueColor ?? theme.text }]}
        numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
  customRangeRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  flex1: {
    flex: 1,
  },
  navigatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: Radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rangeTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '700',
  },
  kpiGrid: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  kpiTile: {
    flex: 1,
    borderRadius: Radius.md,
    padding: Spacing.three - 4,
    gap: 4,
  },
  kpiLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  kpiValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  metricsList: {
    marginTop: Spacing.two,
    gap: Spacing.two,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  metricLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  metricValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    width: '100%',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
});
