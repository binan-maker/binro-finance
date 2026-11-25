import { PAYMENT_METHODS } from '@/constants/categories';
import type {
  AppSettingsRow,
  BudgetRow,
  CategoryRow,
  TransactionRow,
} from '@/types/database';
import type {
  AppSettings,
  Budget,
  Category,
  PaymentMethod,
  Transaction,
} from '@/types/models';

function toPaymentMethod(value: string | null): PaymentMethod {
  if (value && PAYMENT_METHODS.includes(value as PaymentMethod)) {
    return value as PaymentMethod;
  }
  return 'Other';
}

export function mapTransactionRow(row: TransactionRow): Transaction {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    amountMinor: row.amount_minor,
    categoryId: row.category_id,
    categoryNameSnapshot: row.category_name_snapshot ?? 'Other',
    paymentMethod: toPaymentMethod(row.payment_method),
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
    icon: row.icon ?? 'tag',
    color: row.color ?? '#546E7A',
    isDefault: row.is_default === 1,
    isArchived: row.is_archived === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapBudgetRow(row: BudgetRow): Budget {
  return {
    id: row.id,
    amountMinor: row.amount_minor,
    period: row.period,
    month: row.month,
    year: row.year,
    categoryId: row.category_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSettingsRow(row: AppSettingsRow): AppSettings {
  return {
    id: row.id,
    currencyCode: row.currency_code,
    openingBalanceMinor: row.opening_balance_minor,
    theme: row.theme,
    dateFormat: row.date_format,
    onboardingCompleted: row.onboarding_completed === 1,
  };
}
