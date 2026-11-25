import type { SqlDatabaseAdapter } from '@/database/driver';
import type { CreateTagInput, ITagRepository, TagRow, UpdateTagInput } from '@/types/database';
import type { Tag } from '@/types/models';
import { generateUUID } from '@/utils/uuid';

import { mapTagRow } from './mappers';

export class SQLiteTagRepository implements ITagRepository {
  constructor(private readonly getDb: () => Promise<SqlDatabaseAdapter>) {}

  async getAll(): Promise<Tag[]> {
    const db = await this.getDb();
    const rows = await db.getAllAsync<TagRow>('SELECT * FROM tags ORDER BY name ASC');
    return rows.map(mapTagRow);
  }

  async getById(id: string): Promise<Tag | null> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<TagRow>('SELECT * FROM tags WHERE id = ? LIMIT 1', id);
    return row ? mapTagRow(row) : null;
  }

  async create(input: CreateTagInput): Promise<Tag> {
    const trimmedName = input.name.trim();
    if (!trimmedName) {
      throw new Error('Tag name is required.');
    }

    const db = await this.getDb();
    const duplicate = await db.getFirstAsync<Pick<TagRow, 'id'>>(
      'SELECT id FROM tags WHERE LOWER(name) = LOWER(?) LIMIT 1',
      trimmedName,
    );
    if (duplicate) {
      throw new Error('A tag with this name already exists.');
    }

    const id = input.id ?? generateUUID();
    const now = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO tags (id, name, color, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      id,
      trimmedName,
      input.color || '#10B981',
      now,
      now,
    );

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
        'SELECT id FROM tags WHERE LOWER(name) = LOWER(?) AND id != ? LIMIT 1',
        nextName,
        id,
      );
      if (duplicate) {
        throw new Error('A tag with this name already exists.');
      }
    }

    const now = new Date().toISOString();
    await db.runAsync(
      'UPDATE tags SET name = ?, color = ?, updated_at = ? WHERE id = ?',
      nextName,
      input.color ?? existing.color,
      now,
      id,
    );

    const updated = await this.getById(id);
    if (!updated) {
      throw new Error('Failed to load updated tag.');
    }
    return updated;
  }

  async delete(id: string): Promise<void> {
    const db = await this.getDb();
    await db.runAsync('DELETE FROM tags WHERE id = ?', id);
  }
}
