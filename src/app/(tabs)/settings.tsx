import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
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
  SegmentedControl,
  type SegmentOption,
} from '@/components/common';
import { CurrencyPickerModal } from '@/components/forms/CurrencyPickerModal';
import { getCurrencyConfig } from '@/constants/currencies';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';
import type { DateFormatPreference, ThemePreference } from '@/types/models';
import { formatDateForDisplay, getTodayISODate } from '@/utils/date';
import { formatMinorToMajorInput, formatMoney } from '@/utils/money';
import { validateNonNegativeAmountInput } from '@/utils/validation';

const THEME_OPTIONS: readonly SegmentOption<ThemePreference>[] = [
  { label: 'System', value: 'system' },
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
];

const DATE_FORMAT_OPTIONS: readonly DateFormatPreference[] = [
  'DD MMM YYYY',
  'YYYY-MM-DD',
  'DD/MM/YYYY',
  'MM/DD/YYYY',
];

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();

  const settings = useAppStore((s) => s.settings);
  const currencies = useAppStore((s) => s.currencies);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const clearAllLocalData = useAppStore((s) => s.clearAllLocalData);

  const [currencyModalVisible, setCurrencyModalVisible] = useState(false);
  const [openingCurrencyModalVisible, setOpeningCurrencyModalVisible] = useState(false);
  const [dateModalVisible, setDateModalVisible] = useState(false);
  const [balanceModalVisible, setBalanceModalVisible] = useState(false);
  const [privacyModalVisible, setPrivacyModalVisible] = useState(false);
  const [clearConfirmVisible, setClearConfirmVisible] = useState(false);

  const [balanceInput, setBalanceInput] = useState('');
  const [balanceCurrencyInput, setBalanceCurrencyInput] = useState(
    settings.openingBalanceCurrencyCode || settings.currencyCode,
  );
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [savingBalance, setSavingBalance] = useState(false);
  const [clearingData, setClearingData] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const activeCurrency = getCurrencyConfig(settings.currencyCode, currencies);
  const openingCurrency = getCurrencyConfig(balanceCurrencyInput, currencies);
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';
  const todayISO = getTodayISODate();

  const openBalanceEditor = () => {
    const obCurrency = settings.openingBalanceCurrencyCode || settings.currencyCode;
    setBalanceCurrencyInput(obCurrency);
    setBalanceInput(
      formatMinorToMajorInput(settings.openingBalanceMinor, obCurrency, currencies),
    );
    setBalanceError(null);
    setBalanceModalVisible(true);
  };

  const handleSaveOpeningBalance = async () => {
    if (savingBalance) return;
    const validation = validateNonNegativeAmountInput(
      balanceInput,
      balanceCurrencyInput,
      currencies,
    );
    if (!validation.valid || validation.value === undefined) {
      setBalanceError(validation.error ?? 'Enter a valid non-negative balance.');
      return;
    }

    setSavingBalance(true);
    try {
      await updateSettings({
        openingBalanceMinor: validation.value,
        openingBalanceCurrencyCode: balanceCurrencyInput,
      });
      setBalanceModalVisible(false);
    } catch {
      setBalanceError('Failed to save opening balance.');
    } finally {
      setSavingBalance(false);
    }
  };

  const handleThemeChange = async (nextTheme: ThemePreference) => {
    setStatusError(null);
    try {
      await updateSettings({ theme: nextTheme });
    } catch {
      setStatusError('Unable to update theme preference.');
    }
  };

  const handleCurrencySelect = async (code: string) => {
    setStatusError(null);
    setCurrencyModalVisible(false);
    try {
      await updateSettings({ currencyCode: code });
    } catch {
      setStatusError('Unable to update currency.');
    }
  };

  const handleDateFormatSelect = async (format: DateFormatPreference) => {
    setStatusError(null);
    setDateModalVisible(false);
    try {
      await updateSettings({ dateFormat: format });
    } catch {
      setStatusError('Unable to update date format.');
    }
  };

  const handleClearAllData = async () => {
    if (clearingData) return;
    setClearingData(true);
    setStatusError(null);
    try {
      await clearAllLocalData();
      setClearConfirmVisible(false);
      router.replace('/onboarding');
    } catch {
      setClearConfirmVisible(false);
      setStatusError('Could not clear local data. Please try again.');
    } finally {
      setClearingData(false);
    }
  };

  return (
    <AppScreen>
      <AppHeader
        title="Settings"
        subtitle="Preferences, management, and local data"
      />

      {statusError ? (
        <Text style={[styles.errorBanner, { color: theme.danger }]}>{statusError}</Text>
      ) : null}

      <AppCard>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Preferences</Text>

        <View style={styles.preferenceBlock}>
          <Text style={[styles.rowLabel, { color: theme.textSecondary }]}>Theme</Text>
          <SegmentedControl
            options={THEME_OPTIONS}
            value={settings.theme}
            onChange={(val) => void handleThemeChange(val)}
          />
        </View>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        <SettingsRow
          icon="cash-outline"
          label="Default Currency"
          value={`${activeCurrency.code} (${activeCurrency.symbol})`}
          onPress={() => setCurrencyModalVisible(true)}
        />

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        <SettingsRow
          icon="calendar-outline"
          label="Date Format"
          value={formatDateForDisplay(todayISO, settings.dateFormat)}
          onPress={() => setDateModalVisible(true)}
        />

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        <SettingsRow
          icon="wallet-outline"
          label="Opening Balance"
          value={formatMoney(
            settings.openingBalanceMinor,
            settings.openingBalanceCurrencyCode,
            { catalog: currencies },
          )}
          onPress={openBalanceEditor}
        />
      </AppCard>

      <AppCard>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>Manage</Text>

        <SettingsRow
          icon="grid-outline"
          label="Categories"
          value="Income & Expense"
          onPress={() => router.push('/categories')}
        />
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <SettingsRow
          icon="pricetags-outline"
          label="Tags"
          value="Custom Labels"
          onPress={() => router.push('/tags')}
        />
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <SettingsRow
          icon="card-outline"
          label="Payment Methods"
          value="Built-in & Custom"
          onPress={() => router.push('/payment-methods')}
        />
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <SettingsRow
          icon="calendar-number-outline"
          label="Calendar View"
          value="Daily Activity"
          onPress={() => router.push('/calendar')}
        />
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <SettingsRow
          icon="download-outline"
          label="Export & JSON Backup"
          value="CSV / JSON"
          onPress={() => router.push('/backup')}
        />
      </AppCard>

      <AppCard>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>About & Privacy</Text>

        <SettingsRow
          icon="shield-checkmark-outline"
          label="Privacy Policy"
          value="100% Offline"
          onPress={() => setPrivacyModalVisible(true)}
        />
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <View style={styles.staticRow}>
          <View style={styles.rowLeft}>
            <Ionicons
              name="information-circle-outline"
              size={20}
              color={theme.textSecondary}
            />
            <Text style={[styles.rowTitle, { color: theme.text }]}>
              BinRo Finance Version
            </Text>
          </View>
          <Text style={[styles.rowValue, { color: theme.textSecondary }]}>
            v{appVersion}
          </Text>
        </View>
      </AppCard>

      <AppCard>
        <Text style={[styles.sectionTitle, { color: theme.danger }]}>Danger Zone</Text>
        <Text style={[styles.dangerHint, { color: theme.textSecondary }]}>
          Permanently remove all transactions, tags, custom payment methods, custom categories, and reset your opening balance on this device.
        </Text>
        <AppButton
          label="Clear All Local Data"
          variant="danger"
          onPress={() => setClearConfirmVisible(true)}
        />
      </AppCard>

      {/* Searchable Currency Picker Modal */}
      <CurrencyPickerModal
        visible={currencyModalVisible}
        currencies={currencies}
        selectedCode={settings.currencyCode}
        onSelect={(curr) => void handleCurrencySelect(curr.code)}
        onClose={() => setCurrencyModalVisible(false)}
      />

      <CurrencyPickerModal
        visible={openingCurrencyModalVisible}
        currencies={currencies}
        selectedCode={balanceCurrencyInput}
        onSelect={(curr) => setBalanceCurrencyInput(curr.code)}
        onClose={() => setOpeningCurrencyModalVisible(false)}
      />

      {/* Date Format Modal */}
      <Modal
        visible={dateModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDateModalVisible(false)}>
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setDateModalVisible(false)}>
          <Pressable
            style={[
              styles.modalSheet,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
            onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              Select Date Format
            </Text>
            <View style={styles.modalList}>
              {DATE_FORMAT_OPTIONS.map((fmt) => {
                const selected = fmt === settings.dateFormat;
                return (
                  <Pressable
                    key={fmt}
                    onPress={() => void handleDateFormatSelect(fmt)}
                    style={[
                      styles.modalItem,
                      {
                        backgroundColor: selected
                          ? theme.primarySoft
                          : 'transparent',
                        borderColor: theme.border,
                      },
                    ]}>
                    <View>
                      <Text style={[styles.modalItemTitle, { color: theme.text }]}>
                        {formatDateForDisplay(todayISO, fmt)}
                      </Text>
                      <Text style={[styles.modalItemSub, { color: theme.textMuted }]}>
                        {fmt}
                      </Text>
                    </View>
                    {selected ? (
                      <Ionicons name="checkmark" size={18} color={theme.primary} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
            <AppButton
              label="Close"
              variant="outline"
              onPress={() => setDateModalVisible(false)}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Opening Balance Modal */}
      <Modal
        visible={balanceModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setBalanceModalVisible(false)}>
        <KeyboardAvoidingView
          style={styles.centerBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable
            style={[
              styles.dialogCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
            onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              Edit Opening Balance
            </Text>
            <Text style={[styles.dangerHint, { color: theme.textSecondary }]}>
              Opening balance stays linked to its own currency so changing your default currency never mutates past amounts.
            </Text>

            <Pressable
              onPress={() => setOpeningCurrencyModalVisible(true)}
              style={[
                styles.currencyPickButton,
                { backgroundColor: theme.surfaceElevated, borderColor: theme.border },
              ]}>
              <Text style={[styles.rowTitle, { color: theme.text }]}>
                Currency: {openingCurrency.code} ({openingCurrency.symbol})
              </Text>
              <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
            </Pressable>

            <AppInput
              label="Opening Balance"
              prefix={openingCurrency.symbol}
              value={balanceInput}
              onChangeText={(text) => {
                setBalanceInput(text);
                if (balanceError) setBalanceError(null);
              }}
              keyboardType={
                openingCurrency.minorUnits === 0 ? 'number-pad' : 'decimal-pad'
              }
              error={balanceError}
            />
            <View style={styles.dialogButtons}>
              <View style={styles.flex1}>
                <AppButton
                  label="Cancel"
                  variant="outline"
                  onPress={() => setBalanceModalVisible(false)}
                  disabled={savingBalance}
                  fullWidth
                />
              </View>
              <View style={styles.flex1}>
                <AppButton
                  label="Save"
                  onPress={() => void handleSaveOpeningBalance()}
                  loading={savingBalance}
                  fullWidth
                />
              </View>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Privacy Policy Modal */}
      <Modal
        visible={privacyModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPrivacyModalVisible(false)}>
        <Pressable
          style={styles.centerBackdrop}
          onPress={() => setPrivacyModalVisible(false)}>
          <Pressable
            style={[
              styles.dialogCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
            onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              Privacy Policy
            </Text>
            <Text style={[styles.dangerHint, { color: theme.textSecondary }]}>
              BinRo Finance stores all your financial records locally on this device using SQLite. Your transactions, balances, tags, and categories never leave your device unless you explicitly export a backup file.
            </Text>
            <AppButton
              label="Done"
              onPress={() => setPrivacyModalVisible(false)}
              fullWidth
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Clear All Confirmation */}
      <ConfirmDialog
        visible={clearConfirmVisible}
        title="Clear All Local Data?"
        message="This will permanently delete every transaction, tag, custom payment method, and custom category stored on this device. This action cannot be undone."
        confirmLabel="Clear All Data"
        cancelLabel="Cancel"
        destructive
        loading={clearingData}
        onConfirm={() => void handleClearAllData()}
        onCancel={() => setClearConfirmVisible(false)}
      />
    </AppScreen>
  );
}

interface SettingsRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  onPress: () => void;
}

function SettingsRow({ icon, label, value, onPress }: SettingsRowProps) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.staticRow, pressed && styles.pressed]}>
      <View style={styles.rowLeft}>
        <Ionicons name={icon} size={20} color={theme.textSecondary} />
        <Text style={[styles.rowTitle, { color: theme.text }]}>{label}</Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={[styles.rowValue, { color: theme.textSecondary }]} numberOfLines={1}>
          {value}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  preferenceBlock: {
    gap: Spacing.two,
  },
  rowLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  staticRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.one + 2,
    gap: Spacing.two,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flex: 1,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    flexShrink: 1,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  rowValue: {
    fontSize: 13,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    width: '100%',
  },
  dangerHint: {
    fontSize: 13,
    lineHeight: 19,
  },
  errorBanner: {
    fontSize: 13,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  centerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  modalSheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.three,
    maxHeight: '75%',
  },
  dialogCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: Radius.xl,
    borderWidth: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  currencyPickButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.two + 3,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalList: {
    maxHeight: 340,
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two + 4,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalItemTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  modalItemSub: {
    fontSize: 12,
    marginTop: 2,
  },
  dialogButtons: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  flex1: {
    flex: 1,
  },
});
