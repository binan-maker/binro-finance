import type { SqlDatabaseAdapter } from '@/database/driver';

import { SQLiteBackupRepository } from './backupRepository';
import { SQLiteBudgetRepository } from './budgetRepository';
import { SQLiteCategoryRepository } from './categoryRepository';
import { SQLiteCurrencyRepository } from './currencyRepository';
import { SQLiteNotificationRepository } from './notificationRepository';
import { SQLitePaymentMethodRepository } from './paymentMethodRepository';
import { SQLiteSettingsRepository } from './settingsRepository';
import { SQLiteSyncRepository } from './syncRepository';
import { SQLiteTagRepository } from './tagRepository';
import { SQLiteTransactionRepository } from './transactionRepository';

export function createRepositories(getDb: () => Promise<SqlDatabaseAdapter>) {
  return {
    transactions: new SQLiteTransactionRepository(getDb),
    categories: new SQLiteCategoryRepository(getDb),
    tags: new SQLiteTagRepository(getDb),
    paymentMethods: new SQLitePaymentMethodRepository(getDb),
    currencies: new SQLiteCurrencyRepository(getDb),
    budgets: new SQLiteBudgetRepository(getDb),
    settings: new SQLiteSettingsRepository(getDb),
    notifications: new SQLiteNotificationRepository(getDb),
    backup: new SQLiteBackupRepository(getDb),
    sync: new SQLiteSyncRepository(getDb),
  };
}

export {
  SQLiteBackupRepository,
  SQLiteBudgetRepository,
  SQLiteCategoryRepository,
  SQLiteCurrencyRepository,
  SQLiteNotificationRepository,
  SQLitePaymentMethodRepository,
  SQLiteSettingsRepository,
  SQLiteSyncRepository,
  SQLiteTagRepository,
  SQLiteTransactionRepository,
};
