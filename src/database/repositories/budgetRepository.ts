import { DEFAULT_CURRENCY_CODE, isValidIsoCurrencyCode } from '@/constants/currencies';
import type { SqlDatabaseAdapter } from '@/database/driver';
import type { BudgetRow, IBudgetRepository, UpsertBudgetInput } from '@/types/database';
import type { Budget } from '@/types/models';
import { isValidISODate, parseISODateParts } from '@/utils/date';
import { generateUUID } from '@/utils/uuid';

import { mapBudgetRow } from './mappers';

export class SQLiteBudgetRepository implements IBudgetRepository {
  constructor(private readonly getDb: () => Promise<SqlDatabaseAdapter>) {}

  private async getFallbackCurrency(db: SqlDatabaseAdapter): Promise<string> {
    const row = await db.getFirstAsync<{ currency_code: string }>(
      'SELECT currency_code FROM app_settings WHERE id = 1 LIMIT 1',
    );
    return row?.currency_code?.trim().toUpperCase() || DEFAULT_CURRENCY_CODE;
  }

  async getByMonthYear(month: number, year: number): Promise<Budget[]> {
    const db = await this.getDb();
    const fallbackCurrency = await this.getFallbackCurrency(db);
    const rows = await db.getAllAsync<BudgetRow>(
      `SELECT * FROM budgets
       WHERE period = 'monthly' AND month = ? AND year = ?
       ORDER BY CASE WHEN category_id IS NULL THEN 0 ELSE 1 END, created_at ASC`,
      month,
      year,
    );
    return rows.map((row) => mapBudgetRow(row, fallbackCurrency));
  }

  async getAll(): Promise<Budget[]> {
    const db = await this.getDb();
    const fallbackCurrency = await this.getFallbackCurrency(db);
    const rows = await db.getAllAsync<BudgetRow>(
      'SELECT * FROM budgets ORDER BY year DESC, month DESC, created_at ASC',
    );
    return rows.map((row) => mapBudgetRow(row, fallbackCurrency));
  }

  async upsert(input: UpsertBudgetInput): Promise<Budget> {
    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
      throw new Error('Budget amount must be a positive integer in minor units.');
    }

    const period = input.period ?? 'monthly';
    if (period !== 'monthly' && period !== 'biweekly' && period !== 'yearly') {
      throw new Error('Unsupported budget period.');
    }

    let normalizedMonth = input.month;
    let normalizedYear = input.year;
    let normalizedStartDate: string | null = null;

    if (period === 'biweekly') {
      const candidateDate = input.startDate?.trim() ?? '';
      if (!isValidISODate(candidateDate)) {
        throw new Error('A valid start date is required for an Every 2 Weeks budget.');
      }
      const parts = parseISODateParts(candidateDate);
      normalizedMonth = parts.month;
      normalizedYear = parts.year;
      normalizedStartDate = candidateDate;
    } else if (period === 'yearly') {
      if (!Number.isInteger(input.year) || input.year < 1970) {
        throw new Error('Budget year must be 1970 or later.');
      }
      normalizedMonth = 1;
      normalizedYear = input.year;
      normalizedStartDate = null;
    } else {
      if (!Number.isInteger(input.month) || input.month < 1 || input.month > 12) {
        throw new Error('Budget month must be between 1 and 12.');
      }
      if (!Number.isInteger(input.year) || input.year < 1970) {
        throw new Error('Budget year must be 1970 or later.');
      }
    }

    const db = await this.getDb();
    const fallbackCurrency = await this.getFallbackCurrency(db);
    const currencyCode = (input.currencyCode ?? fallbackCurrency).trim().toUpperCase();
    if (!isValidIsoCurrencyCode(currencyCode)) {
      throw new Error('Budget currency code must be a valid 3-letter ISO code.');
    }

    const now = new Date().toISOString();
    let targetId = input.id ?? generateUUID();

    await db.withTransactionAsync(async () => {
      let existing: BudgetRow | null = null;

      if (input.id) {
        existing = await db.getFirstAsync<BudgetRow>(
          'SELECT * FROM budgets WHERE id = ? LIMIT 1',
          input.id,
        );
      }

      if (!existing) {
        existing =
          input.categoryId === null
            ? await db.getFirstAsync<BudgetRow>(
                `SELECT * FROM budgets
                 WHERE period = ? AND month = ? AND year = ?
                   AND COALESCE(start_date, '') = COALESCE(?, '')
                   AND UPPER(COALESCE(currency_code, ?)) = UPPER(?)
                   AND category_id IS NULL
                 LIMIT 1`,
                period,
                normalizedMonth,
                normalizedYear,
                normalizedStartDate ?? '',
                fallbackCurrency,
                currencyCode,
              )
            : await db.getFirstAsync<BudgetRow>(
                `SELECT * FROM budgets
                 WHERE period = ? AND month = ? AND year = ?
                   AND COALESCE(start_date, '') = COALESCE(?, '')
                   AND UPPER(COALESCE(currency_code, ?)) = UPPER(?)
                   AND category_id = ?
                 LIMIT 1`,
                period,
                normalizedMonth,
                normalizedYear,
                normalizedStartDate ?? '',
                fallbackCurrency,
                currencyCode,
                input.categoryId,
              );
      }

      if (existing) {
        targetId = existing.id;
        await db.runAsync(
          `UPDATE budgets
           SET amount_minor = ?, currency_code = ?, period = ?, month = ?, year = ?, start_date = ?, updated_at = ?
           WHERE id = ?`,
          input.amountMinor,
          currencyCode,
          period,
          normalizedMonth,
          normalizedYear,
          normalizedStartDate,
          now,
          existing.id,
        );
      } else {
        await db.runAsync(
          `INSERT INTO budgets (
            id, amount_minor, currency_code, period, month, year, start_date, category_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          targetId,
          input.amountMinor,
          currencyCode,
          period,
          normalizedMonth,
          normalizedYear,
          normalizedStartDate,
          input.categoryId,
          now,
          now,
        );
      }
    });

    const row = await db.getFirstAsync<BudgetRow>(
      'SELECT * FROM budgets WHERE id = ? LIMIT 1',
      targetId,
    );
    if (!row) {
      throw new Error('Failed to save budget.');
    }
    return mapBudgetRow(row, fallbackCurrency);
  }

  async delete(id: string): Promise<void> {
    const db = await this.getDb();
    await db.runAsync('DELETE FROM budgets WHERE id = ?', id);
  }
}
