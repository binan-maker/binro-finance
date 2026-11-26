import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BottomSheetModal, CategoryIcon } from '@/components/common';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Category, CategoryType } from '@/types/models';
import {
  buildCategoryPickerItems,
  type DisplayCategoryItem,
} from '@/utils/modalPickerLayout';

export { buildCategoryPickerItems, type DisplayCategoryItem };

interface CategoryPickerModalProps {
  visible: boolean;
  type: CategoryType;
  categories: readonly Category[];
  selectedId: string | null;
  onSelect: (category: Category) => void;
  onClose: () => void;
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

  const items = useMemo<DisplayCategoryItem[]>(
    () =>
      buildCategoryPickerItems({
        categories,
        type,
        selectedId,
        search,
      }),
    [categories, type, selectedId, search],
  );

  const handleClose = () => {
    setSearch('');
    onClose();
  };

  return (
    <BottomSheetModal visible={visible} onClose={handleClose} keyboardAvoiding>
      <View style={styles.sheetHeader}>
        <Text style={[styles.sheetTitle, { color: theme.text }]}>
          Select Category
        </Text>
        <Pressable
          onPress={handleClose}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Close category selector">
          <Ionicons name="chevron-down" size={22} color={theme.textSecondary} />
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
        style={styles.list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        nestedScrollEnabled
        showsVerticalScrollIndicator
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
              accessibilityRole="button"
              accessibilityState={{ selected }}
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
                imageUri={item.category.imageUri}
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
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
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
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 8,
  },
  list: {
    flexShrink: 1,
    flexGrow: 0,
  },
  listContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.five,
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
