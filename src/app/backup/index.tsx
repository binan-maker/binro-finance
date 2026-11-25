import Constants from 'expo-constants';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

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
        body: `Exported ${res.count} transaction(s) with multi-currency amounts and tags.`,
      });
      setStatusMessage(
        res.shared
          ? `Exported ${res.count} transactions to CSV.`
          : `Saved CSV (${res.count} transactions) locally.`,
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
        title: 'JSON Backup Created',
        body: `Saved ${res.payload.transactions.length} transactions, ${res.payload.categories.length} categories, ${res.payload.tags?.length ?? 0} tags, and ${res.payload.budgets.length} budgets.`,
      });
      setStatusMessage(
        res.shared
          ? `Exported full JSON backup (${res.payload.transactions.length} transactions, ${res.payload.categories.length} categories, ${res.payload.tags?.length ?? 0} tags, ${res.payload.budgets.length} budgets).`
          : 'Saved complete JSON backup locally.',
      );
    } catch {
      setErrorMessage('Failed to export JSON backup.');
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
      setErrorMessage('Could not inspect selected backup file.');
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
        `Restore (${mode}) complete: added ${res.transactionsInserted} transactions (${res.transactionsSkipped} duplicates skipped), ${res.categoriesInserted} categories, ${res.tagsInserted} tags, ${res.paymentMethodsInserted} payment methods, and ${res.budgetsInserted} budgets.`,
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
      <AppHeader
        title="Backup & Export"
        subtitle="Multi-currency CSV export & JSON backup/restore"
        showBack
      />

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
          Current Local Data
        </Text>
        <Text style={[styles.bodyText, { color: theme.textSecondary }]}>
          {transactions.length} transactions · {categories.length} categories ·{' '}
          {tags.length} tags · {paymentMethods.length} payment methods ·{' '}
          {budgets.length} budgets
        </Text>
      </AppCard>

      <AppCard>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          Export CSV (Spreadsheet)
        </Text>
        <Text style={[styles.bodyText, { color: theme.textSecondary }]}>
          Export all recorded transactions with each transaction’s own currency, tags, and minor-unit precision.
        </Text>
        <AppButton
          label="Export Transactions CSV"
          variant="outline"
          onPress={() => void handleExportCsv()}
          loading={busyAction === 'csv'}
          disabled={Boolean(busyAction) && busyAction !== 'csv'}
        />
      </AppCard>

      <AppCard>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          Complete JSON Backup
        </Text>
        <Text style={[styles.bodyText, { color: theme.textSecondary }]}>
          Export transactions, categories, tags, payment methods, budgets, and settings into a portable JSON backup file.
        </Text>
        <AppButton
          label="Export JSON Backup"
          onPress={() => void handleExportJson()}
          loading={busyAction === 'json'}
          disabled={Boolean(busyAction) && busyAction !== 'json'}
        />
      </AppCard>

      <AppCard>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          Restore from JSON Backup
        </Text>
        <Text style={[styles.bodyText, { color: theme.textSecondary }]}>
          Select a BinRo Finance V1 or V2 JSON backup file. Safe Merge adds missing records and skips duplicates without overwriting existing records.
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
              Ready to restore: {stagedBackup.fileName}
            </Text>
            <Text style={[styles.bodyText, { color: theme.textSecondary }]}>
              Exported:{' '}
              {formatDateTimeForDisplay(
                stagedBackup.payload.exportedAt,
                settings.dateFormat,
              )}
              {'\n'}
              Contains {stagedBackup.payload.transactions.length} transactions,{' '}
              {stagedBackup.payload.categories.length} categories,{' '}
              {stagedBackup.payload.tags?.length ?? 0} tags,{' '}
              {stagedBackup.payload.paymentMethods?.length ?? 0} payment methods,{' '}
              {stagedBackup.payload.budgets.length} budgets
            </Text>

            <View style={styles.stagedActions}>
              <AppButton
                label="Safe Merge (Skip Duplicates)"
                onPress={() => void executeRestore('merge')}
                loading={busyAction === 'restore'}
              />
              <AppButton
                label="Replace All Local Data"
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

      <ConfirmDialog
        visible={replaceConfirmVisible}
        title="Replace All Existing Data?"
        message="Replace mode will delete all current transactions, tags, custom payment methods, budgets, custom categories, and settings on this device and replace them with the selected backup."
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
});
