export type TransactionType = 'income' | 'expense';

export type CategoryType = 'income' | 'expense';

export type PaymentMethod = string;

export type ThemePreference = 'system' | 'light' | 'dark';

export type DateFormatPreference =
  | 'YYYY-MM-DD'
  | 'DD/MM/YYYY'
  | 'MM/DD/YYYY'
  | 'DD MMM YYYY';

export type BudgetPeriod = 'monthly' | 'biweekly' | 'yearly';

export type NotificationType = 'backup' | 'budget_alert' | 'system';

export type GenderOption =
  | 'prefer_not_to_say'
  | 'female'
  | 'male'
  | 'non_binary'
  | 'other';

export type SyncStatus =
  | 'idle'
  | 'syncing'
  | 'offline'
  | 'error'
  | 'pending_link'
  | 'needs_account_switch';

export type SyncEntityType =
  | 'profile'
  | 'settings'
  | 'category'
  | 'payment_method'
  | 'tag'
  | 'transaction'
  | 'transaction_tag'
  | 'budget';

export type SyncOperationType = 'upsert' | 'delete';

export type EntitlementTier = 'free' | 'pro';

export type EntitlementStatus = 'active' | 'inactive' | 'grace_period' | 'expired';

export interface UserEntitlement {
  userId: string | null;
  tier: EntitlementTier;
  status: EntitlementStatus;
  expiresAt: string | null;
  source: string;
  updatedAt: string | null;
}

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
  imageUri: string | null;
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
  imageUri: string | null;
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
  startDate: string | null; // YYYY-MM-DD anchor date for biweekly budgets
  categoryId: string | null; // null = period overall budget
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
  showHomeBudgetShortcut: boolean;
  gender: GenderOption | null;
  dateOfBirth: string | null; // YYYY-MM-DD
  googleName: string | null;
  googleEmail: string | null;
  googleAvatarUrl: string | null;
  profileCompletedAt: string | null;
  updatedAt: string;
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

export interface SyncStateSnapshot {
  linkedUserId: string | null;
  linkedUserEmail: string | null;
  migrationCompletedAt: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  syncStatus: SyncStatus;
  cursors: Record<string, { serverUpdatedAt: string; id: string }>;
  anonymousInstallId: string;
}
