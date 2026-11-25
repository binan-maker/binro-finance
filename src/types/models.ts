export type TransactionType = 'income' | 'expense';

export type CategoryType = 'income' | 'expense';

export type PaymentMethod = string;

export type ThemePreference = 'system' | 'light' | 'dark';

export type DateFormatPreference =
  | 'YYYY-MM-DD'
  | 'DD/MM/YYYY'
  | 'MM/DD/YYYY'
  | 'DD MMM YYYY';

export type BudgetPeriod = 'monthly';

export type NotificationType = 'backup' | 'budget_alert' | 'system';

export interface Tag {
  id: string;
  name: string;
  color: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentMethodRecord {
  id: string;
  name: string;
  icon: string;
  isBuiltin: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  title: string;
  amountMinor: number;
  currencyCode: string; // ISO 4217 code stored per transaction
  categoryId: string | null;
  categoryNameSnapshot: string;
  paymentMethodId: string | null;
  paymentMethod: string; // historical payment method name snapshot
  tagIds: string[];
  transactionDate: string; // YYYY-MM-DD
  note: string | null;
  createdAt: string; // ISO-8601 UTC timestamp
  updatedAt: string; // ISO-8601 UTC timestamp
}

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  parentId: string | null;
  icon: string;
  color: string;
  isDefault: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Budget {
  id: string;
  amountMinor: number;
  currencyCode: string;
  period: BudgetPeriod;
  month: number; // 1-12
  year: number;
  categoryId: string | null; // null = monthly overall budget
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  id: number;
  currencyCode: string; // default/preferred display currency
  openingBalanceMinor: number;
  openingBalanceCurrencyCode: string;
  theme: ThemePreference;
  dateFormat: DateFormatPreference;
  onboardingCompleted: boolean;
  profileName: string | null;
  profileBio: string | null;
  profileAvatar: string | null;
  currencyInitialized: boolean;
}

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  isRead: boolean;
  metadataJson: string | null;
  createdAt: string;
}
