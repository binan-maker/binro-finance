import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  AppButton,
  AppHeader,
  AppInput,
  AppScreen,
  BottomSheetModal,
  CategoryIcon,
} from '@/components/common';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  deleteStoredImage,
  pickAndSaveSquareImage,
} from '@/services/images/localImageStorage';
import { useAppStore } from '@/store/app-store';
import type { PaymentMethodRecord } from '@/types/models';
import { validatePaymentMethodName } from '@/utils/validation';

const PM_ICONS = ['cash', 'qr-code', 'card', 'bank', 'wallet', 'phone'] as const;

export default function SelectPaymentMethodScreen() {
  const theme = useTheme();
  const router = useRouter();

  const paymentMethods = useAppStore((s) => s.paymentMethods);
  const transactionDraft = useAppStore((s) => s.transactionDraft);
  const patchTransactionDraft = useAppStore((s) => s.patchTransactionDraft);
  const createPaymentMethod = useAppStore((s) => s.createPaymentMethod);

  const [search, setSearch] = useState('');
  const [createVisible, setCreateVisible] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [iconInput, setIconInput] = useState<string>('wallet');
  const [imageUriInput, setImageUriInput] = useState<string | null>(null);
  const [pickingImage, setPickingImage] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const unsavedImageRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (unsavedImageRef.current) {
        deleteStoredImage(unsavedImageRef.current);
      }
    };
  }, []);

  const selectedId = transactionDraft?.paymentMethodId ?? null;
  const selectedName = transactionDraft?.paymentMethod ?? '';

  const filteredMethods = useMemo(() => {
    const active = paymentMethods.filter(
      (pm) => !pm.isArchived || pm.id === selectedId,
    );
    const term = search.trim().toLowerCase();
    if (!term) return active;
    return active.filter((pm) => pm.name.toLowerCase().includes(term));
  }, [paymentMethods, selectedId, search]);

  const handleSelect = (pm: PaymentMethodRecord) => {
    patchTransactionDraft({
      paymentMethodId: pm.id,
      paymentMethod: pm.name,
    });
    if (router.canGoBack()) {
      router.back();
    }
  };

  const openCreateModal = () => {
    if (unsavedImageRef.current) {
      deleteStoredImage(unsavedImageRef.current);
      unsavedImageRef.current = null;
    }
    setNameInput('');
    setIconInput('wallet');
    setImageUriInput(null);
    setCreateError(null);
    setCreateVisible(true);
  };

  const closeCreateModal = () => {
    if (unsavedImageRef.current) {
      deleteStoredImage(unsavedImageRef.current);
      unsavedImageRef.current = null;
    }
    setCreateVisible(false);
  };

  const handlePickImage = async () => {
    if (pickingImage || saving) return;
    setPickingImage(true);
    setCreateError(null);
    try {
      const result = await pickAndSaveSquareImage('payment_methods');
      if (result.error) {
        setCreateError(result.error);
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

  const handleCreate = async () => {
    if (saving) return;
    const check = validatePaymentMethodName(nameInput);
    if (!check.valid || !check.value) {
      setCreateError(check.error ?? 'Invalid payment method name.');
      return;
    }

    setSaving(true);
    setCreateError(null);
    try {
      const created = await createPaymentMethod({
        name: check.value,
        icon: iconInput,
        imageUri: imageUriInput,
      });
      unsavedImageRef.current = null;
      patchTransactionDraft({
        paymentMethodId: created.id,
        paymentMethod: created.name,
      });
      setCreateVisible(false);
      if (router.canGoBack()) {
        router.back();
      }
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : 'Unable to add payment method.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppScreen
      scrollable={false}
      edges={['top', 'bottom', 'left', 'right']}
      footer={
        <AppButton
          label="Add Payment Method"
          size="lg"
          onPress={openCreateModal}
          fullWidth
        />
      }>
      <AppHeader title="Payment Method" showBack />

      <View
        style={[
          styles.searchBox,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}>
        <Ionicons name="search" size={18} color={theme.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search payment method"
          placeholderTextColor={theme.textMuted}
          style={[styles.searchInput, { color: theme.text }]}
          autoCorrect={false}
        />
        {search.length > 0 ? (
          <Pressable onPress={() => setSearch('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={theme.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <FlatList
        data={filteredMethods}
        keyExtractor={(item) => item.id}
        style={styles.list}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            No matching payment methods found.
          </Text>
        }
        renderItem={({ item }) => {
          const selected =
            item.id === selectedId ||
            (!selectedId &&
              selectedName.length > 0 &&
              item.name.toLowerCase() === selectedName.toLowerCase());
          return (
            <Pressable
              onPress={() => handleSelect(item)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: selected ? theme.primarySoft : theme.surface,
                  borderColor: selected ? theme.primary : theme.border,
                },
                pressed && styles.pressed,
              ]}>
              <CategoryIcon
                icon={item.icon}
                color={theme.primary}
                imageUri={item.imageUri}
                size={38}
              />
              <View style={styles.rowText}>
                <Text style={[styles.rowName, { color: theme.text }]}>{item.name}</Text>
                <Text style={[styles.rowSub, { color: theme.textMuted }]}>
                  {item.isBuiltin ? 'Built-in' : 'Custom'}
                </Text>
              </View>
              {selected ? (
                <Ionicons name="checkmark-circle" size={21} color={theme.primary} />
              ) : null}
            </Pressable>
          );
        }}
      />

      <BottomSheetModal
        visible={createVisible}
        onClose={closeCreateModal}
        keyboardAvoiding>
        <View style={styles.sheetHeader}>
          <Text style={[styles.modalTitle, { color: theme.text }]}>
            New Payment Method
          </Text>
          <Pressable
            onPress={closeCreateModal}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close new payment method modal">
            <Ionicons name="close" size={22} color={theme.textSecondary} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.modalScroll}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          showsVerticalScrollIndicator>
          <View style={styles.modalBody}>
            <AppInput
              label="Method Name"
              value={nameInput}
              onChangeText={(t) => {
                setNameInput(t);
                if (createError) setCreateError(null);
              }}
              placeholder="e.g. Apple Pay, Corporate Card"
              maxLength={40}
              error={createError}
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
              onPress={closeCreateModal}
              disabled={saving}
              fullWidth
            />
          </View>
          <View style={styles.flex1}>
            <AppButton
              label="Save"
              onPress={() => void handleCreate()}
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
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three - 2,
    minHeight: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 8,
  },
  list: {
    flex: 1,
  },
  listContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.five,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    padding: Spacing.two + 3,
    borderRadius: Radius.md,
    borderWidth: 1,
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
    paddingVertical: Spacing.five,
    fontSize: 14,
  },
  pressed: {
    opacity: 0.78,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalScroll: {
    flexShrink: 1,
    flexGrow: 0,
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
    flexShrink: 0,
  },
  flex1: {
    flex: 1,
  },
});
