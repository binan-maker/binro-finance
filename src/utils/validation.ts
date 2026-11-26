import { isValidIsoCurrencyCode, type CurrencyConfig } from '@/constants/currencies';
import type { BackupPayload } from '@/types/database';
import type { TransactionType } from '@/types/models';

import { isValidISODate } from './date';
import { parseMajorToMinor } from './money';

export interface ValidationResult<T = void> {
  valid: boolean;
  error?: string;
  value?: T;
}

export function validatePositiveAmountInput(
  rawAmount: string,
  currencyCode: string,
  catalog?: readonly CurrencyConfig[],
): ValidationResult<number> {
  const minor = parseMajorToMinor(rawAmount, currencyCode, catalog);
  if (minor === null || minor <= 0) {
    return {
      valid: false,
      error: 'Enter a valid amount greater than zero.',
    };
  }
  return { valid: true, value: minor };
}

export function validateNonNegativeAmountInput(
  rawAmount: string,
  currencyCode: string,
  catalog?: readonly CurrencyConfig[],
): ValidationResult<number> {
  if (!rawAmount.trim()) {
    return { valid: true, value: 0 };
  }
  const minor = parseMajorToMinor(rawAmount, currencyCode, catalog);
  if (minor === null || minor < 0) {
    return {
      valid: false,
      error: 'Enter a valid non-negative amount.',
    };
  }
  return { valid: true, value: minor };
}

export function validateTransactionInput(params: {
  type: TransactionType;
  title: string;
  rawAmount: string;
  currencyCode: string;
  categoryId: string | null;
  transactionDate: string;
  paymentMethod: string;
  catalog?: readonly CurrencyConfig[];
}): ValidationResult<{ amountMinor: number; title: string }> {
  const trimmedTitle = params.title.trim();
  if (!trimmedTitle) {
    return { valid: false, error: 'Title is required.' };
  }
  if (trimmedTitle.length > 100) {
    return { valid: false, error: 'Title must be 100 characters or fewer.' };
  }

  if (!isValidIsoCurrencyCode(params.currencyCode)) {
    return { valid: false, error: 'Please select a valid currency.' };
  }

  const amountResult = validatePositiveAmountInput(
    params.rawAmount,
    params.currencyCode,
    params.catalog,
  );
  if (!amountResult.valid || amountResult.value === undefined) {
    return { valid: false, error: amountResult.error };
  }

  if (!params.categoryId) {
    return { valid: false, error: 'Please select a category.' };
  }

  if (!isValidISODate(params.transactionDate)) {
    return { valid: false, error: 'Please select a valid date.' };
  }

  if (!params.paymentMethod || !params.paymentMethod.trim()) {
    return { valid: false, error: 'Please select a payment method.' };
  }

  return {
    valid: true,
    value: {
      amountMinor: amountResult.value,
      title: trimmedTitle,
    },
  };
}

export function validateCategoryName(name: string): ValidationResult<string> {
  const trimmed = name.trim();
  if (!trimmed) {
    return { valid: false, error: 'Category name is required.' };
  }
  if (trimmed.length > 40) {
    return { valid: false, error: 'Category name must be 40 characters or fewer.' };
  }
  return { valid: true, value: trimmed };
}

export function validateTagName(name: string): ValidationResult<string> {
  const trimmed = name.trim();
  if (!trimmed) {
    return { valid: false, error: 'Tag name is required.' };
  }
  if (trimmed.length > 32) {
    return { valid: false, error: 'Tag name must be 32 characters or fewer.' };
  }
  return { valid: true, value: trimmed };
}

export function validatePaymentMethodName(name: string): ValidationResult<string> {
  const trimmed = name.trim();
  if (!trimmed) {
    return { valid: false, error: 'Payment method name is required.' };
  }
  if (trimmed.length > 32) {
    return { valid: false, error: 'Payment method name must be 32 characters or fewer.' };
  }
  return { valid: true, value: trimmed };
}

const VALID_THEMES = ['system', 'light', 'dark'] as const;
const VALID_DATE_FORMATS = ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'DD MMM YYYY'] as const;

function isNonEmptyString(val: unknown): val is string {
  return typeof val === 'string' && val.trim().length > 0;
}

