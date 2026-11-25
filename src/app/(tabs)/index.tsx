import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BudgetProgressCard } from '@/components/budgets/BudgetProgressCard';
import {
  AppButton,
  AppCard,
  AppHeader,
  AppScreen,
  EmptyState,
} from '@/components/common';
import { CategoryDonutChart } from '@/components/reports/Charts';
import { TransactionRowItem } from '@/components/transactions/TransactionRowItem';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  calculateBudgetProgress,
  calculatePeriodSummary,
  summarizeTransactions,
} from '@/services/calculations/financialCalculations';
import { useAppStore } from '@/store/app-store';
import { getMonthLabel, getMonthRange } from '@/utils/date';
import { formatMoney } from '@/utils/money';

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();

  const settings = useAppStore((s) => s.settings);
  const categories = useAppStore((s) => s.categories);
  const transactions = useAppStore((s) => s.transactions);
  const budgets = useAppStore((s) => s.budgets);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const overallSummary = useMemo(
    () => summarizeTransactions(transactions, settings.openingBalanceMinor),
    [transactions, settings.openingBalanceMinor],
  );

  const monthlySummary = useMemo(() => {
    const { startDate, endDate } = getMonthRange(currentYear, currentMonth);
    return calculatePeriodSummary({
      transactions,
      categories,
      startDate,
      endDate,
    });
  }, [transactions, categories, currentYear, currentMonth]);

  const overallMonthlyBudget = budgets.find(
    (b) => b.year === currentYear && b.month === currentMonth && b.categoryId === null,
  );

  const monthlyBudgetProgress = useMemo(() => {
    if (!overallMonthlyBudget) return null;
    return calculateBudgetProgress({
      budget: overallMonthlyBudget,
      transactions,
      category: null,
    });
  }, [overallMonthlyBudget, transactions]);

  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const recentTransactions = transactions.slice(0, 5);

  return (
    <AppScreen>
      <AppHeader
        title="BinRo Finance"
        subtitle={getMonthLabel(currentYear, currentMonth)}
        rightAction={
          <AppButton
            label="Calendar"
            variant="outline"
            size="sm"
            icon={<Ionicons name="calendar-outline" size={16} color={theme.text} />}
            onPress={() => router.push('/calendar')}
          />
        }
      />

      {/* Balance & Monthly Cashflow Card */}
      <AppCard>
        <Text style={[styles.caption, { color: theme.textSecondary }]}>
          Current Available Balance
        </Text>
        <Text style={[styles.balance, { color: theme.text }]}>
          {formatMoney(overallSummary.currentBalanceMinor, settings.currencyCode)}
        </Text>
        <Text style={[styles.openingHint, { color: theme.textMuted }]}>
          Opening balance:{' '}
          {formatMoney(overallSummary.openingBalanceMinor, settings.currencyCode)}
        </Text>

        <View style={styles.summaryRow}>
          <View style={[styles.summaryTile, { backgroundColor: theme.incomeSoft }]}>
            <Text style={[styles.tileLabel, { color: theme.income }]}>
              Month Income
            </Text>
            <Text style={[styles.tileValue, { color: theme.income }]}>
              {formatMoney(monthlySummary.totalIncomeMinor, settings.currencyCode)}
            </Text>
          </View>
          <View style={[styles.summaryTile, { backgroundColor: theme.expenseSoft }]}>
            <Text style={[styles.tileLabel, { color: theme.expense }]}>
              Month Expenses
            </Text>
            <Text style={[styles.tileValue, { color: theme.expense }]}>
              {formatMoney(monthlySummary.totalExpensesMinor, settings.currencyCode)}
            </Text>
          </View>
        </View>
      </AppCard>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <View style={styles.flex1}>
          <AppButton
            label="Add Expense"
            variant="outline"
            icon={<Ionicons name="remove-circle-outline" size={18} color={theme.expense} />}
            onPress={() => router.push('/transactions/add?type=expense')}
            fullWidth
          />
        </View>
        <View style={styles.flex1}>
          <AppButton
            label="Add Income"
            icon={<Ionicons name="add-circle-outline" size={18} color={theme.primaryText} />}
            onPress={() => router.push('/transactions/add?type=income')}
            fullWidth
          />
        </View>
      </View>

      {/* Monthly Budget Progress */}
      {monthlyBudgetProgress ? (
        <BudgetProgressCard
          progress={monthlyBudgetProgress}
          currencyCode={settings.currencyCode}
          onEdit={() => router.push('/budgets')}
        />
      ) : (
        <AppCard>
          <View style={styles.rowBetween}>
            <View style={styles.flex1}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                Monthly Budget
              </Text>
              <Text style={[styles.mutedDesc, { color: theme.textSecondary }]}>
                Set a spending limit for {getMonthLabel(currentYear, currentMonth)} to track remaining budget.
              </Text>
            </View>
            <AppButton
              label="Set Budget"
              size="sm"
              variant="outline"
              onPress={() => router.push('/budgets')}
            />
          </View>
        </AppCard>
      )}

      {/* Category Spending Overview */}
      <AppCard>
        <View style={styles.rowBetween}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Spending by Category
          </Text>
          <AppButton
            label="Reports"
            size="sm"
            variant="ghost"
            onPress={() => router.push('/(tabs)/reports')}
          />
        </View>
        <CategoryDonutChart
          items={monthlySummary.categoryBreakdown}
          totalMinor={monthlySummary.totalExpensesMinor}
          currencyCode={settings.currencyCode}
        />
      </AppCard>

      {/* Recent Transactions */}
      <View style={styles.recentHeader}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          Recent Transactions
        </Text>
        {transactions.length > 0 ? (
          <AppButton
            label="View All"
            size="sm"
            variant="ghost"
            onPress={() => router.push('/(tabs)/transactions')}
          />
        ) : null}
      </View>

      {recentTransactions.length === 0 ? (
        <EmptyState
          icon="receipt-outline"
          title="No transactions recorded yet"
          description="Record your first income or expense to see your balance, category breakdown, and recent activity."
          actionLabel="Add Transaction"
          onAction={() => router.push('/transactions/add')}
        />
      ) : (
        <View style={styles.recentList}>
          {recentTransactions.map((tx) => (
            <TransactionRowItem
              key={tx.id}
              transaction={tx}
              category={tx.categoryId ? categoryMap.get(tx.categoryId) : undefined}
              currencyCode={settings.currencyCode}
              dateFormat={settings.dateFormat}
              showDate
              onPress={() => router.push(`/transactions/${tx.id}`)}
            />
          ))}
        </View>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  caption: {
    fontSize: 13,
    fontWeight: '600',
  },
  balance: {
    fontSize: 32,
    fontWeight: '700',
  },
  openingHint: {
    fontSize: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  summaryTile: {
    flex: 1,
    borderRadius: 12,
    padding: Spacing.three - 4,
    gap: 4,
  },
  tileLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  tileValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  quickActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  flex1: {
    flex: 1,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  mutedDesc: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recentList: {
    gap: Spacing.two,
  },
});
