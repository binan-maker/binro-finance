import type {
  AppSettings,
  Budget,
  BudgetPeriod,
  Category,
  CategoryType,
  DateFormatPreference,
  PaymentMethod,
  ThemePreference,
  Transaction,
  TransactionType,
} from './models';

export interface TransactionRow {
  id: string;
  type: TransactionType;
  title: string;
  amount_minor: number;
  category_id: string | null;
  category_name_snapshot: string | null;
  payment_method: string | null;
  transaction_date: string;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface CategoryRow {
  id: string;
  name: string;
  type: CategoryType;
  icon: string | null;
  color: string | null;
  is_default: number | null;
  is_archived: number | null;
  created_at: string;
  updated_at: string;
}

export interface BudgetRow {
  id: string;
  amount_minor: number;
  period: BudgetPeriod;
  month: number;
  year: number;
  category_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppSettingsRow {
  id: number;
  currency_code: string;
  opening_balance_minor: number;
  theme: ThemePreference;
  date_format: DateFormatPreference;
  onboarding_completed: number;
}

export interface CreateTransactionInput {
  id?: string;
  type: TransactionType;
  title: string;
  amountMinor: number;
  categoryId: string | null;
  categoryNameSnapshot: string;
  paymentMethod: PaymentMethod;
  transactionDate: string;
  note?: string | null;
}

export interface UpdateTransactionInput {
  type?: TransactionType;
  title?: string;
  amountMinor?: number;
  categoryId?: string | null;
  categoryNameSnapshot?: string;
  paymentMethod?: PaymentMethod;
  transactionDate?: string;
  note?: string | null;
}

export interface TransactionFilters {
  type?: TransactionType | 'all';
  search?: string;
  startDate?: string;
  endDate?: string;
  categoryId?: string;
  paymentMethod?: PaymentMethod | 'all';
  limit?: number;
  offset?: number;
}

export interface CreateCategoryInput {
  id?: string;
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
  isDefault?: boolean;
}

export interface UpdateCategoryInput {
  name?: string;
  icon?: string;
  color?: string;
  isArchived?: boolean;
}

export interface UpsertBudgetInput {
  id?: string;
  amountMinor: number;
  period?: BudgetPeriod;
  month: number;
  year: number;
  categoryId: string | null;
}

export interface UpdateSettingsInput {
  currencyCode?: string;
  openingBalanceMinor?: number;
  theme?: ThemePreference;
  dateFormat?: DateFormatPreference;
  onboardingCompleted?: boolean;
}

export interface BackupPayload {
  schemaVersion: number;
  exportedAt: string;
  appVersion: string;
  settings: AppSettings;
  categories: Category[];
  budgets: Budget[];
  transactions: Transaction[];
}

export interface RestoreResult {
  categoriesInserted: number;
  categoriesSkipped: number;
  budgetsInserted: number;
  budgetsSkipped: number;
  transactionsInserted: number;
  transactionsSkipped: number;
}

export interface ITransactionRepository {
  getAll(filters?: TransactionFilters): Promise<Transaction[]>;
  getById(id: string): Promise<Transaction | null>;
  getByDate(date: string): Promise<Transaction[]>;
  getByDateRange(startDate: string, endDate: string): Promise<Transaction[]>;
  create(input: CreateTransactionInput): Promise<Transaction>;
  update(id: string, input: UpdateTransactionInput): Promise<Transaction>;
  delete(id: string): Promise<void>;
}

export interface ICategoryRepository {
  getAll(options?: { type?: CategoryType; includeArchived?: boolean }): Promise<Category[]>;
  getById(id: string): Promise<Category | null>;
  create(input: CreateCategoryInput): Promise<Category>;
  update(id: string, input: UpdateCategoryInput): Promise<Category>;
}

export interface IBudgetRepository {
  getByMonthYear(month: number, year: number): Promise<Budget[]>;
  getAll(): Promise<Budget[]>;
  upsert(input: UpsertBudgetInput): Promise<Budget>;
  delete(id: string): Promise<void>;
}

export interface ISettingsRepository {
  get(): Promise<AppSettings>;
  update(input: UpdateSettingsInput): Promise<AppSettings>;
}

export interface IBackupRepository {
  exportAll(appVersion: string): Promise<BackupPayload>;
  restoreFromBackup(payload: BackupPayload, mode: 'merge' | 'replace'): Promise<RestoreResult>;
  clearAllData(): Promise<void>;
}
