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
  TextInput,
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

export default function CategoriesScreen() {
  const theme = useTheme();

  const currencies = useAppStore((s) => s.currencies);
  const categories = useAppStore((s) => s.categories);
  const transactions = useAppStore((s) => s.transactions);
  const createCategory = useAppStore((s) => s.createCategory);
  const updateCategory = useAppStore((s) => s.updateCategory);

  const [selectedType, setSelectedType] = useState<CategoryType>('expense');
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const [editorVisible, setEditorVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [parentIdInput, setParentIdInput] = useState<string | null>(null);
  const [iconInput, setIconInput] = useState<string>(CATEGORY_ICON_OPTIONS[0]);
  const [colorInput, setColorInput] = useState<string>(CATEGORY_COLOR_OPTIONS[0]);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [archiveTarget, setArchiveTarget] = useState<Category | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const typeOptions = useMemo<readonly SegmentOption<CategoryType>[]>(
    () => [
      {
        label: 'Expense',
        value: 'expense',
        activeColor: theme.expense,
        activeTextColor: '#FFFFFF',
      },
      {
        label: 'Income',
        value: 'income',
        activeColor: theme.income,
        activeTextColor: '#FFFFFF',
      },
    ],
    [theme.expense, theme.income],
  );

  // Store per-currency totals per category so distinct currencies are never combined
  const categoryStats = useMemo(() => {
    const stats = new Map<
      string,
      { count: number; byCurrency: Map<string, number> }
    >();
    for (const tx of transactions) {
      if (!tx.categoryId) continue;
      const entry = stats.get(tx.categoryId) ?? {
        count: 0,
        byCurrency: new Map<string, number>(),
      };
      entry.count += 1;
      entry.byCurrency.set(
        tx.currencyCode,
        (entry.byCurrency.get(tx.currencyCode) ?? 0) + tx.amountMinor,
      );
      stats.set(tx.categoryId, entry);
    }
    return stats;
  }, [transactions]);

  const parentCandidates = useMemo(
    () =>
      categories.filter(
        (c) =>
          c.type === (editingCategory?.type ?? selectedType) &&
          !c.isArchived &&
          c.parentId === null &&
          c.id !== editingCategory?.id,
      ),
    [categories, editingCategory, selectedType],
  );

  const orderedCategories = useMemo(() => {
    const base = categories.filter(
      (cat) =>
        cat.type === selectedType && (showArchived ? true : !cat.isArchived),
    );
    const term = searchQuery.trim().toLowerCase();
    if (term) {
      return base.filter((c) => c.name.toLowerCase().includes(term));
    }

    const roots = base
      .filter((c) => !c.parentId)
      .sort((a, b) => a.name.localeCompare(b.name));
    const list: Category[] = [];
    for (const root of roots) {
      list.push(root);
      const children = base
        .filter((c) => c.parentId === root.id)
        .sort((a, b) => a.name.localeCompare(b.name));
      list.push(...children);
    }
    const seen = new Set(list.map((c) => c.id));
    for (const cat of base) {
      if (!seen.has(cat.id)) list.push(cat);
    }
    return list;
  }, [categories, selectedType, showArchived, searchQuery]);

  const categoryNameMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  );

  const openCreateModal = () => {
    setEditingCategory(null);
    setNameInput('');
    setParentIdInput(null);
    setIconInput(selectedType === 'income' ? 'briefcase' : 'tag');
    setColorInput(CATEGORY_COLOR_OPTIONS[0]);
    setEditorError(null);
    setEditorVisible(true);
  };

  const openEditModal = (cat: Category) => {
    setEditingCategory(cat);
    setNameInput(cat.name);
    setParentIdInput(cat.parentId);
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
          parentId: parentIdInput,
          icon: iconInput,
          color: colorInput,
        });
      } else {
        await createCategory({
          name: validation.value,
          type: selectedType,
          parentId: parentIdInput,
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
    setActionError(null);
    try {
      await updateCategory(archiveTarget.id, {
        isArchived: !archiveTarget.isArchived,
      });
      setArchiveTarget(null);
    } catch {
      setArchiveTarget(null);
      setActionError('Unable to update category status. Please try again.');
    } finally {
      setArchiving(false);
    }
  };

  return (
    <AppScreen edges={['top', 'bottom', 'left', 'right']}>
      <AppHeader
        title="Categories"
        subtitle={`${orderedCategories.length} ${selectedType} categories`}
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
        options={typeOptions}
        value={selectedType}
        onChange={setSelectedType}
      />

      {/* Searchable bar for large category sets */}
      <View
        style={[
          styles.searchBar,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}>
        <Ionicons name="search" size={18} color={theme.textMuted} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search categories..."
          placeholderTextColor={theme.textMuted}
          style={[styles.searchInput, { color: theme.text }]}
        />
        {searchQuery.length > 0 ? (
          <Pressable onPress={() => setSearchQuery('')} hitSlop={6}>
            <Ionicons name="close-circle" size={18} color={theme.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.filterBar}>
        <Text style={[styles.hintText, { color: theme.textSecondary }]}>
          Archiving hides a category from new forms while preserving historical names on past transactions.
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

      {actionError ? (
        <Text style={[styles.errorBanner, { color: theme.danger }]}>{actionError}</Text>
      ) : null}

      {orderedCategories.length === 0 ? (
        <EmptyState
          icon="pricetags-outline"
          title="No categories found"
          description="Try clearing your search or add a new category."
          actionLabel="Add Category"
          onAction={openCreateModal}
        />
      ) : (
        <View style={styles.list}>
          {orderedCategories.map((cat) => {
            const stat = categoryStats.get(cat.id);
            const parentName = cat.parentId ? categoryNameMap.get(cat.parentId) : null;
            const summaryParts = stat
              ? Array.from(stat.byCurrency.entries()).map(([code, minor]) =>
                  formatMoney(minor, code, { catalog: currencies }),
                )
              : [];
            const isSub = Boolean(cat.parentId) && !searchQuery;

            return (
              <AppCard key={cat.id} style={isSub ? styles.subCard : undefined}>
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
                    {parentName ? (
                      <Text style={[styles.parentLabel, { color: theme.primary }]}>
                        Subcategory of {parentName}
                      </Text>
                    ) : null}
                    <Text style={[styles.catTotal, { color: theme.textSecondary }]}>
                      {summaryParts.length > 0
                        ? `${stat?.count ?? 0} tx · ${summaryParts.join(' · ')}`
                        : 'No transactions yet'}
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
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable
            style={styles.backdropDismiss}
            onPress={() => setEditorVisible(false)}
          />
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              {editingCategory ? 'Edit Category' : `New ${selectedType} Category`}
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
                  placeholder="e.g. Subscriptions, Coffee"
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
          </View>
        </KeyboardAvoidingView>
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
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three - 2,
    minHeight: 42,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 6,
  },
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
  subCard: {
    marginLeft: Spacing.three,
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
  parentLabel: {
    fontSize: 11,
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
  flex1: {
    flex: 1,
  },
  errorBanner: {
    fontSize: 13,
    fontWeight: '600',
  },
});