export function validateBackupPayload(raw: unknown): ValidationResult<BackupPayload> {
  if (!raw || typeof raw !== 'object') {
    return { valid: false, error: 'Backup file is not a valid JSON object.' };
  }

  const candidate = raw as Record<string, unknown>;
  if (
    !Number.isInteger(candidate.schemaVersion) ||
    (candidate.schemaVersion !== 1 &&
      candidate.schemaVersion !== 2 &&
      candidate.schemaVersion !== 3 &&
      candidate.schemaVersion !== 4)
  ) {
    return { valid: false, error: 'Unsupported or missing backup schema version.' };
  }

  if (!candidate.settings || typeof candidate.settings !== 'object') {
    return { valid: false, error: 'Backup is missing settings data.' };
  }

  const settings = candidate.settings as Record<string, unknown>;
  const settingsCurrency =
    typeof settings.currencyCode === 'string' ? settings.currencyCode.trim().toUpperCase() : '';
  const openingCurrency =
    typeof settings.openingBalanceCurrencyCode === 'string'
      ? settings.openingBalanceCurrencyCode.trim().toUpperCase()
      : settingsCurrency;

  if (
    !isValidIsoCurrencyCode(settingsCurrency) ||
    !isValidIsoCurrencyCode(openingCurrency) ||
    typeof settings.openingBalanceMinor !== 'number' ||
    !Number.isSafeInteger(settings.openingBalanceMinor) ||
    settings.openingBalanceMinor < 0
  ) {
    return { valid: false, error: 'Backup settings contain invalid currency or balance.' };
  }

  if (
    !VALID_THEMES.includes(settings.theme as (typeof VALID_THEMES)[number]) ||
    !VALID_DATE_FORMATS.includes(settings.dateFormat as (typeof VALID_DATE_FORMATS)[number]) ||
    typeof settings.onboardingCompleted !== 'boolean'
  ) {
    return { valid: false, error: 'Backup settings contain invalid preferences.' };
  }

  if (
    !Array.isArray(candidate.categories) ||
    !Array.isArray(candidate.budgets) ||
    !Array.isArray(candidate.transactions)
  ) {
    return { valid: false, error: 'Backup must include categories, budgets, and transactions lists.' };
  }

  if (candidate.tags !== undefined && !Array.isArray(candidate.tags)) {
    return { valid: false, error: 'Backup tags must be a list.' };
  }

  if (candidate.paymentMethods !== undefined && !Array.isArray(candidate.paymentMethods)) {
    return { valid: false, error: 'Backup payment methods must be a list.' };
  }

  for (const cat of candidate.categories) {
    const rec = cat as Record<string, unknown>;
    if (
      !cat ||
      typeof cat !== 'object' ||
      !isNonEmptyString(rec.id) ||
      !isNonEmptyString(rec.name) ||
      (rec.type !== 'income' && rec.type !== 'expense') ||
      (rec.parentId !== undefined && rec.parentId !== null && !isNonEmptyString(rec.parentId)) ||
      typeof rec.icon !== 'string' ||
      typeof rec.color !== 'string' ||
      (rec.imageUri !== undefined && rec.imageUri !== null && typeof rec.imageUri !== 'string') ||
      typeof rec.isDefault !== 'boolean' ||
      typeof rec.isArchived !== 'boolean' ||
      !isNonEmptyString(rec.createdAt) ||
      !isNonEmptyString(rec.updatedAt)
    ) {
      return { valid: false, error: 'Backup contains an invalid category record.' };
    }
  }

  if (Array.isArray(candidate.tags)) {
    for (const tag of candidate.tags) {
      const rec = tag as Record<string, unknown>;
      if (
        !tag ||
        typeof tag !== 'object' ||
        !isNonEmptyString(rec.id) ||
        !isNonEmptyString(rec.name) ||
        typeof rec.color !== 'string' ||
        (rec.isArchived !== undefined && typeof rec.isArchived !== 'boolean') ||
        !isNonEmptyString(rec.createdAt) ||
        !isNonEmptyString(rec.updatedAt)
      ) {
        return { valid: false, error: 'Backup contains an invalid tag record.' };
      }
    }
  }

  if (Array.isArray(candidate.paymentMethods)) {
    for (const pm of candidate.paymentMethods) {
      const rec = pm as Record<string, unknown>;
      if (
        !pm ||
        typeof pm !== 'object' ||
        !isNonEmptyString(rec.id) ||
        !isNonEmptyString(rec.name) ||
        typeof rec.icon !== 'string' ||
        typeof rec.isBuiltin !== 'boolean' ||
        typeof rec.isArchived !== 'boolean' ||
        !isNonEmptyString(rec.createdAt) ||
        !isNonEmptyString(rec.updatedAt)
      ) {
        return { valid: false, error: 'Backup contains an invalid payment method record.' };
      }
    }
  }

  for (const tx of candidate.transactions) {
    const rec = tx as Record<string, unknown>;
    const txCurrency =
      rec.currencyCode === undefined
        ? settingsCurrency
        : typeof rec.currencyCode === 'string'
          ? rec.currencyCode.trim().toUpperCase()
          : '';
    if (
      !tx ||
      typeof tx !== 'object' ||
      !isNonEmptyString(rec.id) ||
      (rec.type !== 'income' && rec.type !== 'expense') ||
      !isNonEmptyString(rec.title) ||
      typeof rec.amountMinor !== 'number' ||
      !Number.isSafeInteger(rec.amountMinor) ||
      rec.amountMinor <= 0 ||
      !isValidIsoCurrencyCode(txCurrency) ||
      (rec.categoryId !== null && !isNonEmptyString(rec.categoryId)) ||
      typeof rec.categoryNameSnapshot !== 'string' ||
      !isNonEmptyString(rec.paymentMethod) ||
      (rec.tagIds !== undefined &&
        (!Array.isArray(rec.tagIds) || !rec.tagIds.every((id) => isNonEmptyString(id)))) ||
      typeof rec.transactionDate !== 'string' ||
      !isValidISODate(rec.transactionDate) ||
      (rec.note !== null && rec.note !== undefined && typeof rec.note !== 'string') ||
      !isNonEmptyString(rec.createdAt) ||
      !isNonEmptyString(rec.updatedAt)
    ) {
      return { valid: false, error: 'Backup contains an invalid transaction record.' };
    }
  }

  for (const b of candidate.budgets) {
    const rec = b as Record<string, unknown>;
    const budgetCurrency =
      rec.currencyCode === undefined
        ? settingsCurrency
        : typeof rec.currencyCode === 'string'
          ? rec.currencyCode.trim().toUpperCase()
          : '';
    const validPeriod =
      rec.period === 'monthly' || rec.period === 'biweekly' || rec.period === 'yearly';
    const validStartDate =
      rec.startDate === undefined ||
      rec.startDate === null ||
      (typeof rec.startDate === 'string' && isValidISODate(rec.startDate));
    if (
      !b ||
      typeof b !== 'object' ||
      !isNonEmptyString(rec.id) ||
      typeof rec.amountMinor !== 'number' ||
      !Number.isSafeInteger(rec.amountMinor) ||
      rec.amountMinor <= 0 ||
      !isValidIsoCurrencyCode(budgetCurrency) ||
      !validPeriod ||
      (rec.period === 'biweekly' && (!rec.startDate || typeof rec.startDate !== 'string' || !isValidISODate(rec.startDate))) ||
      !validStartDate ||
      typeof rec.month !== 'number' ||
      !Number.isInteger(rec.month) ||
      rec.month < 1 ||
      rec.month > 12 ||
      typeof rec.year !== 'number' ||
      !Number.isInteger(rec.year) ||
      rec.year < 1970 ||
      (rec.categoryId !== null && !isNonEmptyString(rec.categoryId)) ||
      !isNonEmptyString(rec.createdAt) ||
      !isNonEmptyString(rec.updatedAt)
    ) {
      return { valid: false, error: 'Backup contains an invalid budget record.' };
    }
  }

  if (candidate.mediaAssets !== undefined) {
    if (!candidate.mediaAssets || typeof candidate.mediaAssets !== 'object' || Array.isArray(candidate.mediaAssets)) {
      return { valid: false, error: 'Backup mediaAssets must be an object map.' };
    }
    for (const [assetKey, assetVal] of Object.entries(candidate.mediaAssets as Record<string, unknown>)) {
      const assetRec = assetVal as Record<string, unknown>;
      if (
        !isNonEmptyString(assetKey) ||
        !assetVal ||
        typeof assetVal !== 'object' ||
        typeof assetRec.mimeType !== 'string' ||
        typeof assetRec.base64 !== 'string'
      ) {
        return { valid: false, error: 'Backup contains an invalid media asset.' };
      }
    }
  }

  return { valid: true, value: candidate as unknown as BackupPayload };
}
