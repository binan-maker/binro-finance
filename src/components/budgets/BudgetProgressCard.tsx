import Ionicons from '@expo/vector-icons/Ionicons';
import { type ComponentRef, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  AnchoredActionMenu,
  AppCard,
  CategoryIcon,
  type AnchorRect,
  type AnchoredMenuAction,
} from '@/components/common';
import type { CurrencyConfig } from '@/constants/currencies';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { DateFormatPreference } from '@/types/models';
import type { BudgetProgress } from '@/types/reports';
import { formatDateForDisplay } from '@/utils/date';
import { formatMoney } from '@/utils/money';

interface BudgetProgressCardProps {
  progress: BudgetProgress;
  currencyCode: string;
  dateFormat?: DateFormatPreference;
  currencies?: readonly CurrencyConfig[];
  onEdit?: () => void;
  onDelete?: () => void;
}

export function BudgetProgressCard({
  progress,
  currencyCode,
  dateFormat = 'DD MMM YYYY',
  currencies,
  onEdit,
  onDelete,
}: BudgetProgressCardProps) {
  const theme = useTheme();
  const triggerRef = useRef<ComponentRef<typeof View>>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<AnchorRect | null>(null);

  const defaultOverallTitle =
    progress.budget.period === 'biweekly'
      ? 'Paycheck Overall Budget'
      : progress.budget.period === 'yearly'
        ? 'Annual Target Budget'
        : 'Monthly Overall Budget';

  const title = progress.categoryName ?? defaultOverallTitle;
  const clampedRatio = Math.min(Math.max(progress.percentageUsed / 100, 0), 1);

  const barColor =
    progress.status === 'exceeded'
      ? theme.danger
      : progress.status === 'warning'
        ? theme.warning
        : progress.categoryColor || theme.primary;

  const statusConfig =
    progress.status === 'exceeded'
      ? { label: 'Over Budget', bg: theme.dangerSoft, fg: theme.danger }
      : progress.status === 'warning'
        ? { label: 'Near Limit', bg: theme.warningSoft, fg: theme.warning }
        : { label: 'On Track', bg: theme.incomeSoft, fg: theme.income };

  const menuActions: AnchoredMenuAction[] = [];
  if (onEdit) {
    menuActions.push({
      key: 'edit',
      label: 'Edit',
      icon: 'create-outline',
      onPress: onEdit,
    });
  }
  if (onDelete) {
    menuActions.push({
      key: 'delete',
      label: 'Delete',
      icon: 'trash-outline',
      destructive: true,
      onPress: onDelete,
    });
  }

  const openAnchoredMenu = () => {
    if (triggerRef.current) {
      triggerRef.current.measureInWindow((x, y, width, height) => {
        setMenuAnchor({ x, y, width, height });
        setMenuOpen(true);
      });
    } else {
      setMenuAnchor(null);
      setMenuOpen(true);
    }
  };

  let periodHint: string | null = null;
  if (progress.budget.period === 'biweekly') {
    const startLabel = formatDateForDisplay(progress.periodStartDate, dateFormat);
    const endLabel = formatDateForDisplay(progress.periodEndDate, dateFormat);
    const nextLabel = progress.nextPeriodStartDate
      ? formatDateForDisplay(progress.nextPeriodStartDate, dateFormat)
      : null;
    periodHint = nextLabel
      ? `${startLabel} – ${endLabel} · Next: ${nextLabel}`
      : `${startLabel} – ${endLabel}`;
  } else if (progress.budget.period === 'yearly' && progress.monthlyContributionMinor !== null) {
    periodHint = `Set aside ${formatMoney(progress.monthlyContributionMinor, currencyCode, { catalog: currencies })}/mo`;
  }

  return (
    <AppCard>
      <View style={styles.headerRow}>
        <View style={styles.titleRow}>
          {progress.budget.categoryId ? (
            <CategoryIcon
              icon={progress.categoryIcon}
              color={progress.categoryColor}
              imageUri={progress.categoryImageUri}
              size={30}
            />
          ) : null}
          <View style={styles.titleCol}>
            <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
              {title}
            </Text>
            {periodHint ? (
              <Text style={[styles.periodHint, { color: theme.textSecondary }]} numberOfLines={1}>
                {periodHint}
              </Text>
            ) : null}
          </View>
        </View>

        {menuActions.length > 0 ? (
          <View ref={triggerRef} collapsable={false}>
            <Pressable
              onPress={openAnchoredMenu}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={`Actions for ${title}`}
              style={({ pressed }) => [styles.menuBtn, pressed && styles.pressed]}>
              <Ionicons name="ellipsis-vertical" size={18} color={theme.textSecondary} />
            </Pressable>
          </View>
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
        <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
          <Text style={[styles.statusBadgeText, { color: statusConfig.fg }]}>
            {statusConfig.label}
          </Text>
        </View>
      </View>

      <AnchoredActionMenu
        visible={menuOpen}
        anchor={menuAnchor}
        actions={menuActions}
        onClose={() => setMenuOpen(false)}
      />
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
  titleCol: {
    flex: 1,
    gap: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
  },
  periodHint: {
    fontSize: 12,
    fontWeight: '500',
  },
  menuBtn: {
    padding: 4,
    borderRadius: Radius.full,
  },
  pressed: {
    opacity: 0.68,
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
    gap: Spacing.two,
  },
  remainingText: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
    borderRadius: Radius.sm,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
