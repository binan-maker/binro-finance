import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
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

import { AppButton, CategoryIcon } from '@/components/common';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { PaymentMethodRecord } from '@/types/models';
import { validatePaymentMethodName } from '@/utils/validation';

interface PaymentMethodPickerModalProps {
  visible: boolean;
  paymentMethods: readonly PaymentMethodRecord[];
  selectedId: string | null;
  selectedName: string;
  onSelect: (method: PaymentMethodRecord) => void;
  onCreateMethod: (input: { name: string; icon?: string }) => Promise<PaymentMethodRecord>;
  onClose: () => void;
}

export function PaymentMethodPickerModal({
  visible,
  paymentMethods,
  selectedId,
  selectedName,
  onSelect,
  onCreateMethod,
  onClose,
}: PaymentMethodPickerModalProps) {
  const theme = useTheme();
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleMethods = paymentMethods.filter((pm) => !pm.isArchived);

  const handleQuickCreate = async () => {
    const check = validatePaymentMethodName(newName);
    if (!check.valid || !check.value) {
      setError(check.error ?? 'Invalid payment method name.');
      return;
    }
    setError(null);
    setCreating(true);
    try {
      const created = await onCreateMethod({ name: check.value, icon: 'wallet' });
      onSelect(created);
      setNewName('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add payment method.');
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
              Payment Method
            </Text>
            <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button">
              <Ionicons name="close" size={22} color={theme.textSecondary} />
            </Pressable>
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
                placeholder="Add custom method (e.g. PayPal, Wallet)..."
                placeholderTextColor={theme.textMuted}
                style={[styles.quickInput, { color: theme.text }]}
                maxLength={40}
              />
              <AppButton
                label="Add"
                size="sm"
                onPress={() => void handleQuickCreate()}
                loading={creating}
              />
            </View>
            {error ? (
              <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>
            ) : null}
          </View>

          <FlatList
            data={visibleMethods}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const selected =
                (selectedId && item.id === selectedId) ||
                (!selectedId && item.name.toLowerCase() === selectedName.toLowerCase());
              return (
                <Pressable
                  onPress={() => {
                    onSelect(item);
                    onClose();
                  }}
                  style={[
                    styles.row,
                    {
                      backgroundColor: selected ? theme.primarySoft : 'transparent',
                      borderColor: selected ? theme.primary : theme.border,
                    },
                  ]}>
                  <CategoryIcon icon={item.icon} color="#059669" size={34} />
                  <View style={styles.rowText}>
                    <Text style={[styles.rowName, { color: theme.text }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={[styles.rowSub, { color: theme.textMuted }]}>
                      {item.isBuiltin ? 'Built-in' : 'Custom'}
                    </Text>
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
  quickAddCard: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.two + 2,
    gap: Spacing.one,
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
  errorText: {
    fontSize: 12,
    fontWeight: '500',
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
});
