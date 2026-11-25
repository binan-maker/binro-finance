import type { SqlDatabaseAdapter } from '@/database/driver';
import type { BudgetRow, IBudgetRepository, UpsertBudgetInput } from '@/types/database';
import type { Budget } from '@/types/models';
import { generateUUID } from '@/utils/uuid';

import { mapBudgetRow } from './mappers';

export class SQLiteBudgetRepository implements IBudgetRepository {
  constructor(private readonly getDb: () => Promise<SqlDatabaseAdapter>) {}

  async getByMonthYear(month: number, year: number): Promise<Budget[]> {
    const db = await this.getDb();
    const rows = await db.getAllAsync<BudgetRow>(
      `SELECT * FROM budgets
       WHERE month = ? AND year = ?
       ORDER BY CASE WHEN category_id IS NULL THEN 0 ELSE 1 END, created_at ASC`,
      month,
      year,
    );
    return rows.map(mapBudgetRow);
  }

  async getAll(): Promise<Budget[]> {
    const db = await this.getDb();
    const rows = await db.getAllAsync<BudgetRow>(
      'SELECT * FROM budgets ORDER BY year DESC, month DESC, created_at ASC',
    );
    return rows.map(mapBudgetRow);
  }

  async upsert(input: UpsertBudgetInput): Promise<Budget> {
    if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
      throw new Error('Budget amount must be a positive integer in minor units.');
    }
    if (input.month < 1 || input.month > 12) {
      throw new Error('Budget month must be between 1 and 12.');
    }

    const db = await this.getDb();
    const period = input.period ?? 'monthly';
    const now = new Date().toISOString();
    let targetId = input.id ?? generateUUID();

    await db.withTransactionAsync(async () => {
      const existing =
        input.categoryId === null
          ? await db.getFirstAsync<BudgetRow>(
              `SELECT * FROM budgets
               WHERE period = ? AND month = ? AND year = ? AND category_id IS NULL
               LIMIT 1`,
              period,
              input.month,
              input.year,
            )
          : await db.getFirstAsync<BudgetRow>(
              `SELECT * FROM budgets
               WHERE period = ? AND month = ? AND year = ? AND category_id = ?
               LIMIT 1`,
              period,
              input.month,
              input.year,
              input.categoryId,
            );

      if (existing) {
        targetId = existing.id;
        await db.runAsync(
          'UPDATE budgets SET amount_minor = ?, updated_at = ? WHERE id = ?',
          input.amountMinor,
          now,
          existing.id,
        );
      } else {
        await db.runAsync(
          `INSERT INTO budgets (
            id, amount_minor, period, month, year, category_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          targetId,
          input.amountMinor,
          period,
          input.month,
          input.year,
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
    return mapBudgetRow(row);
  }

  async delete(id: string): Promise<void> {
    const db = await this.getDb();
    await db.runAsync('DELETE FROM budgets WHERE id = ?', id);
  }
}
