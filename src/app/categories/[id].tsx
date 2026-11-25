import { useLocalSearchParams, useRouter } from 'expo-router';
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

import {
  AppButton,
  AppCard,
  AppHeader,
  AppInput,
  AppScreen,
  CategoryIcon,
  ConfirmDialog,
  EmptyState,
} from '@/components/common';
import {
  CATEGORY_COLOR_OPTIONS,
  CATEGORY_ICON_OPTIONS,
} from '@/constants/categories';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';
import { formatMoney } from '@/utils/money';
import { validateCategoryName } from '@/utils/validation';

export default function CategoryDetailsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const categories = useAppStore((s) => s.categories);
  const currencies = useAppStore((s) => s.currencies);
  const transactions = useAppStore((s) => s.transactions);
  const updateCategory = useAppStore((s) => s.updateCategory);

  const category = categories.find((c) => c.id === id) ?? null;

  const [editVisible, setEditVisible] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [parentIdInput, setParentIdInput] = useState<string | null>(null);
  const [iconInput, setIconInput] = useState<string>(CATEGORY_ICON_OPTIONS[0]);
  const [colorInput, setColorInput] = useState<string>(CATEGORY_COLOR_OPTIONS[0]);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [archiveDialogVisible, setArchiveDialogVisible] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const stats = useMemo(() => {
    if (!category) return { count: 0, totals: [] as { code: string; minor: number }[] };
    let count = 0;
    const byCurrency = new Map<string, number>();
    for (const tx of transactions) {
      if (tx.categoryId === category.id) {
        count += 1;
        byCurrency.set(
          tx.currencyCode,
          (byCurrency.get(tx.currencyCode) ?? 0) + tx.amountMinor,
        );
      }
    }
    return {
      count,
      totals: Array.from(byCurrency.entries()).map(([code, minor]) => ({ code, minor })),
    };
  }, [category, transactions]);

  const parentCandidates = useMemo(() => {
    if (!category) return [];
    return categories.filter(
      (c) =>
        c.type === category.type &&
        !c.isArchived &&
        c.parentId === null &&
        c.id !== category.id,
    );
  }, [categories, category]);

  if (!category) {
    return (
      <AppScreen edges={['top', 'bottom', 'left', 'right']}>
        <AppHeader title="Category Details" showBack />
        <EmptyState
          icon="alert-circle-outline"
          title="Category not found"
          description="This category may no longer exist."
          actionLabel="Go Back"
          onAction={() => router.back()}
        />
      </AppScreen>
    );
  }

  const parentCategory = category.parentId
    ? categories.find((c) => c.id === category.parentId) ?? null
    : null;

  const openEditModal = () => {
    setNameInput(category.name);
    setParentIdInput(category.parentId);
    setIconInput(category.icon);
    setColorInput(category.color);
    setEditorError(null);
    setEditVisible(true);
  };

  const handleSaveEdit = async () => {
    if (saving) return;
    setEditorError(null);

    const validation = validateCategoryName(nameInput);
    if (!validation.valid || !validation.value) {
      setEditorError(validation.error ?? 'Invalid category name.');
      return;
    }

    const duplicate = categories.find(
      (c) =>
        c.type === category.type &&
        c.name.toLowerCase() === validation.value!.toLowerCase() &&
        c.id !== category.id,
    );
    if (duplicate) {
      setEditorError('A category with this name already exists.');
      return;
    }

    setSaving(true);
    try {
      await updateCategory(category.id, {
        name: validation.value,
        parentId: parentIdInput,
        icon: iconInput,
        color: colorInput,
      });
      setEditVisible(false);
    } catch (error) {
      setEditorError(
        error instanceof Error ? error.message : 'Unable to save category.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggleArchive = async () => {
    if (archiving) return;
    setArchiving(true);
    setActionError(null);
    try {
      await updateCategory(category.id, {
        isArchived: !category.isArchived,
      });
      setArchiveDialogVisible(false);
    } catch {
      setArchiveDialogVisible(false);
      setActionError('Unable to update category status.');
    } finally {
      setArchiving(false);
    }
  };

  const isIncome = category.type === 'income';

  return (
    <AppScreen
      edges={['top', 'bottom', 'left', 'right']}
      footer={
        <View style={styles.footerRow}>
          <View style={styles.flex1}>
            <AppButton
              label={category.isArchived ? 'Restore' : 'Archive'}
              variant="outline"
              onPress={() => setArchiveDialogVisible(true)}
              fullWidth
            />
          </View>
          <View style={styles.flex1}>
            <AppButton label="Edit" onPress={openEditModal} fullWidth />
          </View>
        </View>
      }>
      <AppHeader title="Category Details" showBack />

      <AppCard>
        <View style={styles.heroRow}>
          <CategoryIcon icon={category.icon} color={category.color} size={52} />
          <View style={styles.heroBadges}>
            <View
              style={[
                styles.typeBadge,
                { backgroundColor: isIncome ? theme.incomeSoft : theme.expenseSoft },
              ]}>
              <Text
                style={[
                  styles.typeBadgeText,
                  { color: isIncome ? theme.income : theme.expense },
                ]}>
                {isIncome ? 'Income' : 'Expense'}
              </Text>
            </View>
            {category.isArchived ? (
              <View
                style={[
                  styles.typeBadge,
                  { backgroundColor: theme.surfaceElevated },
                ]}>
                <Text style={[styles.typeBadgeText, { color: theme.textMuted }]}>
                  Archived
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        <Text style={[styles.catTitle, { color: theme.text }]}>{category.name}</Text>
      </AppCard>

      <AppCard>
        <DetailRow
          label="Hierarchy"
          value={parentCategory ? `Subcategory of ${parentCategory.name}` : 'Top-Level'}
        />
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <DetailRow label="Transactions" value={String(stats.count)} />
        {stats.totals.length > 0 ? (
          <>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <DetailRow
              label="Total"
              value={stats.totals
                .map((t) => formatMoney(t.minor, t.code, { catalog: currencies }))
                .join(' · ')}
            />
          </>
        ) : null}
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <DetailRow
          label="Status"
          value={category.isArchived ? 'Archived' : 'Active'}
        />
      </AppCard>

      {actionError ? (
        <Text style={[styles.errorText, { color: theme.danger }]}>{actionError}</Text>
      ) : null}

      <Modal
        visible={editVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditVisible(false)}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable
            style={styles.backdropDismiss}
            onPress={() => setEditVisible(false)}
          />
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              Edit Category
            </Text>

            <ScrollView
              style={styles.modalScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              <View style={styles.modalBody}>
                <AppInput
                  label="Category Name"
                  value={nameInput}
                  onChangeText={(text) => {
                    setNameInput(text);
                    if (editorError) setEditorError(null);
                  }}
                  placeholder="Category name"
                  maxLength={40}
                  error={editorError}
                />

                {parentCandidates.length > 0 ? (
                  <>
                    <Text style={[styles.fieldLabel, { color: theme.text }]}>
                      Parent Category (Optional)
                    </Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.parentChips}>
                      <Pressable
                        onPress={() => setParentIdInput(null)}
                        style={[
                          styles.parentChip,
                          {
                            backgroundColor:
                              parentIdInput === null
                                ? theme.primarySoft
                                : theme.surfaceElevated,
                            borderColor:
                              parentIdInput === null ? theme.primary : theme.border,
                          },
                        ]}>
                        <Text
                          style={[
                            styles.parentChipText,
                            {
                              color:
                                parentIdInput === null ? theme.primary : theme.text,
                            },
                          ]}>
                          Top-Level
                        </Text>
                      </Pressable>
                      {parentCandidates.map((p) => {
                        const selected = parentIdInput === p.id;
                        return (
                          <Pressable
                            key={p.id}
                            onPress={() => setParentIdInput(p.id)}
                            style={[
                              styles.parentChip,
                              {
                                backgroundColor: selected
                                  ? theme.primarySoft
                                  : theme.surfaceElevated,
                                borderColor: selected ? theme.primary : theme.border,
                              },
                            ]}>
                            <Text
                              style={[
                                styles.parentChipText,
                                { color: selected ? theme.primary : theme.text },
                              ]}>
                              {p.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </>
                ) : null}

                <Text style={[styles.fieldLabel, { color: theme.text }]}>Icon</Text>
                <View style={styles.optionGrid}>
                  {CATEGORY_ICON_OPTIONS.map((iconKey) => {
                    const selected = iconInput === iconKey;
                    return (
                      <Pressable
                        key={iconKey}
                        onPress={() => setIconInput(iconKey)}
                        style={[
                          styles.iconChoice,
                          {
                            borderColor: selected ? theme.primary : theme.border,
                            backgroundColor: selected
                              ? theme.primarySoft
                              : theme.surfaceElevated,
                          },
                        ]}>
                        <CategoryIcon icon={iconKey} color={colorInput} size={32} />
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={[styles.fieldLabel, { color: theme.text }]}>Color</Text>
                <View style={styles.optionGrid}>
                  {CATEGORY_COLOR_OPTIONS.map((swatch) => {
                    const selected = colorInput === swatch;
                    return (
                      <Pressable
                        key={swatch}
                        onPress={() => setColorInput(swatch)}
                        style={[
                          styles.colorSwatch,
                          {
                            backgroundColor: swatch,
                            borderColor: selected ? theme.text : 'transparent',
                            borderWidth: selected ? 3 : 0,
                          },
                        ]}
                      />
                    );
                  })}
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <View style={styles.flex1}>
                <AppButton
                  label="Cancel"
                  variant="outline"
                  onPress={() => setEditVisible(false)}
                  disabled={saving}
                  fullWidth
                />
              </View>
              <View style={styles.flex1}>
                <AppButton
                  label="Save"
                  onPress={() => void handleSaveEdit()}
                  loading={saving}
                  fullWidth
                />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ConfirmDialog
        visible={archiveDialogVisible}
        title={category.isArchived ? 'Restore Category?' : 'Archive Category?'}
        message={
          category.isArchived
            ? `Restore "${category.name}" so it appears in new transaction forms?`
            : `Archive "${category.name}"? Existing transactions will keep their historical category.`
        }
        confirmLabel={category.isArchived ? 'Restore' : 'Archive'}
        cancelLabel="Cancel"
        loading={archiving}
        onConfirm={() => void handleToggleArchive()}
        onCancel={() => setArchiveDialogVisible(false)}
      />
    </AppScreen>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: theme.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroBadges: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  typeBadge: {
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radius.full,
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  catTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: Spacing.one,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingVertical: Spacing.one,
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
    flexShrink: 1,
  },
  divider: {
    height: 1,
    width: '100%',
  },
  footerRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  flex1: {
    flex: 1,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
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
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.three,
    maxHeight: '86%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalScroll: {
    maxHeight: 420,
  },
  modalBody: {
    gap: Spacing.three,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  parentChips: {
    gap: Spacing.two,
  },
  parentChip: {
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  parentChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  iconChoice: {
    padding: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  colorSwatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
});
