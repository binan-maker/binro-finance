import type { SqlBindValue, SqlDatabaseAdapter } from '@/database/driver';
import type {
  CreateTransactionInput,
  ITransactionRepository,
  TransactionFilters,
  TransactionRow,
  UpdateTransactionInput,
} from '@/types/database';
import type { Transaction } from '@/types/models';
import { generateUUID } from '@/utils/uuid';

import { mapTransactionRow } from './mappers';

export class SQLiteTransactionRepository implements ITransactionRepository {
  constructor(private readonly getDb: () => Promise<SqlDatabaseAdapter>) {}

  async getAll(filters?: TransactionFilters): Promise<Transaction[]> {
    const db = await this.getDb();
    const conditions: string[] = [];
    const params: SqlBindValue[] = [];

    if (filters?.type && filters.type !== 'all') {
      conditions.push('type = ?');
      params.push(filters.type);
    }

    if (filters?.categoryId) {
      conditions.push('category_id = ?');
      params.push(filters.categoryId);
    }

    if (filters?.paymentMethod && filters.paymentMethod !== 'all') {
      conditions.push('payment_method = ?');
      params.push(filters.paymentMethod);
    }

    if (filters?.startDate) {
      conditions.push('transaction_date >= ?');
      params.push(filters.startDate);
    }

    if (filters?.endDate) {
      conditions.push('transaction_date <= ?');
      params.push(filters.endDate);
    }

    if (filters?.search && filters.search.trim().length > 0) {
      const term = `%${filters.search.trim().toLowerCase()}%`;
      conditions.push(
        "(LOWER(title) LIKE ? OR LOWER(COALESCE(note, '')) LIKE ? OR LOWER(COALESCE(category_name_snapshot, '')) LIKE ?)",
      );
      params.push(term, term, term);
    }

    let sql = 'SELECT * FROM transactions';
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }
    sql += ' ORDER BY transaction_date DESC, created_at DESC';

    if (typeof filters?.limit === 'number' && filters.limit > 0) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
      if (typeof filters.offset === 'number' && filters.offset >= 0) {
        sql += ' OFFSET ?';
        params.push(filters.offset);
      }
    }

    const rows = await db.getAllAsync<TransactionRow>(sql, ...params);
    return rows.map(mapTransactionRow);
  }

  async getById(id: string): Promise<Transaction | null> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<TransactionRow>(
      'SELECT * FROM transactions WHERE id = ? LIMIT 1',
      id,
    );
    return row ? mapTransactionRow(row) : null;
  }

  async getByDate(date: string): Promise<Transaction[]> {
    return this.getAll({ startDate: date, endDate: date });
  }

  async getByDateRange(startDate: string, endDate: string): Promise<Transaction[]> {
    return this.getAll({ startDate, endDate });
  }

  async create(input: CreateTransactionInput): Promise<Transaction> {
    if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
      throw new Error('Transaction amount must be a positive integer in minor units.');
    }

    const db = await this.getDb();
    const id = input.id ?? generateUUID();
    const now = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO transactions (
        id, type, title, amount_minor, category_id, category_name_snapshot,
        payment_method, transaction_date, note, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.type,
      input.title.trim(),
      input.amountMinor,
      input.categoryId,
      input.categoryNameSnapshot,
      input.paymentMethod,
      input.transactionDate,
      input.note?.trim() || null,
      now,
      now,
    );

    const created = await this.getById(id);
    if (!created) {
      throw new Error('Failed to load newly created transaction.');
    }
    return created;
  }

  async update(id: string, input: UpdateTransactionInput): Promise<Transaction> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error('Transaction not found.');
    }

    const nextAmount = input.amountMinor ?? existing.amountMinor;
    if (!Number.isInteger(nextAmount) || nextAmount <= 0) {
      throw new Error('Transaction amount must be a positive integer in minor units.');
    }

    const db = await this.getDb();
    const now = new Date().toISOString();

    await db.runAsync(
      `UPDATE transactions
       SET type = ?,
           title = ?,
           amount_minor = ?,
           category_id = ?,
           category_name_snapshot = ?,
           payment_method = ?,
           transaction_date = ?,
           note = ?,
           updated_at = ?
       WHERE id = ?`,
      input.type ?? existing.type,
      (input.title ?? existing.title).trim(),
      nextAmount,
      input.categoryId !== undefined ? input.categoryId : existing.categoryId,
      input.categoryNameSnapshot ?? existing.categoryNameSnapshot,
      input.paymentMethod ?? existing.paymentMethod,
      input.transactionDate ?? existing.transactionDate,
      input.note !== undefined ? input.note?.trim() || null : existing.note,
      now,
      id,
    );

    const updated = await this.getById(id);
    if (!updated) {
      throw new Error('Failed to load updated transaction.');
    }
    return updated;
  }

  async delete(id: string): Promise<void> {
    const db = await this.getDb();
    await db.runAsync('DELETE FROM transactions WHERE id = ?', id);
  }
}
