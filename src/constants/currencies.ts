export interface CurrencyConfig {
  code: string;
  symbol: string;
  name: string;
  minorUnits: number; // digits after decimal point (e.g., 2 for INR/USD, 0 for JPY, 3 for KWD)
}

/**
 * Comprehensive offline ISO 4217 currency catalog with verified symbols and decimal precision.
 * All records remain functional completely offline.
 */
export const FALLBACK_CURRENCIES: readonly CurrencyConfig[] = [
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', minorUnits: 2 },
  { code: 'USD', symbol: '$', name: 'US Dollar', minorUnits: 2 },
  { code: 'EUR', symbol: '€', name: 'Euro', minorUnits: 2 },
  { code: 'GBP', symbol: '£', name: 'British Pound', minorUnits: 2 },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham', minorUnits: 2 },
  { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal', minorUnits: 2 },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', minorUnits: 2 },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', minorUnits: 2 },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', minorUnits: 2 },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', minorUnits: 0 },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc', minorUnits: 2 },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan', minorUnits: 2 },
  { code: 'KWD', symbol: 'د.ك', name: 'Kuwaiti Dinar', minorUnits: 3 },
  { code: 'BHD', symbol: '.د.ب', name: 'Bahraini Dinar', minorUnits: 3 },
  { code: 'OMR', symbol: '﷼', name: 'Omani Rial', minorUnits: 3 },
  { code: 'QAR', symbol: '﷼', name: 'Qatari Riyal', minorUnits: 2 },
  { code: 'AFN', symbol: '؋', name: 'Afghan Afghani', minorUnits: 2 },
  { code: 'ALL', symbol: 'L', name: 'Albanian Lek', minorUnits: 2 },
  { code: 'AMD', symbol: '֏', name: 'Armenian Dram', minorUnits: 2 },
  { code: 'ANG', symbol: 'ƒ', name: 'Netherlands Antillean Guilder', minorUnits: 2 },
  { code: 'AOA', symbol: 'Kz', name: 'Angolan Kwanza', minorUnits: 2 },
  { code: 'ARS', symbol: 'ARS$', name: 'Argentine Peso', minorUnits: 2 },
  { code: 'AWG', symbol: 'ƒ', name: 'Aruban Florin', minorUnits: 2 },
  { code: 'AZN', symbol: '₼', name: 'Azerbaijani Manat', minorUnits: 2 },
  { code: 'BAM', symbol: 'KM', name: 'Bosnia-Herzegovina Convertible Mark', minorUnits: 2 },
  { code: 'BBD', symbol: 'Bds$', name: 'Barbadian Dollar', minorUnits: 2 },
  { code: 'BDT', symbol: '৳', name: 'Bangladeshi Taka', minorUnits: 2 },
  { code: 'BGN', symbol: 'лв', name: 'Bulgarian Lev', minorUnits: 2 },
  { code: 'BIF', symbol: 'FBu', name: 'Burundian Franc', minorUnits: 0 },
  { code: 'BMD', symbol: 'BD$', name: 'Bermudian Dollar', minorUnits: 2 },
  { code: 'BND', symbol: 'B$', name: 'Brunei Dollar', minorUnits: 2 },
  { code: 'BOB', symbol: 'Bs.', name: 'Bolivian Boliviano', minorUnits: 2 },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real', minorUnits: 2 },
  { code: 'BSD', symbol: 'B$', name: 'Bahamian Dollar', minorUnits: 2 },
  { code: 'BTN', symbol: 'Nu.', name: 'Bhutanese Ngultrum', minorUnits: 2 },
  { code: 'BWP', symbol: 'P', name: 'Botswanan Pula', minorUnits: 2 },
  { code: 'BYN', symbol: 'Br', name: 'Belarusian Ruble', minorUnits: 2 },
  { code: 'BZD', symbol: 'BZ$', name: 'Belize Dollar', minorUnits: 2 },
  { code: 'CDF', symbol: 'FC', name: 'Congolese Franc', minorUnits: 2 },
  { code: 'CLP', symbol: 'CLP$', name: 'Chilean Peso', minorUnits: 0 },
  { code: 'COP', symbol: 'COL$', name: 'Colombian Peso', minorUnits: 2 },
  { code: 'CRC', symbol: '₡', name: 'Costa Rican Colón', minorUnits: 2 },
  { code: 'CUP', symbol: '₱', name: 'Cuban Peso', minorUnits: 2 },
  { code: 'CVE', symbol: 'Esc', name: 'Cape Verdean Escudo', minorUnits: 2 },
  { code: 'CZK', symbol: 'Kč', name: 'Czech Koruna', minorUnits: 2 },
  { code: 'DJF', symbol: 'Fdj', name: 'Djiboutian Franc', minorUnits: 0 },
  { code: 'DKK', symbol: 'kr', name: 'Danish Krone', minorUnits: 2 },
  { code: 'DOP', symbol: 'RD$', name: 'Dominican Peso', minorUnits: 2 },
  { code: 'DZD', symbol: 'د.ج', name: 'Algerian Dinar', minorUnits: 2 },
  { code: 'EGP', symbol: 'E£', name: 'Egyptian Pound', minorUnits: 2 },
  { code: 'ERN', symbol: 'Nfk', name: 'Eritrean Nakfa', minorUnits: 2 },
  { code: 'ETB', symbol: 'Br', name: 'Ethiopian Birr', minorUnits: 2 },
  { code: 'FJD', symbol: 'FJ$', name: 'Fijian Dollar', minorUnits: 2 },
  { code: 'FKP', symbol: '£', name: 'Falkland Islands Pound', minorUnits: 2 },
  { code: 'GEL', symbol: '₾', name: 'Georgian Lari', minorUnits: 2 },
  { code: 'GHS', symbol: '₵', name: 'Ghanaian Cedi', minorUnits: 2 },
  { code: 'GIP', symbol: '£', name: 'Gibraltar Pound', minorUnits: 2 },
  { code: 'GMD', symbol: 'D', name: 'Gambian Dalasi', minorUnits: 2 },
  { code: 'GNF', symbol: 'FG', name: 'Guinean Franc', minorUnits: 0 },
  { code: 'GTQ', symbol: 'Q', name: 'Guatemalan Quetzal', minorUnits: 2 },
  { code: 'GYD', symbol: 'G$', name: 'Guyanaese Dollar', minorUnits: 2 },
  { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar', minorUnits: 2 },
  { code: 'HNL', symbol: 'L', name: 'Honduran Lempira', minorUnits: 2 },
  { code: 'HTG', symbol: 'G', name: 'Haitian Gourde', minorUnits: 2 },
  { code: 'HUF', symbol: 'Ft', name: 'Hungarian Forint', minorUnits: 2 },
  { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah', minorUnits: 2 },
  { code: 'ILS', symbol: '₪', name: 'Israeli New Shekel', minorUnits: 2 },
  { code: 'IQD', symbol: 'ع.د', name: 'Iraqi Dinar', minorUnits: 3 },
  { code: 'IRR', symbol: '﷼', name: 'Iranian Rial', minorUnits: 2 },
  { code: 'ISK', symbol: 'kr', name: 'Icelandic Króna', minorUnits: 0 },
  { code: 'JMD', symbol: 'J$', name: 'Jamaican Dollar', minorUnits: 2 },
  { code: 'JOD', symbol: 'JD', name: 'Jordanian Dinar', minorUnits: 3 },
  { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling', minorUnits: 2 },
  { code: 'KGS', symbol: 'сом', name: 'Kyrgystani Som', minorUnits: 2 },
  { code: 'KHR', symbol: '៛', name: 'Cambodian Riel', minorUnits: 2 },
  { code: 'KMF', symbol: 'CF', name: 'Comorian Franc', minorUnits: 0 },
  { code: 'KPW', symbol: '₩', name: 'North Korean Won', minorUnits: 2 },
  { code: 'KRW', symbol: '₩', name: 'South Korean Won', minorUnits: 0 },
  { code: 'KYD', symbol: 'CI$', name: 'Cayman Islands Dollar', minorUnits: 2 },
  { code: 'KZT', symbol: '₸', name: 'Kazakhstani Tenge', minorUnits: 2 },
  { code: 'LAK', symbol: '₭', name: 'Laotian Kip', minorUnits: 2 },
  { code: 'LBP', symbol: 'ل.ل', name: 'Lebanese Pound', minorUnits: 2 },
  { code: 'LKR', symbol: 'Rs', name: 'Sri Lankan Rupee', minorUnits: 2 },
  { code: 'LRD', symbol: 'L$', name: 'Liberian Dollar', minorUnits: 2 },
  { code: 'LSL', symbol: 'L', name: 'Lesotho Loti', minorUnits: 2 },
  { code: 'LYD', symbol: 'ل.د', name: 'Libyan Dinar', minorUnits: 3 },
  { code: 'MAD', symbol: 'MAD', name: 'Moroccan Dirham', minorUnits: 2 },
  { code: 'MDL', symbol: 'L', name: 'Moldovan Leu', minorUnits: 2 },
  { code: 'MGA', symbol: 'Ar', name: 'Malagasy Ariary', minorUnits: 2 },
  { code: 'MKD', symbol: 'ден', name: 'Macedonian Denar', minorUnits: 2 },
  { code: 'MMK', symbol: 'K', name: 'Myanmar Kyat', minorUnits: 2 },
  { code: 'MNT', symbol: '₮', name: 'Mongolian Tugrik', minorUnits: 2 },
  { code: 'MOP', symbol: 'MOP$', name: 'Macanese Pataca', minorUnits: 2 },
  { code: 'MRU', symbol: 'UM', name: 'Mauritanian Ouguiya', minorUnits: 2 },
  { code: 'MUR', symbol: '₨', name: 'Mauritian Rupee', minorUnits: 2 },
  { code: 'MVR', symbol: 'Rf', name: 'Maldivian Rufiyaa', minorUnits: 2 },
  { code: 'MWK', symbol: 'MK', name: 'Malawian Kwacha', minorUnits: 2 },
  { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso', minorUnits: 2 },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit', minorUnits: 2 },
  { code: 'MZN', symbol: 'MT', name: 'Mozambican Metical', minorUnits: 2 },
  { code: 'NAD', symbol: 'N$', name: 'Namibian Dollar', minorUnits: 2 },
  { code: 'NGN', symbol: '₦', name: 'Nigerian Naira', minorUnits: 2 },
  { code: 'NIO', symbol: 'C$', name: 'Nicaraguan Córdoba', minorUnits: 2 },
  { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone', minorUnits: 2 },
  { code: 'NPR', symbol: 'रू', name: 'Nepalese Rupee', minorUnits: 2 },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar', minorUnits: 2 },
  { code: 'PAB', symbol: 'B/.', name: 'Panamanian Balboa', minorUnits: 2 },
  { code: 'PEN', symbol: 'S/', name: 'Peruvian Sol', minorUnits: 2 },
  { code: 'PGK', symbol: 'K', name: 'Papua New Guinean Kina', minorUnits: 2 },
  { code: 'PHP', symbol: '₱', name: 'Philippine Peso', minorUnits: 2 },
  { code: 'PKR', symbol: '₨', name: 'Pakistani Rupee', minorUnits: 2 },
  { code: 'PLN', symbol: 'zł', name: 'Polish Zloty', minorUnits: 2 },
  { code: 'PYG', symbol: '₲', name: 'Paraguayan Guarani', minorUnits: 0 },
  { code: 'RON', symbol: 'lei', name: 'Romanian Leu', minorUnits: 2 },
  { code: 'RSD', symbol: 'дин', name: 'Serbian Dinar', minorUnits: 2 },
  { code: 'RUB', symbol: '₽', name: 'Russian Ruble', minorUnits: 2 },
  { code: 'RWF', symbol: 'FRw', name: 'Rwandan Franc', minorUnits: 0 },
  { code: 'SBD', symbol: 'SI$', name: 'Solomon Islands Dollar', minorUnits: 2 },
  { code: 'SCR', symbol: '₨', name: 'Seychellois Rupee', minorUnits: 2 },
  { code: 'SDG', symbol: '£', name: 'Sudanese Pound', minorUnits: 2 },
  { code: 'SEK', symbol: 'kr', name: 'Swedish Krona', minorUnits: 2 },
  { code: 'SHP', symbol: '£', name: 'Saint Helena Pound', minorUnits: 2 },
  { code: 'SLE', symbol: 'Le', name: 'Sierra Leonean Leone', minorUnits: 2 },
  { code: 'SOS', symbol: 'Sh', name: 'Somali Shilling', minorUnits: 2 },
  { code: 'SRD', symbol: 'SR$', name: 'Surinamese Dollar', minorUnits: 2 },
  { code: 'SSP', symbol: '£', name: 'South Sudanese Pound', minorUnits: 2 },
  { code: 'STN', symbol: 'Db', name: 'São Tomé and Príncipe Dobra', minorUnits: 2 },
  { code: 'SYP', symbol: '£S', name: 'Syrian Pound', minorUnits: 2 },
  { code: 'SZL', symbol: 'L', name: 'Swazi Lilangeni', minorUnits: 2 },
  { code: 'THB', symbol: '฿', name: 'Thai Baht', minorUnits: 2 },
  { code: 'TJS', symbol: 'SM', name: 'Tajikistani Somoni', minorUnits: 2 },
  { code: 'TMT', symbol: 'T', name: 'Turkmenistani Manat', minorUnits: 2 },
  { code: 'TND', symbol: 'د.ت', name: 'Tunisian Dinar', minorUnits: 3 },
  { code: 'TOP', symbol: 'T$', name: 'Tongan Paʻanga', minorUnits: 2 },
  { code: 'TRY', symbol: '₺', name: 'Turkish Lira', minorUnits: 2 },
  { code: 'TTD', symbol: 'TT$', name: 'Trinidad and Tobago Dollar', minorUnits: 2 },
  { code: 'TWD', symbol: 'NT$', name: 'New Taiwan Dollar', minorUnits: 2 },
  { code: 'TZS', symbol: 'TSh', name: 'Tanzanian Shilling', minorUnits: 2 },
  { code: 'UAH', symbol: '₴', name: 'Ukrainian Hryvnia', minorUnits: 2 },
  { code: 'UGX', symbol: 'USh', name: 'Ugandan Shilling', minorUnits: 0 },
  { code: 'UYU', symbol: '$U', name: 'Uruguayan Peso', minorUnits: 2 },
  { code: 'UZS', symbol: 'soʻm', name: 'Uzbekistani Som', minorUnits: 2 },
  { code: 'VES', symbol: 'Bs.S', name: 'Venezuelan Bolívar', minorUnits: 2 },
  { code: 'VND', symbol: '₫', name: 'Vietnamese Dong', minorUnits: 0 },
  { code: 'VUV', symbol: 'VT', name: 'Vanuatu Vatu', minorUnits: 0 },
  { code: 'WST', symbol: 'WS$', name: 'Samoan Tala', minorUnits: 2 },
  { code: 'XAF', symbol: 'FCFA', name: 'Central African CFA Franc', minorUnits: 0 },
  { code: 'XCD', symbol: 'EC$', name: 'East Caribbean Dollar', minorUnits: 2 },
  { code: 'XOF', symbol: 'CFA', name: 'West African CFA Franc', minorUnits: 0 },
  { code: 'XPF', symbol: '₣', name: 'CFP Franc', minorUnits: 0 },
  { code: 'YER', symbol: '﷼', name: 'Yemeni Rial', minorUnits: 2 },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand', minorUnits: 2 },
  { code: 'ZMW', symbol: 'ZK', name: 'Zambian Kwacha', minorUnits: 2 },
  { code: 'ZWL', symbol: 'Z$', name: 'Zimbabwean Dollar', minorUnits: 2 },
] as const;

// Backwards-compatible alias used in onboarding, settings, and validation
export const SUPPORTED_CURRENCIES = FALLBACK_CURRENCIES;

export const DEFAULT_CURRENCY_CODE = 'INR';
export const NEUTRAL_FALLBACK_CURRENCY_CODE = 'USD';

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
