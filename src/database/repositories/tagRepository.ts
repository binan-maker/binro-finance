import type { SqlDatabaseAdapter } from '@/database/driver';
import type {
  CreateTagInput,
  ITagRepository,
  TagRow,
  TransactionTagRow,
  UpdateTagInput,
} from '@/types/database';
import type { Tag } from '@/types/models';
import { generateUUID } from '@/utils/uuid';

import { mapTagRow } from './mappers';
import { enqueueOutboxChangeIfLinked } from './syncRepository';

export class SQLiteTagRepository implements ITagRepository {
  constructor(private readonly getDb: () => Promise<SqlDatabaseAdapter>) {}

  async getAll(options?: { includeArchived?: boolean }): Promise<Tag[]> {
    const db = await this.getDb();
    const whereClause = options?.includeArchived
      ? 'WHERE deleted_at IS NULL'
      : 'WHERE COALESCE(is_archived, 0) = 0 AND deleted_at IS NULL';
    const rows = await db.getAllAsync<TagRow>(
      `SELECT * FROM tags ${whereClause} ORDER BY name ASC`,
    );
    return rows.map(mapTagRow);
  }

  async getById(id: string): Promise<Tag | null> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<TagRow>(
      'SELECT * FROM tags WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      id,
    );
    return row ? mapTagRow(row) : null;
  }

  async create(input: CreateTagInput): Promise<Tag> {
    const trimmedName = input.name.trim();
    if (!trimmedName) {
      throw new Error('Tag name is required.');
    }

    const db = await this.getDb();
    const duplicate = await db.getFirstAsync<TagRow>(
      'SELECT * FROM tags WHERE LOWER(name) = LOWER(?) AND deleted_at IS NULL LIMIT 1',
      trimmedName,
    );
    if (duplicate) {
      if (duplicate.is_archived === 1) {
        return this.update(duplicate.id, {
          name: trimmedName,
          color: input.color || duplicate.color || '#10B981',
          isArchived: false,
        });
      }
      throw new Error('A tag with this name already exists.');
    }

    const id = input.id ?? generateUUID();
    const now = new Date().toISOString();

    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `INSERT INTO tags (id, name, color, is_archived, deleted_at, created_at, updated_at)
         VALUES (?, ?, ?, 0, NULL, ?, ?)`,
        id,
        trimmedName,
        input.color || '#10B981',
        now,
        now,
      );
      await enqueueOutboxChangeIfLinked(db, {
        entityType: 'tag',
        entityId: id,
        operation: 'upsert',
        localUpdatedAt: now,
      });
    });

    const created = await this.getById(id);
    if (!created) {
      throw new Error('Failed to load created tag.');
    }
    return created;
  }

  async update(id: string, input: UpdateTagInput): Promise<Tag> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error('Tag not found.');
    }

    const nextName = (input.name ?? existing.name).trim();
    if (!nextName) {
      throw new Error('Tag name cannot be empty.');
    }

    const db = await this.getDb();
    if (nextName.toLowerCase() !== existing.name.toLowerCase()) {
      const duplicate = await db.getFirstAsync<Pick<TagRow, 'id'>>(
        'SELECT id FROM tags WHERE LOWER(name) = LOWER(?) AND id != ? AND deleted_at IS NULL LIMIT 1',
        nextName,
        id,
      );
      if (duplicate) {
        throw new Error('A tag with this name already exists.');
      }
    }

    const now = new Date().toISOString();
    const nextArchived =
      input.isArchived !== undefined ? input.isArchived : existing.isArchived;

    await db.withTransactionAsync(async () => {
      await db.runAsync(
        'UPDATE tags SET name = ?, color = ?, is_archived = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
        nextName,
        input.color ?? existing.color,
        nextArchived ? 1 : 0,
        now,
        id,
      );
      await enqueueOutboxChangeIfLinked(db, {
        entityType: 'tag',
        entityId: id,
        operation: 'upsert',
        localUpdatedAt: now,
      });
    });

    const updated = await this.getById(id);
    if (!updated) {
      throw new Error('Failed to load updated tag.');
    }
    return updated;
  }

  async delete(id: string): Promise<void> {
    const db = await this.getDb();
    const now = new Date().toISOString();
    await db.withTransactionAsync(async () => {
      const affectedLinks = await db.getAllAsync<Pick<TransactionTagRow, 'transaction_id'>>(
        'SELECT transaction_id FROM transaction_tags WHERE tag_id = ? AND deleted_at IS NULL',
        id,
      );
      await db.runAsync(
        'UPDATE transaction_tags SET deleted_at = ?, updated_at = ? WHERE tag_id = ? AND deleted_at IS NULL',
        now,
        now,
        id,
      );
      for (const link of affectedLinks) {
        await enqueueOutboxChangeIfLinked(db, {
          entityType: 'transaction_tag',
          entityId: `${link.transaction_id}:${id}`,
          operation: 'delete',
          localUpdatedAt: now,
        });
      }

      await db.runAsync(
        'UPDATE tags SET deleted_at = ?, updated_at = ? WHERE id = ?',
        now,
        now,
        id,
      );
      await enqueueOutboxChangeIfLinked(db, {
        entityType: 'tag',
        entityId: id,
        operation: 'delete',
        localUpdatedAt: now,
      });
    });
  }
}
