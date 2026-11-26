import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import {
  AppButton,
  AppCard,
  AppHeader,
  AppInput,
  AppScreen,
  BottomSheetModal,
  GoogleSignInButton,
  SegmentedControl,
  type SegmentOption,
} from '@/components/common';
import { getCurrencyConfig } from '@/constants/currencies';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { resolveLocalImageUri } from '@/services/images/localImageStorage';
import { useAppStore } from '@/store/app-store';
import type { DateFormatPreference, ThemePreference } from '@/types/models';
import { formatDateForDisplay, getTodayISODate } from '@/utils/date';
import { formatMinorToMajorInput, formatMoney } from '@/utils/money';
import {
  getProfileInitials,
  PROFILE_AVATAR_COLOR,
  shouldPromptProfileCompletion,
} from '@/utils/profile';
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
  const authUser = useAppStore((s) => s.authUser);
  const authBusy = useAppStore((s) => s.authBusy);
  const syncState = useAppStore((s) => s.syncState);
  const signInWithGoogle = useAppStore((s) => s.signInWithGoogle);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const openingBalanceDraft = useAppStore((s) => s.openingBalanceDraft);
  const setOpeningBalanceDraft = useAppStore((s) => s.setOpeningBalanceDraft);

  const [dateModalVisible, setDateModalVisible] = useState(false);
  const [balanceModalVisible, setBalanceModalVisible] = useState(false);

  const [balanceInput, setBalanceInput] = useState('');
  const [balanceCurrencyInput, setBalanceCurrencyInput] = useState(
    settings.openingBalanceCurrencyCode || settings.currencyCode,
  );
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [savingBalance, setSavingBalance] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [failedAvatarUri, setFailedAvatarUri] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (openingBalanceDraft?.reopenOnFocus) {
        setBalanceCurrencyInput(openingBalanceDraft.currencyCode);
        setBalanceInput(openingBalanceDraft.amountText);
        setBalanceError(null);
        setBalanceModalVisible(true);
        setOpeningBalanceDraft(null);
      }
    }, [openingBalanceDraft, setOpeningBalanceDraft]),
  );

  const activeCurrency = getCurrencyConfig(settings.currencyCode, currencies);
  const openingCurrency = getCurrencyConfig(balanceCurrencyInput, currencies);
  const todayISO = getTodayISODate();

  const avatarImageUri =
    resolveLocalImageUri(settings.profileAvatar) ??
    resolveLocalImageUri(authUser?.googleAvatarUrl ?? settings.googleAvatarUrl);
  const showAvatarPhoto = Boolean(avatarImageUri && failedAvatarUri !== avatarImageUri);
  const profileInitials = getProfileInitials(
    settings.profileName || authUser?.googleName || authUser?.email,
  );
  const accountStatusLabel = authUser
    ? syncState.syncStatus === 'syncing'
      ? 'Syncing...'
      : syncState.syncStatus === 'error'
        ? 'Sync Error'
        : syncState.syncStatus === 'offline'
          ? 'Offline'
          : 'Google Synced'
    : syncState.linkedUserEmail
      ? 'Signed Out'
      : 'Local Device';

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

  const handleDateFormatSelect = async (format: DateFormatPreference) => {
    setStatusError(null);
    setDateModalVisible(false);
    try {
      await updateSettings({ dateFormat: format });
    } catch {
      setStatusError('Unable to update date format.');
    }
  };

  const handleToggleHomeBudgetShortcut = async (enabled: boolean) => {
    setStatusError(null);
    try {
      await updateSettings({ showHomeBudgetShortcut: enabled });
    } catch {
      setStatusError('Unable to update Home budget shortcut preference.');
    }
  };

  const handleSettingsGoogleSignIn = async () => {
    if (authBusy) return;
    setAuthError(null);
    try {
      const result = await signInWithGoogle();
      if (result.status === 'error') {
        setAuthError(result.message);
        return;
      }
      if (result.status === 'success') {
        const latest = useAppStore.getState();
        if (
          !latest.accountSwitchConflict &&
          shouldPromptProfileCompletion(latest.settings)
        ) {
          router.push('/profile/complete');
        }
      }
    } catch {
      setAuthError('Unable to sign in with Google right now. Please try again.');
    }
  };

  return (
    <AppScreen>
      <AppHeader
        title="Settings"
        showBack
        onBackPress={() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace('/(tabs)');
          }
        }}
      />

      {statusError ? (
        <Text style={[styles.errorBanner, { color: theme.danger }]}>{statusError}</Text>
      ) : null}

      <AppCard>
        <Pressable
          onPress={() => router.push('/profile')}
          accessibilityRole="button"
          style={({ pressed }) => [styles.profileRow, pressed && styles.pressed]}>
          <View
            style={[
              styles.profileAvatar,
              { backgroundColor: PROFILE_AVATAR_COLOR },
            ]}>
            {showAvatarPhoto && avatarImageUri ? (
              <Image
                source={{ uri: avatarImageUri }}
                style={styles.profileAvatarImage}
                contentFit="cover"
                onError={() => setFailedAvatarUri(avatarImageUri)}
              />
            ) : (
              <Text style={styles.profileInitials}>{profileInitials}</Text>
            )}
          </View>
          <View style={styles.profileMeta}>
            <Text style={[styles.profileName, { color: theme.text }]} numberOfLines={1}>
              {settings.profileName?.trim() || authUser?.googleName || 'Local Profile'}
            </Text>
            <Text style={[styles.profileSub, { color: theme.textSecondary }]} numberOfLines={1}>
              {authUser?.email || settings.googleEmail || settings.profileBio?.trim() || 'Set up local profile'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
        </Pressable>
      </AppCard>

      {authUser ? (
        <AppCard>
          <Pressable
            onPress={() => router.push('/account')}
            accessibilityRole="button"
            style={({ pressed }) => [styles.accountSummaryRow, pressed && styles.pressed]}>
            <View style={styles.accountSummaryTextCol}>
              <Text style={[styles.accountSummaryTitle, { color: theme.text }]} numberOfLines={1}>
                {authUser.email ?? settings.googleEmail ?? 'Google Account'}
              </Text>
              <Text style={[styles.accountSummarySub, { color: theme.textSecondary }]}>
                Google account connected
              </Text>
            </View>
            <View
              style={[
                styles.accountStatusChip,
                { backgroundColor: theme.primarySoft, borderColor: theme.border },
              ]}>
              <Text style={[styles.accountStatusChipText, { color: theme.primary }]}>
                {accountStatusLabel}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
          </Pressable>
        </AppCard>
      ) : (
        <AppCard>
          <View style={styles.accountSummaryTextCol}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Sign in with Google
            </Text>
            <Text style={[styles.accountSummarySub, { color: theme.textSecondary }]}>
              {syncState.linkedUserEmail
                ? `Reconnect ${syncState.linkedUserEmail} to sync your data`
                : 'Connect your Google account for cloud sync'}
            </Text>
          </View>

          {authError ? (
            <Text style={[styles.errorBanner, { color: theme.danger }]}>
              {authError}
            </Text>
          ) : null}

          <GoogleSignInButton
            label="Continue with Google"
            size="md"
            loading={authBusy}
            onPress={() => void handleSettingsGoogleSignIn()}
          />
        </AppCard>
      )}

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
          onPress={() => router.push('/currency')}
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

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        <View style={styles.staticRow}>
          <View style={styles.rowLeft}>
            <Ionicons
              name="pie-chart-outline"
              size={20}
              color={theme.textSecondary}
            />
            <Text style={[styles.rowTitle, { color: theme.text }]}>
              Home Budget Shortcut
            </Text>
          </View>
          <Switch
            value={settings.showHomeBudgetShortcut}
            onValueChange={(val) => void handleToggleHomeBudgetShortcut(val)}
            trackColor={{ false: theme.border, true: theme.primarySoft }}
            thumbColor={
              settings.showHomeBudgetShortcut ? theme.primary : theme.textMuted
            }
          />
        </View>
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
          label="Backup & Export"
          value="CSV / JSON"
          onPress={() => router.push('/backup')}
        />
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <SettingsRow
          icon="person-circle-outline"
          label="Account Management"
          value={accountStatusLabel}
          onPress={() => router.push('/account')}
        />
      </AppCard>

      <AppCard>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>About & Privacy</Text>

        <SettingsRow
          icon="shield-checkmark-outline"
          label="Privacy Policy"
          value={authUser ? 'Local + Cloud Sync' : 'Local-First'}
          onPress={() => router.push('/privacy-policy')}
        />
        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <SettingsRow
          icon="information-circle-outline"
          label="About"
          onPress={() => router.push('/about')}
        />
      </AppCard>

      <BottomSheetModal
        visible={dateModalVisible}
        onClose={() => setDateModalVisible(false)}>
        <View style={styles.sheetHeader}>
          <Text style={[styles.modalTitle, { color: theme.text }]}>
            Select Date Format
          </Text>
          <Pressable
            onPress={() => setDateModalVisible(false)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close date format selector">
            <Ionicons name="chevron-down" size={22} color={theme.textSecondary} />
          </Pressable>
        </View>
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
                    backgroundColor: selected ? theme.primarySoft : 'transparent',
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
      </BottomSheetModal>

      <BottomSheetModal
        visible={balanceModalVisible}
        onClose={() => setBalanceModalVisible(false)}
        variant="center"
        keyboardAvoiding>
        <View style={styles.sheetHeader}>
          <Text style={[styles.modalTitle, { color: theme.text }]}>
            Edit Opening Balance
          </Text>
          <Pressable
            onPress={() => setBalanceModalVisible(false)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close opening balance editor">
            <Ionicons name="chevron-down" size={22} color={theme.textSecondary} />
          </Pressable>
        </View>

        <Pressable
          onPress={() => {
            setOpeningBalanceDraft({
              currencyCode: balanceCurrencyInput,
              amountText: balanceInput,
              reopenOnFocus: true,
            });
            setBalanceModalVisible(false);
            router.push('/currency?mode=openingBalance');
          }}
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
      </BottomSheetModal>

    </AppScreen>
  );
}

interface SettingsRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
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
        {value ? (
          <Text style={[styles.rowValue, { color: theme.textSecondary }]} numberOfLines={1}>
            {value}
          </Text>
        ) : null}
        <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  profileAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  profileAvatarImage: {
    width: '100%',
    height: '100%',
  },
  profileInitials: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  profileMeta: {
    flex: 1,
    gap: 2,
  },
  profileName: {
    fontSize: 16,
    fontWeight: '700',
  },
  profileSub: {
    fontSize: 13,
  },
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
  errorBanner: {
    fontSize: 13,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    gap: Spacing.one,
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
  accountSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  accountSummaryTextCol: {
    flex: 1,
    gap: 2,
  },
  accountSummaryTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  accountSummarySub: {
    fontSize: 12,
    lineHeight: 17,
  },
  accountStatusChip: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  accountStatusChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
