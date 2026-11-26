import type { CurrencyConfig } from '@/constants/currencies';

import type {
  AppNotification,
  AppSettings,
  Budget,
  BudgetPeriod,
  Category,
  CategoryType,
  DateFormatPreference,
  NotificationType,
  PaymentMethodRecord,
  Tag,
  ThemePreference,
  Transaction,
  TransactionType,
} from './models';

export interface TransactionRow {
  id: string;
  type: TransactionType;
  title: string;
  amount_minor: number;
  currency_code: string | null;
  category_id: string | null;
  category_name_snapshot: string | null;
  payment_method_id: string | null;
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
  parent_id: string | null;
  icon: string | null;
  color: string | null;
  image_uri?: string | null;
  is_default: number | null;
  is_archived: number | null;
  created_at: string;
  updated_at: string;
}

export interface TagRow {
  id: string;
  name: string;
  color: string | null;
  is_archived?: number | null;
  created_at: string;
  updated_at: string;
}

export interface TransactionTagRow {
  transaction_id: string;
  tag_id: string;
}

export interface PaymentMethodRow {
  id: string;
  name: string;
  icon: string | null;
  is_builtin: number | null;
  is_archived: number | null;
  created_at: string;
  updated_at: string;
}

export interface CurrencyCatalogRow {
  code: string;
  name: string;
  symbol: string;
  minor_units: number;
  updated_at: string;
}

export interface BudgetRow {
  id: string;
  amount_minor: number;
  currency_code: string | null;
  period: BudgetPeriod;
  month: number;
  year: number;
  start_date?: string | null;
  category_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppSettingsRow {
  id: number;
  currency_code: string;
  opening_balance_minor: number;
  opening_balance_currency_code: string | null;
  theme: ThemePreference;
  date_format: DateFormatPreference;
  onboarding_completed: number;
  profile_name?: string | null;
  profile_bio?: string | null;
  profile_avatar?: string | null;
  currency_initialized?: number | null;
  show_home_budget_shortcut?: number | null;
}

export interface NotificationRow {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  is_read: number;
  metadata_json: string | null;
  created_at: string;
}

export interface CreateTransactionInput {
  id?: string;
  type: TransactionType;
  title: string;
  amountMinor: number;
  currencyCode: string;
  categoryId: string | null;
  categoryNameSnapshot: string;
  paymentMethodId?: string | null;
  paymentMethod: string;
  tagIds?: string[];
  transactionDate: string;
  note?: string | null;
}

export interface UpdateTransactionInput {
  type?: TransactionType;
  title?: string;
  amountMinor?: number;
  currencyCode?: string;
  categoryId?: string | null;
  categoryNameSnapshot?: string;
  paymentMethodId?: string | null;
  paymentMethod?: string;
  tagIds?: string[];
  transactionDate?: string;
  note?: string | null;
}

export interface TransactionFilters {
  type?: TransactionType | 'all';
  search?: string;
  startDate?: string;
  endDate?: string;
  categoryId?: string;
  tagId?: string;
  tagIds?: string[];
  currencyCode?: string;
  paymentMethodId?: string;
  paymentMethod?: string | 'all';
  limit?: number;
  offset?: number;
}

export interface CreateCategoryInput {
  id?: string;
  name: string;
  type: CategoryType;
  parentId?: string | null;
  icon: string;
  color: string;
  imageUri?: string | null;
  isDefault?: boolean;
}

export interface UpdateCategoryInput {
  name?: string;
  parentId?: string | null;
  icon?: string;
  color?: string;
  imageUri?: string | null;
  isArchived?: boolean;
}

export interface CreateTagInput {
  id?: string;
  name: string;
  color: string;
}

export interface UpdateTagInput {
  name?: string;
  color?: string;
  isArchived?: boolean;
}

export interface CreatePaymentMethodInput {
  id?: string;
  name: string;
  icon?: string;
  isBuiltin?: boolean;
}

export interface UpdatePaymentMethodInput {
  name?: string;
  icon?: string;
  isArchived?: boolean;
}

export interface UpsertBudgetInput {
  id?: string;
  amountMinor: number;
  currencyCode?: string;
  period?: BudgetPeriod;
  month: number;
  year: number;
  startDate?: string | null;
  categoryId: string | null;
}

export interface UpdateSettingsInput {
  currencyCode?: string;
  openingBalanceMinor?: number;
  openingBalanceCurrencyCode?: string;
  theme?: ThemePreference;
  dateFormat?: DateFormatPreference;
  onboardingCompleted?: boolean;
  profileName?: string | null;
  profileBio?: string | null;
  profileAvatar?: string | null;
  currencyInitialized?: boolean;
  showHomeBudgetShortcut?: boolean;
}

export interface CreateNotificationInput {
  id?: string;
  type: NotificationType;
  title: string;
  body: string;
  metadataJson?: string | null;
}

export interface BackupMediaAsset {
  mimeType: string;
  base64: string;
}

export interface BackupPayload {
  schemaVersion: number;
  exportedAt: string;
  appVersion: string;
  settings: AppSettings;
  categories: Category[];
  tags?: Tag[];
  paymentMethods?: PaymentMethodRecord[];
  budgets: Budget[];
  transactions: Transaction[];
  notifications?: AppNotification[];
  mediaAssets?: Record<string, BackupMediaAsset>;
}

export interface RestoreResult {
  categoriesInserted: number;
  categoriesSkipped: number;
  tagsInserted: number;
  tagsSkipped: number;
  paymentMethodsInserted: number;
  paymentMethodsSkipped: number;
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

export interface ITagRepository {
  getAll(options?: { includeArchived?: boolean }): Promise<Tag[]>;
  getById(id: string): Promise<Tag | null>;
  create(input: CreateTagInput): Promise<Tag>;
  update(id: string, input: UpdateTagInput): Promise<Tag>;
  delete(id: string): Promise<void>;
}

export interface IPaymentMethodRepository {
  getAll(options?: { includeArchived?: boolean }): Promise<PaymentMethodRecord[]>;
  getById(id: string): Promise<PaymentMethodRecord | null>;
  create(input: CreatePaymentMethodInput): Promise<PaymentMethodRecord>;
  update(id: string, input: UpdatePaymentMethodInput): Promise<PaymentMethodRecord>;
  delete(id: string): Promise<void>;
}

export interface ICurrencyRepository {
  getAll(): Promise<CurrencyConfig[]>;
  upsertMany(currencies: readonly CurrencyConfig[]): Promise<void>;
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

export interface INotificationRepository {
  getAll(): Promise<AppNotification[]>;
  create(input: CreateNotificationInput): Promise<AppNotification>;
  markAsRead(id: string): Promise<void>;
  markAsUnread(id: string): Promise<void>;
  markAllAsRead(): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface IBackupRepository {
  exportAll(appVersion: string): Promise<BackupPayload>;
  restoreFromBackup(payload: BackupPayload, mode: 'merge' | 'replace'): Promise<RestoreResult>;
  clearAllData(): Promise<void>;
}
