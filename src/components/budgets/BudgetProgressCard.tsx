import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppCard } from '@/components/common';
import type { CurrencyConfig } from '@/constants/currencies';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { BudgetProgress } from '@/types/reports';
import { formatMoney } from '@/utils/money';

interface BudgetProgressCardProps {
  progress: BudgetProgress;
  currencyCode: string;
  currencies?: readonly CurrencyConfig[];
  onEdit?: () => void;
  onDelete?: () => void;
}

export function BudgetProgressCard({
  progress,
  currencyCode,
  currencies,
  onEdit,
  onDelete,
}: BudgetProgressCardProps) {
  const theme = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  const title = progress.categoryName ?? 'Monthly Overall Budget';
  const clampedRatio = Math.min(Math.max(progress.percentageUsed / 100, 0), 1);

  const barColor = progress.isExceeded
    ? theme.danger
    : progress.percentageUsed >= 85
      ? theme.warning
      : progress.categoryColor || theme.primary;

  const hasActions = Boolean(onEdit || onDelete);

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

        {hasActions ? (
          <Pressable
            onPress={() => setMenuOpen(true)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`Actions for ${title}`}
            style={styles.menuBtn}>
            <Ionicons name="ellipsis-horizontal" size={18} color={theme.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.amountsRow}>
        <Text style={[styles.spentText, { color: theme.text }]}>
          {formatMoney(progress.spentMinor, currencyCode, { catalog: currencies })}{' '}
          <Text style={[styles.limitText, { color: theme.textSecondary }]}>
            / {formatMoney(progress.budget.amountMinor, currencyCode, { catalog: currencies })}
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
            ? `Exceeded by ${formatMoney(Math.abs(progress.remainingMinor), currencyCode, { catalog: currencies })}`
            : `${formatMoney(progress.remainingMinor, currencyCode, { catalog: currencies })} remaining`}
        </Text>
        {progress.isExceeded ? (
          <View style={[styles.warnBadge, { backgroundColor: theme.dangerSoft }]}>
            <Text style={[styles.warnBadgeText, { color: theme.danger }]}>
              Over Budget
            </Text>
          </View>
        ) : null}
      </View>

      {hasActions ? (
        <Modal
          visible={menuOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setMenuOpen(false)}>
          <Pressable
            style={styles.menuBackdrop}
            onPress={() => setMenuOpen(false)}>
            <View
              style={[
                styles.menuCard,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}>
              {onEdit ? (
                <Pressable
                  onPress={() => {
                    setMenuOpen(false);
                    onEdit();
                  }}
                  accessibilityRole="button"
                  style={styles.menuItem}>
                  <Text style={[styles.menuItemText, { color: theme.text }]}>
                    Edit
                  </Text>
                </Pressable>
              ) : null}
              {onEdit && onDelete ? (
                <View style={[styles.menuDivider, { backgroundColor: theme.border }]} />
              ) : null}
              {onDelete ? (
                <Pressable
                  onPress={() => {
                    setMenuOpen(false);
                    onDelete();
                  }}
                  accessibilityRole="button"
                  style={styles.menuItem}>
                  <Text style={[styles.menuItemText, { color: theme.danger }]}>
                    Delete
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </Pressable>
        </Modal>
      ) : null}
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
  menuBtn: {
    padding: 4,
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
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  menuCard: {
    width: '100%',
    maxWidth: 280,
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  menuItem: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: '600',
  },
  menuDivider: {
    height: 1,
  },
});
