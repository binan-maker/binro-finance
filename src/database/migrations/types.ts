import type { SqlDatabaseAdapter } from '../driver';

export interface DatabaseMigration {
  version: number;
  name: string;
  up: (db: SqlDatabaseAdapter) => Promise<void>;
}
