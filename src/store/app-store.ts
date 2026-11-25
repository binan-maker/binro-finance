import { create } from 'zustand';

import { DEFAULT_CURRENCY_CODE } from '@/constants/currencies';
import { initializeDatabase } from '@/database';
import { repositories } from '@/database/repositories';
import type {
  BackupPayload,
  CreateCategoryInput,
  CreateTransactionInput,
  RestoreResult,
  UpdateCategoryInput,
  UpdateSettingsInput,
  UpdateTransactionInput,
  UpsertBudgetInput,
} from '@/types/database';
import type { AppSettings, Budget, Category, Transaction } from '@/types/models';

const DEFAULT_SETTINGS: AppSettings = {
  id: 1,
  currencyCode: DEFAULT_CURRENCY_CODE,
  openingBalanceMinor: 0,
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
  transactions: Transaction[];
  budgets: Budget[];

  initializeApp: () => Promise<void>;
  refreshData: () => Promise<void>;
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

  upsertBudget: (input: UpsertBudgetInput) => Promise<Budget>;
  deleteBudget: (id: string) => Promise<void>;

  restoreBackup: (
    payload: BackupPayload,
    mode: 'merge' | 'replace',
  ) => Promise<RestoreResult>;
  clearAllLocalData: () => Promise<void>;
}

async function loadSnapshot() {
  const [settings, categories, transactions, budgets] = await Promise.all([
    repositories.settings.get(),
    repositories.categories.getAll({ includeArchived: true }),
    repositories.transactions.getAll(),
    repositories.budgets.getAll(),
  ]);
  return { settings, categories, transactions, budgets };
}

export const useAppStore = create<AppStoreState>((set, get) => ({
  isInitialized: false,
  isLoading: false,
  error: null,
  settings: DEFAULT_SETTINGS,
  categories: [],
  transactions: [],
  budgets: [],

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

  completeOnboarding: async ({ currencyCode, openingBalanceMinor }) => {
    set({ isLoading: true, error: null });
    try {
      const updated = await repositories.settings.update({
        currencyCode,
        openingBalanceMinor,
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

  restoreBackup: async (payload, mode) => {
    const result = await repositories.backup.restoreFromBackup(payload, mode);
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
