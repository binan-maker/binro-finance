import { getDatabase } from '@/database';

import { createRepositories } from './factory';

export const repositories = createRepositories(getDatabase);

export {
  createRepositories,
  SQLiteBackupRepository,
  SQLiteBudgetRepository,
  SQLiteCategoryRepository,
  SQLiteCurrencyRepository,
  SQLiteNotificationRepository,
  SQLitePaymentMethodRepository,
  SQLiteSettingsRepository,
  SQLiteTagRepository,
  SQLiteTransactionRepository,
} from './factory';
