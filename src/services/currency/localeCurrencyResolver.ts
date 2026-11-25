import {
  FALLBACK_CURRENCIES,
  NEUTRAL_FALLBACK_CURRENCY_CODE,
  isValidIsoCurrencyCode,
  type CurrencyConfig,
} from '@/constants/currencies';

/**
 * Maps ISO 3166-1 alpha-2 regions to their official ISO 4217 currency code.
 * Regions with no official circulating currency (e.g. AQ, GS, HM, TF, BV) map to null
 * so they safely fall back without runtime errors.
 */
export const REGION_TO_CURRENCY_MAP: Readonly<Record<string, string | null>> = {
  AD: 'EUR', AE: 'AED', AF: 'AFN', AG: 'XCD', AI: 'XCD', AL: 'ALL', AM: 'AMD', AO: 'AOA',
  AQ: null, AR: 'ARS', AS: 'USD', AT: 'EUR', AU: 'AUD', AW: 'AWG', AX: 'EUR', AZ: 'AZN',
  BA: 'BAM', BB: 'BBD', BD: 'BDT', BE: 'EUR', BF: 'XOF', BG: 'BGN', BH: 'BHD', BI: 'BIF',
  BJ: 'XOF', BL: 'EUR', BM: 'BMD', BN: 'BND', BO: 'BOB', BQ: 'USD', BR: 'BRL', BS: 'BSD',
  BT: 'BTN', BV: null, BW: 'BWP', BY: 'BYN', BZ: 'BZD',
  CA: 'CAD', CC: 'AUD', CD: 'CDF', CF: 'XAF', CG: 'XAF', CH: 'CHF', CI: 'XOF', CK: 'NZD',
  CL: 'CLP', CM: 'XAF', CN: 'CNY', CO: 'COP', CR: 'CRC', CU: 'CUP', CV: 'CVE', CW: 'ANG',
  CX: 'AUD', CY: 'EUR', CZ: 'CZK',
  DE: 'EUR', DJ: 'DJF', DK: 'DKK', DM: 'XCD', DO: 'DOP', DZ: 'DZD',
  EC: 'USD', EE: 'EUR', EG: 'EGP', EH: 'MAD', ER: 'ERN', ES: 'EUR', ET: 'ETB',
  FI: 'EUR', FJ: 'FJD', FK: 'FKP', FM: 'USD', FO: 'DKK', FR: 'EUR',
  GA: 'XAF', GB: 'GBP', GD: 'XCD', GE: 'GEL', GF: 'EUR', GG: 'GBP', GH: 'GHS', GI: 'GIP',
  GL: 'DKK', GM: 'GMD', GN: 'GNF', GP: 'EUR', GQ: 'XAF', GR: 'EUR', GS: null, GT: 'GTQ',
  GU: 'USD', GW: 'XOF', GY: 'GYD',
  HK: 'HKD', HM: null, HN: 'HNL', HR: 'EUR', HT: 'HTG', HU: 'HUF',
  ID: 'IDR', IE: 'EUR', IL: 'ILS', IM: 'GBP', IN: 'INR', IO: 'USD', IQ: 'IQD', IR: 'IRR',
  IS: 'ISK', IT: 'EUR',
  JE: 'GBP', JM: 'JMD', JO: 'JOD', JP: 'JPY',
  KE: 'KES', KG: 'KGS', KH: 'KHR', KI: 'AUD', KM: 'KMF', KN: 'XCD', KP: 'KPW', KR: 'KRW',
  KW: 'KWD', KY: 'KYD', KZ: 'KZT',
  LA: 'LAK', LB: 'LBP', LC: 'XCD', LI: 'CHF', LK: 'LKR', LR: 'LRD', LS: 'LSL', LT: 'EUR',
  LU: 'EUR', LV: 'EUR', LY: 'LYD',
  MA: 'MAD', MC: 'EUR', MD: 'MDL', ME: 'EUR', MF: 'EUR', MG: 'MGA', MH: 'USD', MK: 'MKD',
  ML: 'XOF', MM: 'MMK', MN: 'MNT', MO: 'MOP', MP: 'USD', MQ: 'EUR', MR: 'MRU', MS: 'XCD',
  MT: 'EUR', MU: 'MUR', MV: 'MVR', MW: 'MWK', MX: 'MXN', MY: 'MYR', MZ: 'MZN',
  NA: 'NAD', NC: 'XPF', NE: 'XOF', NF: 'AUD', NG: 'NGN', NI: 'NIO', NL: 'EUR', NO: 'NOK',
  NP: 'NPR', NR: 'AUD', NU: 'NZD', NZ: 'NZD',
  OM: 'OMR',
  PA: 'PAB', PE: 'PEN', PF: 'XPF', PG: 'PGK', PH: 'PHP', PK: 'PKR', PL: 'PLN', PM: 'EUR',
  PN: 'NZD', PR: 'USD', PS: 'ILS', PT: 'EUR', PW: 'USD', PY: 'PYG',
  QA: 'QAR',
  RE: 'EUR', RO: 'RON', RS: 'RSD', RU: 'RUB', RW: 'RWF',
  SA: 'SAR', SB: 'SBD', SC: 'SCR', SD: 'SDG', SE: 'SEK', SG: 'SGD', SH: 'SHP', SI: 'EUR',
  SJ: 'NOK', SK: 'EUR', SL: 'SLE', SM: 'EUR', SN: 'XOF', SO: 'SOS', SR: 'SRD', SS: 'SSP',
  ST: 'STN', SV: 'USD', SX: 'ANG', SY: 'SYP', SZ: 'SZL',
  TC: 'USD', TD: 'XAF', TF: null, TG: 'XOF', TH: 'THB', TJ: 'TJS', TK: 'NZD', TL: 'USD',
  TM: 'TMT', TN: 'TND', TO: 'TOP', TR: 'TRY', TT: 'TTD', TV: 'AUD', TW: 'TWD', TZ: 'TZS',
  UA: 'UAH', UG: 'UGX', UM: 'USD', US: 'USD', UY: 'UYU', UZ: 'UZS',
  VA: 'EUR', VC: 'XCD', VE: 'VES', VG: 'USD', VI: 'USD', VN: 'VND', VU: 'VUV',
  WF: 'XPF', WS: 'WST',
  XK: 'EUR',
  YE: 'YER', YT: 'EUR',
  ZA: 'ZAR', ZM: 'ZMW', ZW: 'ZWL',
};

