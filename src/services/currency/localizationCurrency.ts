import { getLocales } from 'expo-localization';

import {
  FALLBACK_CURRENCIES,
  NEUTRAL_FALLBACK_CURRENCY_CODE,
  type CurrencyConfig,
} from '@/constants/currencies';

import { resolveCurrencyCodeFromLocales } from './localeCurrencyResolver';

export {
  REGION_TO_CURRENCY_MAP,
  resolveCurrencyCodeFromLocales,
  type LocaleCurrencyCandidate,
} from './localeCurrencyResolver';

export function detectDeviceCurrencyCode(
  catalog: readonly CurrencyConfig[] = FALLBACK_CURRENCIES,
): string {
  try {
    const locales = getLocales();
    return resolveCurrencyCodeFromLocales(locales, catalog);
  } catch {
    return NEUTRAL_FALLBACK_CURRENCY_CODE;
  }
}
