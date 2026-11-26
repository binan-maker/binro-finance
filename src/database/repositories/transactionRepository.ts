import { DEFAULT_CURRENCY_CODE, isValidIsoCurrencyCode } from '@/constants/currencies';
import type { SqlBindValue, SqlDatabaseAdapter } from '@/database/driver';
import type {
  CreateTransactionInput,
  ITransactionRepository,
  TransactionFilters,
  TransactionRow,
  TransactionTagRow,
  UpdateTransactionInput,
} from '@/types/database';
import type { Transaction } from '@/types/models';
import { generateUUID } from '@/utils/uuid';

import { mapTransactionRow } from './mappers';
import { enqueueOutboxChangeIfLinked } from './syncRepository';

export class SQLiteTransactionRepository implements ITransactionRepository {
  constructor(private readonly getDb: () => Promise<SqlDatabaseAdapter>) {}

  private async getFallbackCurrency(db: SqlDatabaseAdapter): Promise<string> {
    const row = await db.getFirstAsync<{ currency_code: string }>(
      'SELECT currency_code FROM app_settings WHERE id = 1 LIMIT 1',
    );
    return row?.currency_code?.trim().toUpperCase() || DEFAULT_CURRENCY_CODE;
  }

  private async attachTags(
    db: SqlDatabaseAdapter,
    rows: TransactionRow[],
    fallbackCurrency: string,
  ): Promise<Transaction[]> {
    if (rows.length === 0) return [];

    const placeholders = rows.map(() => '?').join(', ');
    const tagRows = await db.getAllAsync<TransactionTagRow>(
      `SELECT tt.transaction_id, tt.tag_id
       FROM transaction_tags tt
       INNER JOIN tags tg ON tg.id = tt.tag_id
       WHERE tt.transaction_id IN (${placeholders})
         AND tt.deleted_at IS NULL
         AND tg.deleted_at IS NULL`,
      ...rows.map((r) => r.id),
    );

    const tagsByTx = new Map<string, string[]>();
    for (const row of tagRows) {
      const existing = tagsByTx.get(row.transaction_id) ?? [];
      existing.push(row.tag_id);
      tagsByTx.set(row.transaction_id, existing);
    }

    return rows.map((row) =>
      mapTransactionRow(row, fallbackCurrency, tagsByTx.get(row.id) ?? []),
    );
  }

  private async replaceTransactionTags(
    db: SqlDatabaseAdapter,
    transactionId: string,
    tagIds: readonly string[],
    now: string,
  ): Promise<void> {
    const nextSet = new Set(tagIds.filter((id) => Boolean(id)));
    const existingRows = await db.getAllAsync<Pick<TransactionTagRow, 'tag_id' | 'deleted_at'>>(
      'SELECT tag_id, deleted_at FROM transaction_tags WHERE transaction_id = ?',
      transactionId,
    );

    for (const row of existingRows) {
      if (!nextSet.has(row.tag_id) && row.deleted_at === null) {
        await db.runAsync(
          'UPDATE transaction_tags SET deleted_at = ?, updated_at = ? WHERE transaction_id = ? AND tag_id = ?',
          now,
          now,
          transactionId,
          row.tag_id,
        );
        await enqueueOutboxChangeIfLinked(db, {
          entityType: 'transaction_tag',
          entityId: `${transactionId}:${row.tag_id}`,
          operation: 'delete',
          localUpdatedAt: now,
        });
      }
    }

    for (const tagId of nextSet) {
      await db.runAsync(
        `INSERT INTO transaction_tags (transaction_id, tag_id, deleted_at, updated_at)
         VALUES (?, ?, NULL, ?)
         ON CONFLICT(transaction_id, tag_id) DO UPDATE SET
           deleted_at = NULL,
           updated_at = excluded.updated_at`,
        transactionId,
        tagId,
        now,
      );
      await enqueueOutboxChangeIfLinked(db, {
        entityType: 'transaction_tag',
        entityId: `${transactionId}:${tagId}`,
        operation: 'upsert',
        localUpdatedAt: now,
      });
    }
  }

