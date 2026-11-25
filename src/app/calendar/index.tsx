import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  AppButton,
  AppCard,
  AppHeader,
  AppScreen,
  EmptyState,
} from '@/components/common';
import { TransactionRowItem } from '@/components/transactions/TransactionRowItem';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';
import type { Transaction } from '@/types/models';
import {
  formatDateForDisplay,
  getDaysInMonth,
  getMonthLabel,
  getTodayISODate,
  parseISODateParts,
  toISODate,
} from '@/utils/date';
import { formatMoney } from '@/utils/money';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

interface CurrencyDayTotals {
  currencyCode: string;
  incomeMinor: number;
  expenseMinor: number;
  netMinor: number;
}

interface DayEntry {
  hasIncome: boolean;
  hasExpense: boolean;
  byCurrency: Map<string, CurrencyDayTotals>;
  transactions: Transaction[];
}

export default function CalendarScreen() {
  const theme = useTheme();
  const router = useRouter();

  const settings = useAppStore((s) => s.settings);
  const categories = useAppStore((s) => s.categories);
  const currencies = useAppStore((s) => s.currencies);
  const transactions = useAppStore((s) => s.transactions);

  const todayISO = getTodayISODate();
  const todayParts = parseISODateParts(todayISO);

  const [viewYear, setViewYear] = useState(todayParts.year);
  const [viewMonth, setViewMonth] = useState(todayParts.month);
  const [selectedDate, setSelectedDate] = useState(todayISO);

  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const dayMap = useMemo(() => {
    const map = new Map<string, DayEntry>();
    for (const tx of transactions) {
      let entry = map.get(tx.transactionDate);
      if (!entry) {
        entry = {
          hasIncome: false,
          hasExpense: false,
          byCurrency: new Map<string, CurrencyDayTotals>(),
          transactions: [],
        };
        map.set(tx.transactionDate, entry);
      }

      const currEntry = entry.byCurrency.get(tx.currencyCode) ?? {
        currencyCode: tx.currencyCode,
        incomeMinor: 0,
        expenseMinor: 0,
        netMinor: 0,
      };

      if (tx.type === 'income') {
        entry.hasIncome = true;
        currEntry.incomeMinor += tx.amountMinor;
        currEntry.netMinor += tx.amountMinor;
      } else {
        entry.hasExpense = true;
        currEntry.expenseMinor += tx.amountMinor;
        currEntry.netMinor -= tx.amountMinor;
      }

      entry.byCurrency.set(tx.currencyCode, currEntry);
      entry.transactions.push(tx);
    }
    return map;
  }, [transactions]);

  const stepMonth = (delta: number) => {
    let nextMonth = viewMonth + delta;
    let nextYear = viewYear;
    if (nextMonth < 1) {
      nextMonth = 12;
      nextYear -= 1;
    } else if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    setViewMonth(nextMonth);
    setViewYear(nextYear);
  };

  const jumpToToday = () => {
    setViewYear(todayParts.year);
    setViewMonth(todayParts.month);
    setSelectedDate(todayISO);
  };

  const firstWeekday = new Date(viewYear, viewMonth - 1, 1).getDay();
  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  const selectedDayData = dayMap.get(selectedDate);
  const selectedCurrencyTotals = selectedDayData
    ? Array.from(selectedDayData.byCurrency.values())
    : [
        {
          currencyCode: settings.currencyCode,
          incomeMinor: 0,
          expenseMinor: 0,
          netMinor: 0,
        },
      ];

  return (
    <AppScreen edges={['top', 'bottom', 'left', 'right']}>
      <AppHeader
        title="Calendar"
        subtitle="Date-wise activity"
        showBack
        rightAction={
          <AppButton label="Today" variant="outline" size="sm" onPress={jumpToToday} />
        }
      />

      <AppCard>
        <View style={styles.monthHeader}>
          <Pressable
            onPress={() => stepMonth(-1)}
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            style={[styles.navBtn, { borderColor: theme.border }]}>
            <Ionicons name="chevron-back" size={18} color={theme.text} />
          </Pressable>

          <Text style={[styles.monthTitle, { color: theme.text }]}>
            {getMonthLabel(viewYear, viewMonth)}
          </Text>

          <Pressable
            onPress={() => stepMonth(1)}
            accessibilityRole="button"
            accessibilityLabel="Next month"
            style={[styles.navBtn, { borderColor: theme.border }]}>
            <Ionicons name="chevron-forward" size={18} color={theme.text} />
          </Pressable>
        </View>

        <View style={styles.weekRow}>
          {WEEKDAYS.map((day) => (
            <Text key={day} style={[styles.weekdayText, { color: theme.textMuted }]}>
              {day}
            </Text>
          ))}
        </View>

        <View style={styles.grid}>
          {cells.map((day, idx) => {
            if (day === null) {
              return <View key={`empty-${idx}`} style={styles.dayCell} />;
            }

            const cellISO = toISODate(viewYear, viewMonth, day);
            const info = dayMap.get(cellISO);
            const isSelected = cellISO === selectedDate;
            const isToday = cellISO === todayISO;

            return (
              <Pressable
                key={cellISO}
                onPress={() => setSelectedDate(cellISO)}
                style={[
                  styles.dayCell,
                  isSelected && { backgroundColor: theme.primary },
                  !isSelected &&
                    isToday && {
                      borderWidth: 1,
                      borderColor: theme.primary,
                    },
                ]}>
                <Text
                  style={[
                    styles.dayNumber,
                    {
                      color: isSelected ? theme.primaryText : theme.text,
                      fontWeight: isSelected || isToday ? '700' : '500',
                    },
                  ]}>
                  {day}
                </Text>

                <View style={styles.dotRow}>
                  {info?.hasIncome ? (
                    <View
                      style={[
                        styles.dot,
                        {
                          backgroundColor: isSelected
                            ? theme.primaryText
                            : theme.income,
                        },
                      ]}
                    />
                  ) : null}
                  {info?.hasExpense ? (
                    <View
                      style={[
                        styles.dot,
                        {
                          backgroundColor: isSelected
                            ? theme.primaryText
                            : theme.expense,
                        },
                      ]}
                    />
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </AppCard>

      <AppCard>
        <View style={styles.selectedHeader}>
          <View>
            <Text style={[styles.selectedDateTitle, { color: theme.text }]}>
              {formatDateForDisplay(selectedDate, settings.dateFormat)}
            </Text>
            <Text style={[styles.selectedCount, { color: theme.textSecondary }]}>
              {selectedDayData?.transactions.length ?? 0} transaction
              {selectedDayData?.transactions.length === 1 ? '' : 's'}
            </Text>
          </View>
          <AppButton
            label="Add"
            size="sm"
            icon={<Ionicons name="add" size={16} color={theme.primaryText} />}
            onPress={() => router.push(`/transactions/add?date=${selectedDate}`)}
          />
        </View>

        {selectedCurrencyTotals.map((ct) => (
          <View key={ct.currencyCode} style={styles.currencyGroup}>
            {selectedCurrencyTotals.length > 1 ? (
              <Text style={[styles.currencySubLabel, { color: theme.textMuted }]}>
                {ct.currencyCode}
              </Text>
            ) : null}
            <View style={styles.totalsRow}>
              <View style={[styles.totalTile, { backgroundColor: theme.incomeSoft }]}>
                <Text style={[styles.totalLabel, { color: theme.income }]}>Income</Text>
                <Text
                  style={[styles.totalValue, { color: theme.income }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit>
                  {formatMoney(ct.incomeMinor, ct.currencyCode, { catalog: currencies })}
                </Text>
              </View>
              <View style={[styles.totalTile, { backgroundColor: theme.expenseSoft }]}>
                <Text style={[styles.totalLabel, { color: theme.expense }]}>Expense</Text>
                <Text
                  style={[styles.totalValue, { color: theme.expense }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit>
                  {formatMoney(ct.expenseMinor, ct.currencyCode, { catalog: currencies })}
                </Text>
              </View>
              <View
                style={[styles.totalTile, { backgroundColor: theme.surfaceElevated }]}>
                <Text style={[styles.totalLabel, { color: theme.textSecondary }]}>
                  Net
                </Text>
                <Text
                  style={[
                    styles.totalValue,
                    { color: ct.netMinor >= 0 ? theme.income : theme.expense },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit>
                  {formatMoney(ct.netMinor, ct.currencyCode, {
                    showSign: true,
                    catalog: currencies,
                  })}
                </Text>
              </View>
            </View>
          </View>
        ))}
      </AppCard>

      {!selectedDayData || selectedDayData.transactions.length === 0 ? (
        <EmptyState
          icon="calendar-outline"
          title="No transactions on this date"
          description="Select another highlighted date or add a transaction for this day."
          actionLabel="Add Transaction"
          onAction={() => router.push(`/transactions/add?date=${selectedDate}`)}
        />
      ) : (
        <View style={styles.txList}>
          {selectedDayData.transactions.map((tx) => (
            <TransactionRowItem
              key={tx.id}
              transaction={tx}
              category={tx.categoryId ? categoryMap.get(tx.categoryId) : undefined}
              catalog={currencies}
              onPress={() => router.push(`/transactions/${tx.id}`)}
            />
          ))}
        </View>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: Radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  weekRow: {
    flexDirection: 'row',
    marginTop: Spacing.one,
  },
  weekdayText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.285%',
    aspectRatio: 1,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  dayNumber: {
    fontSize: 14,
  },
  dotRow: {
    flexDirection: 'row',
    gap: 3,
    height: 6,
    alignItems: 'center',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  selectedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectedDateTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  selectedCount: {
    fontSize: 12,
  },
  currencyGroup: {
    gap: 4,
    marginTop: Spacing.one,
  },
  currencySubLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  totalsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  totalTile: {
    flex: 1,
    borderRadius: Radius.md,
    padding: Spacing.two + 2,
    gap: 2,
  },
  totalLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  totalValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  txList: {
    gap: Spacing.two,
  },
});
