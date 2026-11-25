import { getDatabase } from '@/database';

import { createRepositories } from './factory';

export const repositories = createRepositories(getDatabase);

export {
  createRepositories,
  SQLiteBackupRepository,
  SQLiteBudgetRepository,
  SQLiteCategoryRepository,
  SQLiteSettingsRepository,
  SQLiteTransactionRepository,
} from './factory';
