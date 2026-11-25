import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  AppButton,
  AppCard,
  AppHeader,
  AppScreen,
  CategoryIcon,
  ConfirmDialog,
  EmptyState,
  LoadingState,
} from '@/components/common';
import {
  TransactionForm,
  type TransactionFormValues,
} from '@/components/forms/TransactionForm';
import { Radius, Spacing } from '@/constants/theme';
import { repositories } from '@/database/repositories';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';
import type { Transaction } from '@/types/models';
import { formatDateForDisplay, formatDateTimeForDisplay } from '@/utils/date';
import { formatMoney } from '@/utils/money';

export default function TransactionDetailsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const settings = useAppStore((s) => s.settings);
  const categories = useAppStore((s) => s.categories);
  const transactions = useAppStore((s) => s.transactions);
  const updateTransaction = useAppStore((s) => s.updateTransaction);
  const deleteTransaction = useAppStore((s) => s.deleteTransaction);

  const txFromStore = transactions.find((t) => t.id === id) ?? null;
  const [fetchedTx, setFetchedTx] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(!txFromStore && Boolean(id));
  const [isEditing, setIsEditing] = useState(false);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadedTx = txFromStore ?? fetchedTx;

  useEffect(() => {
    if (txFromStore || !id) {
      return;
    }

    let active = true;
    repositories.transactions
      .getById(id)
      .then((found) => {
        if (active) {
          setFetchedTx(found);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id, txFromStore]);

  if (loading) {
    return (
      <AppScreen>
        <AppHeader title="Transaction Details" showBack />
        <LoadingState message="Loading transaction..." />
      </AppScreen>
    );
  }

  if (!loadedTx) {
    return (
      <AppScreen>
        <AppHeader title="Transaction Details" showBack />
        <EmptyState
          icon="alert-circle-outline"
          title="Transaction not found"
          description="This transaction may have been deleted."
          actionLabel="Go Back"
          onAction={() => router.back()}
        />
      </AppScreen>
    );
  }

  const category = loadedTx.categoryId
    ? categories.find((c) => c.id === loadedTx.categoryId)
    : undefined;
  const isIncome = loadedTx.type === 'income';
  const signedAmount = isIncome ? loadedTx.amountMinor : -loadedTx.amountMinor;

  const handleUpdate = async (values: TransactionFormValues) => {
    await updateTransaction(loadedTx.id, values);
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    setActionError(null);
    try {
      await deleteTransaction(loadedTx.id);
      setDeleteDialogVisible(false);
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)/transactions');
      }
    } catch {
      setDeleteDialogVisible(false);
      setActionError('Unable to delete transaction. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AppScreen keyboardAvoiding>
      <AppHeader
        title={isEditing ? 'Edit Transaction' : 'Transaction Details'}
        showBack
        onBackPress={isEditing ? () => setIsEditing(false) : undefined}
      />

      {isEditing ? (
        <TransactionForm
          currencyCode={settings.currencyCode}
          dateFormat={settings.dateFormat}
          categories={categories}
          initialValues={{
            type: loadedTx.type,
            title: loadedTx.title,
            amountMinor: loadedTx.amountMinor,
            categoryId: loadedTx.categoryId,
            paymentMethod: loadedTx.paymentMethod,
            transactionDate: loadedTx.transactionDate,
            note: loadedTx.note,
          }}
          submitLabel="Save Changes"
          onSubmit={handleUpdate}
          onCancel={() => setIsEditing(false)}
        />
      ) : (
        <>
          <AppCard>
            <View style={styles.heroTop}>
              <CategoryIcon
                icon={category?.icon}
                color={category?.color}
                size={48}
              />
              <View
                style={[
                  styles.typeBadge,
                  {
                    backgroundColor: isIncome
                      ? theme.incomeSoft
                      : theme.expenseSoft,
                  },
                ]}>
                <Text
                  style={[
                    styles.typeText,
                    { color: isIncome ? theme.income : theme.expense },
                  ]}>
                  {isIncome ? 'Income' : 'Expense'}
                </Text>
              </View>
            </View>

            <Text style={[styles.txTitle, { color: theme.text }]}>
              {loadedTx.title}
            </Text>
            <Text
              style={[
                styles.txAmount,
                { color: isIncome ? theme.income : theme.expense },
              ]}>
              {formatMoney(signedAmount, settings.currencyCode, { showSign: true })}
            </Text>
          </AppCard>

          <AppCard>
            <DetailRow
              label="Category"
              value={category?.name ?? loadedTx.categoryNameSnapshot}
            />
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <DetailRow
              label="Date"
              value={formatDateForDisplay(
                loadedTx.transactionDate,
                settings.dateFormat,
              )}
            />
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <DetailRow label="Payment Method" value={loadedTx.paymentMethod} />
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <DetailRow
              label="Note"
              value={loadedTx.note ? loadedTx.note : 'No note added'}
            />
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <DetailRow
              label="Created"
              value={formatDateTimeForDisplay(loadedTx.createdAt, settings.dateFormat)}
            />
          </AppCard>

          {actionError ? (
            <Text style={[styles.errorText, { color: theme.danger }]}>
              {actionError}
            </Text>
          ) : null}

          <View style={styles.actions}>
            <View style={styles.flex1}>
              <AppButton
                label="Edit"
                variant="outline"
                onPress={() => setIsEditing(true)}
                fullWidth
              />
            </View>
            <View style={styles.flex1}>
              <AppButton
                label="Delete"
                variant="danger"
                onPress={() => setDeleteDialogVisible(true)}
                fullWidth
              />
            </View>
          </View>
        </>
      )}

      <ConfirmDialog
        visible={deleteDialogVisible}
        title="Delete Transaction?"
        message={`Delete "${loadedTx.title}" (${formatMoney(loadedTx.amountMinor, settings.currencyCode)})? Your balance and reports will update immediately.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        loading={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteDialogVisible(false)}
      />
    </AppScreen>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
        {label}
      </Text>
      <Text style={[styles.detailValue, { color: theme.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  typeBadge: {
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radius.full,
  },
  typeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  txTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: Spacing.one,
  },
  txAmount: {
    fontSize: 30,
    fontWeight: '700',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.three,
    paddingVertical: Spacing.one,
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  detailValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'right',
  },
  divider: {
    height: 1,
    width: '100%',
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  flex1: {
    flex: 1,
  },
});