  async getAll(filters?: TransactionFilters): Promise<Transaction[]> {
    const db = await this.getDb();
    const fallbackCurrency = await this.getFallbackCurrency(db);
    const conditions: string[] = ['deleted_at IS NULL'];
    const params: SqlBindValue[] = [];

    if (filters?.type && filters.type !== 'all') {
      conditions.push('type = ?');
      params.push(filters.type);
    }

    if (filters?.categoryId) {
      conditions.push('category_id = ?');
      params.push(filters.categoryId);
    }

    if (filters?.tagId) {
      conditions.push(
        `EXISTS (
          SELECT 1 FROM transaction_tags tt
          WHERE tt.transaction_id = transactions.id
            AND tt.tag_id = ?
            AND tt.deleted_at IS NULL
        )`,
      );
      params.push(filters.tagId);
    }

    if (filters?.tagIds && filters.tagIds.length > 0) {
      const placeholders = filters.tagIds.map(() => '?').join(', ');
      conditions.push(
        `EXISTS (
          SELECT 1 FROM transaction_tags tt
          WHERE tt.transaction_id = transactions.id
            AND tt.tag_id IN (${placeholders})
            AND tt.deleted_at IS NULL
        )`,
      );
      params.push(...filters.tagIds);
    }

    if (filters?.currencyCode) {
      conditions.push('UPPER(COALESCE(currency_code, ?)) = UPPER(?)');
      params.push(fallbackCurrency, filters.currencyCode);
    }

    if (filters?.paymentMethodId) {
      conditions.push('payment_method_id = ?');
      params.push(filters.paymentMethodId);
    } else if (filters?.paymentMethod && filters.paymentMethod !== 'all') {
      conditions.push("LOWER(COALESCE(payment_method, '')) = LOWER(?)");
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
        `(LOWER(title) LIKE ?
          OR LOWER(COALESCE(note, '')) LIKE ?
          OR LOWER(COALESCE(category_name_snapshot, '')) LIKE ?
          OR LOWER(COALESCE(payment_method, '')) LIKE ?
          OR LOWER(COALESCE(currency_code, '')) LIKE ?
          OR EXISTS (
            SELECT 1 FROM transaction_tags tt
            INNER JOIN tags tg ON tg.id = tt.tag_id
            WHERE tt.transaction_id = transactions.id
              AND tt.deleted_at IS NULL
              AND tg.deleted_at IS NULL
              AND LOWER(tg.name) LIKE ?
          ))`,
      );
      params.push(term, term, term, term, term, term);
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
    return this.attachTags(db, rows, fallbackCurrency);
  }

