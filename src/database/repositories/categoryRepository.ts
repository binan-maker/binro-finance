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
    sql += ' ORDER BY CASE WHEN parent_id IS NULL THEN 0 ELSE 1 END, is_default DESC, name ASC';

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

  private async validateParentId(
    parentId: string | null | undefined,
    type: CategoryType,
    selfId?: string,
  ): Promise<string | null> {
    if (!parentId) return null;
    if (selfId && parentId === selfId) {
      throw new Error('A category cannot be its own parent.');
    }
    const parent = await this.getById(parentId);
    if (!parent) {
      throw new Error('Selected parent category does not exist.');
    }
    if (parent.type !== type) {
      throw new Error('Subcategory must have the same type as its parent category.');
    }
    if (parent.parentId !== null) {
      throw new Error('Subcategories cannot be nested more than one level.');
    }
    return parent.id;
  }

  async create(input: CreateCategoryInput): Promise<Category> {
    const trimmedName = input.name.trim();
    if (!trimmedName) {
      throw new Error('Category name is required.');
    }

    const parentId = await this.validateParentId(input.parentId, input.type);

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
          parentId,
          icon: input.icon,
          color: input.color,
          imageUri: input.imageUri ?? null,
          isArchived: false,
        });
      }
      throw new Error('A category with this name already exists.');
    }

    const id = input.id ?? generateUUID();
    const now = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO categories (
        id, name, type, parent_id, icon, color, image_uri, is_default, is_archived, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      id,
      trimmedName,
      input.type,
      parentId,
      input.icon,
      input.color,
      input.imageUri ?? null,
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

    const nextParentId =
      input.parentId !== undefined
        ? await this.validateParentId(input.parentId, existing.type, id)
        : existing.parentId;

    const db = await this.getDb();
    if (nextName.toLowerCase() !== existing.name.toLowerCase()) {
      const duplicate = await db.getFirstAsync<Pick<CategoryRow, 'id'>>(
        'SELECT id FROM categories WHERE LOWER(name) = LOWER(?) AND type = ? AND id != ? LIMIT 1',
        nextName,
        existing.type,
        id,
      );
      if (duplicate) {
        throw new Error('A category with this name already exists.');
      }
    }

    const nextImageUri =
      input.imageUri !== undefined
        ? input.imageUri?.trim() || null
        : existing.imageUri;

    const now = new Date().toISOString();

    await db.runAsync(
      `UPDATE categories
       SET name = ?, parent_id = ?, icon = ?, color = ?, image_uri = ?, is_archived = ?, updated_at = ?
       WHERE id = ?`,
      nextName,
      nextParentId,
      input.icon ?? existing.icon,
      input.color ?? existing.color,
      nextImageUri,
      input.isArchived !== undefined ? (input.isArchived ? 1 : 0) : existing.isArchived ? 1 : 0,
      now,
      id,
    );

    const updated = await this.getById(id);
    if (!updated) {
      throw new Error('Failed to load updated category.');
    }
    return updated;
  }
}
