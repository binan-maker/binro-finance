import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Pressable,
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
  BottomSheetModal,
  EmptyState,
} from '@/components/common';
import { TAG_COLOR_OPTIONS } from '@/constants/categories';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';
import { validateTagName } from '@/utils/validation';

export default function TagsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const tags = useAppStore((s) => s.tags);
  const transactions = useAppStore((s) => s.transactions);
  const createTag = useAppStore((s) => s.createTag);

  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const [editorVisible, setEditorVisible] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [colorInput, setColorInput] = useState<string>(TAG_COLOR_OPTIONS[0]);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const usageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tx of transactions) {
      for (const tid of tx.tagIds ?? []) {
        counts.set(tid, (counts.get(tid) ?? 0) + 1);
      }
    }
    return counts;
  }, [transactions]);

  const visibleTags = useMemo(() => {
    const base = tags.filter((t) => (showArchived ? true : !t.isArchived));
    const term = searchQuery.trim().toLowerCase();
    if (!term) return base;
    return base.filter((t) => t.name.toLowerCase().includes(term));
  }, [tags, showArchived, searchQuery]);

  const openCreate = () => {
    setNameInput('');
    setColorInput(TAG_COLOR_OPTIONS[0]);
    setEditorError(null);
    setEditorVisible(true);
  };

  const handleSave = async () => {
    if (saving) return;
    const validation = validateTagName(nameInput);
    if (!validation.valid || !validation.value) {
      setEditorError(validation.error ?? 'Invalid tag name.');
      return;
    }

    setSaving(true);
    setEditorError(null);
    try {
      await createTag({
        name: validation.value,
        color: colorInput,
      });
      setEditorVisible(false);
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : 'Unable to save tag.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppScreen
      edges={['top', 'bottom', 'left', 'right']}
      footer={
        <AppButton
          label="Add Tag"
          size="lg"
          onPress={openCreate}
          fullWidth
        />
      }>
      <AppHeader
        title="Tags"
        showBack
        rightAction={
          <Pressable
            onPress={() => {
              if (searchVisible && searchQuery.length > 0) {
                setSearchQuery('');
              }
              setSearchVisible((v) => !v);
            }}
            accessibilityRole="button"
            accessibilityLabel="Search tags"
            style={({ pressed }) => [
              styles.headerIconBtn,
              {
                backgroundColor:
                  searchVisible || searchQuery.length > 0
                    ? theme.primarySoft
                    : theme.surface,
                borderColor:
                  searchVisible || searchQuery.length > 0
                    ? theme.primary
                    : theme.border,
              },
              pressed && styles.pressed,
            ]}>
            <Ionicons
              name={searchVisible ? 'close' : 'search'}
              size={19}
              color={
                searchVisible || searchQuery.length > 0 ? theme.primary : theme.text
              }
            />
          </Pressable>
        }
      />

      {searchVisible ? (
        <View
          style={[
            styles.searchBar,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}>
          <Ionicons name="search" size={18} color={theme.textMuted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search tags"
            placeholderTextColor={theme.textMuted}
            autoFocus
            style={[styles.searchInput, { color: theme.text }]}
          />
          {searchQuery.length > 0 ? (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={6}>
              <Ionicons name="close-circle" size={18} color={theme.textMuted} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.filterBar}>
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

      {visibleTags.length === 0 ? (
        <EmptyState
          icon="pricetags-outline"
          title={searchQuery.trim() ? 'No matching tags' : 'No tags created yet'}
          description="Create custom tags to organize transactions."
          actionLabel="Add Tag"
          onAction={openCreate}
        />
      ) : (
        <View style={styles.list}>
          {visibleTags.map((tag) => {
            const count = usageCounts.get(tag.id) ?? 0;
            return (
              <Pressable
                key={tag.id}
                onPress={() => router.push(`/tags/${tag.id}`)}
                accessibilityRole="button"
                accessibilityLabel={tag.name}
                style={({ pressed }) => [pressed && styles.pressed]}>
                <AppCard>
                  <View style={styles.row}>
                    <View style={[styles.dot, { backgroundColor: tag.color }]} />
                    <View style={styles.meta}>
                      <View style={styles.nameRow}>
                        <Text style={[styles.name, { color: theme.text }]}>
                          #{tag.name}
                        </Text>
                        {tag.isArchived ? (
                          <View
                            style={[
                              styles.badge,
                              { backgroundColor: theme.surfaceElevated },
                            ]}>
                            <Text style={[styles.badgeText, { color: theme.textMuted }]}>
                              Archived
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={[styles.count, { color: theme.textSecondary }]}>
                        {count} transaction{count === 1 ? '' : 's'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
                  </View>
                </AppCard>
              </Pressable>
            );
          })}
        </View>
      )}

      <BottomSheetModal
        visible={editorVisible}
        onClose={() => setEditorVisible(false)}
        keyboardAvoiding>
        <Text style={[styles.modalTitle, { color: theme.text }]}>New Tag</Text>

        <AppInput
          label="Tag Name"
          value={nameInput}
          onChangeText={(t) => {
            setNameInput(t);
            if (editorError) setEditorError(null);
          }}
          placeholder="e.g. Vacation, Reimbursable"
          maxLength={28}
          error={editorError}
        />

        <Text style={[styles.label, { color: theme.text }]}>Color</Text>
        <View style={styles.colors}>
          {TAG_COLOR_OPTIONS.map((c) => {
            const selected = colorInput === c;
            return (
              <Pressable
                key={c}
                onPress={() => setColorInput(c)}
                style={[
                  styles.colorSwatch,
                  {
                    backgroundColor: c,
                    borderWidth: selected ? 3 : 0,
                    borderColor: theme.text,
                  },
                ]}
              />
            );
          })}
        </View>

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
              onPress={() => void handleSave()}
              loading={saving}
              fullWidth
            />
          </View>
        </View>
      </BottomSheetModal>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.78,
  },
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
    flexDirection: 'row',
    alignItems: 'center',
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  meta: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  name: {
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
  count: {
    fontSize: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  colors: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  colorSwatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  flex1: {
    flex: 1,
  },
});
