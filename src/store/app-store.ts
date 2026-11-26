import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import {
  DEFAULT_CURRENCY_CODE,
  FALLBACK_CURRENCIES,
  type CurrencyConfig,
} from '@/constants/currencies';
import { initializeDatabase } from '@/database';
import { repositories } from '@/database/repositories';
import { trackAnalyticsEvent } from '@/services/analytics/analyticsService';
import { deleteRemoteUserAccount } from '@/services/auth/accountDeletionService';
import {
  type AuthSessionSource,
  buildWelcomeDedupeKey,
  decideAccountSignInNotification,
} from '@/services/auth/accountNotificationPolicy';
import {
  buildGoogleFallbackProfilePatch,
  type GoogleAuthUserProfile,
  type GoogleSignInFlowResult,
  signInWithGoogleAccount,
  signOutGoogleAndSupabase,
} from '@/services/auth/googleAuthService';
import { materializeBackupMediaAssets } from '@/services/backup/backupService';
import { calculateBudgetProgress } from '@/services/calculations/financialCalculations';
import {
  mergeCurrencyCatalog,
  syncCurrencyCatalog,
} from '@/services/currency/currencyCatalogService';
import { detectDeviceCurrencyCode } from '@/services/currency/localizationCurrency';
import {
  DEFAULT_FREE_ENTITLEMENT,
  loadCachedEntitlement,
  refreshUserEntitlement,
} from '@/services/entitlements/entitlementService';
import { clearAllStoredImages } from '@/services/images/localImageStorage';
import {
  checkRemoteAccountExists,
  fetchRemoteProfileRow,
  inspectAccountLinkState,
  linkLocalWorkspaceToUser,
  runSyncCycle,
  type SyncRunResult,
  switchWorkspaceAccountAndSync,
  waitForInFlightSync,
} from '@/services/sync/syncEngine';
import type {
  BackupPayload,
  CreateCategoryInput,
  CreateNotificationInput,
  CreatePaymentMethodInput,
  CreateTagInput,
  CreateTransactionInput,
  RestoreResult,
  UpdateCategoryInput,
  UpdatePaymentMethodInput,
  UpdateSettingsInput,
  UpdateTagInput,
  UpdateTransactionInput,
  UpsertBudgetInput,
} from '@/types/database';
import type {
  AppNotification,
  AppSettings,
  Budget,
  Category,
  PaymentMethodRecord,
  SyncStateSnapshot,
  Tag,
  Transaction,
  TransactionType,
  UserEntitlement,
} from '@/types/models';
import type { TransactionFilterState } from '@/types/reports';
import { addDaysToISODate, getTodayISODate, parseISODateParts } from '@/utils/date';
import { formatMoney } from '@/utils/money';
import { reconcileLocalAndRemoteProfile } from '@/utils/profile';

const HOME_SIGNIN_REMINDER_DISMISSED_KEY = 'binro_home_signin_reminder_dismissed';
const TRANSACTIONS_SIGNIN_REMINDER_DISMISSED_KEY =
  'binro_transactions_signin_reminder_dismissed';

export interface TransactionDraft {
  mode: 'create' | 'edit';
  transactionId?: string;
  step: 1 | 2;
  type: TransactionType;
  amountText: string;
  currencyCode: string;
  title: string;
  categoryId: string | null;
  tagIds: string[];
  transactionDate: string;
  paymentMethodId: string | null;
  paymentMethod: string;
  note: string;
}

export interface OpeningBalanceDraft {
  currencyCode: string;
  amountText: string;
  reopenOnFocus: boolean;
}

export interface AccountSwitchConflict {
  newProfile: GoogleAuthUserProfile;
  previousUserId: string;
  previousUserEmail: string | null;
  hasLocalData: boolean;
  pendingOutboxCount: number;
  source?: AuthSessionSource;
  remoteAccountExisted?: boolean | null;
}

export function createDefaultTransactionFilters(): TransactionFilterState {
  const today = getTodayISODate();
  return {
    datePreset: 'all_time',
    customStartDate: addDaysToISODate(today, -29),
    customEndDate: today,
    selectedYears: [],
    categoryIds: [],
    paymentMethodIds: [],
    tagIds: [],
    currencyCode: 'all',
    sortBy: 'newest',
  };
}

