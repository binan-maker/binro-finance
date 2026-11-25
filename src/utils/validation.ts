import { PAYMENT_METHODS } from '@/constants/categories';
import { SUPPORTED_CURRENCIES } from '@/constants/currencies';
import type { BackupPayload } from '@/types/database';
import type { PaymentMethod, TransactionType } from '@/types/models';

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
): ValidationResult<number> {
  const minor = parseMajorToMinor(rawAmount, currencyCode);
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
): ValidationResult<number> {
  if (!rawAmount.trim()) {
    return { valid: true, value: 0 };
  }
  const minor = parseMajorToMinor(rawAmount, currencyCode);
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
  paymentMethod: PaymentMethod;
}): ValidationResult<{ amountMinor: number; title: string }> {
  const trimmedTitle = params.title.trim();
  if (!trimmedTitle) {
    return { valid: false, error: 'Title is required.' };
  }
  if (trimmedTitle.length > 100) {
    return { valid: false, error: 'Title must be 100 characters or fewer.' };
  }

  const amountResult = validatePositiveAmountInput(params.rawAmount, params.currencyCode);
  if (!amountResult.valid || amountResult.value === undefined) {
    return { valid: false, error: amountResult.error };
  }

  if (!params.categoryId) {
    return { valid: false, error: 'Please select a category.' };
  }

  if (!isValidISODate(params.transactionDate)) {
    return { valid: false, error: 'Please select a valid date.' };
  }

  if (!PAYMENT_METHODS.includes(params.paymentMethod)) {
    return { valid: false, error: 'Invalid payment method.' };
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

export function validateBackupPayload(raw: unknown): ValidationResult<BackupPayload> {
  if (!raw || typeof raw !== 'object') {
    return { valid: false, error: 'Backup file is not a valid JSON object.' };
  }

  const candidate = raw as Record<string, unknown>;
  if (typeof candidate.schemaVersion !== 'number' || candidate.schemaVersion < 1) {
    return { valid: false, error: 'Unsupported or missing backup schema version.' };
  }

  if (!candidate.settings || typeof candidate.settings !== 'object') {
    return { valid: false, error: 'Backup is missing settings data.' };
  }

  const settings = candidate.settings as Record<string, unknown>;
  const currencyValid = SUPPORTED_CURRENCIES.some((c) => c.code === settings.currencyCode);
  if (!currencyValid || typeof settings.openingBalanceMinor !== 'number') {
    return { valid: false, error: 'Backup settings contain invalid currency or balance.' };
  }

  if (
    !Array.isArray(candidate.categories) ||
    !Array.isArray(candidate.budgets) ||
    !Array.isArray(candidate.transactions)
  ) {
    return { valid: false, error: 'Backup must include categories, budgets, and transactions lists.' };
  }

  for (const cat of candidate.categories) {
    if (
      !cat ||
      typeof cat !== 'object' ||
      typeof (cat as Record<string, unknown>).id !== 'string' ||
      typeof (cat as Record<string, unknown>).name !== 'string' ||
      ((cat as Record<string, unknown>).type !== 'income' &&
        (cat as Record<string, unknown>).type !== 'expense')
    ) {
      return { valid: false, error: 'Backup contains an invalid category record.' };
    }
  }

  for (const tx of candidate.transactions) {
    const rec = tx as Record<string, unknown>;
    if (
      !tx ||
      typeof tx !== 'object' ||
      typeof rec.id !== 'string' ||
      (rec.type !== 'income' && rec.type !== 'expense') ||
      typeof rec.title !== 'string' ||
      typeof rec.amountMinor !== 'number' ||
      !Number.isInteger(rec.amountMinor) ||
      rec.amountMinor <= 0 ||
      typeof rec.transactionDate !== 'string' ||
      !isValidISODate(rec.transactionDate)
    ) {
      return { valid: false, error: 'Backup contains an invalid transaction record.' };
    }
  }

  for (const b of candidate.budgets) {
    const rec = b as Record<string, unknown>;
    if (
      !b ||
      typeof b !== 'object' ||
      typeof rec.id !== 'string' ||
      typeof rec.amountMinor !== 'number' ||
      !Number.isInteger(rec.amountMinor) ||
      rec.amountMinor <= 0 ||
      typeof rec.month !== 'number' ||
      typeof rec.year !== 'number'
    ) {
      return { valid: false, error: 'Backup contains an invalid budget record.' };
    }
  }

  return { valid: true, value: candidate as unknown as BackupPayload };
}
