import { create } from 'zustand';

import {
  DEFAULT_CURRENCY_CODE,
  FALLBACK_CURRENCIES,
  type CurrencyConfig,
} from '@/constants/currencies';
import { initializeDatabase } from '@/database';
import { repositories } from '@/database/repositories';
import { calculateBudgetProgress } from '@/services/calculations/financialCalculations';
import {
  mergeCurrencyCatalog,
  syncCurrencyCatalog,
} from '@/services/currency/currencyCatalogService';
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
  Tag,
  Transaction,
} from '@/types/models';
import { parseISODateParts } from '@/utils/date';
import { formatMoney } from '@/utils/money';

const DEFAULT_SETTINGS: AppSettings = {
  id: 1,
  currencyCode: DEFAULT_CURRENCY_CODE,
  openingBalanceMinor: 0,
  openingBalanceCurrencyCode: DEFAULT_CURRENCY_CODE,
  theme: 'system',
  dateFormat: 'DD MMM YYYY',
  onboardingCompleted: false,
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

  initializeApp: () => Promise<void>;
  refreshData: () => Promise<void>;
  refreshCurrencyCatalog: () => Promise<void>;
  completeOnboarding: (params: {
    currencyCode: string;
    openingBalanceMinor: number;
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

  upsertBudget: (input: UpsertBudgetInput) => Promise<Budget>;
  deleteBudget: (id: string) => Promise<void>;

  addNotification: (input: CreateNotificationInput) => Promise<AppNotification>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;

  restoreBackup: (
    payload: BackupPayload,
    mode: 'merge' | 'replace',
  ) => Promise<RestoreResult>;
  clearAllLocalData: () => Promise<void>;
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
  ] = await Promise.all([
    repositories.settings.get(),
    repositories.categories.getAll({ includeArchived: true }),
    repositories.tags.getAll(),
    repositories.paymentMethods.getAll({ includeArchived: true }),
    repositories.currencies.getAll(),
    repositories.transactions.getAll(),
    repositories.budgets.getAll(),
    repositories.notifications.getAll(),
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
  };
}

export const useAppStore = create<AppStoreState>((set, get) => ({
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

  initializeApp: async () => {
    if (get().isLoading) return;
    set({ isLoading: true, error: null });

    try {
      await initializeDatabase();
      const snapshot = await loadSnapshot();
      set({
        isInitialized: true,
        isLoading: false,
        ...snapshot,
      });

      // Refresh currency metadata asynchronously if online without blocking startup
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

  completeOnboarding: async ({ currencyCode, openingBalanceMinor }) => {
    set({ isLoading: true, error: null });
    try {
      const updated = await repositories.settings.update({
        currencyCode,
        openingBalanceMinor,
        openingBalanceCurrencyCode: currencyCode,
        onboardingCompleted: true,
      });
      set({ settings: updated, isLoading: false });
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
      set({ settings: updated });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to update settings.';
      set({ error: message });
      throw error;
    }
  },

  createTransaction: async (input) => {
    const created = await repositories.transactions.create(input);
    const transactions = await repositories.transactions.getAll();
    set({ transactions });

    // Check genuine budget exceedance event if budgets exist for that month & currency
    if (created.type === 'expense') {
      const { budgets, categories, currencies, notifications } = get();
      const { year, month } = parseISODateParts(created.transactionDate);
      const matchingBudgets = budgets.filter(
        (b) =>
          b.year === year &&
          b.month === month &&
          b.currencyCode.toUpperCase() === created.currencyCode.toUpperCase() &&
          (b.categoryId === null || b.categoryId === created.categoryId),
      );

      for (const budget of matchingBudgets) {
        const category = budget.categoryId
          ? categories.find((c) => c.id === budget.categoryId) ?? null
          : null;
        const progress = calculateBudgetProgress({ budget, transactions, category });
        if (progress.isExceeded) {
          const dedupeKey = `budget_exceeded:${budget.id}:${year}-${month}`;
          const alreadyNotified = notifications.some((n) => n.metadataJson === dedupeKey);
          if (!alreadyNotified) {
            const label = category ? `${category.name} budget` : 'Monthly budget';
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

    return created;
  },

  updateTransaction: async (id, input) => {
    const updated = await repositories.transactions.update(id, input);
    const transactions = await repositories.transactions.getAll();
    set({ transactions });
    return updated;
  },

  deleteTransaction: async (id) => {
    await repositories.transactions.delete(id);
    const transactions = await repositories.transactions.getAll();
    set({ transactions });
  },

  createCategory: async (input) => {
    const created = await repositories.categories.create(input);
    const categories = await repositories.categories.getAll({ includeArchived: true });
    set({ categories });
    return created;
  },

  updateCategory: async (id, input) => {
    const updated = await repositories.categories.update(id, input);
    const [categories, transactions] = await Promise.all([
      repositories.categories.getAll({ includeArchived: true }),
      repositories.transactions.getAll(),
    ]);
    set({ categories, transactions });
    return updated;
  },

  createTag: async (input) => {
    const created = await repositories.tags.create(input);
    const tags = await repositories.tags.getAll();
    set({ tags });
    return created;
  },

  updateTag: async (id, input) => {
    const updated = await repositories.tags.update(id, input);
    const tags = await repositories.tags.getAll();
    set({ tags });
    return updated;
  },

  deleteTag: async (id) => {
    await repositories.tags.delete(id);
    const [tags, transactions] = await Promise.all([
      repositories.tags.getAll(),
      repositories.transactions.getAll(),
    ]);
    set({ tags, transactions });
  },

  createPaymentMethod: async (input) => {
    const created = await repositories.paymentMethods.create(input);
    const paymentMethods = await repositories.paymentMethods.getAll({ includeArchived: true });
    set({ paymentMethods });
    return created;
  },

  updatePaymentMethod: async (id, input) => {
    const updated = await repositories.paymentMethods.update(id, input);
    const paymentMethods = await repositories.paymentMethods.getAll({ includeArchived: true });
    set({ paymentMethods });
    return updated;
  },

  upsertBudget: async (input) => {
    const saved = await repositories.budgets.upsert(input);
    const budgets = await repositories.budgets.getAll();
    set({ budgets });
    return saved;
  },

  deleteBudget: async (id) => {
    await repositories.budgets.delete(id);
    const budgets = await repositories.budgets.getAll();
    set({ budgets });
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

  markAllNotificationsRead: async () => {
    await repositories.notifications.markAllAsRead();
    const notifications = await repositories.notifications.getAll();
    set({ notifications });
  },

  restoreBackup: async (payload, mode) => {
    const result = await repositories.backup.restoreFromBackup(payload, mode);
    await repositories.notifications.create({
      type: 'backup',
      title: 'Backup restored',
      body: `Restored ${result.transactionsInserted} transaction(s) in ${mode} mode.`,
    });
    const snapshot = await loadSnapshot();
    set({ ...snapshot, error: null });
    return result;
  },

  clearAllLocalData: async () => {
    set({ isLoading: true, error: null });
    try {
      await repositories.backup.clearAllData();
      const snapshot = await loadSnapshot();
      set({
        ...snapshot,
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
}));
