import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
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
  BottomSheetModal,
  ConfirmDialog,
  EmptyState,
} from '@/components/common';
import { TAG_COLOR_OPTIONS } from '@/constants/categories';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';
import { validateTagName } from '@/utils/validation';

export default function TagDetailsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const tags = useAppStore((s) => s.tags);
  const transactions = useAppStore((s) => s.transactions);
  const updateTag = useAppStore((s) => s.updateTag);
  const deleteTag = useAppStore((s) => s.deleteTag);

  const tag = tags.find((t) => t.id === id) ?? null;

  const [editVisible, setEditVisible] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [colorInput, setColorInput] = useState<string>(TAG_COLOR_OPTIONS[0]);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [archiveDialogVisible, setArchiveDialogVisible] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const txCount = useMemo(() => {
    if (!tag) return 0;
    let count = 0;
    for (const tx of transactions) {
      if ((tx.tagIds ?? []).includes(tag.id)) count += 1;
    }
    return count;
  }, [tag, transactions]);

  if (!tag) {
    return (
      <AppScreen edges={['top', 'bottom', 'left', 'right']}>
        <AppHeader title="Tag Details" showBack />
        <EmptyState
          icon="alert-circle-outline"
          title="Tag not found"
          description="This tag may have been deleted."
          actionLabel="Go Back"
          onAction={() => router.back()}
        />
      </AppScreen>
    );
  }

  const openEdit = () => {
    setNameInput(tag.name);
    setColorInput(tag.color);
    setEditorError(null);
    setEditVisible(true);
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
      await updateTag(tag.id, {
        name: validation.value,
        color: colorInput,
      });
      setEditVisible(false);
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : 'Unable to update tag.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleArchive = async () => {
    if (archiving) return;
    setArchiving(true);
    setActionError(null);
    try {
      await updateTag(tag.id, { isArchived: !tag.isArchived });
      setArchiveDialogVisible(false);
    } catch {
      setArchiveDialogVisible(false);
      setActionError('Unable to update tag status.');
    } finally {
      setArchiving(false);
    }
  };

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    setActionError(null);
    try {
      await deleteTag(tag.id);
      setDeleteDialogVisible(false);
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/tags');
      }
    } catch {
      setDeleteDialogVisible(false);
      setActionError('Unable to delete tag.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AppScreen
      edges={['top', 'bottom', 'left', 'right']}
      footer={
        <View style={styles.footerCol}>
          <View style={styles.footerRow}>
            <View style={styles.flex1}>
              <AppButton
                label={tag.isArchived ? 'Restore' : 'Archive'}
                variant="outline"
                onPress={() => setArchiveDialogVisible(true)}
                fullWidth
              />
            </View>
            <View style={styles.flex1}>
              <AppButton label="Edit" onPress={openEdit} fullWidth />
            </View>
          </View>
          <AppButton
            label="Delete Tag"
            variant="danger"
            onPress={() => setDeleteDialogVisible(true)}
            fullWidth
          />
        </View>
      }>
      <AppHeader title="Tag Details" showBack />

      <AppCard>
        <View style={styles.heroRow}>
          <View style={[styles.tagColorCircle, { backgroundColor: tag.color }]} />
          {tag.isArchived ? (
            <View style={[styles.badge, { backgroundColor: theme.surfaceElevated }]}>
              <Text style={[styles.badgeText, { color: theme.textMuted }]}>
                Archived
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.tagTitle, { color: theme.text }]}>#{tag.name}</Text>
      </AppCard>

      <AppCard>
        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
            Transactions
          </Text>
          <Text style={[styles.detailValue, { color: theme.text }]}>{txCount}</Text>
        </View>
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
            Status
          </Text>
          <Text style={[styles.detailValue, { color: theme.text }]}>
            {tag.isArchived ? 'Archived' : 'Active'}
          </Text>
        </View>
      </AppCard>

      {actionError ? (
        <Text style={[styles.errorText, { color: theme.danger }]}>{actionError}</Text>
      ) : null}

      <BottomSheetModal
        visible={editVisible}
        onClose={() => setEditVisible(false)}
        keyboardAvoiding>
        <Text style={[styles.modalTitle, { color: theme.text }]}>Edit Tag</Text>

        <AppInput
          label="Tag Name"
          value={nameInput}
          onChangeText={(t) => {
            setNameInput(t);
            if (editorError) setEditorError(null);
          }}
          placeholder="Tag name"
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
              onPress={() => setEditVisible(false)}
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

      <ConfirmDialog
        visible={archiveDialogVisible}
        title={tag.isArchived ? 'Restore Tag?' : 'Archive Tag?'}
        message={
          tag.isArchived
            ? `Restore "#${tag.name}" for new transactions?`
            : `Archive "#${tag.name}"? Existing transactions keep their tag history.`
        }
        confirmLabel={tag.isArchived ? 'Restore' : 'Archive'}
        cancelLabel="Cancel"
        loading={archiving}
        onConfirm={() => void handleToggleArchive()}
        onCancel={() => setArchiveDialogVisible(false)}
      />

      <ConfirmDialog
        visible={deleteDialogVisible}
        title="Delete Tag?"
        message={`Delete "#${tag.name}"? Transactions using this tag will remain untouched.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        loading={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteDialogVisible(false)}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tagColorCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  badge: {
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radius.full,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  tagTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: Spacing.one,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.one,
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    width: '100%',
  },
  footerCol: {
    gap: Spacing.two,
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
});
