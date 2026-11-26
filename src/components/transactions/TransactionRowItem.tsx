import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CategoryIcon } from '@/components/common';
import type { CurrencyConfig } from '@/constants/currencies';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Category, Transaction } from '@/types/models';
import { formatTimeForDisplay } from '@/utils/date';
import { formatMoney } from '@/utils/money';

interface TransactionRowItemProps {
  transaction: Transaction;
  category?: Category;
  catalog?: readonly CurrencyConfig[];
  subtitle?: string;
  onPress: () => void;
}

export function TransactionRowItem({
  transaction,
  category,
  catalog,
  subtitle,
  onPress,
}: TransactionRowItemProps) {
  const theme = useTheme();
  const isIncome = transaction.type === 'income';
  const amountColor = isIncome ? theme.income : theme.expense;
  const signedAmount = isIncome ? transaction.amountMinor : -transaction.amountMinor;
  const subtitleText = subtitle ?? formatTimeForDisplay(transaction.createdAt);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: theme.surface, borderColor: theme.border },
        pressed && styles.pressed,
      ]}>
      <CategoryIcon
        icon={category?.icon}
        color={category?.color}
        imageUri={category?.imageUri}
        size={42}
      />

      <View style={styles.center}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          {transaction.title}
        </Text>
        {subtitleText ? (
          <Text style={[styles.time, { color: theme.textMuted }]} numberOfLines={1}>
            {subtitleText}
          </Text>
        ) : null}
      </View>

      <Text style={[styles.amount, { color: amountColor }]} numberOfLines={1}>
        {formatMoney(signedAmount, transaction.currencyCode, {
          showSign: true,
          catalog,
        })}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.two + 3,
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
  time: {
    fontSize: 12,
  },
  amount: {
    fontSize: 15,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.8,
  },
});
