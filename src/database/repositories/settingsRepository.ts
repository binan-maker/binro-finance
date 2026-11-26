import { DEFAULT_CURRENCY_CODE, isValidIsoCurrencyCode } from '@/constants/currencies';
import type { SqlDatabaseAdapter } from '@/database/driver';
import { isLocalRelativeImagePath } from '@/services/images/mediaPathUtils';
import type { AppSettingsRow, ISettingsRepository, UpdateSettingsInput } from '@/types/database';
import type { AppSettings } from '@/types/models';

import { mapSettingsRow } from './mappers';
import {
  enqueueOutboxChangeIfLinked,
  markLocalMediaPendingDelete,
  trackLocalMediaPendingUpload,
} from './syncRepository';

export class SQLiteSettingsRepository implements ISettingsRepository {
  constructor(private readonly getDb: () => Promise<SqlDatabaseAdapter>) {}

  async get(): Promise<AppSettings> {
    const db = await this.getDb();
    const row = await db.getFirstAsync<AppSettingsRow>(
      'SELECT * FROM app_settings WHERE id = 1 LIMIT 1',
    );
    if (!row) {
      const now = new Date().toISOString();
      await db.runAsync(
        `INSERT OR IGNORE INTO app_settings (
          id, currency_code, opening_balance_minor, opening_balance_currency_code,
          theme, date_format, onboarding_completed, updated_at
        ) VALUES (1, ?, 0, ?, 'system', 'DD MMM YYYY', 0, ?)`,
        DEFAULT_CURRENCY_CODE,
        DEFAULT_CURRENCY_CODE,
        now,
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
    const nextShowHomeBudgetShortcut =
      input.showHomeBudgetShortcut !== undefined
        ? input.showHomeBudgetShortcut
        : current.showHomeBudgetShortcut;
    const nextGender = input.gender !== undefined ? input.gender : current.gender;
    const nextDateOfBirth =
      input.dateOfBirth !== undefined
        ? input.dateOfBirth?.trim() || null
        : current.dateOfBirth;
    const nextGoogleName =
      input.googleName !== undefined
        ? input.googleName?.trim() || null
        : current.googleName;
    const nextGoogleEmail =
      input.googleEmail !== undefined
        ? input.googleEmail?.trim() || null
        : current.googleEmail;
    const nextGoogleAvatarUrl =
      input.googleAvatarUrl !== undefined
        ? input.googleAvatarUrl?.trim() || null
        : current.googleAvatarUrl;
    const nextProfileCompletedAt =
      input.profileCompletedAt !== undefined
        ? input.profileCompletedAt?.trim() || null
        : current.profileCompletedAt;

    const now = new Date().toISOString();

    const profileChanged =
      input.profileName !== undefined ||
      input.profileBio !== undefined ||
      input.profileAvatar !== undefined ||
      input.gender !== undefined ||
      input.dateOfBirth !== undefined ||
      input.googleName !== undefined ||
      input.googleEmail !== undefined ||
      input.googleAvatarUrl !== undefined ||
      input.profileCompletedAt !== undefined;

    const settingsChanged =
      input.currencyCode !== undefined ||
      input.openingBalanceMinor !== undefined ||
      input.openingBalanceCurrencyCode !== undefined ||
      input.theme !== undefined ||
      input.dateFormat !== undefined ||
      input.onboardingCompleted !== undefined ||
      input.currencyInitialized !== undefined ||
      input.showHomeBudgetShortcut !== undefined;

    const db = await this.getDb();
    await db.withTransactionAsync(async () => {
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
             currency_initialized = ?,
             show_home_budget_shortcut = ?,
             gender = ?,
             date_of_birth = ?,
             google_name = ?,
             google_email = ?,
             google_avatar_url = ?,
             profile_completed_at = ?,
             updated_at = ?
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
        nextShowHomeBudgetShortcut ? 1 : 0,
        nextGender,
        nextDateOfBirth,
        nextGoogleName,
        nextGoogleEmail,
        nextGoogleAvatarUrl,
        nextProfileCompletedAt,
        now,
      );

      if (
        current.profileAvatar &&
        current.profileAvatar !== nextProfileAvatar &&
        isLocalRelativeImagePath(current.profileAvatar)
      ) {
        await markLocalMediaPendingDelete(db, current.profileAvatar);
      }

      if (
        nextProfileAvatar &&
        nextProfileAvatar !== current.profileAvatar &&
        isLocalRelativeImagePath(nextProfileAvatar)
      ) {
        await trackLocalMediaPendingUpload(db, {
          localPath: nextProfileAvatar,
          entityType: 'profile',
          entityId: 'self',
        });
      }

      if (profileChanged) {
        await enqueueOutboxChangeIfLinked(db, {
          entityType: 'profile',
          entityId: 'self',
          operation: 'upsert',
          localUpdatedAt: now,
        });
      }

      if (settingsChanged || !profileChanged) {
        await enqueueOutboxChangeIfLinked(db, {
          entityType: 'settings',
          entityId: 'self',
          operation: 'upsert',
          localUpdatedAt: now,
        });
      }
    });

    return this.get();
  }
}
