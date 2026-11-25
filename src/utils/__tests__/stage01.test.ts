import { describe, expect, test } from 'bun:test';

import { getMonthRange, getWeekRange, getYearRange, isValidISODate } from '@/utils/date';
import { formatMinorToMajorInput, formatMoney, parseMajorToMinor } from '@/utils/money';
import { generateUUID, isValidUUID } from '@/utils/uuid';
import { validateTransactionInput } from '@/utils/validation';

describe('money utilities (minor units)', () => {
  test('parses INR amounts without floating point drift', () => {
    expect(parseMajorToMinor('19.99', 'INR')).toBe(1999);
    expect(parseMajorToMinor('1,234.50', 'INR')).toBe(123450);
    expect(parseMajorToMinor('100', 'INR')).toBe(10000);
    expect(parseMajorToMinor('0.01', 'INR')).toBe(1);
    expect(parseMajorToMinor('12.345', 'INR')).toBeNull();
    expect(parseMajorToMinor('abc', 'INR')).toBeNull();
  });

  test('handles zero-minor-unit currencies like JPY', () => {
    expect(parseMajorToMinor('1500', 'JPY')).toBe(1500);
    expect(parseMajorToMinor('1500.5', 'JPY')).toBeNull();
    expect(formatMoney(1500, 'JPY')).toBe('¥1,500');
  });

  test('formats minor units to major input and display string', () => {
    expect(formatMinorToMajorInput(123450, 'INR')).toBe('1234.50');
    expect(formatMoney(123450, 'INR')).toBe('₹1,234.50');
    expect(formatMoney(-500, 'USD')).toBe('-$5.00');
    expect(formatMoney(500, 'USD', { showSign: true })).toBe('+$5.00');
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

  test('validates transaction input', () => {
    const valid = validateTransactionInput({
      type: 'expense',
      title: 'Lunch',
      rawAmount: '250.50',
      currencyCode: 'INR',
      categoryId: 'cat-exp-food',
      transactionDate: '2026-11-24',
      paymentMethod: 'UPI',
    });
    expect(valid.valid).toBe(true);
    expect(valid.value).toEqual({ amountMinor: 25050, title: 'Lunch' });

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
  });
});
