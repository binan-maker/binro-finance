import { DEFAULT_CURRENCY_CODE, isValidIsoCurrencyCode } from '@/constants/currencies';
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
          id, currency_code, opening_balance_minor, opening_balance_currency_code,
          theme, date_format, onboarding_completed
        ) VALUES (1, ?, 0, ?, 'system', 'DD MMM YYYY', 0)`,
        DEFAULT_CURRENCY_CODE,
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
    const nextCurrency = (input.currencyCode ?? current.currencyCode).trim().toUpperCase();
    if (!isValidIsoCurrencyCode(nextCurrency)) {
      throw new Error('Unsupported currency code.');
    }

    const nextOpeningCurrency = (
      input.openingBalanceCurrencyCode ?? current.openingBalanceCurrencyCode
    )
      .trim()
      .toUpperCase();
    if (!isValidIsoCurrencyCode(nextOpeningCurrency)) {
      throw new Error('Unsupported opening balance currency code.');
    }

    const nextOpeningBalance =
      input.openingBalanceMinor !== undefined
        ? input.openingBalanceMinor
        : current.openingBalanceMinor;

    if (!Number.isSafeInteger(nextOpeningBalance) || nextOpeningBalance < 0) {
      throw new Error('Opening balance must be a non-negative integer in minor units.');
    }

    const nextProfileName =
      input.profileName !== undefined
        ? input.profileName?.trim() || null
        : current.profileName;
    const nextProfileBio =
      input.profileBio !== undefined
        ? input.profileBio?.trim() || null
        : current.profileBio;
    const nextProfileAvatar =
      input.profileAvatar !== undefined
        ? input.profileAvatar?.trim() || null
        : current.profileAvatar;
    const nextCurrencyInitialized =
      input.currencyInitialized !== undefined
        ? input.currencyInitialized
        : input.currencyCode !== undefined
          ? true
          : current.currencyInitialized;

    const db = await this.getDb();
    await db.runAsync(
      `UPDATE app_settings
       SET currency_code = ?,
           opening_balance_minor = ?,
           opening_balance_currency_code = ?,
           theme = ?,
           date_format = ?,
           onboarding_completed = ?,
           profile_name = ?,
           profile_bio = ?,
           profile_avatar = ?,
           currency_initialized = ?
       WHERE id = 1`,
      nextCurrency,
      nextOpeningBalance,
      nextOpeningCurrency,
      input.theme ?? current.theme,
      input.dateFormat ?? current.dateFormat,
      input.onboardingCompleted !== undefined
        ? input.onboardingCompleted
          ? 1
          : 0
        : current.onboardingCompleted
          ? 1
          : 0,
      nextProfileName,
      nextProfileBio,
      nextProfileAvatar,
      nextCurrencyInitialized ? 1 : 0,
    );

    return this.get();
  }
}
