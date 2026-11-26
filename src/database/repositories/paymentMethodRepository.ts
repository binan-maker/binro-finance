import type { SqlDatabaseAdapter } from '@/database/driver';
import { isLocalRelativeImagePath } from '@/services/images/mediaPathUtils';
import type {
  CreatePaymentMethodInput,
  IPaymentMethodRepository,
  PaymentMethodRow,
  UpdatePaymentMethodInput,
} from '@/types/database';
import type { PaymentMethodRecord } from '@/types/models';
import { generateUUID } from '@/utils/uuid';

import { mapPaymentMethodRow } from './mappers';
import {
  enqueueOutboxChangeIfLinked,
  markLocalMediaPendingDelete,
  trackLocalMediaPendingUpload,
} from './syncRepository';

export class SQLitePaymentMethodRepository implements IPaymentMethodRepository {
  constructor(private readonly getDb: () => Promise<SqlDatabaseAdapter>) {}

  async getAll(options?: { includeArchived?: boolean }): Promise<PaymentMethodRecord[]> {
    const db = await this.getDb();
    const whereClause = options?.includeArchived
      ? 'WHERE deleted_at IS NULL'
      : 'WHERE is_archived = 0 AND deleted_at IS NULL';
    const rows = await db.getAllAsync<PaymentMethodRow>(
      `SELECT * FROM payment_methods ${whereClause} ORDER BY is_builtin DESC, name ASC`,
    );
    return rows.map(mapPaymentMethodRow);
  }

  async getById(id: string): Promise<PaymentMethodRecord | null> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<PaymentMethodRow>(
      'SELECT * FROM payment_methods WHERE id = ? AND deleted_at IS NULL LIMIT 1',
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
      'SELECT * FROM payment_methods WHERE LOWER(name) = LOWER(?) AND deleted_at IS NULL LIMIT 1',
      trimmedName,
    );
    if (duplicate) {
      if (duplicate.is_archived === 1) {
        return this.update(duplicate.id, {
          name: trimmedName,
          icon: input.icon ?? duplicate.icon ?? 'wallet',
          imageUri: input.imageUri !== undefined ? input.imageUri : duplicate.image_uri ?? null,
          isArchived: false,
        });
      }
      throw new Error('A payment method with this name already exists.');
    }

    const id = input.id ?? generateUUID();
    const now = new Date().toISOString();
    const nextImageUri = input.imageUri?.trim() || null;

    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `INSERT INTO payment_methods (
          id, name, icon, image_uri, is_builtin, is_archived, deleted_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 0, NULL, ?, ?)`,
        id,
        trimmedName,
        input.icon || 'wallet',
        nextImageUri,
        input.isBuiltin ? 1 : 0,
        now,
        now,
      );

      if (nextImageUri && isLocalRelativeImagePath(nextImageUri)) {
        await trackLocalMediaPendingUpload(db, {
          localPath: nextImageUri,
          entityType: 'payment_method',
          entityId: id,
        });
      }

      await enqueueOutboxChangeIfLinked(db, {
        entityType: 'payment_method',
        entityId: id,
        operation: 'upsert',
        localUpdatedAt: now,
      });
    });

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
        'SELECT id FROM payment_methods WHERE LOWER(name) = LOWER(?) AND id != ? AND deleted_at IS NULL LIMIT 1',
        nextName,
        id,
      );
      if (duplicate) {
        throw new Error('A payment method with this name already exists.');
      }
    }

    const nextImageUri =
      input.imageUri !== undefined
        ? input.imageUri?.trim() || null
        : existing.imageUri;

    const now = new Date().toISOString();
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `UPDATE payment_methods
         SET name = ?, icon = ?, image_uri = ?, is_archived = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
        nextName,
        input.icon ?? existing.icon,
        nextImageUri,
        input.isArchived !== undefined ? (input.isArchived ? 1 : 0) : existing.isArchived ? 1 : 0,
        now,
        id,
      );

      if (existing.imageUri && existing.imageUri !== nextImageUri && isLocalRelativeImagePath(existing.imageUri)) {
        await markLocalMediaPendingDelete(db, existing.imageUri);
      }
      if (nextImageUri && nextImageUri !== existing.imageUri && isLocalRelativeImagePath(nextImageUri)) {
        await trackLocalMediaPendingUpload(db, {
          localPath: nextImageUri,
          entityType: 'payment_method',
          entityId: id,
        });
      }

      await enqueueOutboxChangeIfLinked(db, {
        entityType: 'payment_method',
        entityId: id,
        operation: 'upsert',
        localUpdatedAt: now,
      });
    });

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
    const now = new Date().toISOString();
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        'UPDATE payment_methods SET deleted_at = ?, updated_at = ? WHERE id = ?',
        now,
        now,
        id,
      );
      if (existing.imageUri && isLocalRelativeImagePath(existing.imageUri)) {
        await markLocalMediaPendingDelete(db, existing.imageUri);
      }
      await enqueueOutboxChangeIfLinked(db, {
        entityType: 'payment_method',
        entityId: id,
        operation: 'delete',
        localUpdatedAt: now,
      });
    });
  }
}
