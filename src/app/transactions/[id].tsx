import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
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
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();

  const settings = useAppStore((s) => s.settings);
  const categories = useAppStore((s) => s.categories);
  const tags = useAppStore((s) => s.tags);
  const paymentMethods = useAppStore((s) => s.paymentMethods);
  const currencies = useAppStore((s) => s.currencies);
  const transactions = useAppStore((s) => s.transactions);
  const updateTransaction = useAppStore((s) => s.updateTransaction);
  const deleteTransaction = useAppStore((s) => s.deleteTransaction);
  const createTag = useAppStore((s) => s.createTag);
  const clearTransactionDraft = useAppStore((s) => s.clearTransactionDraft);

  const txFromStore = transactions.find((t) => t.id === id) ?? null;
  const [fetchedTx, setFetchedTx] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(!txFromStore && Boolean(id));
  const [isEditing, setIsEditing] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
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

  useEffect(() => {
    return () => {
      useAppStore.getState().clearTransactionDraft();
    };
  }, []);

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
  const attachedTags = tags.filter((t) => (loadedTx.tagIds ?? []).includes(t.id));
  const isIncome = loadedTx.type === 'income';
  const signedAmount = isIncome ? loadedTx.amountMinor : -loadedTx.amountMinor;

  const handleUpdate = async (values: TransactionFormValues) => {
    // Protect historical currency on existing transaction edits
    await updateTransaction(loadedTx.id, {
      ...values,
      currencyCode: loadedTx.currencyCode,
    });
    clearTransactionDraft();
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

  if (isEditing) {
    const exitEditing = () => {
      clearTransactionDraft();
      setIsEditing(false);
    };

    return (
      <SafeAreaView
        edges={['top', 'bottom', 'left', 'right']}
        style={[styles.editSafeArea, { backgroundColor: theme.background }]}>
        <View style={styles.editHeaderWrap}>
          <AppHeader
            title="Edit Transaction"
            showBack
            onBackPress={exitEditing}
          />
        </View>
        <TransactionForm
          transactionId={loadedTx.id}
          defaultCurrencyCode={loadedTx.currencyCode}
          dateFormat={settings.dateFormat}
          categories={categories}
          tags={tags}
          paymentMethods={paymentMethods}
          currencies={currencies}
          isEditing
          initialValues={{
            type: loadedTx.type,
            title: loadedTx.title,
            amountMinor: loadedTx.amountMinor,
            currencyCode: loadedTx.currencyCode,
            categoryId: loadedTx.categoryId,
            paymentMethodId: loadedTx.paymentMethodId,
            paymentMethod: loadedTx.paymentMethod,
            tagIds: loadedTx.tagIds,
            transactionDate: loadedTx.transactionDate,
            note: loadedTx.note,
          }}
          submitLabel="Save Changes"
          onCreateTag={createTag}
          onSubmit={handleUpdate}
          onCancel={exitEditing}
        />
      </SafeAreaView>
    );
  }

  return (
    <AppScreen edges={['top', 'bottom', 'left', 'right']}>
      <AppHeader
        title="Transaction Details"
        showBack
        rightAction={
          <Pressable
            onPress={() => setMenuVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="More actions"
            style={[
              styles.overflowBtn,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}>
            <Ionicons name="ellipsis-vertical" size={18} color={theme.text} />
          </Pressable>
        }
      />

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
          {formatMoney(signedAmount, loadedTx.currencyCode, {
            showSign: true,
            catalog: currencies,
          })}
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
        <DetailRow label="Currency" value={loadedTx.currencyCode} />
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <DetailRow label="Payment Method" value={loadedTx.paymentMethod} />

        {attachedTags.length > 0 ? (
          <>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <View style={styles.tagsRow}>
              <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
                Tags
              </Text>
              <View style={styles.tagsWrap}>
                {attachedTags.map((tag) => (
                  <View
                    key={tag.id}
                    style={[
                      styles.tagChip,
                      {
                        backgroundColor: `${tag.color}20`,
                        borderColor: tag.color,
                      },
                    ]}>
                    <View style={[styles.tagDot, { backgroundColor: tag.color }]} />
                    <Text style={[styles.tagText, { color: theme.text }]}>
                      {tag.name}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        ) : null}

        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <DetailRow
          label="Note"
          value={loadedTx.note ? loadedTx.note : 'No note added'}
        />
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <DetailRow
          label="Recorded"
          value={formatDateTimeForDisplay(loadedTx.createdAt, settings.dateFormat)}
        />
      </AppCard>

      {actionError ? (
        <Text style={[styles.errorText, { color: theme.danger }]}>
          {actionError}
        </Text>
      ) : null}

      {/* Text-Only Overflow Action Menu */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}>
        <Pressable
          style={[
            styles.menuBackdrop,
            {
              paddingTop: insets.top + 56,
              paddingRight: Math.max(insets.right, Spacing.three),
            },
          ]}
          onPress={() => setMenuVisible(false)}>
          <View
            style={[
              styles.menuCard,
              {
                width: Math.min(180, width * 0.55),
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}>
            <Pressable
              onPress={() => {
                setMenuVisible(false);
                setIsEditing(true);
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}>
              <Text style={[styles.menuItemText, { color: theme.text }]}>Edit</Text>
            </Pressable>

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            <Pressable
              onPress={() => {
                setMenuVisible(false);
                setDeleteDialogVisible(true);
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}>
              <Text style={[styles.menuItemText, { color: theme.danger }]}>Delete</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <ConfirmDialog
        visible={deleteDialogVisible}
        title="Delete Transaction?"
        message={`Delete "${loadedTx.title}" (${formatMoney(loadedTx.amountMinor, loadedTx.currencyCode, { catalog: currencies })})? Your balance and reports will update immediately.`}
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
  editSafeArea: {
    flex: 1,
  },
  editHeaderWrap: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  overflowBtn: {
    width: 38,
    height: 38,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  tagsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.one,
  },
  tagsWrap: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 6,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  tagDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '600',
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
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'flex-end',
  },
  menuCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  menuItem: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three - 2,
  },
  menuItemPressed: {
    opacity: 0.72,
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
