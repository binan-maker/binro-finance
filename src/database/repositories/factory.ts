import type { SqlDatabaseAdapter } from '@/database/driver';

import { SQLiteBackupRepository } from './backupRepository';
import { SQLiteBudgetRepository } from './budgetRepository';
import { SQLiteCategoryRepository } from './categoryRepository';
import { SQLiteSettingsRepository } from './settingsRepository';
import { SQLiteTransactionRepository } from './transactionRepository';

export function createRepositories(getDb: () => Promise<SqlDatabaseAdapter>) {
  return {
    transactions: new SQLiteTransactionRepository(getDb),
    categories: new SQLiteCategoryRepository(getDb),
    budgets: new SQLiteBudgetRepository(getDb),
    settings: new SQLiteSettingsRepository(getDb),
    backup: new SQLiteBackupRepository(getDb),
  };
}

export {
  SQLiteBackupRepository,
  SQLiteBudgetRepository,
  SQLiteCategoryRepository,
  SQLiteSettingsRepository,
  SQLiteTransactionRepository,
};
