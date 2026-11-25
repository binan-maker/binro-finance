import { describe, expect, test } from 'bun:test';

import type { CurrencyConfig } from '@/constants/currencies';
import { getMonthRange, getWeekRange, getYearRange, isValidISODate } from '@/utils/date';
import { formatMinorToMajorInput, formatMoney, parseMajorToMinor } from '@/utils/money';
import { generateUUID, isValidUUID } from '@/utils/uuid';
import {
  validateBackupPayload,
  validatePaymentMethodName,
  validateTagName,
  validateTransactionInput,
} from '@/utils/validation';

describe('money utilities (0, 2, and 3 decimal minor units)', () => {
  test('parses 2-decimal INR amounts without floating point drift', () => {
    expect(parseMajorToMinor('19.99', 'INR')).toBe(1999);
    expect(parseMajorToMinor('1,234.50', 'INR')).toBe(123450);
    expect(parseMajorToMinor('100', 'INR')).toBe(10000);
    expect(parseMajorToMinor('0.01', 'INR')).toBe(1);
    expect(parseMajorToMinor('.50', 'INR')).toBe(50);
    expect(parseMajorToMinor('10.', 'INR')).toBe(1000);
    expect(parseMajorToMinor('.', 'INR')).toBeNull();
    expect(parseMajorToMinor('12.345', 'INR')).toBeNull();
    expect(parseMajorToMinor('abc', 'INR')).toBeNull();
  });

  test('handles zero-minor-unit currencies like JPY', () => {
    expect(parseMajorToMinor('1500', 'JPY')).toBe(1500);
    expect(parseMajorToMinor('1500.5', 'JPY')).toBeNull();
    expect(formatMinorToMajorInput(1500, 'JPY')).toBe('1500');
    expect(formatMoney(1500, 'JPY')).toBe('¥1,500');
  });

  test('handles 3-decimal currencies like KWD using fallback and custom catalog', () => {
    expect(parseMajorToMinor('12.345', 'KWD')).toBe(12345);
    expect(parseMajorToMinor('12.34', 'KWD')).toBe(12340);
    expect(parseMajorToMinor('12.3456', 'KWD')).toBeNull();
    expect(formatMinorToMajorInput(12345, 'KWD')).toBe('12.345');
    expect(formatMoney(12345, 'KWD')).toBe('د.ك 12.345');

    const customCatalog: CurrencyConfig[] = [
      { code: 'OMR', name: 'Omani Rial', symbol: 'OMR', minorUnits: 3 },
    ];
    expect(parseMajorToMinor('1.005', 'OMR', customCatalog)).toBe(1005);
    expect(formatMoney(1005, 'OMR', { catalog: customCatalog })).toBe('OMR 1.005');
  });

  test('formats minor units to major input and display string', () => {
    expect(formatMinorToMajorInput(123450, 'INR')).toBe('1234.50');
    expect(formatMoney(123450, 'INR')).toBe('₹1,234.50');
    expect(formatMoney(-500, 'USD')).toBe('-$5');
    expect(formatMoney(500, 'USD', { showSign: true })).toBe('+$5');
    expect(formatMoney(-550, 'USD')).toBe('-$5.50');
    expect(formatMoney(550, 'USD', { showSign: true })).toBe('+$5.50');
  });
});

describe('date utilities', () => {
  test('validates ISO dates strictly', () => {
    expect(isValidISODate('2026-02-28')).toBe(true);
    expect(isValidISODate('2026-02-29')).toBe(false);
    expect(isValidISODate('2024-02-29')).toBe(true);
    expect(isValidISODate('2026-13-01')).toBe(false);
  });

  test('computes month, week, and year ranges', () => {
    expect(getMonthRange(2026, 2)).toEqual({
      startDate: '2026-02-01',
      endDate: '2026-02-28',
    });
    expect(getYearRange(2026)).toEqual({
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    });
    // 2026-11-25 is Wednesday -> Mon 2026-11-23 to Sun 2026-11-29
    expect(getWeekRange('2026-11-25')).toEqual({
      startDate: '2026-11-23',
      endDate: '2026-11-29',
    });
  });
});

