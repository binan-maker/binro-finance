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
  CategoryIcon,
  ConfirmDialog,
} from '@/components/common';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';
import type { PaymentMethodRecord } from '@/types/models';
import { validatePaymentMethodName } from '@/utils/validation';

const PM_ICONS = ['cash', 'qr-code', 'card', 'bank', 'wallet', 'phone'] as const;

export default function PaymentMethodsScreen() {
  const theme = useTheme();
  const paymentMethods = useAppStore((s) => s.paymentMethods);
  const createPaymentMethod = useAppStore((s) => s.createPaymentMethod);
  const updatePaymentMethod = useAppStore((s) => s.updatePaymentMethod);

  const [showArchived, setShowArchived] = useState(false);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingMethod, setEditingMethod] = useState<PaymentMethodRecord | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [iconInput, setIconInput] = useState<string>('wallet');
  const [editorError, setEditorError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [archiveTarget, setArchiveTarget] = useState<PaymentMethodRecord | null>(null);
  const [archiving, setArchiving] = useState(false);

  const visibleMethods = useMemo(
    () =>
      paymentMethods.filter((pm) => (showArchived ? true : !pm.isArchived)),
    [paymentMethods, showArchived],
  );

  const openCreate = () => {
    setEditingMethod(null);
    setNameInput('');
    setIconInput('wallet');
    setEditorError(null);
    setEditorVisible(true);
  };

  const openEdit = (pm: PaymentMethodRecord) => {
    setEditingMethod(pm);
    setNameInput(pm.name);
    setIconInput(pm.icon);
    setEditorError(null);
    setEditorVisible(true);
  };

  const handleSave = async () => {
    if (saving) return;
    const check = validatePaymentMethodName(nameInput);
    if (!check.valid || !check.value) {
      setEditorError(check.error ?? 'Invalid payment method name.');
      return;
    }

    setSaving(true);
    setEditorError(null);
    try {
      if (editingMethod) {
        await updatePaymentMethod(editingMethod.id, {
          name: check.value,
          icon: iconInput,
        });
      } else {
        await createPaymentMethod({
          name: check.value,
          icon: iconInput,
        });
      }
      setEditorVisible(false);
    } catch (err) {
      setEditorError(
        err instanceof Error ? err.message : 'Unable to save payment method.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggleArchive = async () => {
    if (!archiveTarget || archiving) return;
    setArchiving(true);
    try {
      await updatePaymentMethod(archiveTarget.id, {
        isArchived: !archiveTarget.isArchived,
      });
      setArchiveTarget(null);
    } finally {
      setArchiving(false);
    }
  };

  return (
    <AppScreen edges={['top', 'bottom', 'left', 'right']}>
      <AppHeader
        title="Payment Methods"
        subtitle="Built-in & custom methods"
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

      <View style={styles.filterBar}>
        <Text style={[styles.hint, { color: theme.textSecondary }]}>
          Renaming or archiving a payment method keeps historical names intact on existing transactions.
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

      <View style={styles.list}>
        {visibleMethods.map((pm) => (
          <AppCard key={pm.id}>
            <View style={styles.row}>
              <CategoryIcon icon={pm.icon} color="#059669" size={38} />
              <View style={styles.meta}>
                <View style={styles.nameRow}>
                  <Text style={[styles.name, { color: theme.text }]}>{pm.name}</Text>
                  <View
                    style={[
                      styles.badge,
                      { backgroundColor: theme.surfaceElevated },
                    ]}>
                    <Text style={[styles.badgeText, { color: theme.textMuted }]}>
                      {pm.isArchived
                        ? 'Archived'
                        : pm.isBuiltin
                          ? 'Built-in'
                          : 'Custom'}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.actions}>
                {!pm.isBuiltin ? (
                  <Pressable onPress={() => openEdit(pm)} hitSlop={8}>
                    <Ionicons name="create-outline" size={19} color={theme.primary} />
                  </Pressable>
                ) : null}
                <Pressable onPress={() => setArchiveTarget(pm)} hitSlop={8}>
                  <Ionicons
                    name={pm.isArchived ? 'refresh-outline' : 'archive-outline'}
                    size={19}
                    color={theme.textSecondary}
                  />
                </Pressable>
              </View>
            </View>
          </AppCard>
        ))}
      </View>

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
              {editingMethod ? 'Rename Payment Method' : 'New Payment Method'}
            </Text>

            <AppInput
              label="Method Name"
              value={nameInput}
              onChangeText={(t) => {
                setNameInput(t);
                if (editorError) setEditorError(null);
              }}
              placeholder="e.g. PayPal, Sodexo, Business Card"
              maxLength={40}
              error={editorError}
            />

            <Text style={[styles.label, { color: theme.text }]}>Icon</Text>
            <View style={styles.iconGrid}>
              {PM_ICONS.map((iconKey) => {
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
                    <CategoryIcon icon={iconKey} color="#059669" size={32} />
                  </Pressable>
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
        visible={Boolean(archiveTarget)}
        title={
          archiveTarget?.isArchived
            ? 'Restore Payment Method?'
            : 'Archive Payment Method?'
        }
        message={
          archiveTarget?.isArchived
            ? `Restore "${archiveTarget.name}" for new transactions?`
            : `Archive "${archiveTarget?.name}"? Historical transactions will preserve this payment method name.`
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
  hint: {
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
  },
  meta: {
    flex: 1,
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
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
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
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  iconChoice: {
    padding: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  flex1: {
    flex: 1,
  },
});
