import type { SqlBindValue, SqlDatabaseAdapter } from '@/database/driver';
import type {
  CategoryRow,
  CreateCategoryInput,
  ICategoryRepository,
  UpdateCategoryInput,
} from '@/types/database';
import type { Category, CategoryType } from '@/types/models';
import { generateUUID } from '@/utils/uuid';

import { mapCategoryRow } from './mappers';

export class SQLiteCategoryRepository implements ICategoryRepository {
  constructor(private readonly getDb: () => Promise<SqlDatabaseAdapter>) {}

  async getAll(options?: { type?: CategoryType; includeArchived?: boolean }): Promise<Category[]> {
    const db = await this.getDb();
    const conditions: string[] = [];
    const params: SqlBindValue[] = [];

    if (options?.type) {
      conditions.push('type = ?');
      params.push(options.type);
    }

    if (!options?.includeArchived) {
      conditions.push('is_archived = 0');
    }

    let sql = 'SELECT * FROM categories';
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }
    sql += ' ORDER BY is_default DESC, name ASC';

    const rows = await db.getAllAsync<CategoryRow>(sql, ...params);
    return rows.map(mapCategoryRow);
  }

  async getById(id: string): Promise<Category | null> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<CategoryRow>(
      'SELECT * FROM categories WHERE id = ? LIMIT 1',
      id,
    );
    return row ? mapCategoryRow(row) : null;
  }

  async create(input: CreateCategoryInput): Promise<Category> {
    const trimmedName = input.name.trim();
    if (!trimmedName) {
      throw new Error('Category name is required.');
    }

    const db = await this.getDb();
    const existingDuplicate = await db.getFirstAsync<CategoryRow>(
      'SELECT * FROM categories WHERE LOWER(name) = LOWER(?) AND type = ? LIMIT 1',
      trimmedName,
      input.type,
    );
    if (existingDuplicate) {
      if (existingDuplicate.is_archived === 1) {
        return this.update(existingDuplicate.id, {
          name: trimmedName,
          icon: input.icon,
          color: input.color,
          isArchived: false,
        });
      }
      throw new Error('A category with this name already exists.');
    }

    const id = input.id ?? generateUUID();
    const now = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO categories (
        id, name, type, icon, color, is_default, is_archived, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      id,
      trimmedName,
      input.type,
      input.icon,
      input.color,
      input.isDefault ? 1 : 0,
      now,
      now,
    );

    const created = await this.getById(id);
    if (!created) {
      throw new Error('Failed to load created category.');
    }
    return created;
  }

  async update(id: string, input: UpdateCategoryInput): Promise<Category> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error('Category not found.');
    }

    const nextName = (input.name ?? existing.name).trim();
    if (!nextName) {
      throw new Error('Category name cannot be empty.');
    }

    const db = await this.getDb();
    const now = new Date().toISOString();

    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `UPDATE categories
         SET name = ?, icon = ?, color = ?, is_archived = ?, updated_at = ?
         WHERE id = ?`,
        nextName,
        input.icon ?? existing.icon,
        input.color ?? existing.color,
        input.isArchived !== undefined ? (input.isArchived ? 1 : 0) : existing.isArchived ? 1 : 0,
        now,
        id,
      );

      // Keep snapshot aligned when user renames a category if desired, without breaking unlinked rows
      if (input.name && nextName !== existing.name) {
        await db.runAsync(
          'UPDATE transactions SET category_name_snapshot = ? WHERE category_id = ?',
          nextName,
          id,
        );
      }
    });

    const updated = await this.getById(id);
    if (!updated) {
      throw new Error('Failed to load updated category.');
    }
    return updated;
  }
}
