import type { CurrencyConfig } from '@/constants/currencies';
import type { SqlDatabaseAdapter } from '@/database/driver';
import type { CurrencyCatalogRow, ICurrencyRepository } from '@/types/database';

import { mapCurrencyCatalogRow } from './mappers';

export class SQLiteCurrencyRepository implements ICurrencyRepository {
  constructor(private readonly getDb: () => Promise<SqlDatabaseAdapter>) {}

  async getAll(): Promise<CurrencyConfig[]> {
    const db = await this.getDb();
    const rows = await db.getAllAsync<CurrencyCatalogRow>(
      'SELECT * FROM currency_catalog ORDER BY code ASC',
    );
    return rows.map(mapCurrencyCatalogRow);
  }

  async upsertMany(currencies: readonly CurrencyConfig[]): Promise<void> {
    if (currencies.length === 0) return;
    const db = await this.getDb();
    const now = new Date().toISOString();

    await db.withTransactionAsync(async () => {
      for (const curr of currencies) {
        await db.runAsync(
          `INSERT INTO currency_catalog (code, name, symbol, minor_units, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(code) DO UPDATE SET
             name = excluded.name,
             symbol = excluded.symbol,
             minor_units = excluded.minor_units,
             updated_at = excluded.updated_at`,
          curr.code.trim().toUpperCase(),
          curr.name.trim(),
          curr.symbol.trim() || curr.code.trim().toUpperCase(),
          curr.minorUnits,
          now,
        );
      }
    });
  }
}