describe('uuid & validation', () => {
  test('generates valid unique v4 UUIDs', () => {
    const a = generateUUID();
    const b = generateUUID();
    expect(isValidUUID(a)).toBe(true);
    expect(isValidUUID(b)).toBe(true);
    expect(a).not.toBe(b);
  });

  test('validates transaction input, tags, and custom payment methods', () => {
    const valid = validateTransactionInput({
      type: 'expense',
      title: 'Lunch',
      rawAmount: '250.50',
      currencyCode: 'INR',
      categoryId: 'cat-exp-food',
      transactionDate: '2026-11-24',
      paymentMethod: 'Apple Pay',
    });
    expect(valid.valid).toBe(true);
    expect(valid.value).toEqual({ amountMinor: 25050, title: 'Lunch' });

    const invalidCurrency = validateTransactionInput({
      type: 'expense',
      title: 'Lunch',
      rawAmount: '10',
      currencyCode: 'INVALID',
      categoryId: 'cat-exp-food',
      transactionDate: '2026-11-24',
      paymentMethod: 'UPI',
    });
    expect(invalidCurrency.valid).toBe(false);

    const invalidAmount = validateTransactionInput({
      type: 'expense',
      title: 'Lunch',
      rawAmount: '0',
      currencyCode: 'INR',
      categoryId: 'cat-exp-food',
      transactionDate: '2026-11-24',
      paymentMethod: 'UPI',
    });
    expect(invalidAmount.valid).toBe(false);

    expect(validateTagName('  Office  ')).toEqual({ valid: true, value: 'Office' });
    expect(validateTagName('   ').valid).toBe(false);
    expect(validatePaymentMethodName('  Revolut Card  ')).toEqual({
      valid: true,
      value: 'Revolut Card',
    });
    expect(validatePaymentMethodName('').valid).toBe(false);
  });

  test('accepts valid V1 and V2 backups and strictly rejects malformed payloads', () => {
    const baseValidV1 = {
      schemaVersion: 1,
      exportedAt: '2026-11-25T00:00:00.000Z',
      appVersion: '1.0.0',
      settings: {
        id: 1,
        currencyCode: 'INR',
        openingBalanceMinor: 0,
        theme: 'system',
        dateFormat: 'DD MMM YYYY',
        onboardingCompleted: true,
      },
      categories: [],
      budgets: [],
      transactions: [],
    };

    expect(validateBackupPayload(baseValidV1).valid).toBe(true);
    expect(
      validateBackupPayload({
        ...baseValidV1,
        schemaVersion: 2,
        settings: {
          ...baseValidV1.settings,
          openingBalanceCurrencyCode: 'USD',
        },
        tags: [],
        paymentMethods: [],
      }).valid,
    ).toBe(true);

    // Unsupported schema version
    expect(validateBackupPayload({ ...baseValidV1, schemaVersion: 99 }).valid).toBe(false);

    // Invalid theme / negative balance
    expect(
      validateBackupPayload({
        ...baseValidV1,
        settings: { ...baseValidV1.settings, theme: 'neon' },
      }).valid,
    ).toBe(false);
    expect(
      validateBackupPayload({
        ...baseValidV1,
        settings: { ...baseValidV1.settings, openingBalanceMinor: -50 },
      }).valid,
    ).toBe(false);

    // Invalid budget month
    expect(
      validateBackupPayload({
        ...baseValidV1,
        budgets: [
          {
            id: 'b1',
            amountMinor: 1000,
            period: 'monthly',
            month: 13,
            year: 2026,
            categoryId: null,
            createdAt: '2026-11-25T00:00:00.000Z',
            updatedAt: '2026-11-25T00:00:00.000Z',
          },
        ],
      }).valid,
    ).toBe(false);

    // Invalid transaction currency
    expect(
      validateBackupPayload({
        ...baseValidV1,
        schemaVersion: 2,
        transactions: [
          {
            id: 'tx1',
            type: 'expense',
            title: 'Test',
            amountMinor: 1000,
            currencyCode: 'INVALID_CURR',
            categoryId: null,
            categoryNameSnapshot: 'Other',
            paymentMethod: 'Card',
            transactionDate: '2026-11-25',
            note: null,
            createdAt: '2026-11-25T00:00:00.000Z',
            updatedAt: '2026-11-25T00:00:00.000Z',
          },
        ],
      }).valid,
    ).toBe(false);
  });
});