  async getById(id: string): Promise<Transaction | null> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<TransactionRow>(
      'SELECT * FROM transactions WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      id,
    );
    if (!row) return null;
    const fallbackCurrency = await this.getFallbackCurrency(db);
    const [tx] = await this.attachTags(db, [row], fallbackCurrency);
    return tx ?? null;
  }

  async getByDate(date: string): Promise<Transaction[]> {
    return this.getAll({ startDate: date, endDate: date });
  }

  async getByDateRange(startDate: string, endDate: string): Promise<Transaction[]> {
    return this.getAll({ startDate, endDate });
  }

  async create(input: CreateTransactionInput): Promise<Transaction> {
    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
      throw new Error('Transaction amount must be a positive integer in minor units.');
    }
    const trimmedTitle = input.title.trim();
    if (!trimmedTitle) {
      throw new Error('Transaction title is required.');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.transactionDate)) {
      throw new Error('Transaction date must be in YYYY-MM-DD format.');
    }
    const normalizedCurrency = input.currencyCode.trim().toUpperCase();
    if (!isValidIsoCurrencyCode(normalizedCurrency)) {
      throw new Error('Transaction currency code must be a valid 3-letter ISO code.');
    }

    const db = await this.getDb();
    const id = input.id ?? generateUUID();
    const now = new Date().toISOString();

    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `INSERT INTO transactions (
          id, type, title, amount_minor, currency_code, category_id, category_name_snapshot,
          payment_method_id, payment_method, transaction_date, note, deleted_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
        id,
        input.type,
        trimmedTitle,
        input.amountMinor,
        normalizedCurrency,
        input.categoryId,
        input.categoryNameSnapshot,
        input.paymentMethodId ?? null,
        input.paymentMethod.trim() || 'Cash',
        input.transactionDate,
        input.note?.trim() || null,
        now,
        now,
      );

      await enqueueOutboxChangeIfLinked(db, {
        entityType: 'transaction',
        entityId: id,
        operation: 'upsert',
        localUpdatedAt: now,
      });

      if (input.tagIds && input.tagIds.length > 0) {
        await this.replaceTransactionTags(db, id, input.tagIds, now);
      }
    });

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
    if (!Number.isSafeInteger(nextAmount) || nextAmount <= 0) {
      throw new Error('Transaction amount must be a positive integer in minor units.');
    }
    const nextTitle = (input.title ?? existing.title).trim();
    if (!nextTitle) {
      throw new Error('Transaction title cannot be empty.');
    }
    const nextDate = input.transactionDate ?? existing.transactionDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) {
      throw new Error('Transaction date must be in YYYY-MM-DD format.');
    }
    const nextCurrency = (input.currencyCode ?? existing.currencyCode).trim().toUpperCase();
    if (!isValidIsoCurrencyCode(nextCurrency)) {
      throw new Error('Transaction currency code must be a valid 3-letter ISO code.');
    }

    const db = await this.getDb();
    const now = new Date().toISOString();

    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `UPDATE transactions
         SET type = ?,
             title = ?,
             amount_minor = ?,
             currency_code = ?,
             category_id = ?,
             category_name_snapshot = ?,
             payment_method_id = ?,
             payment_method = ?,
             transaction_date = ?,
             note = ?,
             updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
        input.type ?? existing.type,
        nextTitle,
        nextAmount,
        nextCurrency,
        input.categoryId !== undefined ? input.categoryId : existing.categoryId,
        input.categoryNameSnapshot ?? existing.categoryNameSnapshot,
        input.paymentMethodId !== undefined ? input.paymentMethodId : existing.paymentMethodId,
        (input.paymentMethod ?? existing.paymentMethod).trim() || 'Cash',
        nextDate,
        input.note !== undefined ? input.note?.trim() || null : existing.note,
        now,
        id,
      );

      await enqueueOutboxChangeIfLinked(db, {
        entityType: 'transaction',
        entityId: id,
        operation: 'upsert',
        localUpdatedAt: now,
      });

      if (input.tagIds !== undefined) {
        await this.replaceTransactionTags(db, id, input.tagIds, now);
      }
    });

    const updated = await this.getById(id);
    if (!updated) {
      throw new Error('Failed to load updated transaction.');
    }
    return updated;
  }

  async delete(id: string): Promise<void> {
    const db = await this.getDb();
    const now = new Date().toISOString();
    await db.withTransactionAsync(async () => {
      const existingLinks = await db.getAllAsync<Pick<TransactionTagRow, 'tag_id'>>(
        'SELECT tag_id FROM transaction_tags WHERE transaction_id = ? AND deleted_at IS NULL',
        id,
      );
      await db.runAsync(
        'UPDATE transaction_tags SET deleted_at = ?, updated_at = ? WHERE transaction_id = ? AND deleted_at IS NULL',
        now,
        now,
        id,
      );
      for (const link of existingLinks) {
        await enqueueOutboxChangeIfLinked(db, {
          entityType: 'transaction_tag',
          entityId: `${id}:${link.tag_id}`,
          operation: 'delete',
          localUpdatedAt: now,
        });
      }

      await db.runAsync(
        'UPDATE transactions SET deleted_at = ?, updated_at = ? WHERE id = ?',
        now,
        now,
        id,
      );
      await enqueueOutboxChangeIfLinked(db, {
        entityType: 'transaction',
        entityId: id,
        operation: 'delete',
        localUpdatedAt: now,
      });
    });
  }
}
