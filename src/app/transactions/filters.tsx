import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton, AppHeader } from '@/components/common';
import { DateRangePicker } from '@/components/forms/DateRangePicker';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getDistinctTransactionCurrencies } from '@/services/calculations/financialCalculations';
import { createDefaultTransactionFilters, useAppStore } from '@/store/app-store';
import type {
  DateFilterPreset,
  TransactionFilterState,
  TransactionSortBy,
} from '@/types/reports';
import { normalizeDateRange } from '@/utils/date';

const DATE_PRESETS: readonly { value: DateFilterPreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7', label: 'Last 7 Days' },
  { value: 'last_30', label: 'Last 30 Days' },
  { value: 'this_month', label: 'This Month' },
  { value: 'this_year', label: 'This Year' },
  { value: 'all_time', label: 'All Time' },
  { value: 'custom', label: 'Custom' },
];

const SORT_OPTIONS: readonly { value: TransactionSortBy; label: string }[] = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'highest_amount', label: 'Highest Amount' },
  { value: 'lowest_amount', label: 'Lowest Amount' },
];

const COLLAPSED_CATEGORY_LIMIT = 6;

export default function TransactionFiltersScreen() {
  const theme = useTheme();
  const router = useRouter();

  const settings = useAppStore((s) => s.settings);
  const transactions = useAppStore((s) => s.transactions);
  const categories = useAppStore((s) => s.categories);
  const paymentMethods = useAppStore((s) => s.paymentMethods);
  const tags = useAppStore((s) => s.tags);
  const storedFilters = useAppStore((s) => s.transactionFilters);
  const setTransactionFilters = useAppStore((s) => s.setTransactionFilters);

  const [draft, setDraft] = useState<TransactionFilterState>(() => ({
    ...storedFilters,
    selectedYears: [],
    categoryIds: [...storedFilters.categoryIds],
    paymentMethodIds: [...storedFilters.paymentMethodIds],
    tagIds: [...storedFilters.tagIds],
  }));

  const [categoriesExpanded, setCategoriesExpanded] = useState(false);
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [rangeAdjustedNotice, setRangeAdjustedNotice] = useState(false);

  const distinctCurrencies = useMemo(
    () =>
      getDistinctTransactionCurrencies(
        transactions,
        settings.currencyCode,
        settings.openingBalanceCurrencyCode,
      ),
    [transactions, settings.currencyCode, settings.openingBalanceCurrencyCode],
  );

  const orderedCategories = useMemo(
    () =>
      [...categories].sort((a, b) => {
        if (a.isArchived !== b.isArchived) return a.isArchived ? 1 : -1;
        return a.name.localeCompare(b.name);
      }),
    [categories],
  );

  const visibleCategories = useMemo(() => {
    if (categoriesExpanded) {
      return orderedCategories;
    }
    const base = orderedCategories.slice(0, COLLAPSED_CATEGORY_LIMIT);
    if (draft.categoryIds.length > 0) {
      const baseIds = new Set(base.map((c) => c.id));
      for (const cat of orderedCategories) {
        if (draft.categoryIds.includes(cat.id) && !baseIds.has(cat.id)) {
          base.push(cat);
        }
      }
    }
    return base;
  }, [orderedCategories, categoriesExpanded, draft.categoryIds]);

  const activeTags = useMemo(
    () => tags.filter((t) => !t.isArchived),
    [tags],
  );

  const toggleCategory = (id: string) => {
    setDraft((prev) => {
      const exists = prev.categoryIds.includes(id);
      const next = exists
        ? prev.categoryIds.filter((c) => c !== id)
        : [...prev.categoryIds, id];
      return { ...prev, categoryIds: next };
    });
  };

  const togglePaymentMethod = (id: string) => {
    setDraft((prev) => {
      const exists = prev.paymentMethodIds.includes(id);
      const next = exists
        ? prev.paymentMethodIds.filter((p) => p !== id)
        : [...prev.paymentMethodIds, id];
      return { ...prev, paymentMethodIds: next };
    });
  };

  const toggleTag = (id: string) => {
    setDraft((prev) => {
      const exists = prev.tagIds.includes(id);
      const next = exists ? prev.tagIds.filter((t) => t !== id) : [...prev.tagIds, id];
      return { ...prev, tagIds: next };
    });
  };

  const handleReset = () => {
    const defaults = createDefaultTransactionFilters();
    setDraft(defaults);
    setCategoriesExpanded(false);
    setSortDropdownOpen(false);
    setRangeAdjustedNotice(false);
  };

  const handleApply = () => {
    const normalized = normalizeDateRange(draft.customStartDate, draft.customEndDate);
    setTransactionFilters({
      ...draft,
      selectedYears: [],
      customStartDate: normalized.startDate,
      customEndDate: normalized.endDate,
    });
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/transactions');
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/transactions');
    }
  };

  const selectedSortLabel =
    SORT_OPTIONS.find((o) => o.value === draft.sortBy)?.label ?? 'Newest First';

  return (
    <SafeAreaView
      edges={['top', 'bottom', 'left', 'right']}
      style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <View style={[styles.headerWrap, { borderBottomColor: theme.border }]}>
        <AppHeader title="Filters" showBack onBackPress={handleBack} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalChipRow}>
          {DATE_PRESETS.map((preset) => {
            const selected = draft.datePreset === preset.value;
            return (
              <Pressable
                key={preset.value}
                onPress={() =>
                  setDraft((prev) => ({ ...prev, datePreset: preset.value }))
                }
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={[
                  styles.pillChip,
                  {
                    backgroundColor: selected ? theme.primary : theme.surface,
                    borderColor: selected ? theme.primary : theme.border,
                  },
                ]}>
                <Text
                  style={[
                    styles.pillChipText,
                    { color: selected ? theme.primaryText : theme.text },
                  ]}>
                  {preset.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {draft.datePreset === 'custom' ? (
          <View
            style={[
              styles.sectionCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Custom Date Range
            </Text>
            <DateRangePicker
              startDate={draft.customStartDate}
              endDate={draft.customEndDate}
              dateFormat={settings.dateFormat}
              onChange={({ startDate, endDate, wasReversed }) => {
                setRangeAdjustedNotice(wasReversed);
                setDraft((prev) => ({
                  ...prev,
                  customStartDate: startDate,
                  customEndDate: endDate,
                }));
              }}
            />
            {rangeAdjustedNotice ? (
              <Text style={[styles.helperText, { color: theme.textSecondary }]}>
                Start and end dates were ordered automatically so the range remains valid.
              </Text>
            ) : null}
          </View>
        ) : null}

        <View
          style={[
            styles.sectionCard,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Categories</Text>
            {orderedCategories.length > COLLAPSED_CATEGORY_LIMIT ? (
              <Pressable
                onPress={() => setCategoriesExpanded((v) => !v)}
                hitSlop={8}
                accessibilityRole="button">
                <Text style={[styles.toggleActionText, { color: theme.primary }]}>
                  {categoriesExpanded ? 'Show Less' : 'Expand'}
                </Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.wrapChips}>
            <Pressable
              onPress={() => setDraft((prev) => ({ ...prev, categoryIds: [] }))}
              style={[
                styles.pillChip,
                {
                  backgroundColor:
                    draft.categoryIds.length === 0
                      ? theme.primary
                      : theme.surfaceElevated,
                  borderColor:
                    draft.categoryIds.length === 0 ? theme.primary : theme.border,
                },
              ]}>
              <Text
                style={[
                  styles.pillChipText,
                  {
                    color:
                      draft.categoryIds.length === 0 ? theme.primaryText : theme.text,
                  },
                ]}>
                All Categories
              </Text>
            </Pressable>

            {visibleCategories.map((cat) => {
              const selected = draft.categoryIds.includes(cat.id);
              return (
                <Pressable
                  key={cat.id}
                  onPress={() => toggleCategory(cat.id)}
                  style={[
                    styles.pillChip,
                    {
                      backgroundColor: selected
                        ? theme.primarySoft
                        : theme.surfaceElevated,
                      borderColor: selected ? theme.primary : theme.border,
                    },
                  ]}>
                  <View style={[styles.catDot, { backgroundColor: cat.color }]} />
                  <Text
                    style={[
                      styles.pillChipText,
                      { color: selected ? theme.primary : theme.text },
                    ]}>
                    {cat.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View
          style={[
            styles.sectionCard,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Sort By</Text>
          <Pressable
            onPress={() => setSortDropdownOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={`Sort by ${selectedSortLabel}`}
            style={[
              styles.dropdownTrigger,
              {
                backgroundColor: theme.surfaceElevated,
                borderColor: sortDropdownOpen ? theme.primary : theme.border,
              },
            ]}>
            <Text style={[styles.dropdownValue, { color: theme.text }]}>
              {selectedSortLabel}
            </Text>
            <Ionicons
              name={sortDropdownOpen ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={theme.textSecondary}
            />
          </Pressable>

          {sortDropdownOpen ? (
            <View
              style={[
                styles.dropdownList,
                {
                  backgroundColor: theme.surfaceElevated,
                  borderColor: theme.border,
                },
              ]}>
              {SORT_OPTIONS.map((opt, idx) => {
                const selected = draft.sortBy === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => {
                      setDraft((prev) => ({ ...prev, sortBy: opt.value }));
                      setSortDropdownOpen(false);
                    }}
                    style={[
                      styles.dropdownItem,
                      idx > 0 && { borderTopWidth: 1, borderTopColor: theme.border },
                      selected && { backgroundColor: theme.primarySoft },
                    ]}>
                    <Text
                      style={[
                        styles.dropdownItemText,
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
          ) : null}
        </View>

        <View
          style={[
            styles.sectionCard,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Payment Method
          </Text>
          <View style={styles.wrapChips}>
            <Pressable
              onPress={() => setDraft((prev) => ({ ...prev, paymentMethodIds: [] }))}
              style={[
                styles.pillChip,
                {
                  backgroundColor:
                    draft.paymentMethodIds.length === 0
                      ? theme.primary
                      : theme.surfaceElevated,
                  borderColor:
                    draft.paymentMethodIds.length === 0 ? theme.primary : theme.border,
                },
              ]}>
              <Text
                style={[
                  styles.pillChipText,
                  {
                    color:
                      draft.paymentMethodIds.length === 0
                        ? theme.primaryText
                        : theme.text,
                  },
                ]}>
                All Payment Methods
              </Text>
            </Pressable>

            {paymentMethods.map((pm) => {
              const selected = draft.paymentMethodIds.includes(pm.id);
              return (
                <Pressable
                  key={pm.id}
                  onPress={() => togglePaymentMethod(pm.id)}
                  style={[
                    styles.pillChip,
                    {
                      backgroundColor: selected
                        ? theme.primarySoft
                        : theme.surfaceElevated,
                      borderColor: selected ? theme.primary : theme.border,
                    },
                  ]}>
                  <Text
                    style={[
                      styles.pillChipText,
                      { color: selected ? theme.primary : theme.text },
                    ]}>
                    {pm.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {distinctCurrencies.length > 1 ? (
          <View
            style={[
              styles.sectionCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Currency</Text>
            <View style={styles.wrapChips}>
              {(['all', ...distinctCurrencies] as const).map((code) => {
                const selected = draft.currencyCode === code;
                return (
                  <Pressable
                    key={code}
                    onPress={() =>
                      setDraft((prev) => ({ ...prev, currencyCode: code }))
                    }
                    style={[
                      styles.pillChip,
                      {
                        backgroundColor: selected
                          ? theme.primary
                          : theme.surfaceElevated,
                        borderColor: selected ? theme.primary : theme.border,
                      },
                    ]}>
                    <Text
                      style={[
                        styles.pillChipText,
                        { color: selected ? theme.primaryText : theme.text },
                      ]}>
                      {code === 'all' ? 'All Currencies' : code}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {activeTags.length > 0 ? (
          <View
            style={[
              styles.sectionCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Tags</Text>
            <View style={styles.wrapChips}>
              <Pressable
                onPress={() => setDraft((prev) => ({ ...prev, tagIds: [] }))}
                style={[
                  styles.pillChip,
                  {
                    backgroundColor:
                      draft.tagIds.length === 0
                        ? theme.primary
                        : theme.surfaceElevated,
                    borderColor:
                      draft.tagIds.length === 0 ? theme.primary : theme.border,
                  },
                ]}>
                <Text
                  style={[
                    styles.pillChipText,
                    {
                      color:
                        draft.tagIds.length === 0 ? theme.primaryText : theme.text,
                    },
                  ]}>
                  All Tags
                </Text>
              </Pressable>
              {activeTags.map((tag) => {
                const selected = draft.tagIds.includes(tag.id);
                return (
                  <Pressable
                    key={tag.id}
                    onPress={() => toggleTag(tag.id)}
                    style={[
                      styles.pillChip,
                      {
                        backgroundColor: selected
                          ? theme.primarySoft
                          : theme.surfaceElevated,
                        borderColor: selected ? theme.primary : theme.border,
                      },
                    ]}>
                    <Text
                      style={[
                        styles.pillChipText,
                        { color: selected ? theme.primary : theme.text },
                      ]}>
                      #{tag.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.footer,
          { backgroundColor: theme.background, borderTopColor: theme.border },
        ]}>
        <View style={styles.flex1}>
          <AppButton label="Reset" variant="outline" onPress={handleReset} fullWidth />
        </View>
        <View style={styles.flex1}>
          <AppButton label="Apply" onPress={handleApply} fullWidth />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  headerWrap: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderBottomWidth: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.three,
    gap: Spacing.three,
    paddingBottom: Spacing.five,
  },
  horizontalChipRow: {
    gap: Spacing.two,
    paddingVertical: 2,
  },
  sectionCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two + 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  toggleActionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  wrapChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  pillChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.one + 4,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  pillChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  catDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  helperText: {
    fontSize: 12,
  },
  dropdownTrigger: {
    minHeight: 46,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three - 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  dropdownList: {
    borderRadius: Radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.two + 4,
  },
  dropdownItemText: {
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    gap: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 4,
    borderTopWidth: 1,
  },
  flex1: {
    flex: 1,
  },
});
