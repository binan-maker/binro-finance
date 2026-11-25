import { getCurrencyConfig } from '@/constants/currencies';

/**
 * Parses a decimal string (e.g. "1234.50") into integer minor units (e.g. 123450)
 * using string splitting to avoid IEEE-754 floating-point precision loss.
 */
export function parseMajorToMinor(rawInput: string, currencyCode: string): number | null {
  const cleaned = rawInput.trim().replace(/,/g, '');
  if (!cleaned) {
    return null;
  }

  const isNegative = cleaned.startsWith('-');
  const unsigned = isNegative || cleaned.startsWith('+') ? cleaned.slice(1) : cleaned;

  if (!/^\d+(\.\d+)?$/.test(unsigned)) {
    return null;
  }

  const { minorUnits } = getCurrencyConfig(currencyCode);
  const [wholePartRaw, fractionPartRaw = ''] = unsigned.split('.');

  if (minorUnits === 0 && fractionPartRaw.length > 0 && Number(fractionPartRaw) !== 0) {
    return null;
  }

  const wholePart = Number.parseInt(wholePartRaw, 10);
  if (!Number.isSafeInteger(wholePart)) {
    return null;
  }

  const scale = 10 ** minorUnits;
  const paddedFraction = fractionPartRaw.slice(0, minorUnits).padEnd(minorUnits, '0');
  const fractionPart = minorUnits > 0 ? Number.parseInt(paddedFraction, 10) : 0;

  // Check if user provided extra non-zero digits beyond currency minor precision
  if (fractionPartRaw.length > minorUnits) {
    const extraDigits = fractionPartRaw.slice(minorUnits);
    if (!/^0+$/.test(extraDigits)) {
      return null;
    }
  }

  const totalMinor = wholePart * scale + fractionPart;
  if (!Number.isSafeInteger(totalMinor)) {
    return null;
  }

  return isNegative ? -totalMinor : totalMinor;
}

export function formatMinorToMajorInput(amountMinor: number, currencyCode: string): string {
  const { minorUnits } = getCurrencyConfig(currencyCode);
  if (minorUnits === 0) {
    return String(Math.trunc(amountMinor));
  }

  const sign = amountMinor < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(amountMinor));
  const scale = 10 ** minorUnits;
  const whole = Math.floor(abs / scale);
  const frac = String(abs % scale).padStart(minorUnits, '0');

  return `${sign}${whole}.${frac}`;
}

export function formatMoney(
  amountMinor: number,
  currencyCode: string,
  options?: { showSign?: boolean },
): string {
  const { symbol, minorUnits } = getCurrencyConfig(currencyCode);
  const absMinor = Math.abs(Math.trunc(amountMinor));
  const scale = 10 ** minorUnits;
  const whole = Math.floor(absMinor / scale);
  const frac = minorUnits > 0 ? String(absMinor % scale).padStart(minorUnits, '0') : '';

  const locale = currencyCode === 'INR' ? 'en-IN' : 'en-US';
  const formattedWhole = whole.toLocaleString(locale);
  const valueText = minorUnits > 0 ? `${formattedWhole}.${frac}` : formattedWhole;

  let prefix = '';
  if (amountMinor < 0) {
    prefix = '-';
  } else if (options?.showSign && amountMinor > 0) {
    prefix = '+';
  }

  return `${prefix}${symbol}${valueText}`;
}
