import type { SqlDatabaseAdapter } from '../driver';
import { initialMigration, seedDefaultSettings } from './001_initial';
import {
  seedDefaultCurrencies,
  seedDefaultPaymentMethods,
  seedV2DefaultCategoriesSafely,
  v2RedesignMigration,
} from './002_v2_redesign';
import { v3ProfileTagsMigration } from './003_v3_profile_tags_archive';
import type { DatabaseMigration } from './types';

export const MIGRATIONS: readonly DatabaseMigration[] = [
  initialMigration,
  v2RedesignMigration,
  v3ProfileTagsMigration,
];

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

  // Ensure baseline seed rows exist safely without duplicating after partial clears or upgrades
  await db.withTransactionAsync(async () => {
    await seedDefaultSettings(db);
    await seedDefaultPaymentMethods(db);
    await seedDefaultCurrencies(db);
    await seedV2DefaultCategoriesSafely(db);
  });

  return currentVersion;
}
