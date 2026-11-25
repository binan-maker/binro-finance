import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
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
  ConfirmDialog,
  EmptyState,
} from '@/components/common';
import { TAG_COLOR_OPTIONS } from '@/constants/categories';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';
import type { Tag } from '@/types/models';
import { validateTagName } from '@/utils/validation';

export default function TagsScreen() {
  const theme = useTheme();
  const tags = useAppStore((s) => s.tags);
  const transactions = useAppStore((s) => s.transactions);
  const createTag = useAppStore((s) => s.createTag);
  const updateTag = useAppStore((s) => s.updateTag);
  const deleteTag = useAppStore((s) => s.deleteTag);

  const [editorVisible, setEditorVisible] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [colorInput, setColorInput] = useState<string>(TAG_COLOR_OPTIONS[0]);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Tag | null>(null);
  const [deleting, setDeleting] = useState(false);

  const usageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tx of transactions) {
      for (const tid of tx.tagIds ?? []) {
        counts.set(tid, (counts.get(tid) ?? 0) + 1);
      }
    }
    return counts;
  }, [transactions]);

  const openCreate = () => {
    setEditingTag(null);
    setNameInput('');
    setColorInput(TAG_COLOR_OPTIONS[0]);
    setEditorError(null);
    setEditorVisible(true);
  };

  const openEdit = (tag: Tag) => {
    setEditingTag(tag);
    setNameInput(tag.name);
    setColorInput(tag.color);
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
      if (editingTag) {
        await updateTag(editingTag.id, {
          name: validation.value,
          color: colorInput,
        });
      } else {
        await createTag({
          name: validation.value,
          color: colorInput,
        });
      }
      setEditorVisible(false);
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : 'Unable to save tag.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await deleteTag(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AppScreen edges={['top', 'bottom', 'left', 'right']}>
      <AppHeader
        title="Tags"
        subtitle="Custom labels across transactions"
        showBack
        rightAction={
          <AppButton
            label="Add"
            size="sm"
            icon={<Ionicons name="add" size={16} color={theme.primaryText} />}
            onPress={openCreate}
          />
        }
      />

      <Text style={[styles.hint, { color: theme.textSecondary }]}>
        Tags let you group transactions (e.g. Vacation, Tax Deductible, Work) without affecting category totals or budgets.
      </Text>

      {tags.length === 0 ? (
        <EmptyState
          icon="pricetags-outline"
          title="No tags created yet"
          description="Create custom tags to filter and organize transactions across categories."
          actionLabel="Create Tag"
          onAction={openCreate}
        />
      ) : (
        <View style={styles.list}>
          {tags.map((tag) => {
            const count = usageCounts.get(tag.id) ?? 0;
            return (
              <AppCard key={tag.id}>
                <View style={styles.row}>
                  <View style={[styles.dot, { backgroundColor: tag.color }]} />
                  <View style={styles.meta}>
                    <Text style={[styles.name, { color: theme.text }]}>
                      #{tag.name}
                    </Text>
                    <Text style={[styles.count, { color: theme.textSecondary }]}>
                      {count} transaction{count === 1 ? '' : 's'}
                    </Text>
                  </View>
                  <View style={styles.actions}>
                    <Pressable onPress={() => openEdit(tag)} hitSlop={8}>
                      <Ionicons name="create-outline" size={19} color={theme.primary} />
                    </Pressable>
                    <Pressable onPress={() => setDeleteTarget(tag)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={19} color={theme.danger} />
                    </Pressable>
                  </View>
                </View>
              </AppCard>
            );
          })}
        </View>
      )}

      <Modal
        visible={editorVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditorVisible(false)}>
        <KeyboardAvoidingView
          style={styles.backdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable
            style={styles.backdropDismiss}
            onPress={() => setEditorVisible(false)}
          />
          <View
            style={[
              styles.sheet,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              {editingTag ? 'Edit Tag' : 'New Tag'}
            </Text>

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
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ConfirmDialog
        visible={Boolean(deleteTarget)}
        title="Delete Tag?"
        message={`Delete "#${deleteTarget?.name}"? Transactions using this tag will remain untouched.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        loading={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  hint: {
    fontSize: 12,
    lineHeight: 17,
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
  name: {
    fontSize: 15,
    fontWeight: '600',
  },
  count: {
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.three - 2,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  backdropDismiss: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.three,
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
