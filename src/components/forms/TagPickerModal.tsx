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

import { AppButton } from '@/components/common';
import { TAG_COLOR_OPTIONS } from '@/constants/categories';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Tag } from '@/types/models';
import { validateTagName } from '@/utils/validation';

interface TagPickerModalProps {
  visible: boolean;
  tags: readonly Tag[];
  selectedIds: readonly string[];
  onChange: (tagIds: string[]) => void;
  onCreateTag: (input: { name: string; color: string }) => Promise<Tag>;
  onClose: () => void;
}

export function TagPickerModal({
  visible,
  tags,
  selectedIds,
  onChange,
  onCreateTag,
  onClose,
}: TagPickerModalProps) {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<string>(TAG_COLOR_OPTIONS[0]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return tags;
    return tags.filter((t) => t.name.toLowerCase().includes(term));
  }, [tags, search]);

  const toggleTag = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((item) => item !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const handleQuickCreate = async () => {
    const check = validateTagName(newName);
    if (!check.valid || !check.value) {
      setError(check.error ?? 'Invalid tag name.');
      return;
    }
    setError(null);
    setCreating(true);
    try {
      const created = await onCreateTag({ name: check.value, color: newColor });
      onChange([...selectedIds, created.id]);
      setNewName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create tag.');
    } finally {
      setCreating(false);
    }
  };

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
              Select Tags
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
              placeholder="Filter tags..."
              placeholderTextColor={theme.textMuted}
              style={[styles.searchInput, { color: theme.text }]}
              autoCorrect={false}
            />
          </View>

          <View
            style={[
              styles.quickAddCard,
              { backgroundColor: theme.surfaceElevated, borderColor: theme.border },
            ]}>
            <View style={styles.quickAddRow}>
              <TextInput
                value={newName}
                onChangeText={(t) => {
                  setNewName(t);
                  if (error) setError(null);
                }}
                placeholder="New tag name (e.g. Work, Trip)..."
                placeholderTextColor={theme.textMuted}
                style={[styles.quickInput, { color: theme.text }]}
                maxLength={28}
              />
              <AppButton
                label="Add"
                size="sm"
                onPress={() => void handleQuickCreate()}
                loading={creating}
              />
            </View>
            <View style={styles.colorRow}>
              {TAG_COLOR_OPTIONS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setNewColor(c)}
                  style={[
                    styles.colorDot,
                    { backgroundColor: c },
                    newColor === c && { borderWidth: 2, borderColor: '#FFFFFF' },
                  ]}
                />
              ))}
            </View>
            {error ? (
              <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>
            ) : null}
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                No tags yet. Add your first tag above.
              </Text>
            }
            renderItem={({ item }) => {
              const selected = selectedIds.includes(item.id);
              return (
                <Pressable
                  onPress={() => toggleTag(item.id)}
                  style={[
                    styles.row,
                    {
                      backgroundColor: selected ? theme.primarySoft : 'transparent',
                      borderColor: selected ? theme.primary : theme.border,
                    },
                  ]}>
                  <View style={[styles.tagDot, { backgroundColor: item.color }]} />
                  <Text style={[styles.rowName, { color: theme.text }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Ionicons
                    name={selected ? 'checkbox' : 'square-outline'}
                    size={20}
                    color={selected ? theme.primary : theme.textMuted}
                  />
                </Pressable>
              );
            }}
          />

          <AppButton label="Done" onPress={onClose} fullWidth />
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
    maxHeight: '82%',
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two + 4,
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
    minHeight: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 6,
  },
  quickAddCard: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.two + 2,
    gap: Spacing.two,
  },
  quickAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  quickInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 6,
  },
  colorRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  colorDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '500',
  },
  listContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    padding: Spacing.two + 4,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  tagDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  rowName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  emptyText: {
    textAlign: 'center',
    paddingVertical: Spacing.three,
    fontSize: 14,
  },
});
