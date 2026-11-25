import {
  FALLBACK_CURRENCIES,
  isValidIsoCurrencyCode,
  resolveCurrencyMinorUnits,
  type CurrencyConfig,
} from '@/constants/currencies';
import type { ICurrencyRepository } from '@/types/database';

interface RestCountryCurrencyEntry {
  name?: string;
  symbol?: string;
}

interface RestCountryResponseItem {
  currencies?: Record<string, RestCountryCurrencyEntry>;
}

const CURRENCY_METADATA_URL = 'https://restcountries.com/v3.1/all?fields=currencies';

export function mergeCurrencyCatalog(
  remoteOrCached: readonly CurrencyConfig[],
): CurrencyConfig[] {
  const map = new Map<string, CurrencyConfig>();

  for (const item of remoteOrCached) {
    const code = item.code.trim().toUpperCase();
    if (!isValidIsoCurrencyCode(code)) continue;
    map.set(code, {
      code,
      name: item.name.trim() || code,
      symbol: item.symbol.trim() || code,
      minorUnits: Number.isInteger(item.minorUnits)
        ? item.minorUnits
        : resolveCurrencyMinorUnits(code),
    });
  }

  // Ensure curated fallback symbols and precision always remain intact
  for (const fallback of FALLBACK_CURRENCIES) {
    map.set(fallback.code, fallback);
  }

  return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * Fetches ISO 4217 currency names and symbols (metadata only — never exchange rates).
 * Safe to fail offline: returns cached or fallback list without throwing.
 */
export async function fetchRemoteCurrencyMetadata(
  timeoutMs: number = 4500,
): Promise<CurrencyConfig[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(CURRENCY_METADATA_URL, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as RestCountryResponseItem[];
    if (!Array.isArray(payload)) {
      return null;
    }

    const discovered = new Map<string, CurrencyConfig>();
    for (const country of payload) {
      if (!country || typeof country.currencies !== 'object' || !country.currencies) {
        continue;
      }
      for (const [rawCode, entry] of Object.entries(country.currencies)) {
        const code = rawCode.trim().toUpperCase();
        if (!isValidIsoCurrencyCode(code)) continue;
        if (!discovered.has(code)) {
          discovered.set(code, {
            code,
            name: entry?.name?.trim() || code,
            symbol: entry?.symbol?.trim() || code,
            minorUnits: resolveCurrencyMinorUnits(code),
          });
        }
      }
    }

    if (discovered.size === 0) {
      return null;
    }

    return mergeCurrencyCatalog(Array.from(discovered.values()));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function syncCurrencyCatalog(
  currencyRepo: ICurrencyRepository,
): Promise<CurrencyConfig[]> {
  const cached = await currencyRepo.getAll();
  const remote = await fetchRemoteCurrencyMetadata();
  if (remote && remote.length > 0) {
    await currencyRepo.upsertMany(remote);
    return remote;
  }

  if (cached.length > 0) {
    return mergeCurrencyCatalog(cached);
  }

  return mergeCurrencyCatalog(FALLBACK_CURRENCIES);
}
