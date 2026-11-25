import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  AppButton,
  AppCard,
  AppHeader,
  AppScreen,
  ConfirmDialog,
} from '@/components/common';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';

export default function AccountManagementScreen() {
  const theme = useTheme();
  const router = useRouter();

  const settings = useAppStore((s) => s.settings);
  const transactions = useAppStore((s) => s.transactions);
  const categories = useAppStore((s) => s.categories);
  const tags = useAppStore((s) => s.tags);
  const budgets = useAppStore((s) => s.budgets);
  const clearAllLocalData = useAppStore((s) => s.clearAllLocalData);

  const [confirmVisible, setConfirmVisible] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleClearAll = async () => {
    if (clearing) return;
    setClearing(true);
    setErrorMsg(null);
    try {
      await clearAllLocalData();
      setConfirmVisible(false);
      router.replace('/onboarding');
    } catch {
      setConfirmVisible(false);
      setErrorMsg('Unable to clear local data. Please try again.');
    } finally {
      setClearing(false);
    }
  };

  return (
    <AppScreen edges={['top', 'bottom', 'left', 'right']}>
      <AppHeader title="Account Management" showBack />

      <AppCard>
        <View style={styles.cardHeader}>
          <View style={[styles.iconBadge, { backgroundColor: theme.primarySoft }]}>
            <Ionicons name="phone-portrait-outline" size={20} color={theme.primary} />
          </View>
          <View style={styles.flex1}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>
              {settings.profileName?.trim() || 'Local Device Ledger'}
            </Text>
            <Text style={[styles.cardSub, { color: theme.textSecondary }]}>
              Stored locally on this device in SQLite
            </Text>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        <View style={styles.statsGrid}>
          <StatTile label="Transactions" value={String(transactions.length)} />
          <StatTile label="Categories" value={String(categories.length)} />
          <StatTile label="Tags" value={String(tags.length)} />
          <StatTile label="Budgets" value={String(budgets.length)} />
        </View>
      </AppCard>

      <AppCard>
        <Pressable
          onPress={() => router.push('/backup')}
          accessibilityRole="button"
          style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}>
          <View style={styles.actionLeft}>
            <Ionicons name="download-outline" size={20} color={theme.primary} />
            <Text style={[styles.actionLabel, { color: theme.text }]}>
              Backup & Export
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
        </Pressable>
      </AppCard>

      <AppCard>
        <Text style={[styles.dangerTitle, { color: theme.danger }]}>Danger Zone</Text>
        <Text style={[styles.dangerHint, { color: theme.textSecondary }]}>
          Permanently remove all local transactions, tags, custom categories, custom payment methods, and budgets on this device.
        </Text>
        <AppButton
          label="Clear All Local Data"
          variant="danger"
          onPress={() => setConfirmVisible(true)}
        />
      </AppCard>

      {errorMsg ? (
        <Text style={[styles.errorText, { color: theme.danger }]}>{errorMsg}</Text>
      ) : null}

      <ConfirmDialog
        visible={confirmVisible}
        title="Clear All Local Data?"
        message="All local data will be permanently deleted. This action cannot be undone."
        confirmLabel="Clear All Data"
        cancelLabel="Cancel"
        destructive
        loading={clearing}
        onConfirm={() => void handleClearAll()}
        onCancel={() => setConfirmVisible(false)}
      />
    </AppScreen>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.statTile,
        { backgroundColor: theme.surfaceElevated, borderColor: theme.border },
      ]}>
      <Text style={[styles.statValue, { color: theme.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
  },
  iconBadge: {
    width: 42,
    height: 42,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex1: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  cardSub: {
    fontSize: 13,
    marginTop: 2,
  },
  divider: {
    height: 1,
    width: '100%',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  statTile: {
    width: '48%',
    flexGrow: 1,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.two + 2,
    gap: 2,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 12,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  dangerTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  dangerHint: {
    fontSize: 13,
    lineHeight: 19,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
});
