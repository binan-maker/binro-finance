export interface CurrencyConfig {
  code: string;
  symbol: string;
  name: string;
  minorUnits: number; // digits after decimal point (e.g., 2 for INR/USD, 0 for JPY, 3 for KWD)
}

export const FALLBACK_CURRENCIES: readonly CurrencyConfig[] = [
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', minorUnits: 2 },
  { code: 'USD', symbol: '$', name: 'US Dollar', minorUnits: 2 },
  { code: 'EUR', symbol: '€', name: 'Euro', minorUnits: 2 },
  { code: 'GBP', symbol: '£', name: 'British Pound', minorUnits: 2 },
  { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal', minorUnits: 2 },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham', minorUnits: 2 },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', minorUnits: 2 },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', minorUnits: 2 },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', minorUnits: 2 },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', minorUnits: 0 },
  { code: 'KWD', symbol: 'د.ك', name: 'Kuwaiti Dinar', minorUnits: 3 },
  { code: 'BHD', symbol: '.د.ب', name: 'Bahraini Dinar', minorUnits: 3 },
  { code: 'OMR', symbol: '﷼', name: 'Omani Rial', minorUnits: 3 },
  { code: 'QAR', symbol: '﷼', name: 'Qatari Riyal', minorUnits: 2 },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc', minorUnits: 2 },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan', minorUnits: 2 },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit', minorUnits: 2 },
  { code: 'THB', symbol: '฿', name: 'Thai Baht', minorUnits: 2 },
  { code: 'KRW', symbol: '₩', name: 'South Korean Won', minorUnits: 0 },
  { code: 'VND', symbol: '₫', name: 'Vietnamese Dong', minorUnits: 0 },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar', minorUnits: 2 },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand', minorUnits: 2 },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real', minorUnits: 2 },
  { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso', minorUnits: 2 },
] as const;

// Backwards-compatible alias used in onboarding, settings, and validation
export const SUPPORTED_CURRENCIES = FALLBACK_CURRENCIES;

export const DEFAULT_CURRENCY_CODE = 'INR';

const ZERO_DECIMAL_CODES = new Set([
  'BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG',
  'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
]);

const THREE_DECIMAL_CODES = new Set([
  'BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND',
]);

/**
 * Resolves ISO 4217 decimal precision without assuming 2 decimal places.
 */
export function resolveCurrencyMinorUnits(code: string): number {
  const upper = code.trim().toUpperCase();
  const known = FALLBACK_CURRENCIES.find((c) => c.code === upper);
  if (known) return known.minorUnits;
  if (ZERO_DECIMAL_CODES.has(upper)) return 0;
  if (THREE_DECIMAL_CODES.has(upper)) return 3;

  try {
    const resolved = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: upper,
    }).resolvedOptions();
    if (typeof resolved.maximumFractionDigits === 'number') {
      return resolved.maximumFractionDigits;
    }
  } catch {
    // Fallback below if currency code is unknown to Intl
  }

  return 2;
}

export function isValidIsoCurrencyCode(code: string): boolean {
  return /^[A-Z]{3}$/.test(code.trim().toUpperCase());
}

export function getCurrencyConfig(
  code: string,
  catalog?: readonly CurrencyConfig[],
): CurrencyConfig {
  const normalized = code.trim().toUpperCase();
  if (catalog && catalog.length > 0) {
    const fromCatalog = catalog.find((c) => c.code === normalized);
    if (fromCatalog) return fromCatalog;
  }

  const fromFallback = FALLBACK_CURRENCIES.find((c) => c.code === normalized);
  if (fromFallback) return fromFallback;

  if (isValidIsoCurrencyCode(normalized)) {
    return {
      code: normalized,
      symbol: normalized,
      name: normalized,
      minorUnits: resolveCurrencyMinorUnits(normalized),
    };
  }

  return {
    code: DEFAULT_CURRENCY_CODE,
    symbol: '₹',
    name: 'Indian Rupee',
    minorUnits: 2,
  };
}
