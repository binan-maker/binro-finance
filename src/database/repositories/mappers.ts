import { DEFAULT_CURRENCY_CODE, type CurrencyConfig } from '@/constants/currencies';
import type {
  AppSettingsRow,
  BudgetRow,
  CategoryRow,
  CurrencyCatalogRow,
  EntitlementCacheRow,
  NotificationRow,
  PaymentMethodRow,
  SyncStateRow,
  TagRow,
  TransactionRow,
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
  UserEntitlement,
} from '@/types/models';

export function mapTransactionRow(
  row: TransactionRow,
  fallbackCurrencyCode: string = DEFAULT_CURRENCY_CODE,
  tagIds: string[] = [],
): Transaction {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    amountMinor: row.amount_minor,
    currencyCode: row.currency_code?.trim().toUpperCase() || fallbackCurrencyCode,
    categoryId: row.category_id,
    categoryNameSnapshot: row.category_name_snapshot ?? 'Other',
    paymentMethodId: row.payment_method_id ?? null,
    paymentMethod: row.payment_method?.trim() || 'Cash',
    tagIds,
    transactionDate: row.transaction_date,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapCategoryRow(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    parentId: row.parent_id ?? null,
    icon: row.icon ?? 'tag',
    color: row.color ?? '#059669',
    imageUri: row.image_uri?.trim() || null,
    isDefault: row.is_default === 1,
    isArchived: row.is_archived === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapTagRow(row: TagRow): Tag {
  return {
    id: row.id,
    name: row.name,
    color: row.color ?? '#10B981',
    isArchived: row.is_archived === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapPaymentMethodRow(row: PaymentMethodRow): PaymentMethodRecord {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon ?? 'wallet',
    imageUri: row.image_uri?.trim() || null,
    isBuiltin: row.is_builtin === 1,
    isArchived: row.is_archived === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapCurrencyCatalogRow(row: CurrencyCatalogRow): CurrencyConfig {
  return {
    code: row.code,
    name: row.name,
    symbol: row.symbol,
    minorUnits: row.minor_units,
  };
}

export function mapBudgetRow(
  row: BudgetRow,
  fallbackCurrencyCode: string = DEFAULT_CURRENCY_CODE,
): Budget {
  return {
    id: row.id,
    amountMinor: row.amount_minor,
    currencyCode: row.currency_code?.trim().toUpperCase() || fallbackCurrencyCode,
    period: row.period,
    month: row.month,
    year: row.year,
    startDate: row.start_date?.trim() || null,
    categoryId: row.category_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSettingsRow(row: AppSettingsRow): AppSettings {
  const currencyCode = row.currency_code?.trim().toUpperCase() || DEFAULT_CURRENCY_CODE;
  return {
    id: row.id,
    currencyCode,
    openingBalanceMinor: row.opening_balance_minor,
    openingBalanceCurrencyCode:
      row.opening_balance_currency_code?.trim().toUpperCase() || currencyCode,
    theme: row.theme,
    dateFormat: row.date_format,
    onboardingCompleted: row.onboarding_completed === 1,
    profileName: row.profile_name ?? null,
    profileBio: row.profile_bio ?? null,
    profileAvatar: row.profile_avatar ?? null,
    currencyInitialized: row.currency_initialized === 1,
    showHomeBudgetShortcut: row.show_home_budget_shortcut === 1,
    gender: row.gender ?? null,
    dateOfBirth: row.date_of_birth ?? null,
    googleName: row.google_name ?? null,
    googleEmail: row.google_email ?? null,
    googleAvatarUrl: row.google_avatar_url ?? null,
    profileCompletedAt: row.profile_completed_at ?? null,
    updatedAt: row.updated_at ?? new Date(0).toISOString(),
  };
}

export function mapNotificationRow(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    isRead: row.is_read === 1,
    metadataJson: row.metadata_json,
    createdAt: row.created_at,
  };
}

export function mapSyncStateRow(row: SyncStateRow, fallbackInstallId: string): SyncStateSnapshot {
  let cursors: Record<string, { serverUpdatedAt: string; id: string }> = {};
  if (row.cursors_json) {
    try {
      const parsed = JSON.parse(row.cursors_json) as Record<
        string,
        { serverUpdatedAt: string; id: string }
      >;
      if (parsed && typeof parsed === 'object') {
        cursors = parsed;
      }
    } catch {
      cursors = {};
    }
  }
  return {
    linkedUserId: row.linked_user_id ?? null,
    linkedUserEmail: row.linked_user_email ?? null,
    migrationCompletedAt: row.migration_completed_at ?? null,
    lastSyncedAt: row.last_synced_at ?? null,
    lastError: row.last_error ?? null,
    syncStatus: row.sync_status ?? 'idle',
    cursors,
    anonymousInstallId: row.anonymous_install_id || fallbackInstallId,
  };
}

export function mapEntitlementRow(row: EntitlementCacheRow | null): UserEntitlement {
  if (!row) {
    return {
      userId: null,
      tier: 'free',
      status: 'active',
      expiresAt: null,
      source: 'default',
      updatedAt: null,
    };
  }
  return {
    userId: row.user_id ?? null,
    tier: row.tier,
    status: row.status,
    expiresAt: row.expires_at ?? null,
    source: row.source,
    updatedAt: row.updated_at ?? null,
  };
}
