import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  AppButton,
  AppScreen,
  EmptyState,
  SegmentedControl,
  type SegmentOption,
} from '@/components/common';
import { DatePickerField } from '@/components/forms/DatePickerField';
import { TransactionRowItem } from '@/components/transactions/TransactionRowItem';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getDistinctTransactionCurrencies } from '@/services/calculations/financialCalculations';
import { useAppStore } from '@/store/app-store';
import type { Transaction, TransactionType } from '@/types/models';
import {
  addDaysToISODate,
  formatRelativeDateLabel,
  getMonthRange,
  getTodayISODate,
} from '@/utils/date';
import { formatMoney } from '@/utils/money';

type TypeFilter = 'all' | TransactionType;
type DatePreset = 'all' | 'this_month' | 'last_30' | 'custom';

interface CurrencyDailyNet {
  currencyCode: string;
  netMinor: number;
}

interface TransactionSection {
  title: string;
  date: string;
  dailyNets: CurrencyDailyNet[];
  data: Transaction[];
}

export default function TransactionsScreen() {
  const theme = useTheme();
  const router = useRouter();

  const settings = useAppStore((s) => s.settings);
  const categories = useAppStore((s) => s.categories);
  const tags = useAppStore((s) => s.tags);
  const paymentMethods = useAppStore((s) => s.paymentMethods);
  const currencies = useAppStore((s) => s.currencies);
  const transactions = useAppStore((s) => s.transactions);

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [customStartDate, setCustomStartDate] = useState(
    addDaysToISODate(getTodayISODate(), -30),
  );
  const [customEndDate, setCustomEndDate] = useState(getTodayISODate());
  const [currencyFilter, setCurrencyFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [filterModalVisible, setFilterModalVisible] = useState(false);

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
  const tagMap = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  const distinctCurrencies = useMemo(
    () =>
      getDistinctTransactionCurrencies(
        transactions,
        settings.currencyCode,
        settings.openingBalanceCurrencyCode,
      ),
    [transactions, settings.currencyCode, settings.openingBalanceCurrencyCode],
  );

  const activeFilterCount =
    (datePreset !== 'all' ? 1 : 0) +
    (currencyFilter !== 'all' ? 1 : 0) +
    (categoryFilter !== 'all' ? 1 : 0) +
    (tagFilter !== 'all' ? 1 : 0) +
    (paymentFilter !== 'all' ? 1 : 0);

  const filteredTransactions = useMemo(() => {
    const now = new Date();
    const monthRange = getMonthRange(now.getFullYear(), now.getMonth() + 1);
    const today = getTodayISODate();
    const last30Start = addDaysToISODate(today, -29);
    const term = searchQuery.trim().toLowerCase();

    return transactions.filter((tx) => {
      if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
      if (currencyFilter !== 'all' && tx.currencyCode !== currencyFilter) return false;
      if (categoryFilter !== 'all' && tx.categoryId !== categoryFilter) return false;
      if (tagFilter !== 'all' && !(tx.tagIds ?? []).includes(tagFilter)) return false;

      if (paymentFilter !== 'all') {
        const matchesId = tx.paymentMethodId === paymentFilter;
        const matchesName =
          tx.paymentMethod.toLowerCase() === paymentFilter.toLowerCase();
        if (!matchesId && !matchesName) return false;
      }

      if (datePreset === 'this_month') {
        if (
          tx.transactionDate < monthRange.startDate ||
          tx.transactionDate > monthRange.endDate
        ) {
          return false;
        }
      } else if (datePreset === 'last_30') {
        if (tx.transactionDate < last30Start || tx.transactionDate > today) {
          return false;
        }
      } else if (datePreset === 'custom') {
        const rangeStart = customStartDate <= customEndDate ? customStartDate : customEndDate;
        const rangeEnd = customStartDate <= customEndDate ? customEndDate : customStartDate;
        if (
          tx.transactionDate < rangeStart ||
          tx.transactionDate > rangeEnd
        ) {
          return false;
        }
      }

      if (term) {
        const catName =
          (tx.categoryId ? categoryMap.get(tx.categoryId)?.name : null) ??
          tx.categoryNameSnapshot;
        const tagNames = (tx.tagIds ?? [])
          .map((id) => tagMap.get(id)?.name ?? '')
          .join(' ');
        const haystack =
          `${tx.title} ${tx.note ?? ''} ${catName} ${tx.paymentMethod} ${tx.currencyCode} ${tagNames}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }

      return true;
    });
  }, [
    transactions,
    typeFilter,
    currencyFilter,
    categoryFilter,
    tagFilter,
    paymentFilter,
    datePreset,
    customStartDate,
    customEndDate,
    searchQuery,
    categoryMap,
    tagMap,
  ]);

  const sections = useMemo<TransactionSection[]>(() => {
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

      const dailyNets: CurrencyDailyNet[] = Array.from(netByCurrency.entries()).map(
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

  const resetFilters = () => {
    setTypeFilter('all');
    setSearchQuery('');
    setDatePreset('all');
    setCurrencyFilter('all');
    setCategoryFilter('all');
    setTagFilter('all');
    setPaymentFilter('all');
  };

  return (
    <AppScreen scrollable={false}>
      {/* Header: Filter icon left, centered Transactions title, Search icon right */}
      <View style={styles.header}>
        <Pressable
          onPress={() => setFilterModalVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Filter transactions"
          style={[
            styles.iconButton,
            {
              backgroundColor:
                activeFilterCount > 0 ? theme.primarySoft : theme.surface,
              borderColor: activeFilterCount > 0 ? theme.primary : theme.border,
            },
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

        <Text style={[styles.headerTitle, { color: theme.text }]}>Transactions</Text>

        <Pressable
          onPress={() => {
            if (searchVisible && searchQuery.length > 0) {
              setSearchQuery('');
            }
            setSearchVisible((v) => !v);
          }}
          accessibilityRole="button"
          accessibilityLabel="Search transactions"
          style={[
            styles.iconButton,
            {
              backgroundColor:
                searchVisible || searchQuery.length > 0
                  ? theme.primarySoft
                  : theme.surface,
              borderColor:
                searchVisible || searchQuery.length > 0 ? theme.primary : theme.border,
            },
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

      {sections.length === 0 ? (
        <View style={styles.emptyWrap}>
          {transactions.length === 0 ? (
            <EmptyState
              icon="receipt-outline"
              title="No transactions yet"
              description="Tap the green + button below to add your first income or expense."
            />
          ) : (
            <EmptyState
              icon="search-outline"
              title="No matching transactions"
              description="Try clearing your search or adjusting filters."
              actionLabel="Reset Filters"
              onAction={resetFilters}
            />
          )}
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
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
          renderItem={({ item }) => (
            <TransactionRowItem
              transaction={item}
              category={item.categoryId ? categoryMap.get(item.categoryId) : undefined}
              catalog={currencies}
              onPress={() => router.push(`/transactions/${item.id}`)}
            />
          )}
        />
      )}

      {/* Filter Modal */}
      <Modal
        visible={filterModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFilterModalVisible(false)}>
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setFilterModalVisible(false)}>
          <Pressable
            style={[
              styles.modalSheet,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
            onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              Filter Transactions
            </Text>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              {/* Date Range */}
              <View style={styles.filterSection}>
                <Text style={[styles.filterLabel, { color: theme.text }]}>
                  Date Range
                </Text>
                <View style={styles.chipWrap}>
                  {(
                    [
                      ['all', 'All Dates'],
                      ['this_month', 'This Month'],
                      ['last_30', 'Last 30 Days'],
                      ['custom', 'Custom'],
                    ] as const
                  ).map(([val, label]) => {
                    const selected = datePreset === val;
                    return (
                      <Pressable
                        key={val}
                        onPress={() => setDatePreset(val)}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: selected
                              ? theme.primarySoft
                              : theme.surfaceElevated,
                            borderColor: selected ? theme.primary : theme.border,
                          },
                        ]}>
                        <Text
                          style={[
                            styles.chipText,
                            { color: selected ? theme.primary : theme.text },
                          ]}>
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {datePreset === 'custom' ? (
                  <View style={styles.customDates}>
                    <DatePickerField
                      label="Start Date"
                      value={customStartDate}
                      dateFormat={settings.dateFormat}
                      onChange={setCustomStartDate}
                    />
                    <DatePickerField
                      label="End Date"
                      value={customEndDate}
                      dateFormat={settings.dateFormat}
                      onChange={setCustomEndDate}
                    />
                  </View>
                ) : null}
              </View>

              {/* Currency */}
              {distinctCurrencies.length > 1 ? (
                <View style={styles.filterSection}>
                  <Text style={[styles.filterLabel, { color: theme.text }]}>
                    Currency
                  </Text>
                  <View style={styles.chipWrap}>
                    {(['all', ...distinctCurrencies] as const).map((code) => {
                      const selected = currencyFilter === code;
                      return (
                        <Pressable
                          key={code}
                          onPress={() => setCurrencyFilter(code)}
                          style={[
                            styles.chip,
                            {
                              backgroundColor: selected
                                ? theme.primarySoft
                                : theme.surfaceElevated,
                              borderColor: selected ? theme.primary : theme.border,
                            },
                          ]}>
                          <Text
                            style={[
                              styles.chipText,
                              { color: selected ? theme.primary : theme.text },
                            ]}>
                            {code === 'all' ? 'All Currencies' : code}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              {/* Payment Method */}
              <View style={styles.filterSection}>
                <Text style={[styles.filterLabel, { color: theme.text }]}>
                  Payment Method
                </Text>
                <View style={styles.chipWrap}>
                  <Pressable
                    onPress={() => setPaymentFilter('all')}
                    style={[
                      styles.chip,
                      {
                        backgroundColor:
                          paymentFilter === 'all'
                            ? theme.primarySoft
                            : theme.surfaceElevated,
                        borderColor:
                          paymentFilter === 'all' ? theme.primary : theme.border,
                      },
                    ]}>
                    <Text
                      style={[
                        styles.chipText,
                        { color: paymentFilter === 'all' ? theme.primary : theme.text },
                      ]}>
                      All Methods
                    </Text>
                  </Pressable>
                  {paymentMethods.map((pm) => {
                    const selected = paymentFilter === pm.id;
                    return (
                      <Pressable
                        key={pm.id}
                        onPress={() => setPaymentFilter(pm.id)}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: selected
                              ? theme.primarySoft
                              : theme.surfaceElevated,
                            borderColor: selected ? theme.primary : theme.border,
                          },
                        ]}>
                        <Text
                          style={[
                            styles.chipText,
                            { color: selected ? theme.primary : theme.text },
                          ]}>
                          {pm.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Tags */}
              {tags.length > 0 ? (
                <View style={styles.filterSection}>
                  <Text style={[styles.filterLabel, { color: theme.text }]}>
                    Tag
                  </Text>
                  <View style={styles.chipWrap}>
                    <Pressable
                      onPress={() => setTagFilter('all')}
                      style={[
                        styles.chip,
                        {
                          backgroundColor:
                            tagFilter === 'all'
                              ? theme.primarySoft
                              : theme.surfaceElevated,
                          borderColor: tagFilter === 'all' ? theme.primary : theme.border,
                        },
                      ]}>
                      <Text
                        style={[
                          styles.chipText,
                          { color: tagFilter === 'all' ? theme.primary : theme.text },
                        ]}>
                        All Tags
                      </Text>
                    </Pressable>
                    {tags.map((tag) => {
                      const selected = tagFilter === tag.id;
                      return (
                        <Pressable
                          key={tag.id}
                          onPress={() => setTagFilter(tag.id)}
                          style={[
                            styles.chip,
                            {
                              backgroundColor: selected
                                ? theme.primarySoft
                                : theme.surfaceElevated,
                              borderColor: selected ? theme.primary : theme.border,
                            },
                          ]}>
                          <Text
                            style={[
                              styles.chipText,
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

              {/* Category */}
              <View style={styles.filterSection}>
                <Text style={[styles.filterLabel, { color: theme.text }]}>
                  Category
                </Text>
                <View style={styles.chipWrap}>
                  <Pressable
                    onPress={() => setCategoryFilter('all')}
                    style={[
                      styles.chip,
                      {
                        backgroundColor:
                          categoryFilter === 'all'
                            ? theme.primarySoft
                            : theme.surfaceElevated,
                        borderColor:
                          categoryFilter === 'all' ? theme.primary : theme.border,
                      },
                    ]}>
                    <Text
                      style={[
                        styles.chipText,
                        {
                          color:
                            categoryFilter === 'all' ? theme.primary : theme.text,
                        },
                      ]}>
                      All Categories
                    </Text>
                  </Pressable>

                  {categories.map((cat) => {
                    const selected = categoryFilter === cat.id;
                    return (
                      <Pressable
                        key={cat.id}
                        onPress={() => setCategoryFilter(cat.id)}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: selected
                              ? theme.primarySoft
                              : theme.surfaceElevated,
                            borderColor: selected ? theme.primary : theme.border,
                          },
                        ]}>
                        <Text
                          style={[
                            styles.chipText,
                            { color: selected ? theme.primary : theme.text },
                          ]}>
                          {cat.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <View style={styles.flex1}>
                <AppButton
                  label="Reset"
                  variant="outline"
                  onPress={() => {
                    resetFilters();
                    setFilterModalVisible(false);
                  }}
                  fullWidth
                />
              </View>
              <View style={styles.flex1}>
                <AppButton
                  label="Apply"
                  onPress={() => setFilterModalVisible(false)}
                  fullWidth
                />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
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
  emptyWrap: {
    paddingTop: Spacing.three,
  },
  listContent: {
    paddingBottom: Spacing.five,
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.three,
    maxHeight: '84%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalScroll: {
    maxHeight: 430,
  },
  filterSection: {
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  customDates: {
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  flex1: {
    flex: 1,
  },
});
