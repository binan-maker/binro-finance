import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { CategoryIcon } from '@/components/common';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Category, CategoryType } from '@/types/models';

interface CategoryPickerModalProps {
  visible: boolean;
  type: CategoryType;
  categories: readonly Category[];
  selectedId: string | null;
  onSelect: (category: Category) => void;
  onClose: () => void;
}

interface DisplayCategoryItem {
  category: Category;
  parentName?: string;
  isSubcategory: boolean;
}

export function CategoryPickerModal({
  visible,
  type,
  categories,
  selectedId,
  onSelect,
  onClose,
}: CategoryPickerModalProps) {
  const theme = useTheme();
  const [search, setSearch] = useState('');

  const items = useMemo<DisplayCategoryItem[]>(() => {
    const activeForType = categories.filter(
      (cat) => cat.type === type && (!cat.isArchived || cat.id === selectedId),
    );
    const parentMap = new Map(activeForType.map((c) => [c.id, c]));
    const term = search.trim().toLowerCase();

    if (term.length > 0) {
      return activeForType
        .filter((cat) => {
          const parentName = cat.parentId ? parentMap.get(cat.parentId)?.name ?? '' : '';
          return (
            cat.name.toLowerCase().includes(term) ||
            parentName.toLowerCase().includes(term)
          );
        })
        .map((cat) => ({
          category: cat,
          parentName: cat.parentId ? parentMap.get(cat.parentId)?.name : undefined,
          isSubcategory: Boolean(cat.parentId),
        }));
    }

    const roots = activeForType
      .filter((c) => !c.parentId)
      .sort((a, b) => a.name.localeCompare(b.name));
    const ordered: DisplayCategoryItem[] = [];

    for (const root of roots) {
      ordered.push({ category: root, isSubcategory: false });
      const children = activeForType
        .filter((c) => c.parentId === root.id)
        .sort((a, b) => a.name.localeCompare(b.name));
      for (const child of children) {
        ordered.push({
          category: child,
          parentName: root.name,
          isSubcategory: true,
        });
      }
    }

    // Include orphan subcategories whose parent was archived
    const includedIds = new Set(ordered.map((o) => o.category.id));
    for (const cat of activeForType) {
      if (!includedIds.has(cat.id)) {
        ordered.push({
          category: cat,
          parentName: cat.parentId ? parentMap.get(cat.parentId)?.name : undefined,
          isSubcategory: Boolean(cat.parentId),
        });
      }
    }

    return ordered;
  }, [categories, type, selectedId, search]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={styles.backdropDismiss} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}>
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: theme.text }]}>
              Select Category
            </Text>
            <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button">
              <Ionicons name="close" size={22} color={theme.textSecondary} />
            </Pressable>
          </View>

          <View
            style={[
              styles.searchBox,
              { backgroundColor: theme.surfaceElevated, borderColor: theme.border },
            ]}>
            <Ionicons name="search" size={18} color={theme.textMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search categories or subcategories..."
              placeholderTextColor={theme.textMuted}
              style={[styles.searchInput, { color: theme.text }]}
              autoCorrect={false}
            />
            {search.length > 0 ? (
              <Pressable onPress={() => setSearch('')} hitSlop={6}>
                <Ionicons name="close-circle" size={18} color={theme.textMuted} />
              </Pressable>
            ) : null}
          </View>

          <FlatList
            data={items}
            keyExtractor={(item) => item.category.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                No matching categories found.
              </Text>
            }
            renderItem={({ item }) => {
              const selected = item.category.id === selectedId;
              return (
                <Pressable
                  onPress={() => {
                    onSelect(item.category);
                    setSearch('');
                    onClose();
                  }}
                  style={[
                    styles.row,
                    item.isSubcategory && !search ? styles.subRow : null,
                    {
                      backgroundColor: selected ? theme.primarySoft : 'transparent',
                      borderColor: selected ? theme.primary : theme.border,
                    },
                  ]}>
                  <CategoryIcon
                    icon={item.category.icon}
                    color={item.category.color}
                    size={36}
                  />
                  <View style={styles.rowText}>
                    <Text style={[styles.rowName, { color: theme.text }]} numberOfLines={1}>
                      {item.category.name}
                    </Text>
                    {item.parentName ? (
                      <Text style={[styles.rowSub, { color: theme.textMuted }]}>
                        {item.parentName}
                      </Text>
                    ) : null}
                  </View>
                  {selected ? (
                    <Ionicons name="checkmark-circle" size={20} color={theme.primary} />
                  ) : null}
                </Pressable>
              );
            }}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  backdropDismiss: {
    flex: 1,
  },
  sheet: {
    maxHeight: '78%',
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    padding: Spacing.three,
    gap: Spacing.three - 2,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  searchBox: {
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
    paddingVertical: 8,
  },
  listContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.four,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    padding: Spacing.two + 2,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  subRow: {
    marginLeft: Spacing.four,
  },
  rowText: {
    flex: 1,
    gap: 1,
  },
  rowName: {
    fontSize: 15,
    fontWeight: '600',
  },
  rowSub: {
    fontSize: 12,
  },
  emptyText: {
    textAlign: 'center',
    paddingVertical: Spacing.four,
    fontSize: 14,
  },
});
