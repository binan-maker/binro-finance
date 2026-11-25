import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { BudgetProgressCard } from '@/components/budgets/BudgetProgressCard';
import {
  AppButton,
  AppCard,
  AppHeader,
  AppInput,
  AppScreen,
  ConfirmDialog,
  EmptyState,
} from '@/components/common';
import { getCurrencyConfig } from '@/constants/currencies';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { calculateBudgetProgress } from '@/services/calculations/financialCalculations';
import { useAppStore } from '@/store/app-store';
import type { Budget } from '@/types/models';
import { getMonthLabel } from '@/utils/date';
import { formatMinorToMajorInput } from '@/utils/money';
import { validatePositiveAmountInput } from '@/utils/validation';

export default function BudgetsScreen() {
  const theme = useTheme();

  const settings = useAppStore((s) => s.settings);
  const currencies = useAppStore((s) => s.currencies);
  const categories = useAppStore((s) => s.categories);
  const transactions = useAppStore((s) => s.transactions);
  const budgets = useAppStore((s) => s.budgets);
  const upsertBudget = useAppStore((s) => s.upsertBudget);
  const deleteBudget = useAppStore((s) => s.deleteBudget);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingScope, setEditingScope] = useState<'overall' | 'category'>('overall');
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Budget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const activeCurrencyCode = settings.currencyCode;
  const currency = getCurrencyConfig(activeCurrencyCode, currencies);
  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );
  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === 'expense' && !c.isArchived),
    [categories],
  );

  const monthBudgets = useMemo(
    () =>
      budgets.filter(
        (b) =>
          b.year === year &&
          b.month === month &&
          b.currencyCode.toUpperCase() === activeCurrencyCode.toUpperCase(),
      ),
    [budgets, year, month, activeCurrencyCode],
  );

  const overallBudget = monthBudgets.find((b) => b.categoryId === null) ?? null;
  const categoryBudgets = monthBudgets.filter((b) => b.categoryId !== null);

  const overallProgress = useMemo(() => {
    if (!overallBudget) return null;
    return calculateBudgetProgress({
      budget: overallBudget,
      transactions,
      category: null,
    });
  }, [overallBudget, transactions]);

  const categoryProgressList = useMemo(
    () =>
      categoryBudgets.map((b) =>
        calculateBudgetProgress({
          budget: b,
          transactions,
          category: b.categoryId ? categoryMap.get(b.categoryId) ?? null : null,
        }),
      ),
    [categoryBudgets, transactions, categoryMap],
  );

  const availableCategoriesForNewBudget = useMemo(() => {
    const budgetedIds = new Set(
      categoryBudgets.map((b) => b.categoryId).filter(Boolean),
    );
    return expenseCategories.filter((c) => !budgetedIds.has(c.id));
  }, [expenseCategories, categoryBudgets]);

  const stepMonth = (delta: number) => {
    let nextMonth = month + delta;
    let nextYear = year;
    if (nextMonth < 1) {
      nextMonth = 12;
      nextYear -= 1;
    } else if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    setMonth(nextMonth);
    setYear(nextYear);
  };

  const openOverallModal = () => {
    setEditingScope('overall');
    setEditingBudget(overallBudget);
    setSelectedCategoryId(null);
    setAmountInput(
      overallBudget
        ? formatMinorToMajorInput(overallBudget.amountMinor, activeCurrencyCode, currencies)
        : '',
    );
    setFormError(null);
    setModalVisible(true);
  };

  const openCategoryBudgetModal = (existingBudget?: Budget) => {
    setEditingScope('category');
    setEditingBudget(existingBudget ?? null);
    if (existingBudget && existingBudget.categoryId) {
      setSelectedCategoryId(existingBudget.categoryId);
      setAmountInput(
        formatMinorToMajorInput(existingBudget.amountMinor, activeCurrencyCode, currencies),
      );
    } else {
      setSelectedCategoryId(availableCategoriesForNewBudget[0]?.id ?? null);
      setAmountInput('');
    }
    setFormError(null);
    setModalVisible(true);
  };

  const handleSaveBudget = async () => {
    if (saving) return;
    setFormError(null);

    const validation = validatePositiveAmountInput(
      amountInput,
      activeCurrencyCode,
      currencies,
    );
    if (!validation.valid || validation.value === undefined) {
      setFormError(validation.error ?? 'Enter a valid budget amount.');
      return;
    }

    if (editingScope === 'category' && !selectedCategoryId) {
      setFormError('Please select a category.');
      return;
    }

    setSaving(true);
    try {
      await upsertBudget({
        amountMinor: validation.value,
        currencyCode: activeCurrencyCode,
        month,
        year,
        categoryId: editingScope === 'overall' ? null : selectedCategoryId,
      });
      setModalVisible(false);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'Unable to save budget.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBudget = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setActionError(null);
    try {
      await deleteBudget(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      setDeleteTarget(null);
      setActionError('Unable to delete budget. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AppScreen edges={['top', 'bottom', 'left', 'right']}>
      <AppHeader
        title="Budgets"
        subtitle={`Monthly spending limits (${activeCurrencyCode})`}
        showBack
      />

      {actionError ? (
        <Text style={[styles.errorBanner, { color: theme.danger }]}>{actionError}</Text>
      ) : null}

      <AppCard>
        <View style={styles.monthRow}>
          <Pressable
            onPress={() => stepMonth(-1)}
            accessibilityRole="button"
            style={[styles.navBtn, { borderColor: theme.border }]}>
            <Ionicons name="chevron-back" size={18} color={theme.text} />
          </Pressable>
          <Text style={[styles.monthTitle, { color: theme.text }]}>
            {getMonthLabel(year, month)}
          </Text>
          <Pressable
            onPress={() => stepMonth(1)}
            accessibilityRole="button"
            style={[styles.navBtn, { borderColor: theme.border }]}>
            <Ionicons name="chevron-forward" size={18} color={theme.text} />
          </Pressable>
        </View>
      </AppCard>

      <Text style={[styles.sectionHeading, { color: theme.text }]}>
        Monthly Overall Budget
      </Text>
      {overallProgress ? (
        <BudgetProgressCard
          progress={overallProgress}
          currencyCode={activeCurrencyCode}
          currencies={currencies}
          onEdit={openOverallModal}
          onDelete={() => setDeleteTarget(overallProgress.budget)}
        />
      ) : (
        <EmptyState
          icon="pie-chart-outline"
          title="No overall monthly budget"
          description={`Set an overall spending limit for ${getMonthLabel(year, month)} (${activeCurrencyCode}) without affecting existing transactions.`}
          actionLabel="Set Overall Budget"
          onAction={openOverallModal}
        />
      )}

      <View style={styles.sectionHeaderRow}>
        <Text style={[styles.sectionHeading, { color: theme.text }]}>
          Category Budgets
        </Text>
        <AppButton
          label="Add"
          size="sm"
          variant="outline"
          disabled={availableCategoriesForNewBudget.length === 0}
          icon={<Ionicons name="add" size={16} color={theme.text} />}
          onPress={() => openCategoryBudgetModal()}
        />
      </View>

      {categoryProgressList.length === 0 ? (
        <EmptyState
          icon="pricetags-outline"
          title="No category budgets"
          description="Optionally set spending caps for specific expense categories such as Food & Drink or Shopping."
          actionLabel={
            availableCategoriesForNewBudget.length > 0
              ? 'Add Category Budget'
              : undefined
          }
          onAction={
            availableCategoriesForNewBudget.length > 0
              ? () => openCategoryBudgetModal()
              : undefined
          }
        />
      ) : (
        <View style={styles.list}>
          {categoryProgressList.map((prog) => (
            <BudgetProgressCard
              key={prog.budget.id}
              progress={prog}
              currencyCode={activeCurrencyCode}
              currencies={currencies}
              onEdit={() => openCategoryBudgetModal(prog.budget)}
              onDelete={() => setDeleteTarget(prog.budget)}
            />
          ))}
        </View>
      )}

      {/* Budget Upsert Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={styles.backdropDismiss} onPress={() => setModalVisible(false)} />
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              {editingScope === 'overall'
                ? `Overall Budget (${getMonthLabel(year, month)})`
                : `Category Budget (${getMonthLabel(year, month)})`}
            </Text>

            {editingScope === 'category' ? (
              editingBudget && selectedCategoryId ? (
                <Text style={[styles.editingCategoryLabel, { color: theme.textSecondary }]}>
                  Category: {categoryMap.get(selectedCategoryId)?.name ?? 'Selected Category'}
                </Text>
              ) : (
                <ScrollView
                  style={styles.catScroll}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}>
                  <View style={styles.catChips}>
                    {expenseCategories.map((cat) => {
                      const isCurrentEdit = selectedCategoryId === cat.id;
                      const alreadyHasBudget = categoryBudgets.some(
                        (b) => b.categoryId === cat.id,
                      );
                      const disabled = alreadyHasBudget && !isCurrentEdit;
                      return (
                        <Pressable
                          key={cat.id}
                          disabled={disabled}
                          onPress={() => setSelectedCategoryId(cat.id)}
                          style={[
                            styles.catChip,
                            {
                              backgroundColor: isCurrentEdit
                                ? theme.primarySoft
                                : theme.surfaceElevated,
                              borderColor: isCurrentEdit ? theme.primary : theme.border,
                              opacity: disabled ? 0.45 : 1,
                            },
                          ]}>
                          <Text
                            style={[
                              styles.catChipText,
                              { color: isCurrentEdit ? theme.primary : theme.text },
                            ]}>
                            {cat.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              )
            ) : null}

            <AppInput
              label={`Monthly Limit (${activeCurrencyCode})`}
              prefix={currency.symbol}
              value={amountInput}
              onChangeText={(text) => {
                setAmountInput(text);
                if (formError) setFormError(null);
              }}
              keyboardType={currency.minorUnits === 0 ? 'number-pad' : 'decimal-pad'}
              placeholder={currency.minorUnits === 0 ? '0' : '0.00'}
              error={formError}
            />

            <View style={styles.modalActions}>
              <View style={styles.flex1}>
                <AppButton
                  label="Cancel"
                  variant="outline"
                  onPress={() => setModalVisible(false)}
                  disabled={saving}
                  fullWidth
                />
              </View>
              <View style={styles.flex1}>
                <AppButton
                  label="Save Budget"
                  onPress={() => void handleSaveBudget()}
                  loading={saving}
                  fullWidth
                />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ConfirmDialog
        visible={Boolean(deleteTarget)}
        title="Delete Budget?"
        message="Remove this monthly budget limit? Your recorded transactions will not be affected."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        loading={deleting}
        onConfirm={() => void handleDeleteBudget()}
        onCancel={() => setDeleteTarget(null)}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: Radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  list: {
    gap: Spacing.two,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  backdropDismiss: {
    flex: 1,
  },
  modalSheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    padding: Spacing.four,
    gap: Spacing.three,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  catScroll: {
    maxHeight: 200,
  },
  catChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  catChip: {
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  catChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  flex1: {
    flex: 1,
  },
  errorBanner: {
    fontSize: 13,
    fontWeight: '600',
  },
  editingCategoryLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
});
