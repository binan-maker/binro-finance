export type SqlBindValue = string | number | null;

export interface SqlRunResult {
  changes: number;
  lastInsertRowId: number;
}

/**
 * Minimal async SQLite interface matching expo-sqlite's SQLiteDatabase,
 * enabling both native Expo SQLite runtime execution and Node/Bun SQLite tests.
 */
export interface SqlDatabaseAdapter {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, ...params: SqlBindValue[]): Promise<SqlRunResult>;
  getFirstAsync<T>(source: string, ...params: SqlBindValue[]): Promise<T | null>;
  getAllAsync<T>(source: string, ...params: SqlBindValue[]): Promise<T[]>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}
