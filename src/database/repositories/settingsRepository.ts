import { DEFAULT_CURRENCY_CODE } from '@/constants/currencies';
import type { SqlDatabaseAdapter } from '@/database/driver';
import type { AppSettingsRow, ISettingsRepository, UpdateSettingsInput } from '@/types/database';
import type { AppSettings } from '@/types/models';

import { mapSettingsRow } from './mappers';

export class SQLiteSettingsRepository implements ISettingsRepository {
  constructor(private readonly getDb: () => Promise<SqlDatabaseAdapter>) {}

  async get(): Promise<AppSettings> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<AppSettingsRow>(
      'SELECT * FROM app_settings WHERE id = 1 LIMIT 1',
    );
    if (!row) {
      await db.runAsync(
        `INSERT OR IGNORE INTO app_settings (
          id, currency_code, opening_balance_minor, theme, date_format, onboarding_completed
        ) VALUES (1, ?, 0, 'system', 'DD MMM YYYY', 0)`,
        DEFAULT_CURRENCY_CODE,
      );
      const seeded = await db.getFirstAsync<AppSettingsRow>(
        'SELECT * FROM app_settings WHERE id = 1 LIMIT 1',
      );
      if (!seeded) {
        throw new Error('Failed to load application settings.');
      }
      return mapSettingsRow(seeded);
    }
    return mapSettingsRow(row);
  }

  async update(input: UpdateSettingsInput): Promise<AppSettings> {
    const current = await this.get();
    const nextOpeningBalance =
      input.openingBalanceMinor !== undefined
        ? input.openingBalanceMinor
        : current.openingBalanceMinor;

    if (!Number.isInteger(nextOpeningBalance) || nextOpeningBalance < 0) {
      throw new Error('Opening balance must be a non-negative integer in minor units.');
    }

    const db = await this.getDb();
    await db.runAsync(
      `UPDATE app_settings
       SET currency_code = ?,
           opening_balance_minor = ?,
           theme = ?,
           date_format = ?,
           onboarding_completed = ?
       WHERE id = 1`,
      input.currencyCode ?? current.currencyCode,
      nextOpeningBalance,
      input.theme ?? current.theme,
      input.dateFormat ?? current.dateFormat,
      input.onboardingCompleted !== undefined
        ? input.onboardingCompleted
          ? 1
          : 0
        : current.onboardingCompleted
          ? 1
          : 0,
    );

    return this.get();
  }
}
