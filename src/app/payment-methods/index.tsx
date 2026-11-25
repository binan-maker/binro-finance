import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
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
  CategoryIcon,
  EmptyState,
} from '@/components/common';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';
import { validatePaymentMethodName } from '@/utils/validation';

const PM_ICONS = ['cash', 'qr-code', 'card', 'bank', 'wallet', 'phone'] as const;

export default function PaymentMethodsScreen() {
  const theme = useTheme();
  const router = useRouter();

  const paymentMethods = useAppStore((s) => s.paymentMethods);
  const transactions = useAppStore((s) => s.transactions);
  const createPaymentMethod = useAppStore((s) => s.createPaymentMethod);

  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const [editorVisible, setEditorVisible] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [iconInput, setIconInput] = useState<string>('wallet');
  const [editorError, setEditorError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const usageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const pm of paymentMethods) {
      counts.set(pm.id, 0);
    }
    for (const tx of transactions) {
      if (tx.paymentMethodId && counts.has(tx.paymentMethodId)) {
        counts.set(tx.paymentMethodId, (counts.get(tx.paymentMethodId) ?? 0) + 1);
      } else {
        const lower = tx.paymentMethod.trim().toLowerCase();
        const match = paymentMethods.find((pm) => pm.name.toLowerCase() === lower);
        if (match) {
          counts.set(match.id, (counts.get(match.id) ?? 0) + 1);
        }
      }
    }
    return counts;
  }, [paymentMethods, transactions]);

  const visibleMethods = useMemo(() => {
    const base = paymentMethods.filter((pm) => (showArchived ? true : !pm.isArchived));
    const term = searchQuery.trim().toLowerCase();
    if (!term) return base;
    return base.filter((pm) => pm.name.toLowerCase().includes(term));
  }, [paymentMethods, showArchived, searchQuery]);

  const openCreate = () => {
    setNameInput('');
    setIconInput('wallet');
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
      await createPaymentMethod({
        name: check.value,
        icon: iconInput,
      });
      setEditorVisible(false);
    } catch (err) {
      setEditorError(
        err instanceof Error ? err.message : 'Unable to save payment method.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppScreen
      edges={['top', 'bottom', 'left', 'right']}
      footer={
        <AppButton
          label="Add Payment Method"
          size="lg"
          onPress={openCreate}
          fullWidth
        />
      }>
      <AppHeader
        title="Payment Methods"
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
            accessibilityLabel="Search payment methods"
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
            placeholder="Search payment methods"
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

      {visibleMethods.length === 0 ? (
        <EmptyState
          icon="card-outline"
          title="No payment methods found"
          description="Try clearing your search or add a new payment method."
          actionLabel="Add Payment Method"
          onAction={openCreate}
        />
      ) : (
        <View style={styles.list}>
          {visibleMethods.map((pm) => {
            const count = usageCounts.get(pm.id) ?? 0;
            return (
              <Pressable
                key={pm.id}
                onPress={() => router.push(`/payment-methods/${pm.id}`)}
                accessibilityRole="button"
                accessibilityLabel={pm.name}
                style={({ pressed }) => [pressed && styles.pressed]}>
                <AppCard>
                  <View style={styles.row}>
                    <CategoryIcon icon={pm.icon} color={theme.primary} size={40} />
                    <View style={styles.meta}>
                      <View style={styles.nameRow}>
                        <Text style={[styles.name, { color: theme.text }]}>
                          {pm.name}
                        </Text>
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
                      <Text style={[styles.count, { color: theme.textSecondary }]}>
                        {count === 0
                          ? 'No transactions yet'
                          : `${count} transaction${count === 1 ? '' : 's'}`}
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
              New Payment Method
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
                    <CategoryIcon icon={iconKey} color={theme.primary} size={32} />
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
    paddingHorizontal: 7,
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
