import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AppButton, BottomSheetModal } from '@/components/common';
import { TAG_COLOR_OPTIONS } from '@/constants/categories';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Tag } from '@/types/models';
import { validateTagName } from '@/utils/validation';

export const TAG_SEARCH_THRESHOLD = 10;

interface TagSelectionModalProps {
  visible: boolean;
  tags: readonly Tag[];
  selectedTagIds: readonly string[];
  onToggleTag: (tagId: string) => void;
  onCreateTag: (input: { name: string; color: string }) => Promise<Tag>;
  onAutoSelectTag: (tagId: string) => void;
  onClose: () => void;
}

export function TagSelectionModal({
  visible,
  tags,
  selectedTagIds,
  onToggleTag,
  onCreateTag,
  onAutoSelectTag,
  onClose,
}: TagSelectionModalProps) {
  const theme = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState<string>(TAG_COLOR_OPTIONS[0]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const showSearch = tags.length > TAG_SEARCH_THRESHOLD;

  const filteredTags = useMemo(() => {
    if (!showSearch || !searchQuery.trim()) {
      return tags;
    }
    const q = searchQuery.trim().toLowerCase();
    return tags.filter((tag) => tag.name.toLowerCase().includes(q));
  }, [tags, showSearch, searchQuery]);

  const handleClose = () => {
    setSearchQuery('');
    setShowCreateForm(false);
    setNewTagName('');
    setCreateError(null);
    onClose();
  };

  const handleCreate = async () => {
    if (creating) return;
    setCreateError(null);

    const validation = validateTagName(newTagName);
    if (!validation.valid || !validation.value) {
      setCreateError(validation.error ?? 'Invalid tag name.');
      return;
    }

    setCreating(true);
    try {
      const created = await onCreateTag({
        name: validation.value,
        color: newTagColor,
      });
      onAutoSelectTag(created.id);
      setNewTagName('');
      setNewTagColor(TAG_COLOR_OPTIONS[0]);
      setShowCreateForm(false);
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : 'Unable to create tag.',
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <BottomSheetModal visible={visible} onClose={handleClose} keyboardAvoiding>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Select Tags</Text>
        <Pressable
          onPress={handleClose}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Close tag selector">
          <Ionicons name="close" size={22} color={theme.textSecondary} />
        </Pressable>
      </View>

      {showSearch ? (
        <View
          style={[
            styles.searchWrap,
            { backgroundColor: theme.surfaceElevated, borderColor: theme.border },
          ]}>
          <Ionicons name="search-outline" size={16} color={theme.textMuted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search tags"
            placeholderTextColor={theme.textMuted}
            style={[styles.searchInput, { color: theme.text }]}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={6}>
              <Ionicons name="close-circle" size={16} color={theme.textMuted} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <ScrollView
        style={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.pillsWrap}>
          {filteredTags.map((tag) => {
            const selected = selectedTagIds.includes(tag.id);
            return (
              <Pressable
                key={tag.id}
                onPress={() => onToggleTag(tag.id)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={({ pressed }) => [
                  styles.tagPill,
                  {
                    backgroundColor: selected
                      ? `${tag.color}20`
                      : theme.surfaceElevated,
                    borderColor: selected ? tag.color : theme.border,
                  },
                  pressed && styles.pressed,
                ]}>
                <View
                  style={[
                    styles.tagDot,
                    {
                      backgroundColor: tag.color,
                    },
                  ]}
                />
                <Text
                  style={[
                    styles.tagText,
                    { color: theme.text },
                  ]}>
                  {tag.name}
                </Text>
              </Pressable>
            );
          })}

          {!showCreateForm ? (
            <Pressable
              onPress={() => {
                setCreateError(null);
                setShowCreateForm(true);
              }}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.addPill,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.primary,
                },
                pressed && styles.pressed,
              ]}>
              <Ionicons name="add" size={15} color={theme.primary} />
              <Text style={[styles.addPillText, { color: theme.primary }]}>
                Add Tag
              </Text>
            </Pressable>
          ) : null}
        </View>

        {filteredTags.length === 0 && searchQuery.trim() ? (
          <Text style={[styles.emptySearchText, { color: theme.textSecondary }]}>
            No tags matching &ldquo;{searchQuery.trim()}&rdquo;.
          </Text>
        ) : null}
      </ScrollView>

      {showCreateForm ? (
        <View
          style={[
            styles.createCard,
            { backgroundColor: theme.surfaceElevated, borderColor: theme.border },
          ]}>
          <TextInput
            value={newTagName}
            onChangeText={(text) => {
              setNewTagName(text);
              if (createError) setCreateError(null);
            }}
            placeholder="Tag name"
            placeholderTextColor={theme.textMuted}
            maxLength={28}
            autoFocus
            style={[
              styles.createInput,
              {
                color: theme.text,
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}
          />

          <View style={styles.swatchRow}>
            {TAG_COLOR_OPTIONS.map((swatch) => {
              const isSelected = newTagColor === swatch;
              return (
                <Pressable
                  key={swatch}
                  onPress={() => setNewTagColor(swatch)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  style={[
                    styles.swatch,
                    {
                      backgroundColor: swatch,
                      borderWidth: isSelected ? 2.5 : 0,
                      borderColor: theme.text,
                    },
                  ]}
                />
              );
            })}
          </View>

          {createError ? (
            <Text style={[styles.errorText, { color: theme.danger }]}>
              {createError}
            </Text>
          ) : null}

          <View style={styles.createActions}>
            <View style={styles.flex}>
              <AppButton
                label="Cancel"
                size="sm"
                variant="outline"
                onPress={() => {
                  setShowCreateForm(false);
                  setNewTagName('');
                  setCreateError(null);
                }}
                disabled={creating}
                fullWidth
              />
            </View>
            <View style={styles.flex}>
              <AppButton
                label="Create"
                size="sm"
                onPress={() => void handleCreate()}
                loading={creating}
                fullWidth
              />
            </View>
          </View>
        </View>
      ) : null}

      <AppButton label="Done" onPress={handleClose} fullWidth />
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
  },
  searchWrap: {
    minHeight: 40,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.two + 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 6,
  },
  scroll: {
    maxHeight: 240,
  },
  pillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  tagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.one + 3,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  tagDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tagText: {
    fontSize: 13,
    fontWeight: '600',
  },
  addPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.one + 3,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  addPillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptySearchText: {
    fontSize: 13,
    marginTop: Spacing.two,
  },
  createCard: {
    padding: Spacing.three - 2,
    borderRadius: Radius.md,
    borderWidth: 1,
    gap: Spacing.two,
  },
  createInput: {
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.two,
    fontSize: 14,
  },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  swatch: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
  },
  createActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
  pressed: {
    opacity: 0.78,
  },
});