const DEFAULT_SETTINGS: AppSettings = {
  id: 1,
  currencyCode: DEFAULT_CURRENCY_CODE,
  openingBalanceMinor: 0,
  openingBalanceCurrencyCode: DEFAULT_CURRENCY_CODE,
  theme: 'system',
  dateFormat: 'DD MMM YYYY',
  onboardingCompleted: false,
  profileName: null,
  profileBio: null,
  profileAvatar: null,
  currencyInitialized: false,
  showHomeBudgetShortcut: false,
  gender: null,
  dateOfBirth: null,
  googleName: null,
  googleEmail: null,
  googleAvatarUrl: null,
  profileCompletedAt: null,
  updatedAt: '',
};

const DEFAULT_SYNC_STATE: SyncStateSnapshot = {
  linkedUserId: null,
  linkedUserEmail: null,
  migrationCompletedAt: null,
  lastSyncedAt: null,
  lastError: null,
  syncStatus: 'idle',
  cursors: {},
  anonymousInstallId: '',
};

interface AppStoreState {
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  settings: AppSettings;
  categories: Category[];
  tags: Tag[];
  paymentMethods: PaymentMethodRecord[];
  currencies: CurrencyConfig[];
  transactions: Transaction[];
  budgets: Budget[];
  notifications: AppNotification[];
  transactionFilters: TransactionFilterState;
  transactionDraft: TransactionDraft | null;
  onboardingCurrencyCode: string | null;
  openingBalanceDraft: OpeningBalanceDraft | null;

  authUser: GoogleAuthUserProfile | null;
  authBusy: boolean;
  syncState: SyncStateSnapshot;
  pendingOutboxCount: number;
  entitlement: UserEntitlement;
  accountSwitchConflict: AccountSwitchConflict | null;
  homeSignInReminderDismissed: boolean;
  transactionsSignInReminderDismissed: boolean;

  initializeApp: () => Promise<void>;
  refreshData: () => Promise<void>;
  refreshCurrencyCatalog: () => Promise<void>;
  refreshSyncMetadata: () => Promise<void>;
  dismissHomeSignInReminder: () => Promise<void>;
  dismissTransactionsSignInReminder: () => Promise<void>;
  setTransactionFilters: (next: TransactionFilterState) => void;
  resetTransactionFilters: () => void;
  setTransactionDraft: (draft: TransactionDraft | null) => void;
  patchTransactionDraft: (patch: Partial<TransactionDraft>) => void;
  clearTransactionDraft: () => void;
  setOnboardingCurrencyCode: (code: string | null) => void;
  setOpeningBalanceDraft: (draft: OpeningBalanceDraft | null) => void;
  completeOnboarding: (params: {
    currencyCode: string;
    openingBalanceMinor?: number;
  }) => Promise<void>;
  updateSettings: (input: UpdateSettingsInput) => Promise<void>;

  createTransaction: (input: CreateTransactionInput) => Promise<Transaction>;
  updateTransaction: (id: string, input: UpdateTransactionInput) => Promise<Transaction>;
  deleteTransaction: (id: string) => Promise<void>;

  createCategory: (input: CreateCategoryInput) => Promise<Category>;
  updateCategory: (id: string, input: UpdateCategoryInput) => Promise<Category>;

  createTag: (input: CreateTagInput) => Promise<Tag>;
  updateTag: (id: string, input: UpdateTagInput) => Promise<Tag>;
  deleteTag: (id: string) => Promise<void>;

  createPaymentMethod: (input: CreatePaymentMethodInput) => Promise<PaymentMethodRecord>;
  updatePaymentMethod: (
    id: string,
    input: UpdatePaymentMethodInput,
  ) => Promise<PaymentMethodRecord>;
  deletePaymentMethod: (id: string) => Promise<void>;

  upsertBudget: (input: UpsertBudgetInput) => Promise<Budget>;
  deleteBudget: (id: string) => Promise<void>;

  addNotification: (input: CreateNotificationInput) => Promise<AppNotification>;
  markNotificationRead: (id: string) => Promise<void>;
  markNotificationUnread: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;

  restoreBackup: (
    payload: BackupPayload,
    mode: 'merge' | 'replace',
  ) => Promise<RestoreResult>;
  clearAllLocalData: () => Promise<void>;

  applySignedInSession: (
    profile: GoogleAuthUserProfile,
    options?: { source?: AuthSessionSource },
  ) => Promise<void>;
  signInWithGoogle: () => Promise<GoogleSignInFlowResult>;
  confirmAccountSwitchReplace: () => Promise<void>;
  cancelAccountSwitch: () => Promise<void>;
  syncNow: () => Promise<SyncRunResult>;
  signOutCloud: () => Promise<void>;
  deleteAccountAndData: () => Promise<void>;
}

