export interface CurrencyConfig {
  code: string;
  symbol: string;
  name: string;
  minorUnits: number; // digits after decimal point (e.g., 2 for INR/USD, 0 for JPY)
}

export const SUPPORTED_CURRENCIES: readonly CurrencyConfig[] = [
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', minorUnits: 2 },
  { code: 'USD', symbol: '$', name: 'US Dollar', minorUnits: 2 },
  { code: 'EUR', symbol: '€', name: 'Euro', minorUnits: 2 },
  { code: 'GBP', symbol: '£', name: 'British Pound', minorUnits: 2 },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham', minorUnits: 2 },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', minorUnits: 2 },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', minorUnits: 2 },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', minorUnits: 2 },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', minorUnits: 0 },
] as const;

export const DEFAULT_CURRENCY_CODE = 'INR';

export function getCurrencyConfig(code: string): CurrencyConfig {
  return (
    SUPPORTED_CURRENCIES.find((c) => c.code === code) ?? {
      code: DEFAULT_CURRENCY_CODE,
      symbol: '₹',
      name: 'Indian Rupee',
      minorUnits: 2,
    }
  );
}
