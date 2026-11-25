import * as SQLite from 'expo-sqlite';

import type { SqlDatabaseAdapter } from './driver';
import { runMigrations } from './migrations';
import { DATABASE_NAME } from './schema';

let dbInstance: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function initializeDatabase(): Promise<SqlDatabaseAdapter> {
  if (dbInstance) {
    return dbInstance;
  }

  if (!initPromise) {
    initPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      await runMigrations(db);
      dbInstance = db;
      return db;
    })().catch((error) => {
      initPromise = null;
      throw error;
    });
  }

  return initPromise;
}

export async function getDatabase(): Promise<SqlDatabaseAdapter> {
  return initializeDatabase();
}
