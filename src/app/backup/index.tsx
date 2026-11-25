import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
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
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  exportJsonBackupFile,
  exportTransactionsCsvFile,
  pickAndValidateJsonBackupFile,
} from '@/services/backup/backupService';
import { useAppStore } from '@/store/app-store';
import type { BackupPayload } from '@/types/database';
import { formatDateTimeForDisplay } from '@/utils/date';

export default function BackupScreen() {
  const theme = useTheme();
  const router = useRouter();
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  const settings = useAppStore((s) => s.settings);
  const transactions = useAppStore((s) => s.transactions);
  const categories = useAppStore((s) => s.categories);
  const tags = useAppStore((s) => s.tags);
  const paymentMethods = useAppStore((s) => s.paymentMethods);
  const currencies = useAppStore((s) => s.currencies);
  const budgets = useAppStore((s) => s.budgets);
  const restoreBackup = useAppStore((s) => s.restoreBackup);
  const addNotification = useAppStore((s) => s.addNotification);

  const [busyAction, setBusyAction] = useState<'csv' | 'json' | 'pick' | 'restore' | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [stagedBackup, setStagedBackup] = useState<{
    fileName: string;
    payload: BackupPayload;
  } | null>(null);
  const [replaceConfirmVisible, setReplaceConfirmVisible] = useState(false);

  const handleExportCsv = async () => {
    if (busyAction) return;
    setBusyAction('csv');
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const res = await exportTransactionsCsvFile({
        transactions,
        currencyCode: settings.currencyCode,
        tags,
        currencies,
      });
      await addNotification({
        type: 'backup',
        title: 'CSV Export Completed',
        body: `Exported ${res.count} transaction(s).`,
      });
      setStatusMessage(
        res.shared
          ? `Exported ${res.count} transactions to CSV.`
          : `Saved CSV (${res.count} transactions).`,
      );
    } catch {
      setErrorMessage('Failed to export CSV file.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleExportJson = async () => {
    if (busyAction) return;
    setBusyAction('json');
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const res = await exportJsonBackupFile(appVersion);
      await addNotification({
        type: 'backup',
        title: 'Backup Created',
        body: `Saved ${res.payload.transactions.length} transactions, ${res.payload.categories.length} categories, ${res.payload.tags?.length ?? 0} tags, and ${res.payload.budgets.length} budgets.`,
      });
      setStatusMessage(
        res.shared
          ? `Backup exported (${res.payload.transactions.length} transactions).`
          : 'Backup saved locally.',
      );
    } catch {
      setErrorMessage('Failed to export backup.');
    } finally {
      setBusyAction(null);
    }
  };

  const handlePickBackup = async () => {
    if (busyAction) return;
    setBusyAction('pick');
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const picked = await pickAndValidateJsonBackupFile();
      if (picked.canceled) {
        return;
      }
      if (picked.error || !picked.payload) {
        setErrorMessage(picked.error ?? 'Selected backup file is invalid.');
        return;
      }
      setStagedBackup({
        fileName: picked.fileName ?? 'backup.json',
        payload: picked.payload,
      });
    } catch {
      setErrorMessage('Could not read selected backup file.');
    } finally {
      setBusyAction(null);
    }
  };

  const executeRestore = async (mode: 'merge' | 'replace') => {
    if (!stagedBackup || busyAction) return;
    setBusyAction('restore');
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const res = await restoreBackup(stagedBackup.payload, mode);
      setReplaceConfirmVisible(false);
      setStagedBackup(null);
      setStatusMessage(
        `Restore (${mode}) complete: ${res.transactionsInserted} transactions added (${res.transactionsSkipped} skipped).`,
      );
    } catch {
      setReplaceConfirmVisible(false);
      setErrorMessage('Failed to restore backup. Existing data was kept intact.');
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <AppScreen edges={['top', 'bottom', 'left', 'right']}>
      <AppHeader title="Backup & Export" showBack />

      {statusMessage ? (
        <AppCard style={{ backgroundColor: theme.incomeSoft, borderColor: theme.income }}>
          <Text style={[styles.feedbackText, { color: theme.income }]}>
            {statusMessage}
          </Text>
        </AppCard>
      ) : null}

      {errorMessage ? (
        <AppCard style={{ backgroundColor: theme.dangerSoft, borderColor: theme.danger }}>
          <Text style={[styles.feedbackText, { color: theme.danger }]}>
            {errorMessage}
          </Text>
        </AppCard>
      ) : null}

      <AppCard>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          Local Records
        </Text>
        <Text style={[styles.bodyText, { color: theme.textSecondary }]}>
          {transactions.length} transactions · {categories.length} categories ·{' '}
          {tags.length} tags · {paymentMethods.length} methods ·{' '}
          {budgets.length} budgets
        </Text>
      </AppCard>

      <AppCard>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Export CSV</Text>
        <Text style={[styles.bodyText, { color: theme.textSecondary }]}>
          Spreadsheet file preserving per-transaction currencies and tags.
        </Text>
        <AppButton
          label="Export CSV"
          variant="outline"
          onPress={() => void handleExportCsv()}
          loading={busyAction === 'csv'}
          disabled={Boolean(busyAction) && busyAction !== 'csv'}
        />
      </AppCard>

      <AppCard>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Backup Data</Text>
        <Text style={[styles.bodyText, { color: theme.textSecondary }]}>
          Full JSON archive of transactions, categories, tags, methods, budgets, and settings.
        </Text>
        <AppButton
          label="Backup Data"
          onPress={() => void handleExportJson()}
          loading={busyAction === 'json'}
          disabled={Boolean(busyAction) && busyAction !== 'json'}
        />
      </AppCard>

      <AppCard>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          Restore Backup
        </Text>
        <Text style={[styles.bodyText, { color: theme.textSecondary }]}>
          Import a BinRo Finance JSON backup using Safe Merge or Replace.
        </Text>

        {!stagedBackup ? (
          <AppButton
            label="Select Backup File (.json)"
            variant="secondary"
            onPress={() => void handlePickBackup()}
            loading={busyAction === 'pick'}
            disabled={Boolean(busyAction) && busyAction !== 'pick'}
          />
        ) : (
          <View style={styles.stagedBox}>
            <Text style={[styles.stagedTitle, { color: theme.text }]}>
              {stagedBackup.fileName}
            </Text>
            <Text style={[styles.bodyText, { color: theme.textSecondary }]}>
              Exported:{' '}
              {formatDateTimeForDisplay(
                stagedBackup.payload.exportedAt,
                settings.dateFormat,
              )}
              {'\n'}
              {stagedBackup.payload.transactions.length} transactions ·{' '}
              {stagedBackup.payload.categories.length} categories ·{' '}
              {stagedBackup.payload.tags?.length ?? 0} tags ·{' '}
              {stagedBackup.payload.budgets.length} budgets
            </Text>

            <View style={styles.stagedActions}>
              <AppButton
                label="Safe Merge"
                onPress={() => void executeRestore('merge')}
                loading={busyAction === 'restore'}
              />
              <AppButton
                label="Replace All"
                variant="danger"
                onPress={() => setReplaceConfirmVisible(true)}
                disabled={busyAction === 'restore'}
              />
              <AppButton
                label="Cancel"
                variant="outline"
                onPress={() => setStagedBackup(null)}
                disabled={busyAction === 'restore'}
              />
            </View>
          </View>
        )}
      </AppCard>

      <AppCard>
        <Pressable
          onPress={() => router.push('/account')}
          accessibilityRole="button"
          style={({ pressed }) => [styles.actionRow, pressed && styles.pressed]}>
          <View style={styles.actionLeft}>
            <Ionicons name="shield-outline" size={20} color={theme.primary} />
            <Text style={[styles.actionLabel, { color: theme.text }]}>
              Account Management
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
        </Pressable>
      </AppCard>

      <ConfirmDialog
        visible={replaceConfirmVisible}
        title="Replace All Data?"
        message="Replace mode overwrites all local data."
        confirmLabel="Replace All"
        cancelLabel="Cancel"
        destructive
        loading={busyAction === 'restore'}
        onConfirm={() => void executeRestore('replace')}
        onCancel={() => setReplaceConfirmVisible(false)}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  bodyText: {
    fontSize: 13,
    lineHeight: 19,
  },
  feedbackText: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },
  stagedBox: {
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  stagedTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  stagedActions: {
    gap: Spacing.two,
    marginTop: Spacing.one,
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
  pressed: {
    opacity: 0.72,
  },
});
