import type { SqlDatabaseAdapter } from '../driver';
import { initialMigration, seedDefaultCategories, seedDefaultSettings } from './001_initial';
import type { DatabaseMigration } from './types';

export const MIGRATIONS: readonly DatabaseMigration[] = [initialMigration];

interface UserVersionRow {
  user_version: number;
}

export async function runMigrations(db: SqlDatabaseAdapter): Promise<number> {
  await db.execAsync('PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<UserVersionRow>('PRAGMA user_version;');
  let currentVersion = row?.user_version ?? 0;

  const pending = MIGRATIONS.filter((m) => m.version > currentVersion).sort(
    (a, b) => a.version - b.version,
  );

  for (const migration of pending) {
    await db.withTransactionAsync(async () => {
      await migration.up(db);
      await db.execAsync(`PRAGMA user_version = ${migration.version};`);
    });
    currentVersion = migration.version;
  }

  // Ensure default seed rows exist safely without duplicating if database was cleared/upgraded
  await db.withTransactionAsync(async () => {
    await seedDefaultSettings(db);
    await seedDefaultCategories(db);
  });

  return currentVersion;
}
