import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CategoryIcon } from '@/components/common';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Category, DateFormatPreference, Transaction } from '@/types/models';
import { formatDateForDisplay } from '@/utils/date';
import { formatMoney } from '@/utils/money';

interface TransactionRowItemProps {
  transaction: Transaction;
  category?: Category;
  currencyCode: string;
  dateFormat: DateFormatPreference;
  showDate?: boolean;
  onPress: () => void;
  onDeletePress?: () => void;
}

export function TransactionRowItem({
  transaction,
  category,
  currencyCode,
  dateFormat,
  showDate = false,
  onPress,
  onDeletePress,
}: TransactionRowItemProps) {
  const theme = useTheme();
  const isIncome = transaction.type === 'income';
  const amountColor = isIncome ? theme.income : theme.expense;
  const signedAmount = isIncome ? transaction.amountMinor : -transaction.amountMinor;

  const categoryLabel = category?.name ?? transaction.categoryNameSnapshot;
  const metaParts = [categoryLabel, transaction.paymentMethod];
  if (showDate) {
    metaParts.push(formatDateForDisplay(transaction.transactionDate, dateFormat));
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: theme.surface, borderColor: theme.border },
        pressed && styles.pressed,
      ]}>
      <CategoryIcon icon={category?.icon} color={category?.color} size={40} />

      <View style={styles.center}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          {transaction.title}
        </Text>
        <Text style={[styles.meta, { color: theme.textSecondary }]} numberOfLines={1}>
          {metaParts.join(' · ')}
        </Text>
      </View>

      <View style={styles.right}>
        <Text style={[styles.amount, { color: amountColor }]}>
          {formatMoney(signedAmount, currencyCode, { showSign: true })}
        </Text>
        {onDeletePress ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onDeletePress();
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Delete transaction"
            style={styles.deleteBtn}>
            <Ionicons name="trash-outline" size={16} color={theme.textMuted} />
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.two + 2,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  center: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
  },
  meta: {
    fontSize: 12,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  amount: {
    fontSize: 15,
    fontWeight: '700',
  },
  deleteBtn: {
    padding: 4,
  },
  pressed: {
    opacity: 0.8,
  },
});