export interface LocaleCurrencyCandidate {
  currencyCode?: string | null;
  regionCode?: string | null;
  languageRegionCode?: string | null;
  languageTag?: string | null;
}

const INVALID_ISO_CODES = new Set(['XXX', 'XTS', 'XAU', 'XAG', 'XPT', 'XPD']);

function isSupportedCatalogCode(
  code: string,
  catalog: readonly CurrencyConfig[],
): boolean {
  const upper = code.trim().toUpperCase();
  if (!isValidIsoCurrencyCode(upper) || INVALID_ISO_CODES.has(upper)) {
    return false;
  }
  return catalog.some((c) => c.code === upper);
}

function extractRegionFromTag(tag?: string | null): string | null {
  if (!tag) return null;
  const parts = tag.replace(/_/g, '-').split('-');
  for (let i = 1; i < parts.length; i += 1) {
    const part = parts[i];
    if (/^[A-Za-z]{2}$/.test(part)) {
      return part.toUpperCase();
    }
  }
  return null;
}

export function resolveCurrencyCodeFromLocales(
  locales: readonly LocaleCurrencyCandidate[],
  catalog: readonly CurrencyConfig[] = FALLBACK_CURRENCIES,
): string {
  for (const locale of locales) {
    const direct = locale.currencyCode?.trim().toUpperCase();
    if (direct && isSupportedCatalogCode(direct, catalog)) {
      return direct;
    }

    const region =
      locale.regionCode?.trim().toUpperCase() ||
      locale.languageRegionCode?.trim().toUpperCase() ||
      extractRegionFromTag(locale.languageTag);

    if (region && Object.prototype.hasOwnProperty.call(REGION_TO_CURRENCY_MAP, region)) {
      const mapped = REGION_TO_CURRENCY_MAP[region];
      if (mapped && isSupportedCatalogCode(mapped, catalog)) {
        return mapped;
      }
      if (mapped === null) {
        return NEUTRAL_FALLBACK_CURRENCY_CODE;
      }
    }
  }

  return NEUTRAL_FALLBACK_CURRENCY_CODE;
}
