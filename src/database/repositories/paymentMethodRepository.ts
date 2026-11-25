import type { SqlDatabaseAdapter } from '@/database/driver';
import type {
  CreatePaymentMethodInput,
  IPaymentMethodRepository,
  PaymentMethodRow,
  UpdatePaymentMethodInput,
} from '@/types/database';
import type { PaymentMethodRecord } from '@/types/models';
import { generateUUID } from '@/utils/uuid';

import { mapPaymentMethodRow } from './mappers';

export class SQLitePaymentMethodRepository implements IPaymentMethodRepository {
  constructor(private readonly getDb: () => Promise<SqlDatabaseAdapter>) {}

  async getAll(options?: { includeArchived?: boolean }): Promise<PaymentMethodRecord[]> {
    const db = await this.getDb();
    const whereClause = options?.includeArchived ? '' : 'WHERE is_archived = 0';
    const rows = await db.getAllAsync<PaymentMethodRow>(
      `SELECT * FROM payment_methods ${whereClause} ORDER BY is_builtin DESC, name ASC`,
    );
    return rows.map(mapPaymentMethodRow);
  }

  async getById(id: string): Promise<PaymentMethodRecord | null> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<PaymentMethodRow>(
      'SELECT * FROM payment_methods WHERE id = ? LIMIT 1',
      id,
    );
    return row ? mapPaymentMethodRow(row) : null;
  }

  async create(input: CreatePaymentMethodInput): Promise<PaymentMethodRecord> {
    const trimmedName = input.name.trim();
    if (!trimmedName) {
      throw new Error('Payment method name is required.');
    }

    const db = await this.getDb();
    const duplicate = await db.getFirstAsync<PaymentMethodRow>(
      'SELECT * FROM payment_methods WHERE LOWER(name) = LOWER(?) LIMIT 1',
      trimmedName,
    );
    if (duplicate) {
      if (duplicate.is_archived === 1) {
        return this.update(duplicate.id, {
          name: trimmedName,
          icon: input.icon ?? duplicate.icon ?? 'wallet',
          isArchived: false,
        });
      }
      throw new Error('A payment method with this name already exists.');
    }

    const id = input.id ?? generateUUID();
    const now = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO payment_methods (
        id, name, icon, is_builtin, is_archived, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 0, ?, ?)`,
      id,
      trimmedName,
      input.icon || 'wallet',
      input.isBuiltin ? 1 : 0,
      now,
      now,
    );

    const created = await this.getById(id);
    if (!created) {
      throw new Error('Failed to load created payment method.');
    }
    return created;
  }

  async update(id: string, input: UpdatePaymentMethodInput): Promise<PaymentMethodRecord> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error('Payment method not found.');
    }

    const nextName = (input.name ?? existing.name).trim();
    if (!nextName) {
      throw new Error('Payment method name cannot be empty.');
    }

    const db = await this.getDb();
    if (nextName.toLowerCase() !== existing.name.toLowerCase()) {
      const duplicate = await db.getFirstAsync<Pick<PaymentMethodRow, 'id'>>(
        'SELECT id FROM payment_methods WHERE LOWER(name) = LOWER(?) AND id != ? LIMIT 1',
        nextName,
        id,
      );
      if (duplicate) {
        throw new Error('A payment method with this name already exists.');
      }
    }

    const now = new Date().toISOString();
    await db.runAsync(
      `UPDATE payment_methods
       SET name = ?, icon = ?, is_archived = ?, updated_at = ?
       WHERE id = ?`,
      nextName,
      input.icon ?? existing.icon,
      input.isArchived !== undefined ? (input.isArchived ? 1 : 0) : existing.isArchived ? 1 : 0,
      now,
      id,
    );

    // Note: Intentionally do NOT overwrite historical transactions.payment_method snapshots on rename/archive
    const updated = await this.getById(id);
    if (!updated) {
      throw new Error('Failed to load updated payment method.');
    }
    return updated;
  }

  async delete(id: string): Promise<void> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error('Payment method not found.');
    }
    if (existing.isBuiltin) {
      throw new Error('Built-in payment methods cannot be deleted.');
    }
    const db = await this.getDb();
    await db.runAsync('DELETE FROM payment_methods WHERE id = ?', id);
  }
}
