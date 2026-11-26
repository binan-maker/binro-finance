import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
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
  CategoryIcon,
  ConfirmDialog,
  EmptyState,
} from '@/components/common';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  deleteStoredImage,
  pickAndSaveSquareImage,
} from '@/services/images/localImageStorage';
import { useAppStore } from '@/store/app-store';
import { validatePaymentMethodName } from '@/utils/validation';

const PM_ICONS = ['cash', 'qr-code', 'card', 'bank', 'wallet', 'phone'] as const;

export default function PaymentMethodDetailsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const paymentMethods = useAppStore((s) => s.paymentMethods);
  const transactions = useAppStore((s) => s.transactions);
  const updatePaymentMethod = useAppStore((s) => s.updatePaymentMethod);
  const deletePaymentMethod = useAppStore((s) => s.deletePaymentMethod);

  const method = paymentMethods.find((pm) => pm.id === id) ?? null;

  const [editVisible, setEditVisible] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [iconInput, setIconInput] = useState<string>('wallet');
  const [imageUriInput, setImageUriInput] = useState<string | null>(null);
  const [pickingImage, setPickingImage] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const unsavedImageRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (unsavedImageRef.current) {
        deleteStoredImage(unsavedImageRef.current);
      }
    };
  }, []);

  const [archiveDialogVisible, setArchiveDialogVisible] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const txCount = useMemo(() => {
    if (!method) return 0;
    const lower = method.name.toLowerCase();
    let count = 0;
    for (const tx of transactions) {
      if (
        tx.paymentMethodId === method.id ||
        (!tx.paymentMethodId && tx.paymentMethod.trim().toLowerCase() === lower)
      ) {
        count += 1;
      }
    }
    return count;
  }, [method, transactions]);

  if (!method) {
    return (
      <AppScreen edges={['top', 'bottom', 'left', 'right']}>
        <AppHeader title="Payment Method Details" showBack />
        <EmptyState
          icon="alert-circle-outline"
          title="Payment method not found"
          description="This payment method may have been deleted."
          actionLabel="Go Back"
          onAction={() => router.back()}
        />
      </AppScreen>
    );
  }

  const openEdit = () => {
    if (unsavedImageRef.current) {
      deleteStoredImage(unsavedImageRef.current);
      unsavedImageRef.current = null;
    }
    setNameInput(method.name);
    setIconInput(method.icon);
    setImageUriInput(method.imageUri);
    setEditorError(null);
    setEditVisible(true);
  };

  const closeEdit = () => {
    if (unsavedImageRef.current) {
      deleteStoredImage(unsavedImageRef.current);
      unsavedImageRef.current = null;
    }
    setEditVisible(false);
  };

  const handlePickImage = async () => {
    if (pickingImage || saving) return;
    setPickingImage(true);
    setEditorError(null);
    try {
      const result = await pickAndSaveSquareImage('payment_methods');
      if (result.error) {
        setEditorError(result.error);
        return;
      }
      if (!result.canceled && result.relativePath) {
        if (unsavedImageRef.current) {
          deleteStoredImage(unsavedImageRef.current);
        }
        unsavedImageRef.current = result.relativePath;
        setImageUriInput(result.relativePath);
      }
    } finally {
      setPickingImage(false);
    }
  };

  const handleRemoveImage = () => {
    if (unsavedImageRef.current) {
      deleteStoredImage(unsavedImageRef.current);
      unsavedImageRef.current = null;
    }
    setImageUriInput(null);
  };

  const handleSave = async () => {
    if (saving) return;
    const check = validatePaymentMethodName(nameInput);
    if (!check.valid || !check.value) {
      setEditorError(check.error ?? 'Invalid payment method name.');
      return;
    }

    const previousSavedUri = method.imageUri;

    setSaving(true);
    setEditorError(null);
    try {
      await updatePaymentMethod(method.id, {
        name: check.value,
        icon: iconInput,
        imageUri: imageUriInput,
      });

      if (previousSavedUri && previousSavedUri !== imageUriInput) {
        deleteStoredImage(previousSavedUri);
      }
      unsavedImageRef.current = null;
      setEditVisible(false);
    } catch (err) {
      setEditorError(
        err instanceof Error ? err.message : 'Unable to update payment method.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggleArchive = async () => {
    if (archiving) return;
    setArchiving(true);
    setActionError(null);
    try {
      await updatePaymentMethod(method.id, {
        isArchived: !method.isArchived,
      });
      setArchiveDialogVisible(false);
    } catch {
      setArchiveDialogVisible(false);
      setActionError('Unable to update payment method status.');
    } finally {
      setArchiving(false);
    }
  };

  const handleDelete = async () => {
    if (deleting) return;
    const savedUri = method.imageUri;
    setDeleting(true);
    setActionError(null);
    try {
      await deletePaymentMethod(method.id);
      if (savedUri) {
        deleteStoredImage(savedUri);
      }
      setDeleteDialogVisible(false);
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/payment-methods');
      }
    } catch (err) {
      setDeleteDialogVisible(false);
      setActionError(
        err instanceof Error ? err.message : 'Unable to delete payment method.',
      );
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
                label={method.isArchived ? 'Restore' : 'Archive'}
                variant="outline"
                onPress={() => setArchiveDialogVisible(true)}
                fullWidth
              />
            </View>
            {!method.isBuiltin ? (
              <View style={styles.flex1}>
                <AppButton label="Edit" onPress={openEdit} fullWidth />
              </View>
            ) : null}
          </View>
          {!method.isBuiltin ? (
            <AppButton
              label="Delete Payment Method"
              variant="danger"
              onPress={() => setDeleteDialogVisible(true)}
              fullWidth
            />
          ) : null}
        </View>
      }>
      <AppHeader title="Payment Method Details" showBack />

      <AppCard>
        <View style={styles.heroRow}>
          <CategoryIcon
            icon={method.icon}
            color={theme.primary}
            imageUri={method.imageUri}
            size={52}
          />
          <View style={styles.badges}>
            <View style={[styles.badge, { backgroundColor: theme.surfaceElevated }]}>
              <Text style={[styles.badgeText, { color: theme.textSecondary }]}>
                {method.isBuiltin ? 'Built-in' : 'Custom'}
              </Text>
            </View>
            {method.isArchived ? (
              <View style={[styles.badge, { backgroundColor: theme.surfaceElevated }]}>
                <Text style={[styles.badgeText, { color: theme.textMuted }]}>
                  Archived
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        <Text style={[styles.title, { color: theme.text }]}>{method.name}</Text>
      </AppCard>

      <AppCard>
        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>Type</Text>
          <Text style={[styles.detailValue, { color: theme.text }]}>
            {method.isBuiltin ? 'Built-in' : 'Custom'}
          </Text>
        </View>
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
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
            {method.isArchived ? 'Archived' : 'Active'}
          </Text>
        </View>
      </AppCard>

      {actionError ? (
        <Text style={[styles.errorText, { color: theme.danger }]}>{actionError}</Text>
      ) : null}

      <BottomSheetModal
        visible={editVisible}
        onClose={closeEdit}
        keyboardAvoiding>
        <View style={styles.sheetHeader}>
          <Text style={[styles.modalTitle, { color: theme.text }]}>
            Edit Payment Method
          </Text>
          <Pressable
            onPress={closeEdit}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close edit payment method modal">
            <Ionicons name="close" size={22} color={theme.textSecondary} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.modalScroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.modalBody}>
            <AppInput
              label="Method Name"
              value={nameInput}
              onChangeText={(t) => {
                setNameInput(t);
                if (editorError) setEditorError(null);
              }}
              placeholder="Payment method name"
              maxLength={40}
              error={editorError}
            />

            <View style={styles.imageSection}>
              <Text style={[styles.label, { color: theme.text }]}>
                Custom Image (Optional)
              </Text>
              <View style={styles.imageRow}>
                <CategoryIcon
                  icon={iconInput}
                  color={theme.primary}
                  imageUri={imageUriInput}
                  size={48}
                />
                <View style={styles.imageButtonsRow}>
                  <View style={styles.flex1}>
                    <AppButton
                      label={imageUriInput ? 'Change Image' : 'Upload Image'}
                      size="sm"
                      variant="outline"
                      loading={pickingImage}
                      icon={<Ionicons name="image-outline" size={16} color={theme.text} />}
                      onPress={() => void handlePickImage()}
                      fullWidth
                    />
                  </View>
                  {imageUriInput ? (
                    <View style={styles.flex1}>
                      <AppButton
                        label="Remove"
                        size="sm"
                        variant="outline"
                        icon={<Ionicons name="trash-outline" size={15} color={theme.danger} />}
                        onPress={handleRemoveImage}
                        fullWidth
                      />
                    </View>
                  ) : null}
                </View>
              </View>
            </View>

            <Text style={[styles.label, { color: theme.text }]}>Fallback Icon</Text>
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
                    <CategoryIcon icon={iconKey} color={theme.primary} size={32} />
                  </Pressable>
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
              onPress={closeEdit}
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
        title={method.isArchived ? 'Restore Payment Method?' : 'Archive Payment Method?'}
        message={
          method.isArchived
            ? `Restore "${method.name}" for new transactions?`
            : `Archive "${method.name}"? Existing transactions will keep their historical payment method.`
        }
        confirmLabel={method.isArchived ? 'Restore' : 'Archive'}
        cancelLabel="Cancel"
        loading={archiving}
        onConfirm={() => void handleToggleArchive()}
        onCancel={() => setArchiveDialogVisible(false)}
      />

      <ConfirmDialog
        visible={deleteDialogVisible}
        title="Delete Payment Method?"
        message={`Delete "${method.name}"? Historical transactions will preserve this payment method name.`}
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
  badges: {
    flexDirection: 'row',
    gap: Spacing.two,
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
  title: {
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
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalScroll: {
    maxHeight: 380,
  },
  modalBody: {
    gap: Spacing.three,
  },
  imageSection: {
    gap: Spacing.two,
  },
  imageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  imageButtonsRow: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.two,
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
});
