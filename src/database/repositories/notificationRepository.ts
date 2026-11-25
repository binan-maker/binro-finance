import type { SqlDatabaseAdapter } from '@/database/driver';
import type {
  CreateNotificationInput,
  INotificationRepository,
  NotificationRow,
} from '@/types/database';
import type { AppNotification } from '@/types/models';
import { generateUUID } from '@/utils/uuid';

import { mapNotificationRow } from './mappers';

export class SQLiteNotificationRepository implements INotificationRepository {
  constructor(private readonly getDb: () => Promise<SqlDatabaseAdapter>) {}

  async getAll(): Promise<AppNotification[]> {
    const db = await this.getDb();
    const rows = await db.getAllAsync<NotificationRow>(
      'SELECT * FROM notifications ORDER BY created_at DESC LIMIT 100',
    );
    return rows.map(mapNotificationRow);
  }

  async create(input: CreateNotificationInput): Promise<AppNotification> {
    const db = await this.getDb();
    const id = input.id ?? generateUUID();
    const now = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO notifications (
        id, type, title, body, is_read, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, 0, ?, ?)`,
      id,
      input.type,
      input.title.trim(),
      input.body.trim(),
      input.metadataJson ?? null,
      now,
    );

    const row = await db.getFirstAsync<NotificationRow>(
      'SELECT * FROM notifications WHERE id = ? LIMIT 1',
      id,
    );
    if (!row) {
      throw new Error('Failed to load created notification.');
    }
    return mapNotificationRow(row);
  }

  async markAsRead(id: string): Promise<void> {
    const db = await this.getDb();
    await db.runAsync('UPDATE notifications SET is_read = 1 WHERE id = ?', id);
  }

  async markAllAsRead(): Promise<void> {
    const db = await this.getDb();
    await db.runAsync('UPDATE notifications SET is_read = 1 WHERE is_read = 0');
  }
}
