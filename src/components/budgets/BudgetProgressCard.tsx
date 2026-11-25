import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppCard } from '@/components/common';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { BudgetProgress } from '@/types/reports';
import { formatMoney } from '@/utils/money';

interface BudgetProgressCardProps {
  progress: BudgetProgress;
  currencyCode: string;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function BudgetProgressCard({
  progress,
  currencyCode,
  onEdit,
  onDelete,
}: BudgetProgressCardProps) {
  const theme = useTheme();
  const title = progress.categoryName ?? 'Monthly Overall Budget';
  const clampedRatio = Math.min(Math.max(progress.percentageUsed / 100, 0), 1);

  const barColor = progress.isExceeded
    ? theme.danger
    : progress.percentageUsed >= 85
      ? theme.warning
      : progress.categoryColor || theme.primary;

  return (
    <AppCard>
      <View style={styles.headerRow}>
        <View style={styles.titleRow}>
          {progress.categoryColor ? (
            <View
              style={[styles.dot, { backgroundColor: progress.categoryColor }]}
            />
          ) : null}
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
            {title}
          </Text>
        </View>

        <View style={styles.actions}>
          {onEdit ? (
            <Pressable
              onPress={onEdit}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${title}`}>
              <Ionicons name="create-outline" size={18} color={theme.primary} />
            </Pressable>
          ) : null}
          {onDelete ? (
            <Pressable
              onPress={onDelete}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Delete ${title}`}>
              <Ionicons name="trash-outline" size={18} color={theme.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.amountsRow}>
        <Text style={[styles.spentText, { color: theme.text }]}>
          {formatMoney(progress.spentMinor, currencyCode)}{' '}
          <Text style={[styles.limitText, { color: theme.textSecondary }]}>
            / {formatMoney(progress.budget.amountMinor, currencyCode)}
          </Text>
        </Text>
        <Text
          style={[
            styles.pctText,
            { color: progress.isExceeded ? theme.danger : theme.textSecondary },
          ]}>
          {progress.percentageUsed.toFixed(0)}%
        </Text>
      </View>

      <View style={[styles.track, { backgroundColor: theme.surfaceElevated }]}>
        <View
          style={[
            styles.fill,
            {
              width: `${Math.round(clampedRatio * 100)}%`,
              backgroundColor: barColor,
            },
          ]}
        />
      </View>

      <View style={styles.footerRow}>
        <Text
          style={[
            styles.remainingText,
            { color: progress.isExceeded ? theme.danger : theme.textSecondary },
          ]}>
          {progress.isExceeded
            ? `Exceeded by ${formatMoney(Math.abs(progress.remainingMinor), currencyCode)}`
            : `${formatMoney(progress.remainingMinor, currencyCode)} remaining`}
        </Text>
        {progress.isExceeded ? (
          <View style={[styles.warnBadge, { backgroundColor: theme.dangerSoft }]}>
            <Text style={[styles.warnBadgeText, { color: theme.danger }]}>
              Over Budget
            </Text>
          </View>
        ) : null}
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flex: 1,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
  },
  amountsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  spentText: {
    fontSize: 15,
    fontWeight: '700',
  },
  limitText: {
    fontSize: 13,
    fontWeight: '500',
  },
  pctText: {
    fontSize: 13,
    fontWeight: '700',
  },
  track: {
    height: 10,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: Radius.full,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  remainingText: {
    fontSize: 12,
    fontWeight: '500',
  },
  warnBadge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  warnBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
