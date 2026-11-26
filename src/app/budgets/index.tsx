import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BudgetProgressCard } from '@/components/budgets/BudgetProgressCard';
import {
  AppButton,
  AppCard,
  AppHeader,
  AppInput,
  AppScreen,
  BottomSheetModal,
  CategoryIcon,
  ConfirmDialog,
  EmptyState,
  SegmentedControl,
  type SegmentOption,
} from '@/components/common';
import { DatePickerField } from '@/components/forms/DatePickerField';
import { DynamicSpendingTrendChart } from '@/components/reports/Charts';
import { getCurrencyConfig } from '@/constants/currencies';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  calculateBudgetOverviewStats,
  calculateBudgetProgress,
  getDistinctTransactionCurrencies,
} from '@/services/calculations/financialCalculations';
import { useAppStore } from '@/store/app-store';
import type { Budget, BudgetPeriod } from '@/types/models';
import {
  addDaysToISODate,
  formatDateForDisplay,
  getBiweeklyPeriodForDate,
  getBiweeklyPeriodRange,
  getMonthLabel,
  getMonthRange,
  getTodayISODate,
  getYearRange,
  parseISODateParts,
} from '@/utils/date';
import { formatMinorToMajorInput, formatMoney } from '@/utils/money';
import { validatePositiveAmountInput } from '@/utils/validation';

const PERIOD_OPTIONS: readonly SegmentOption<BudgetPeriod>[] = [
  { label: 'Monthly', value: 'monthly' },
  { label: 'Every 2 Weeks', value: 'biweekly' },
  { label: 'Yearly', value: 'yearly' },
];

