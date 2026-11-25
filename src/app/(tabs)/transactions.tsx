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
  View,
} from 'react-native';

import {
  AppButton,
  AppHeader,
  AppInput,
  AppScreen,
  ConfirmDialog,
  EmptyState,
  SegmentedControl,
  type SegmentOption,
} from '@/components/common';
import { DatePickerField } from '@/components/forms/DatePickerField';
import { TransactionRowItem } from '@/components/transactions/TransactionRowItem';
import { PAYMENT_METHODS } from '@/constants/categories';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';
import type { PaymentMethod, Transaction, TransactionType } from '@/types/models';
import {
  addDaysToISODate,
  formatDateForDisplay,
  getMonthRange,
  getTodayISODate,
} from '@/utils/date';
import { formatMoney } from '@/utils/money';

type TypeFilter = 'all' | TransactionType;
type DatePreset = 'all' | 'this_month' | 'last_30' | 'custom';

const TYPE_OPTIONS: readonly SegmentOption<TypeFilter>[] = [
  { label: 'All', value: 'all' },
  { label: 'Expense', value: 'expense' },
  { label: 'Income', value: 'income' },
];

interface TransactionSection {
  title: string;
  date: string;
  netMinor: number;
  data: Transaction[];
}

export default function TransactionsScreen() {
  const theme = useTheme();
  const router = useRouter();

  const settings = useAppStore((s) => s.settings);
  const categories = useAppStore((s) => s.categories);
  const transactions = useAppStore((s) => s.transactions);
  const deleteTransaction = useAppStore((s) => s.deleteTransaction);

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [customStartDate, setCustomStartDate] = useState(
    addDaysToISODate(getTodayISODate(), -30),
  );
  const [customEndDate, setCustomEndDate] = useState(getTodayISODate());
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | PaymentMethod>('all');
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  const [txPendingDelete, setTxPendingDelete] = useState<Transaction | null>(null);
  const [deleting, setDeleting] = useState(false);

  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const activeFilterCount =
    (datePreset !== 'all' ? 1 : 0) +
    (categoryFilter !== 'all' ? 1 : 0) +
    (paymentFilter !== 'all' ? 1 : 0);

  const filteredTransactions = useMemo(() => {
    const now = new Date();
    const monthRange = getMonthRange(now.getFullYear(), now.getMonth() + 1);
    const today = getTodayISODate();
    const last30Start = addDaysToISODate(today, -29);
    const term = searchQuery.trim().toLowerCase();

    return transactions.filter((tx) => {
      if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
      if (categoryFilter !== 'all' && tx.categoryId !== categoryFilter) return false;
      if (paymentFilter !== 'all' && tx.paymentMethod !== paymentFilter) return false;

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
        if (
          tx.transactionDate < customStartDate ||
          tx.transactionDate > customEndDate
        ) {
          return false;
        }
      }

      if (term) {
        const catName =
          (tx.categoryId ? categoryMap.get(tx.categoryId)?.name : null) ??
          tx.categoryNameSnapshot;
        const haystack = `${tx.title} ${tx.note ?? ''} ${catName}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }

      return true;
    });
  }, [
    transactions,
    typeFilter,
    categoryFilter,
    paymentFilter,
    datePreset,
    customStartDate,
    customEndDate,
    searchQuery,
    categoryMap,
  ]);

  const sections = useMemo<TransactionSection[]>(() => {
    const groups = new Map<string, Transaction[]>();
    for (const tx of filteredTransactions) {
      const list = groups.get(tx.transactionDate);
      if (list) {
        list.push(tx);
      } else {
        groups.set(tx.transactionDate, [tx]);
      }
    }

    return Array.from(groups.entries()).map(([date, list]) => {
      let netMinor = 0;
      for (const tx of list) {
        netMinor += tx.type === 'income' ? tx.amountMinor : -tx.amountMinor;
      }
      return {
        date,
        title: formatDateForDisplay(date, settings.dateFormat),
        netMinor,
        data: list,
      };
    });
  }, [filteredTransactions, settings.dateFormat]);

  const resetFilters = () => {
    setTypeFilter('all');
    setSearchQuery('');
    setDatePreset('all');
    setCategoryFilter('all');
    setPaymentFilter('all');
  };

  const handleConfirmDelete = async () => {
    if (!txPendingDelete || deleting) return;
    setDeleting(true);
    try {
      await deleteTransaction(txPendingDelete.id);
      setTxPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AppScreen scrollable={false}>
      <AppHeader
        title="Transactions"
        subtitle={`${filteredTransactions.length} shown`}
        rightAction={
          <AppButton
            label="Add"
            size="sm"
            icon={<Ionicons name="add" size={16} color={theme.primaryText} />}
            onPress={() => router.push('/transactions/add')}
          />
        }
      />

      <SegmentedControl
        options={TYPE_OPTIONS}
        value={typeFilter}
        onChange={setTypeFilter}
      />

      <View style={styles.searchRow}>
        <View style={styles.searchWrap}>
          <AppInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search title, category, or note..."
          />
        </View>
        <Pressable
          onPress={() => setFilterModalVisible(true)}
          accessibilityRole="button"
          style={[
            styles.filterButton,
            {
              backgroundColor:
                activeFilterCount > 0 ? theme.primarySoft : theme.surface,
              borderColor: activeFilterCount > 0 ? theme.primary : theme.border,
            },
          ]}>
          <Ionicons
            name="options-outline"
            size={18}
            color={activeFilterCount > 0 ? theme.primary : theme.text}
          />
          {activeFilterCount > 0 ? (
            <Text style={[styles.filterBadgeText, { color: theme.primary }]}>
              {activeFilterCount}
            </Text>
          ) : null}
        </Pressable>
      </View>

      {sections.length === 0 ? (
        <View style={styles.emptyWrap}>
          {transactions.length === 0 ? (
            <EmptyState
              icon="receipt-outline"
              title="No transactions yet"
              description="Add your first income or expense to build your financial history."
              actionLabel="Add Transaction"
              onAction={() => router.push('/transactions/add')}
            />
          ) : (
            <EmptyState
              icon="search-outline"
              title="No matching transactions"
              description="Try clearing your search or adjusting date, category, and payment filters."
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
              <Text
                style={[
                  styles.sectionNet,
                  {
                    color:
                      section.netMinor >= 0 ? theme.income : theme.expense,
                  },
                ]}>
                {formatMoney(section.netMinor, settings.currencyCode, {
                  showSign: true,
                })}
              </Text>
            </View>
          )}
          renderItem={({ item }) => (
            <TransactionRowItem
              transaction={item}
              category={item.categoryId ? categoryMap.get(item.categoryId) : undefined}
              currencyCode={settings.currencyCode}
              dateFormat={settings.dateFormat}
              onPress={() => router.push(`/transactions/${item.id}`)}
              onDeletePress={() => setTxPendingDelete(item)}
            />
          )}
        />
      )}

      {/* Filter Sheet Modal */}
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

              <View style={styles.filterSection}>
                <Text style={[styles.filterLabel, { color: theme.text }]}>
                  Payment Method
                </Text>
                <View style={styles.chipWrap}>
                  {(['all', ...PAYMENT_METHODS] as const).map((method) => {
                    const selected = paymentFilter === method;
                    return (
                      <Pressable
                        key={method}
                        onPress={() => setPaymentFilter(method)}
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
                          {method === 'all' ? 'All Methods' : method}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

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

      <ConfirmDialog
        visible={Boolean(txPendingDelete)}
        title="Delete Transaction?"
        message={
          txPendingDelete
            ? `Delete "${txPendingDelete.title}" (${formatMoney(txPendingDelete.amountMinor, settings.currencyCode)})?`
            : ''
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        loading={deleting}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setTxPendingDelete(null)}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  searchWrap: {
    flex: 1,
  },
  filterButton: {
    height: 46,
    minWidth: 46,
    paddingHorizontal: Spacing.two + 2,
    borderRadius: Radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  filterBadgeText: {
    fontSize: 13,
    fontWeight: '700',
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
  },
  sectionDate: {
    fontSize: 13,
    fontWeight: '700',
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
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.three,
    maxHeight: '82%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalScroll: {
    maxHeight: 420,
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
