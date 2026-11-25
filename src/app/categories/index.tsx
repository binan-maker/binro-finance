import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  AppButton,
  AppCard,
  AppHeader,
  AppInput,
  AppScreen,
  CategoryIcon,
  ConfirmDialog,
  EmptyState,
  SegmentedControl,
  type SegmentOption,
} from '@/components/common';
import {
  CATEGORY_COLOR_OPTIONS,
  CATEGORY_ICON_OPTIONS,
} from '@/constants/categories';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';
import type { Category, CategoryType } from '@/types/models';
import { formatMoney } from '@/utils/money';
import { validateCategoryName } from '@/utils/validation';

const TYPE_OPTIONS: readonly SegmentOption<CategoryType>[] = [
  { label: 'Expense', value: 'expense' },
  { label: 'Income', value: 'income' },
];

export default function CategoriesScreen() {
  const theme = useTheme();

  const settings = useAppStore((s) => s.settings);
  const categories = useAppStore((s) => s.categories);
  const transactions = useAppStore((s) => s.transactions);
  const createCategory = useAppStore((s) => s.createCategory);
  const updateCategory = useAppStore((s) => s.updateCategory);

  const [selectedType, setSelectedType] = useState<CategoryType>('expense');
  const [showArchived, setShowArchived] = useState(false);

  const [editorVisible, setEditorVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [iconInput, setIconInput] = useState<string>(CATEGORY_ICON_OPTIONS[0]);
  const [colorInput, setColorInput] = useState<string>(CATEGORY_COLOR_OPTIONS[0]);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [archiveTarget, setArchiveTarget] = useState<Category | null>(null);
  const [archiving, setArchiving] = useState(false);

  const categoryTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const tx of transactions) {
      if (!tx.categoryId) continue;
      totals.set(tx.categoryId, (totals.get(tx.categoryId) ?? 0) + tx.amountMinor);
    }
    return totals;
  }, [transactions]);

  const filteredCategories = useMemo(
    () =>
      categories.filter(
        (cat) =>
          cat.type === selectedType && (showArchived ? true : !cat.isArchived),
      ),
    [categories, selectedType, showArchived],
  );

  const openCreateModal = () => {
    setEditingCategory(null);
    setNameInput('');
    setIconInput(selectedType === 'income' ? 'briefcase' : 'tag');
    setColorInput(CATEGORY_COLOR_OPTIONS[0]);
    setEditorError(null);
    setEditorVisible(true);
  };

  const openEditModal = (cat: Category) => {
    setEditingCategory(cat);
    setNameInput(cat.name);
    setIconInput(cat.icon);
    setColorInput(cat.color);
    setEditorError(null);
    setEditorVisible(true);
  };

  const handleSaveCategory = async () => {
    if (saving) return;
    setEditorError(null);

    const validation = validateCategoryName(nameInput);
    if (!validation.valid || !validation.value) {
      setEditorError(validation.error ?? 'Invalid category name.');
      return;
    }

    const duplicate = categories.find(
      (c) =>
        c.type === (editingCategory?.type ?? selectedType) &&
        c.name.toLowerCase() === validation.value!.toLowerCase() &&
        c.id !== editingCategory?.id,
    );
    if (duplicate) {
      setEditorError('A category with this name already exists.');
      return;
    }

    setSaving(true);
    try {
      if (editingCategory) {
        await updateCategory(editingCategory.id, {
          name: validation.value,
          icon: iconInput,
          color: colorInput,
        });
      } else {
        await createCategory({
          name: validation.value,
          type: selectedType,
          icon: iconInput,
          color: colorInput,
        });
      }
      setEditorVisible(false);
    } catch (error) {
      setEditorError(
        error instanceof Error ? error.message : 'Unable to save category.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggleArchive = async () => {
    if (!archiveTarget || archiving) return;
    setArchiving(true);
    try {
      await updateCategory(archiveTarget.id, {
        isArchived: !archiveTarget.isArchived,
      });
      setArchiveTarget(null);
    } finally {
      setArchiving(false);
    }
  };

  return (
    <AppScreen>
      <AppHeader
        title="Categories"
        subtitle={`${filteredCategories.length} ${selectedType} categories`}
        showBack
        rightAction={
          <AppButton
            label="Add"
            size="sm"
            icon={<Ionicons name="add" size={16} color={theme.primaryText} />}
            onPress={openCreateModal}
          />
        }
      />

      <SegmentedControl
        options={TYPE_OPTIONS}
        value={selectedType}
        onChange={setSelectedType}
      />

      <View style={styles.filterBar}>
        <Text style={[styles.hintText, { color: theme.textSecondary }]}>
          Archiving hides a category from new forms while preserving historical transactions.
        </Text>
        <Pressable
          onPress={() => setShowArchived((v) => !v)}
          style={[
            styles.toggleChip,
            {
              backgroundColor: showArchived
                ? theme.primarySoft
                : theme.surfaceElevated,
              borderColor: showArchived ? theme.primary : theme.border,
            },
          ]}>
          <Text
            style={[
              styles.toggleChipText,
              { color: showArchived ? theme.primary : theme.textSecondary },
            ]}>
            {showArchived ? 'Showing Archived' : 'Show Archived'}
          </Text>
        </Pressable>
      </View>

      {filteredCategories.length === 0 ? (
        <EmptyState
          icon="pricetags-outline"
          title="No categories"
          description="Add a custom category to organize your transactions."
          actionLabel="Add Category"
          onAction={openCreateModal}
        />
      ) : (
        <View style={styles.list}>
          {filteredCategories.map((cat) => {
            const totalMinor = categoryTotals.get(cat.id) ?? 0;
            return (
              <AppCard key={cat.id}>
                <View style={styles.catRow}>
                  <CategoryIcon icon={cat.icon} color={cat.color} size={40} />
                  <View style={styles.catMeta}>
                    <View style={styles.nameRow}>
                      <Text style={[styles.catName, { color: theme.text }]}>
                        {cat.name}
                      </Text>
                      {cat.isArchived ? (
                        <View
                          style={[
                            styles.badge,
                            { backgroundColor: theme.surfaceElevated },
                          ]}>
                          <Text
                            style={[styles.badgeText, { color: theme.textMuted }]}>
                            Archived
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={[styles.catTotal, { color: theme.textSecondary }]}>
                      Total recorded: {formatMoney(totalMinor, settings.currencyCode)}
                    </Text>
                  </View>

                  <View style={styles.rowActions}>
                    <Pressable
                      onPress={() => openEditModal(cat)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${cat.name}`}>
                      <Ionicons
                        name="create-outline"
                        size={19}
                        color={theme.primary}
                      />
                    </Pressable>
                    <Pressable
                      onPress={() => setArchiveTarget(cat)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={
                        cat.isArchived ? `Restore ${cat.name}` : `Archive ${cat.name}`
                      }>
                      <Ionicons
                        name={cat.isArchived ? 'refresh-outline' : 'archive-outline'}
                        size={19}
                        color={theme.textSecondary}
                      />
                    </Pressable>
                  </View>
                </View>
              </AppCard>
            );
          })}
        </View>
      )}

      {/* Add / Edit Category Modal */}
      <Modal
        visible={editorVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditorVisible(false)}>
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setEditorVisible(false)}>
          <Pressable
            style={[
              styles.modalSheet,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
            onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              {editingCategory ? 'Edit Category' : `New ${selectedType} Category`}
            </Text>

            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.modalBody}>
                <AppInput
                  label="Category Name"
                  value={nameInput}
                  onChangeText={(text) => {
                    setNameInput(text);
                    if (editorError) setEditorError(null);
                  }}
                  placeholder="e.g. Subscriptions, Groceries"
                  maxLength={40}
                  error={editorError}
                />

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
                  onPress={() => setEditorVisible(false)}
                  disabled={saving}
                  fullWidth
                />
              </View>
              <View style={styles.flex1}>
                <AppButton
                  label="Save"
                  onPress={() => void handleSaveCategory()}
                  loading={saving}
                  fullWidth
                />
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <ConfirmDialog
        visible={Boolean(archiveTarget)}
        title={archiveTarget?.isArchived ? 'Restore Category?' : 'Archive Category?'}
        message={
          archiveTarget?.isArchived
            ? `Restore "${archiveTarget.name}" so it appears when adding new transactions?`
            : `Archive "${archiveTarget?.name}"? Existing transactions will keep their historical category.`
        }
        confirmLabel={archiveTarget?.isArchived ? 'Restore' : 'Archive'}
        cancelLabel="Cancel"
        loading={archiving}
        onConfirm={() => void handleToggleArchive()}
        onCancel={() => setArchiveTarget(null)}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  filterBar: {
    gap: Spacing.two,
  },
  hintText: {
    fontSize: 12,
    lineHeight: 17,
  },
  toggleChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  toggleChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  list: {
    gap: Spacing.two,
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
  },
  catMeta: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  catName: {
    fontSize: 15,
    fontWeight: '600',
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  catTotal: {
    fontSize: 12,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.three,
    maxHeight: '85%',
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
  flex1: {
    flex: 1,
  },
});