async function loadSnapshot() {
  const [
    settings,
    categories,
    tags,
    paymentMethods,
    cachedCurrencies,
    transactions,
    budgets,
    notifications,
    syncState,
    pendingOutboxCount,
    entitlement,
  ] = await Promise.all([
    repositories.settings.get(),
    repositories.categories.getAll({ includeArchived: true }),
    repositories.tags.getAll({ includeArchived: true }),
    repositories.paymentMethods.getAll({ includeArchived: true }),
    repositories.currencies.getAll(),
    repositories.transactions.getAll(),
    repositories.budgets.getAll(),
    repositories.notifications.getAll(),
    repositories.sync.getSyncState(),
    repositories.sync.getPendingOutboxCount(),
    loadCachedEntitlement(),
  ]);

  const currencies = mergeCurrencyCatalog(
    cachedCurrencies.length > 0 ? cachedCurrencies : FALLBACK_CURRENCIES,
  );

  return {
    settings,
    categories,
    tags,
    paymentMethods,
    currencies,
    transactions,
    budgets,
    notifications,
    syncState,
    pendingOutboxCount,
    entitlement,
  };
}

export const useAppStore = create<AppStoreState>((set, get) => {
  const scheduleBackgroundSync = () => {
    const { authUser, authBusy, syncState, accountSwitchConflict, isInitialized } = get();
    if (!isInitialized || !authUser || authBusy || accountSwitchConflict) return;
    if (syncState.linkedUserId && syncState.linkedUserId !== authUser.userId) return;
    void get().syncNow();
  };

  return {
    isInitialized: false,
    isLoading: false,
    error: null,
    settings: DEFAULT_SETTINGS,
    categories: [],
    tags: [],
    paymentMethods: [],
    currencies: [...FALLBACK_CURRENCIES],
    transactions: [],
    budgets: [],
    notifications: [],
    transactionFilters: createDefaultTransactionFilters(),
    transactionDraft: null,
    onboardingCurrencyCode: null,
    openingBalanceDraft: null,

    authUser: null,
    authBusy: false,
    syncState: DEFAULT_SYNC_STATE,
    pendingOutboxCount: 0,
    entitlement: DEFAULT_FREE_ENTITLEMENT,
    accountSwitchConflict: null,
    homeSignInReminderDismissed: false,
    transactionsSignInReminderDismissed: false,

    initializeApp: async () => {
      if (get().isLoading) return;
      set({ isLoading: true, error: null });

      try {
        await initializeDatabase();
        let snapshot = await loadSnapshot();

        let homeDismissed = false;
        let txDismissed = false;
        try {
          const [rawHome, rawTx] = await Promise.all([
            AsyncStorage.getItem(HOME_SIGNIN_REMINDER_DISMISSED_KEY),
            AsyncStorage.getItem(TRANSACTIONS_SIGNIN_REMINDER_DISMISSED_KEY),
          ]);
          homeDismissed = rawHome === 'true';
          txDismissed = rawTx === 'true';
        } catch {
          // Default to visible when local preference storage is unavailable
        }

        // Only detect device currency on first launch when no saved preference exists
        if (!snapshot.settings.onboardingCompleted && !snapshot.settings.currencyInitialized) {
          const detectedCurrency = detectDeviceCurrencyCode(snapshot.currencies);
          const updatedSettings = await repositories.settings.update({
            currencyCode: detectedCurrency,
            openingBalanceCurrencyCode: detectedCurrency,
            currencyInitialized: true,
          });
          snapshot = { ...snapshot, settings: updatedSettings };
        }

        set({
          isInitialized: true,
          isLoading: false,
          homeSignInReminderDismissed: homeDismissed,
          transactionsSignInReminderDismissed: txDismissed,
          ...snapshot,
        });

        // Refresh currency catalog asynchronously if online without blocking startup
        void get().refreshCurrencyCatalog();
      } catch {
        set({
          isLoading: false,
          error: 'Unable to initialize local database. Please restart the app.',
        });
      }
    },

    refreshData: async () => {
      try {
        const snapshot = await loadSnapshot();
        set({ ...snapshot, error: null });
      } catch {
        set({ error: 'Unable to refresh local records.' });
      }
    },

    refreshCurrencyCatalog: async () => {
      try {
        const currencies = await syncCurrencyCatalog(repositories.currencies);
        set({ currencies });
      } catch {
        // Keep cached/fallback currencies silently when offline
      }
    },

    refreshSyncMetadata: async () => {
      try {
        const [syncState, pendingOutboxCount, entitlement] = await Promise.all([
          repositories.sync.getSyncState(),
          repositories.sync.getPendingOutboxCount(),
          loadCachedEntitlement(),
        ]);
        set({ syncState, pendingOutboxCount, entitlement });
      } catch {
        // Non-fatal
      }
    },

    dismissHomeSignInReminder: async () => {
      set({ homeSignInReminderDismissed: true });
      try {
        await AsyncStorage.setItem(HOME_SIGNIN_REMINDER_DISMISSED_KEY, 'true');
      } catch {
        // Non-fatal UI preference persistence failure
      }
    },

    dismissTransactionsSignInReminder: async () => {
      set({ transactionsSignInReminderDismissed: true });
      try {
        await AsyncStorage.setItem(TRANSACTIONS_SIGNIN_REMINDER_DISMISSED_KEY, 'true');
      } catch {
        // Non-fatal UI preference persistence failure
      }
    },

    setTransactionFilters: (next) => {
      set({ transactionFilters: next });
    },

    resetTransactionFilters: () => {
      set({ transactionFilters: createDefaultTransactionFilters() });
    },

    setTransactionDraft: (draft) => {
      set({ transactionDraft: draft });
    },

    patchTransactionDraft: (patch) => {
      set((state) => {
        if (!state.transactionDraft) return state;
        return {
          transactionDraft: {
            ...state.transactionDraft,
            ...patch,
          },
        };
      });
    },

    clearTransactionDraft: () => {
      set({ transactionDraft: null });
    },

    setOnboardingCurrencyCode: (code) => {
      set({ onboardingCurrencyCode: code });
    },

    setOpeningBalanceDraft: (draft) => {
      set({ openingBalanceDraft: draft });
    },

    completeOnboarding: async ({ currencyCode, openingBalanceMinor }) => {
      set({ isLoading: true, error: null });
      try {
        const currentSettings = get().settings;
        const nextOpeningBalanceMinor =
          openingBalanceMinor !== undefined
            ? openingBalanceMinor
            : currentSettings.openingBalanceMinor;
        const nextOpeningBalanceCurrencyCode =
          openingBalanceMinor !== undefined
            ? currencyCode
            : currentSettings.openingBalanceMinor > 0
              ? currentSettings.openingBalanceCurrencyCode
              : currencyCode;

        const updated = await repositories.settings.update({
          currencyCode,
          openingBalanceMinor: nextOpeningBalanceMinor,
          openingBalanceCurrencyCode: nextOpeningBalanceCurrencyCode,
          onboardingCompleted: true,
          currencyInitialized: true,
        });
        set({ settings: updated, onboardingCurrencyCode: null, isLoading: false });
        void trackAnalyticsEvent('onboarding_completed', { currency_code: currencyCode });
        scheduleBackgroundSync();
      } catch (error) {
        set({
          isLoading: false,
          error: error instanceof Error ? error.message : 'Unable to save setup preferences.',
        });
        throw error;
      }
    },

    updateSettings: async (input) => {
      set({ error: null });
      try {
        const updated = await repositories.settings.update(input);
        const pendingOutboxCount = await repositories.sync.getPendingOutboxCount();
        set({ settings: updated, pendingOutboxCount });
        scheduleBackgroundSync();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to update settings.';
        set({ error: message });
        throw error;
      }
    },

    createTransaction: async (input) => {
      const created = await repositories.transactions.create(input);
      const [transactions, pendingOutboxCount] = await Promise.all([
        repositories.transactions.getAll(),
        repositories.sync.getPendingOutboxCount(),
      ]);
      set({ transactions, pendingOutboxCount });

      void trackAnalyticsEvent('transaction_created', {
        tx_type: created.type,
        currency_code: created.currencyCode,
        has_tags: created.tagIds.length > 0,
      });

      if (created.type === 'expense') {
        const { budgets, categories, currencies, notifications } = get();
        const { year, month } = parseISODateParts(created.transactionDate);
        const matchingBudgets = budgets.filter((b) => {
          if (b.currencyCode.toUpperCase() !== created.currencyCode.toUpperCase()) return false;
          if (b.categoryId !== null && b.categoryId !== created.categoryId) return false;
          if (b.period === 'yearly') return b.year === year;
          if (b.period === 'biweekly') return true;
          return b.year === year && b.month === month;
        });

        for (const budget of matchingBudgets) {
          const category = budget.categoryId
            ? categories.find((c) => c.id === budget.categoryId) ?? null
            : null;
          const progress = calculateBudgetProgress({
            budget,
            transactions,
            category,
            referenceDate: created.transactionDate,
          });
          if (
            created.transactionDate >= progress.periodStartDate &&
            created.transactionDate <= progress.periodEndDate &&
            progress.isExceeded
          ) {
            const dedupeKey = `budget_exceeded:${budget.id}:${progress.periodStartDate}`;
            const alreadyNotified = notifications.some((n) => n.metadataJson === dedupeKey);
            if (!alreadyNotified) {
              const periodLabel =
                budget.period === 'biweekly'
                  ? 'Paycheck budget'
                  : budget.period === 'yearly'
                    ? 'Annual budget'
                    : 'Monthly budget';
              const label = category ? `${category.name} budget` : periodLabel;
              await get().addNotification({
                type: 'budget_alert',
                title: `${label} exceeded`,
                body: `Spending reached ${formatMoney(progress.spentMinor, budget.currencyCode, { catalog: currencies })} against ${formatMoney(budget.amountMinor, budget.currencyCode, { catalog: currencies })}.`,
                metadataJson: dedupeKey,
              });
            }
          }
        }
      }

      scheduleBackgroundSync();
      return created;
    },

    updateTransaction: async (id, input) => {
      const updated = await repositories.transactions.update(id, input);
      const [transactions, pendingOutboxCount] = await Promise.all([
        repositories.transactions.getAll(),
        repositories.sync.getPendingOutboxCount(),
      ]);
      set({ transactions, pendingOutboxCount });
      scheduleBackgroundSync();
      return updated;
    },

    deleteTransaction: async (id) => {
      await repositories.transactions.delete(id);
      const [transactions, pendingOutboxCount] = await Promise.all([
        repositories.transactions.getAll(),
        repositories.sync.getPendingOutboxCount(),
      ]);
      set({ transactions, pendingOutboxCount });
      scheduleBackgroundSync();
    },

    createCategory: async (input) => {
      const created = await repositories.categories.create(input);
      const [categories, pendingOutboxCount] = await Promise.all([
        repositories.categories.getAll({ includeArchived: true }),
        repositories.sync.getPendingOutboxCount(),
      ]);
      set({ categories, pendingOutboxCount });
      scheduleBackgroundSync();
      return created;
    },

    updateCategory: async (id, input) => {
      const updated = await repositories.categories.update(id, input);
      const [categories, transactions, pendingOutboxCount] = await Promise.all([
        repositories.categories.getAll({ includeArchived: true }),
        repositories.transactions.getAll(),
        repositories.sync.getPendingOutboxCount(),
      ]);
      set({ categories, transactions, pendingOutboxCount });
      scheduleBackgroundSync();
      return updated;
    },

    createTag: async (input) => {
      const created = await repositories.tags.create(input);
      const [tags, pendingOutboxCount] = await Promise.all([
        repositories.tags.getAll({ includeArchived: true }),
        repositories.sync.getPendingOutboxCount(),
      ]);
      set({ tags, pendingOutboxCount });
      scheduleBackgroundSync();
      return created;
    },

    updateTag: async (id, input) => {
      const updated = await repositories.tags.update(id, input);
      const [tags, pendingOutboxCount] = await Promise.all([
        repositories.tags.getAll({ includeArchived: true }),
        repositories.sync.getPendingOutboxCount(),
      ]);
      set({ tags, pendingOutboxCount });
      scheduleBackgroundSync();
      return updated;
    },

    deleteTag: async (id) => {
      await repositories.tags.delete(id);
      const [tags, transactions, pendingOutboxCount] = await Promise.all([
        repositories.tags.getAll({ includeArchived: true }),
        repositories.transactions.getAll(),
        repositories.sync.getPendingOutboxCount(),
      ]);
      set({ tags, transactions, pendingOutboxCount });
      scheduleBackgroundSync();
    },

    createPaymentMethod: async (input) => {
      const created = await repositories.paymentMethods.create(input);
      const [paymentMethods, pendingOutboxCount] = await Promise.all([
        repositories.paymentMethods.getAll({ includeArchived: true }),
        repositories.sync.getPendingOutboxCount(),
      ]);
      set({ paymentMethods, pendingOutboxCount });
      scheduleBackgroundSync();
      return created;
    },

    updatePaymentMethod: async (id, input) => {
      const updated = await repositories.paymentMethods.update(id, input);
      const [paymentMethods, pendingOutboxCount] = await Promise.all([
        repositories.paymentMethods.getAll({ includeArchived: true }),
        repositories.sync.getPendingOutboxCount(),
      ]);
      set({ paymentMethods, pendingOutboxCount });
      scheduleBackgroundSync();
      return updated;
    },

    deletePaymentMethod: async (id) => {
      await repositories.paymentMethods.delete(id);
      const [paymentMethods, transactions, pendingOutboxCount] = await Promise.all([
        repositories.paymentMethods.getAll({ includeArchived: true }),
        repositories.transactions.getAll(),
        repositories.sync.getPendingOutboxCount(),
      ]);
      set({ paymentMethods, transactions, pendingOutboxCount });
      scheduleBackgroundSync();
    },

    upsertBudget: async (input) => {
      const saved = await repositories.budgets.upsert(input);
      const [budgets, pendingOutboxCount] = await Promise.all([
        repositories.budgets.getAll(),
        repositories.sync.getPendingOutboxCount(),
      ]);
      set({ budgets, pendingOutboxCount });
      scheduleBackgroundSync();
      return saved;
    },

    deleteBudget: async (id) => {
      await repositories.budgets.delete(id);
      const [budgets, pendingOutboxCount] = await Promise.all([
        repositories.budgets.getAll(),
        repositories.sync.getPendingOutboxCount(),
      ]);
      set({ budgets, pendingOutboxCount });
      scheduleBackgroundSync();
    },

    addNotification: async (input) => {
      const created = await repositories.notifications.create(input);
      const notifications = await repositories.notifications.getAll();
      set({ notifications });
      return created;
    },

    markNotificationRead: async (id) => {
      await repositories.notifications.markAsRead(id);
      const notifications = await repositories.notifications.getAll();
      set({ notifications });
    },

    markNotificationUnread: async (id) => {
      await repositories.notifications.markAsUnread(id);
      const notifications = await repositories.notifications.getAll();
      set({ notifications });
    },

    markAllNotificationsRead: async () => {
      await repositories.notifications.markAllAsRead();
      const notifications = await repositories.notifications.getAll();
      set({ notifications });
    },

    deleteNotification: async (id) => {
      await repositories.notifications.delete(id);
      const notifications = await repositories.notifications.getAll();
      set({ notifications });
    },

    restoreBackup: async (payload, mode) => {
      const materialized = materializeBackupMediaAssets(payload);
      const result = await repositories.backup.restoreFromBackup(materialized, mode);
      await repositories.notifications.create({
        type: 'backup',
        title: 'Backup restored',
        body: `Restored ${result.transactionsInserted} transaction(s) in ${mode} mode.`,
      });
      const snapshot = await loadSnapshot();
      set({ ...snapshot, error: null });
      void trackAnalyticsEvent('backup_completed', { mode });
      scheduleBackgroundSync();
      return result;
    },

    clearAllLocalData: async () => {
      set({ isLoading: true, error: null });
      try {
        await repositories.backup.clearAllData();
        clearAllStoredImages();
        try {
          await Promise.all([
            AsyncStorage.removeItem(HOME_SIGNIN_REMINDER_DISMISSED_KEY),
            AsyncStorage.removeItem(TRANSACTIONS_SIGNIN_REMINDER_DISMISSED_KEY),
          ]);
        } catch {
          // Non-fatal
        }
        let snapshot = await loadSnapshot();
        const detectedCurrency = detectDeviceCurrencyCode(snapshot.currencies);
        const updatedSettings = await repositories.settings.update({
          currencyCode: detectedCurrency,
          openingBalanceCurrencyCode: detectedCurrency,
          currencyInitialized: true,
        });
        snapshot = { ...snapshot, settings: updatedSettings };

        set({
          ...snapshot,
          transactionDraft: null,
          onboardingCurrencyCode: null,
          openingBalanceDraft: null,
          transactionFilters: createDefaultTransactionFilters(),
          homeSignInReminderDismissed: false,
          transactionsSignInReminderDismissed: false,
          isLoading: false,
        });
      } catch {
        set({
          isLoading: false,
          error: 'Unable to clear local data.',
        });
        throw new Error('Unable to clear local data.');
      }
    },

    applySignedInSession: async (profile, options) => {
      if (!get().isInitialized) {
        await get().initializeApp();
      }
      const source: AuthSessionSource = options?.source ?? 'session_restore';
      const [syncStateBefore, notificationsBefore, linkCheck] = await Promise.all([
        repositories.sync.getSyncState(),
        repositories.notifications.getAll(),
        inspectAccountLinkState(profile.userId),
      ]);

      const remoteAccountExisted =
        source === 'explicit_sign_in'
          ? await checkRemoteAccountExists(profile.userId)
          : null;

      if (linkCheck.status === 'account_mismatch') {
        await repositories.sync.updateSyncState({
          syncStatus: 'needs_account_switch',
        });
        const syncState = await repositories.sync.getSyncState();
        set({
          authUser: profile,
          syncState,
          accountSwitchConflict: {
            newProfile: profile,
            previousUserId: linkCheck.previousUserId,
            previousUserEmail: linkCheck.previousUserEmail,
            hasLocalData: linkCheck.hasLocalData,
            pendingOutboxCount: linkCheck.pendingOutboxCount,
            source,
            remoteAccountExisted,
          },
        });
        return;
      }

      const remoteProfile = await fetchRemoteProfileRow(profile.userId);
      const localSettings = await repositories.settings.get();
      const reconciledPatch = reconcileLocalAndRemoteProfile({
        localSettings,
        remoteProfile,
        authProfile: profile,
      });
      if (Object.keys(reconciledPatch).length > 0) {
        const updatedSettings = await repositories.settings.update(reconciledPatch);
        set({ settings: updatedSettings });
      }

      set({ authUser: profile, accountSwitchConflict: null });

      try {
        if (linkCheck.status === 'needs_link') {
          await linkLocalWorkspaceToUser({
            userId: profile.userId,
            email: profile.email,
          });
        } else {
          await runSyncCycle(profile.userId);
        }
      } catch (syncError) {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          const msg = syncError instanceof Error ? syncError.message : 'sync_error';
          console.warn(`[GoogleAuth] Post-sign-in sync skipped: ${msg}`);
        }
      }

      const notifDecision = decideAccountSignInNotification({
        source,
        userId: profile.userId,
        previousLinkedUserId: syncStateBefore.linkedUserId,
        alreadyWelcomedLocally: notificationsBefore.some(
          (n) => n.metadataJson === buildWelcomeDedupeKey(profile.userId),
        ),
        remoteAccountExisted,
        createdAt: profile.createdAt,
        lastSignInAt: profile.lastSignInAt,
      });
      if (notifDecision) {
        await repositories.notifications.create(notifDecision);
      }

      const [snapshot, entitlement] = await Promise.all([
        loadSnapshot(),
        refreshUserEntitlement(profile.userId),
      ]);
      await repositories.sync.saveEntitlementCache(entitlement);
      set({ ...snapshot, entitlement, authUser: profile });
    },

    signInWithGoogle: async () => {
      if (get().authBusy) {
        return { status: 'error', message: 'Sign-in is already in progress.' };
      }
      set({ authBusy: true });
      try {
        const result = await signInWithGoogleAccount();
        if (result.status === 'success') {
          await get().applySignedInSession(result.profile, { source: 'explicit_sign_in' });
          void trackAnalyticsEvent('google_sign_in_completed');
        }
        return result;
      } catch (err) {
        const message =
          err instanceof Error && err.message.trim()
            ? err.message
            : 'Unable to complete Google sign-in. Please try again.';
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.warn(`[GoogleAuth] signInWithGoogle store error: ${message}`);
        }
        return { status: 'error', message };
      } finally {
        set({ authBusy: false });
      }
    },

    confirmAccountSwitchReplace: async () => {
      const conflict = get().accountSwitchConflict;
      if (!conflict) return;

      set({ authBusy: true });
      try {
        await switchWorkspaceAccountAndSync({
          userId: conflict.newProfile.userId,
          email: conflict.newProfile.email,
        });
        const currentSettings = await repositories.settings.get();
        const fallbackPatch = buildGoogleFallbackProfilePatch(
          currentSettings,
          conflict.newProfile,
        );
        await repositories.settings.update({
          ...fallbackPatch,
          onboardingCompleted: true,
        });

        const notifDecision = decideAccountSignInNotification({
          source: conflict.source ?? 'session_restore',
          userId: conflict.newProfile.userId,
          previousLinkedUserId: null,
          alreadyWelcomedLocally: false,
          remoteAccountExisted: conflict.remoteAccountExisted ?? null,
          createdAt: conflict.newProfile.createdAt,
          lastSignInAt: conflict.newProfile.lastSignInAt,
        });
        if (notifDecision) {
          await repositories.notifications.create(notifDecision);
        }

        const [snapshot, entitlement] = await Promise.all([
          loadSnapshot(),
          refreshUserEntitlement(conflict.newProfile.userId),
        ]);
        set({
          ...snapshot,
          entitlement,
          authUser: conflict.newProfile,
          accountSwitchConflict: null,
        });
      } finally {
        set({ authBusy: false });
      }
    },

    cancelAccountSwitch: async () => {
      set({ authBusy: true });
      try {
        await signOutGoogleAndSupabase();
        const [syncState, pendingOutboxCount] = await Promise.all([
          repositories.sync.updateSyncState({
            syncStatus: 'idle',
            lastError: null,
          }),
          repositories.sync.getPendingOutboxCount(),
        ]);
        set({
          authUser: null,
          accountSwitchConflict: null,
          syncState,
          pendingOutboxCount,
        });
      } finally {
        set({ authBusy: false });
      }
    },

    syncNow: async () => {
      const { authUser, accountSwitchConflict, syncState } = get();
      if (!authUser || accountSwitchConflict) {
        return { status: 'skipped', pushedCount: 0, pulledCount: 0 };
      }
      if (syncState.linkedUserId && syncState.linkedUserId !== authUser.userId) {
        return { status: 'skipped', pushedCount: 0, pulledCount: 0 };
      }

      set((state) => ({
        syncState: { ...state.syncState, syncStatus: 'syncing', lastError: null },
      }));
      void trackAnalyticsEvent('sync_started');

      const result = await runSyncCycle(authUser.userId);
      const snapshot = await loadSnapshot();
      set({ ...snapshot });

      if (result.status === 'synced') {
        void trackAnalyticsEvent('sync_completed', {
          pushed_count: result.pushedCount,
          pulled_count: result.pulledCount,
        });
      } else if (result.status === 'error') {
        void trackAnalyticsEvent('sync_failed');
      }

      return result;
    },

    signOutCloud: async () => {
      set({ authBusy: true });
      try {
        await signOutGoogleAndSupabase();
        const entitlement = await refreshUserEntitlement(null);
        const syncState = await repositories.sync.updateSyncState({
          syncStatus: 'idle',
          lastError: null,
        });
        set({
          authUser: null,
          accountSwitchConflict: null,
          entitlement,
          syncState,
        });
      } finally {
        set({ authBusy: false });
      }
    },

    deleteAccountAndData: async () => {
      if (get().authBusy) return;
      set({ authBusy: true, error: null });
      try {
        await waitForInFlightSync();
        const currentAuthUser = get().authUser;
        if (currentAuthUser) {
          await deleteRemoteUserAccount(currentAuthUser.userId);
        }

        await signOutGoogleAndSupabase();
        await repositories.backup.clearAllData();
        clearAllStoredImages();

        await repositories.sync.updateSyncState({
          linkedUserId: null,
          linkedUserEmail: null,
          migrationCompletedAt: null,
          lastSyncedAt: null,
          lastError: null,
          syncStatus: 'idle',
          cursors: {},
        });
        await repositories.sync.saveEntitlementCache(DEFAULT_FREE_ENTITLEMENT);
        try {
          await Promise.all([
            AsyncStorage.removeItem(HOME_SIGNIN_REMINDER_DISMISSED_KEY),
            AsyncStorage.removeItem(TRANSACTIONS_SIGNIN_REMINDER_DISMISSED_KEY),
          ]);
        } catch {
          // Non-fatal
        }

        let snapshot = await loadSnapshot();
        const detectedCurrency = detectDeviceCurrencyCode(snapshot.currencies);
        const updatedSettings = await repositories.settings.update({
          currencyCode: detectedCurrency,
          openingBalanceCurrencyCode: detectedCurrency,
          currencyInitialized: true,
        });
        snapshot = { ...snapshot, settings: updatedSettings };

        set({
          ...snapshot,
          authUser: null,
          accountSwitchConflict: null,
          entitlement: DEFAULT_FREE_ENTITLEMENT,
          transactionDraft: null,
          onboardingCurrencyCode: null,
          openingBalanceDraft: null,
          transactionFilters: createDefaultTransactionFilters(),
          homeSignInReminderDismissed: false,
          transactionsSignInReminderDismissed: false,
        });
      } finally {
        set({ authBusy: false });
      }
    },
  };
});