export default function BudgetsScreen() {
  const theme = useTheme();

  const settings = useAppStore((s) => s.settings);
  const currencies = useAppStore((s) => s.currencies);
  const categories = useAppStore((s) => s.categories);
  const transactions = useAppStore((s) => s.transactions);
  const budgets = useAppStore((s) => s.budgets);
  const upsertBudget = useAppStore((s) => s.upsertBudget);
  const deleteBudget = useAppStore((s) => s.deleteBudget);

  const todayISO = getTodayISODate();
  const todayParts = parseISODateParts(todayISO);

  const [period, setPeriod] = useState<BudgetPeriod>('monthly');
  const [selectedCurrency, setSelectedCurrency] = useState<string | null>(null);
  const [year, setYear] = useState(todayParts.year);
  const [month, setMonth] = useState(todayParts.month);
  const [biweeklyOffset, setBiweeklyOffset] = useState(0);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingScope, setEditingScope] = useState<'overall' | 'category'>('overall');
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [startDateInput, setStartDateInput] = useState(todayISO);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Budget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const availableCurrencies = useMemo(() => {
    const base = getDistinctTransactionCurrencies(
      transactions,
      settings.currencyCode,
      settings.openingBalanceCurrencyCode,
    );
    const set = new Set(base);
    for (const b of budgets) {
      set.add(b.currencyCode.toUpperCase());
    }
    return Array.from(set);
  }, [
    transactions,
    budgets,
    settings.currencyCode,
    settings.openingBalanceCurrencyCode,
  ]);

  const activeCurrencyCode =
    selectedCurrency && availableCurrencies.includes(selectedCurrency)
      ? selectedCurrency
      : settings.currencyCode;

  const currency = getCurrencyConfig(activeCurrencyCode, currencies);

  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );
  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === 'expense' && !c.isArchived),
    [categories],
  );

  // Resolve anchor start date for Every 2 Weeks view
  const biweeklyCurrencyBudgets = useMemo(
    () =>
      budgets.filter(
        (b) =>
          b.period === 'biweekly' &&
          b.currencyCode.toUpperCase() === activeCurrencyCode.toUpperCase(),
      ),
    [budgets, activeCurrencyCode],
  );

  const defaultBiweeklyAnchor = useMemo(() => {
    const overallBiweekly = biweeklyCurrencyBudgets.find((b) => b.categoryId === null);
    if (overallBiweekly?.startDate) return overallBiweekly.startDate;
    const firstCat = biweeklyCurrencyBudgets.find((b) => Boolean(b.startDate));
    return firstCat?.startDate ?? todayISO;
  }, [biweeklyCurrencyBudgets, todayISO]);

  const activeBiweeklyCycle = useMemo(() => {
    const currentCycle = getBiweeklyPeriodForDate(defaultBiweeklyAnchor, todayISO);
    const shiftedStart = addDaysToISODate(
      currentCycle.startDate,
      biweeklyOffset * 14,
    );
    return getBiweeklyPeriodRange(shiftedStart);
  }, [defaultBiweeklyAnchor, todayISO, biweeklyOffset]);

  // Determine the budgets & window for the currently selected timeframe
  const { periodStartDate, periodEndDate, periodBudgets } = useMemo(() => {
    const normalizedCurr = activeCurrencyCode.toUpperCase();

    if (period === 'biweekly') {
      return {
        periodStartDate: activeBiweeklyCycle.startDate,
        periodEndDate: activeBiweeklyCycle.endDate,
        periodBudgets: biweeklyCurrencyBudgets,
      };
    }

    if (period === 'yearly') {
      const range = getYearRange(year);
      return {
        periodStartDate: range.startDate,
        periodEndDate: range.endDate,
        periodBudgets: budgets.filter(
          (b) =>
            b.period === 'yearly' &&
            b.year === year &&
            b.currencyCode.toUpperCase() === normalizedCurr,
        ),
      };
    }

    const range = getMonthRange(year, month);
    return {
      periodStartDate: range.startDate,
      periodEndDate: range.endDate,
      periodBudgets: budgets.filter(
        (b) =>
          b.period === 'monthly' &&
          b.year === year &&
          b.month === month &&
          b.currencyCode.toUpperCase() === normalizedCurr,
      ),
    };
  }, [
    activeCurrencyCode,
    period,
    activeBiweeklyCycle.startDate,
    activeBiweeklyCycle.endDate,
    biweeklyCurrencyBudgets,
    budgets,
    year,
    month,
  ]);

  const overallBudget = periodBudgets.find((b) => b.categoryId === null) ?? null;
  const categoryBudgets = useMemo(
    () => periodBudgets.filter((b) => b.categoryId !== null),
    [periodBudgets],
  );

  const referenceDateForProgress =
    period === 'biweekly' ? activeBiweeklyCycle.startDate : periodStartDate;

  const overallProgress = useMemo(() => {
    if (!overallBudget) return null;
    return calculateBudgetProgress({
      budget: overallBudget,
      transactions,
      category: null,
      referenceDate: referenceDateForProgress,
    });
  }, [overallBudget, transactions, referenceDateForProgress]);

  const categoryProgressList = useMemo(
    () =>
      categoryBudgets.map((b) =>
        calculateBudgetProgress({
          budget: b,
          transactions,
          category: b.categoryId ? categoryMap.get(b.categoryId) ?? null : null,
          referenceDate: referenceDateForProgress,
        }),
      ),
    [categoryBudgets, transactions, categoryMap, referenceDateForProgress],
  );

  const overviewStats = useMemo(
    () =>
      calculateBudgetOverviewStats({
        period,
        periodStartDate,
        periodEndDate,
        currencyCode: activeCurrencyCode,
        transactions,
        categories,
        overallProgress,
        categoryProgressList,
      }),
    [
      period,
      periodStartDate,
      periodEndDate,
      activeCurrencyCode,
      transactions,
      categories,
      overallProgress,
      categoryProgressList,
    ],
  );

  const availableCategoriesForNewBudget = useMemo(() => {
    const budgetedIds = new Set(
      categoryBudgets.map((b) => b.categoryId).filter(Boolean),
    );
    return expenseCategories.filter((c) => !budgetedIds.has(c.id));
  }, [expenseCategories, categoryBudgets]);

  const stepMonth = (delta: number) => {
    let nextMonth = month + delta;
    let nextYear = year;
    if (nextMonth < 1) {
      nextMonth = 12;
      nextYear -= 1;
    } else if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    setMonth(nextMonth);
    setYear(nextYear);
  };

  const stepYear = (delta: number) => {
    setYear((prev) => prev + delta);
  };

  const stepBiweekly = (delta: number) => {
    setBiweeklyOffset((prev) => prev + delta);
  };

  const previewYearlyMonthlySetAside = useMemo(() => {
    if (period !== 'yearly') return null;
    const validation = validatePositiveAmountInput(
      amountInput,
      activeCurrencyCode,
      currencies,
    );
    if (!validation.valid || validation.value === undefined || validation.value <= 0) {
      return null;
    }
    return Math.round(validation.value / 12);
  }, [period, amountInput, activeCurrencyCode, currencies]);

  const openOverallModal = () => {
    setEditingScope('overall');
    setEditingBudget(overallBudget);
    setSelectedCategoryId(null);
    setAmountInput(
      overallBudget
        ? formatMinorToMajorInput(overallBudget.amountMinor, activeCurrencyCode, currencies)
        : '',
    );
    setStartDateInput(overallBudget?.startDate ?? activeBiweeklyCycle.startDate);
    setFormError(null);
    setModalVisible(true);
  };

  const openCategoryBudgetModal = (existingBudget?: Budget) => {
    setEditingScope('category');
    setEditingBudget(existingBudget ?? null);
    if (existingBudget && existingBudget.categoryId) {
      setSelectedCategoryId(existingBudget.categoryId);
      setAmountInput(
        formatMinorToMajorInput(existingBudget.amountMinor, activeCurrencyCode, currencies),
      );
      setStartDateInput(existingBudget.startDate ?? activeBiweeklyCycle.startDate);
    } else {
      setSelectedCategoryId(availableCategoriesForNewBudget[0]?.id ?? null);
      setAmountInput('');
      setStartDateInput(defaultBiweeklyAnchor);
    }
    setFormError(null);
    setModalVisible(true);
  };

  const handleSaveBudget = async () => {
    if (saving) return;
    setFormError(null);

    const validation = validatePositiveAmountInput(
      amountInput,
      activeCurrencyCode,
      currencies,
    );
    if (!validation.valid || validation.value === undefined) {
      setFormError(validation.error ?? 'Enter a valid budget amount.');
      return;
    }

    if (editingScope === 'category' && !selectedCategoryId) {
      setFormError('Please select a category.');
      return;
    }

    const startParts = parseISODateParts(startDateInput);
    const saveYear =
      period === 'biweekly' ? startParts.year : year;
    const saveMonth =
      period === 'biweekly'
        ? startParts.month
        : period === 'yearly'
          ? 1
          : month;

    setSaving(true);
    try {
      await upsertBudget({
        id: editingBudget?.id,
        period,
        amountMinor: validation.value,
        currencyCode: activeCurrencyCode,
        month: saveMonth,
        year: saveYear,
        startDate: period === 'biweekly' ? startDateInput : null,
        categoryId: editingScope === 'overall' ? null : selectedCategoryId,
      });
      if (period === 'biweekly') {
        setBiweeklyOffset(0);
      }
      setModalVisible(false);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'Unable to save budget.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBudget = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setActionError(null);
    try {
      await deleteBudget(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      setDeleteTarget(null);
      setActionError('Unable to delete budget. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const highestCatRecord = overviewStats.highestSpendingCategory?.categoryId
    ? categoryMap.get(overviewStats.highestSpendingCategory.categoryId)
    : undefined;

  const statusMeta =
    overviewStats.status === 'exceeded'
      ? { label: 'Over Budget', color: theme.danger, bg: theme.dangerSoft }
      : overviewStats.status === 'warning'
        ? { label: 'Near Limit', color: theme.warning, bg: theme.warningSoft }
        : { label: 'On Track', color: theme.primary, bg: theme.primarySoft };

  const progressFillWidth = Math.min(Math.max(overviewStats.percentageUsed, 0), 100);

  const periodNavigatorLabel =
    period === 'biweekly'
      ? `${formatDateForDisplay(activeBiweeklyCycle.startDate, settings.dateFormat)} – ${formatDateForDisplay(activeBiweeklyCycle.endDate, settings.dateFormat)}`
      : period === 'yearly'
        ? `${year}`
        : getMonthLabel(year, month);

  const coreSectionHeading =
    period === 'biweekly'
      ? 'Paycheck Overall Budget'
      : period === 'yearly'
        ? 'Annual Target Budget'
        : 'Monthly Overall Budget';

  const periodLimitInputLabel =
    period === 'biweekly'
      ? `14-Day Budget (${activeCurrencyCode})`
      : period === 'yearly'
        ? `Annual Target (${activeCurrencyCode})`
        : `Monthly Limit (${activeCurrencyCode})`;

  const subtitleText =
    period === 'biweekly'
      ? `14-day paycheck cycle (${activeCurrencyCode})`
      : period === 'yearly'
        ? `Annual sinking funds (${activeCurrencyCode})`
        : `Monthly spending limits (${activeCurrencyCode})`;

  return (
    <AppScreen edges={['top', 'bottom', 'left', 'right']}>
      <AppHeader
        title="Budgets"
        subtitle={subtitleText}
        showBack
      />

      <SegmentedControl
        options={PERIOD_OPTIONS}
        value={period}
        onChange={(nextPeriod) => {
          setPeriod(nextPeriod);
          setActionError(null);
        }}
      />

      {availableCurrencies.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.currencyRow}>
          {availableCurrencies.map((code) => {
            const selected = code === activeCurrencyCode;
            return (
              <Pressable
                key={code}
                onPress={() => setSelectedCurrency(code)}
                style={[
                  styles.currencyChip,
                  {
                    backgroundColor: selected ? theme.primary : theme.surface,
                    borderColor: selected ? theme.primary : theme.border,
                  },
                ]}>
                <Text
                  style={[
                    styles.currencyChipText,
                    { color: selected ? theme.primaryText : theme.text },
                  ]}>
                  {code}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {actionError ? (
        <Text style={[styles.errorBanner, { color: theme.danger }]}>{actionError}</Text>
      ) : null}

      {/* Period Navigator */}
      <AppCard>
        <View style={styles.monthRow}>
          <Pressable
            onPress={() => {
              if (period === 'biweekly') stepBiweekly(-1);
              else if (period === 'yearly') stepYear(-1);
              else stepMonth(-1);
            }}
            accessibilityRole="button"
            accessibilityLabel="Previous period"
            style={[styles.navBtn, { borderColor: theme.border }]}>
            <Ionicons name="chevron-back" size={18} color={theme.text} />
          </Pressable>

          <View style={styles.periodCenter}>
            <Text style={[styles.monthTitle, { color: theme.text }]} numberOfLines={1}>
              {periodNavigatorLabel}
            </Text>
            {period === 'biweekly' ? (
              <Text style={[styles.periodSub, { color: theme.textSecondary }]}>
                Next period:{' '}
                {formatDateForDisplay(activeBiweeklyCycle.nextStartDate, settings.dateFormat)}
              </Text>
            ) : period === 'yearly' ? (
              <Text style={[styles.periodSub, { color: theme.textSecondary }]}>
                {formatDateForDisplay(periodStartDate, settings.dateFormat)} –{' '}
                {formatDateForDisplay(periodEndDate, settings.dateFormat)}
              </Text>
            ) : null}
          </View>

          <Pressable
            onPress={() => {
              if (period === 'biweekly') stepBiweekly(1);
              else if (period === 'yearly') stepYear(1);
              else stepMonth(1);
            }}
            accessibilityRole="button"
            accessibilityLabel="Next period"
            style={[styles.navBtn, { borderColor: theme.border }]}>
            <Ionicons name="chevron-forward" size={18} color={theme.text} />
          </Pressable>
        </View>
      </AppCard>

      {/* Budget Overview Card */}
      {overviewStats.hasAnyBudget ? (
        <AppCard>
          <View style={styles.overviewHeader}>
            <View style={styles.overviewTitleWrap}>
              <Text style={[styles.sectionHeading, { color: theme.text }]}>
                Budget Overview
              </Text>
              <Text style={[styles.overviewPct, { color: statusMeta.color }]}>
                {overviewStats.percentageUsed.toFixed(0)}% used
              </Text>
            </View>
            <View style={[styles.statusPill, { backgroundColor: statusMeta.bg }]}>
              <Text style={[styles.statusPillText, { color: statusMeta.color }]}>
                {statusMeta.label}
              </Text>
            </View>
          </View>

          <View style={[styles.track, { backgroundColor: theme.surfaceElevated }]}>
            <View
              style={[
                styles.fill,
                {
                  width: `${progressFillWidth}%`,
                  backgroundColor: statusMeta.color,
                },
              ]}
            />
          </View>

          <View style={styles.metricsRow}>
            <View style={styles.metricTile}>
              <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>
                {period === 'yearly' ? 'Annual Target' : 'Total Budget'}
              </Text>
              <Text
                style={[styles.metricVal, { color: theme.text }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}>
                {formatMoney(overviewStats.totalBudgetMinor, activeCurrencyCode, {
                  catalog: currencies,
                })}
              </Text>
            </View>

            <View style={[styles.metricDivider, { backgroundColor: theme.border }]} />

            <View style={styles.metricTile}>
              <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>
                Total Spent
              </Text>
              <Text
                style={[styles.metricVal, { color: theme.expense }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}>
                {formatMoney(overviewStats.totalSpentMinor, activeCurrencyCode, {
                  catalog: currencies,
                })}
              </Text>
            </View>

            <View style={[styles.metricDivider, { backgroundColor: theme.border }]} />

            <View style={styles.metricTile}>
              <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>
                {overviewStats.remainingMinor < 0 ? 'Over by' : 'Remaining'}
              </Text>
              <Text
                style={[
                  styles.metricVal,
                  {
                    color:
                      overviewStats.remainingMinor < 0 ? theme.danger : theme.income,
                  },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}>
                {formatMoney(
                  Math.abs(overviewStats.remainingMinor),
                  activeCurrencyCode,
                  { catalog: currencies },
                )}
              </Text>
            </View>
          </View>

          {period === 'yearly' && overviewStats.monthlyContributionMinor !== null ? (
            <View
              style={[
                styles.yearlyNoteBox,
                { backgroundColor: theme.surfaceElevated, borderColor: theme.border },
              ]}>
              <Ionicons name="calendar-outline" size={16} color={theme.primary} />
              <Text style={[styles.yearlyNoteText, { color: theme.textSecondary }]}>
                Monthly amount to set aside:{' '}
                <Text style={[styles.yearlyNoteAmount, { color: theme.text }]}>
                  {formatMoney(
                    overviewStats.monthlyContributionMinor,
                    activeCurrencyCode,
                    { catalog: currencies },
                  )}
                  /mo
                </Text>
              </Text>
            </View>
          ) : null}
        </AppCard>
      ) : null}

      {/* Core / Overall Budget */}
      <Text style={[styles.sectionHeading, { color: theme.text }]}>
        {coreSectionHeading}
      </Text>
      {overallProgress ? (
        <BudgetProgressCard
          progress={overallProgress}
          currencyCode={activeCurrencyCode}
          currencies={currencies}
          dateFormat={settings.dateFormat}
          onEdit={openOverallModal}
          onDelete={() => setDeleteTarget(overallProgress.budget)}
        />
      ) : (
        <EmptyState
          icon="pie-chart-outline"
          title={
            period === 'biweekly'
              ? 'No paycheck budget yet'
              : period === 'yearly'
                ? 'No annual budget yet'
                : 'No overall monthly budget'
          }
          description={
            period === 'biweekly'
              ? `Create a 14-day paycheck budget (${activeCurrencyCode}) anchored to your payday.`
              : period === 'yearly'
                ? `Plan annual expenses or sinking funds (${activeCurrencyCode}) like insurance or maintenance.`
                : `Set an overall spending limit for ${getMonthLabel(year, month)} (${activeCurrencyCode}) without affecting existing transactions.`
          }
          actionLabel={
            period === 'biweekly'
              ? 'Set Paycheck Budget'
              : period === 'yearly'
                ? 'Set Annual Budget'
                : 'Set Overall Budget'
          }
          onAction={openOverallModal}
        />
      )}

      {/* Category Budgets */}
      <View style={styles.sectionHeaderRow}>
        <Text style={[styles.sectionHeading, { color: theme.text }]}>
          Category Budgets
        </Text>
        <AppButton
          label="Add"
          size="sm"
          variant="outline"
          disabled={availableCategoriesForNewBudget.length === 0}
          icon={<Ionicons name="add" size={16} color={theme.text} />}
          onPress={() => openCategoryBudgetModal()}
        />
      </View>

      {categoryProgressList.length === 0 ? (
        <EmptyState
          icon="pricetags-outline"
          title="No category budgets"
          description={
            period === 'biweekly'
              ? 'Optionally set 14-day caps for groceries, fuel, or specific categories.'
              : period === 'yearly'
                ? 'Add annual targets for specific categories like Car Maintenance, Travel, or Insurance.'
                : 'Optionally set spending caps for specific expense categories such as Food & Drink or Shopping.'
          }
          actionLabel={
            availableCategoriesForNewBudget.length > 0
              ? 'Add Category Budget'
              : undefined
          }
          onAction={
            availableCategoriesForNewBudget.length > 0
              ? () => openCategoryBudgetModal()
              : undefined
          }
        />
      ) : (
        <View style={styles.list}>
          {categoryProgressList.map((prog) => (
            <BudgetProgressCard
              key={prog.budget.id}
              progress={prog}
              currencyCode={activeCurrencyCode}
              currencies={currencies}
              dateFormat={settings.dateFormat}
              onEdit={() => openCategoryBudgetModal(prog.budget)}
              onDelete={() => setDeleteTarget(prog.budget)}
            />
          ))}
        </View>
      )}

      {/* Budget Statistics Card */}
      <AppCard>
        <Text style={[styles.sectionHeading, { color: theme.text }]}>
          Budget Statistics
        </Text>

        {!overviewStats.hasExpenseData ? (
          <Text style={[styles.emptyStatsText, { color: theme.textSecondary }]}>
            No {activeCurrencyCode} expenses recorded in this period yet. Add expenses to see daily average spending, top category, and spending trends.
          </Text>
        ) : (
          <>
            <View style={styles.statsRow}>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
                Daily average spending
              </Text>
              <Text style={[styles.statVal, { color: theme.text }]}>
                {formatMoney(overviewStats.dailyAverageSpentMinor, activeCurrencyCode, {
                  catalog: currencies,
                })}
                /day
              </Text>
            </View>

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            <View style={styles.statsRow}>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
                Highest spending category
              </Text>
              {overviewStats.highestSpendingCategory ? (
                <View style={styles.topCatWrap}>
                  <CategoryIcon
                    icon={overviewStats.highestSpendingCategory.icon}
                    color={overviewStats.highestSpendingCategory.color}
                    imageUri={highestCatRecord?.imageUri}
                    size={22}
                  />
                  <Text
                    style={[styles.statVal, { color: theme.text }]}
                    numberOfLines={1}>
                    {overviewStats.highestSpendingCategory.categoryName} (
                    {formatMoney(
                      overviewStats.highestSpendingCategory.totalMinor,
                      activeCurrencyCode,
                      { catalog: currencies },
                    )}
                    )
                  </Text>
                </View>
              ) : (
                <Text style={[styles.statVal, { color: theme.textMuted }]}>—</Text>
              )}
            </View>

            {overviewStats.hasAnyBudget ? (
              <>
                <View style={[styles.divider, { backgroundColor: theme.border }]} />
                <View style={styles.statsRow}>
                  <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
                    Budget status
                  </Text>
                  <Text style={[styles.statVal, { color: statusMeta.color }]}>
                    {statusMeta.label} ({overviewStats.percentageUsed.toFixed(1)}%)
                  </Text>
                </View>
              </>
            ) : null}

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            <DynamicSpendingTrendChart
              trend={overviewStats.spendingTrend}
              currencyCode={activeCurrencyCode}
              catalog={currencies}
            />
          </>
        )}
      </AppCard>

      {/* Budget Upsert Sheet (BottomSheetModal ensures backdrop fades while sheet slides) */}
      <BottomSheetModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        keyboardAvoiding>
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: theme.text }]}>
            {editingScope === 'overall'
              ? period === 'biweekly'
                ? 'Paycheck Overall Budget'
                : period === 'yearly'
                  ? `Annual Budget (${year})`
                  : `Overall Budget (${getMonthLabel(year, month)})`
              : period === 'biweekly'
                ? 'Paycheck Category Budget'
                : period === 'yearly'
                  ? `Annual Category Budget (${year})`
                  : `Category Budget (${getMonthLabel(year, month)})`}
          </Text>
          <Pressable
            onPress={() => setModalVisible(false)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close budget sheet">
            <Ionicons name="close" size={22} color={theme.textSecondary} />
          </Pressable>
        </View>

        {editingScope === 'category' ? (
          editingBudget && selectedCategoryId ? (
            <View style={styles.editingCategoryRow}>
              <CategoryIcon
                icon={categoryMap.get(selectedCategoryId)?.icon ?? 'tag'}
                color={categoryMap.get(selectedCategoryId)?.color ?? theme.primary}
                imageUri={categoryMap.get(selectedCategoryId)?.imageUri}
                size={28}
              />
              <Text style={[styles.editingCategoryLabel, { color: theme.textSecondary }]}>
                {categoryMap.get(selectedCategoryId)?.name ?? 'Selected Category'}
              </Text>
            </View>
          ) : (
            <ScrollView
              style={styles.catScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              <View style={styles.catChips}>
                {expenseCategories.map((cat) => {
                  const isCurrentEdit = selectedCategoryId === cat.id;
                  const alreadyHasBudget = categoryBudgets.some(
                    (b) => b.categoryId === cat.id,
                  );
                  const disabled = alreadyHasBudget && !isCurrentEdit;
                  return (
                    <Pressable
                      key={cat.id}
                      disabled={disabled}
                      onPress={() => setSelectedCategoryId(cat.id)}
                      style={[
                        styles.catChip,
                        {
                          backgroundColor: isCurrentEdit
                            ? theme.primarySoft
                            : theme.surfaceElevated,
                          borderColor: isCurrentEdit ? theme.primary : theme.border,
                          opacity: disabled ? 0.45 : 1,
                        },
                      ]}>
                      <Text
                        style={[
                          styles.catChipText,
                          { color: isCurrentEdit ? theme.primary : theme.text },
                        ]}>
                        {cat.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          )
        ) : null}

        {period === 'biweekly' ? (
          <DatePickerField
            label="Cycle Start Date (14-day anchor)"
            value={startDateInput}
            dateFormat={settings.dateFormat}
            onChange={setStartDateInput}
          />
        ) : null}

        <AppInput
          label={periodLimitInputLabel}
          prefix={currency.symbol}
          value={amountInput}
          onChangeText={(text) => {
            setAmountInput(text);
            if (formError) setFormError(null);
          }}
          keyboardType={currency.minorUnits === 0 ? 'number-pad' : 'decimal-pad'}
          placeholder={currency.minorUnits === 0 ? '0' : '0.00'}
          error={formError}
        />

        {period === 'yearly' && previewYearlyMonthlySetAside !== null ? (
          <View
            style={[
              styles.yearlyNoteBox,
              { backgroundColor: theme.surfaceElevated, borderColor: theme.border },
            ]}>
            <Ionicons name="sparkles-outline" size={16} color={theme.primary} />
            <Text style={[styles.yearlyNoteText, { color: theme.textSecondary }]}>
              Set aside per month:{' '}
              <Text style={[styles.yearlyNoteAmount, { color: theme.text }]}>
                {formatMoney(previewYearlyMonthlySetAside, activeCurrencyCode, {
                  catalog: currencies,
                })}
                /mo
              </Text>
            </Text>
          </View>
        ) : null}

        <View style={styles.modalActions}>
          <View style={styles.flex1}>
            <AppButton
              label="Cancel"
              variant="outline"
              onPress={() => setModalVisible(false)}
              disabled={saving}
              fullWidth
            />
          </View>
          <View style={styles.flex1}>
            <AppButton
              label="Save Budget"
              onPress={() => void handleSaveBudget()}
              loading={saving}
              fullWidth
            />
          </View>
        </View>
      </BottomSheetModal>

      <ConfirmDialog
        visible={Boolean(deleteTarget)}
        title="Delete Budget?"
        message="Remove this budget limit? Your recorded transactions will not be affected."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        loading={deleting}
        onConfirm={() => void handleDeleteBudget()}
        onCancel={() => setDeleteTarget(null)}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  currencyRow: {
    gap: Spacing.two,
    paddingVertical: 2,
  },
  currencyChip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  currencyChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  monthRow: {
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
  periodCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  monthTitle: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  periodSub: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  overviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  overviewTitleWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  overviewPct: {
    fontSize: 12,
    fontWeight: '700',
  },
  statusPill: {
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  track: {
    height: 8,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: Radius.full,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Spacing.one,
  },
  metricTile: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 4,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  metricVal: {
    fontSize: 15,
    fontWeight: '700',
  },
  metricDivider: {
    width: 1,
    height: 32,
  },
  yearlyNoteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.two,
  },
  yearlyNoteText: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  yearlyNoteAmount: {
    fontWeight: '700',
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  list: {
    gap: Spacing.two,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  statVal: {
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'right',
  },
  topCatWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    flexShrink: 1,
  },
  divider: {
    height: 1,
    width: '100%',
  },
  emptyStatsText: {
    fontSize: 13,
    lineHeight: 19,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
  },
  editingCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  editingCategoryLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  catScroll: {
    maxHeight: 200,
  },
  catChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  catChip: {
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  catChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  flex1: {
    flex: 1,
  },
  errorBanner: {
    fontSize: 13,
    fontWeight: '600',
  },
});
