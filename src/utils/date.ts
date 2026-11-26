import type { DateFormatPreference } from '@/types/models';

export const MONTH_SHORT_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export const MIN_DOB_YEAR = 1900;

export function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function toISODate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`;
}

export function getTodayISODate(): string {
  const now = new Date();
  return toISODate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [y, m, d] = value.split('-').map((part) => Number.parseInt(part, 10));
  if (m < 1 || m > 12 || d < 1) {
    return false;
  }
  const maxDay = getDaysInMonth(y, m);
  return d <= maxDay;
}

export function parseISODateParts(isoDate: string): { year: number; month: number; day: number } {
  const [year, month, day] = isoDate.split('-').map((part) => Number.parseInt(part, 10));
  return { year, month, day };
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function getMonthRange(year: number, month: number): { startDate: string; endDate: string } {
  const lastDay = getDaysInMonth(year, month);
  return {
    startDate: toISODate(year, month, 1),
    endDate: toISODate(year, month, lastDay),
  };
}

export function getYearRange(year: number): { startDate: string; endDate: string } {
  return {
    startDate: toISODate(year, 1, 1),
    endDate: toISODate(year, 12, 31),
  };
}

/**
 * Returns the Monday-Sunday week range containing the given YYYY-MM-DD date.
 */
export function getWeekRange(isoDate: string): { startDate: string; endDate: string } {
  const { year, month, day } = parseISODateParts(isoDate);
  const date = new Date(year, month - 1, day);
  const dayOfWeek = date.getDay(); // 0=Sun, 1=Mon...
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const start = new Date(year, month - 1, day + diffToMonday);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);

  return {
    startDate: toISODate(start.getFullYear(), start.getMonth() + 1, start.getDate()),
    endDate: toISODate(end.getFullYear(), end.getMonth() + 1, end.getDate()),
  };
}

export function addDaysToISODate(isoDate: string, deltaDays: number): string {
  const { year, month, day } = parseISODateParts(isoDate);
  const utcMs = Date.UTC(year, month - 1, day + deltaDays);
  const d = new Date(utcMs);
  return toISODate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/**
 * Computes exact signed integer calendar day difference (endISO - startISO) without DST drift.
 */
export function diffDaysISODate(startISO: string, endISO: string): number {
  const s = parseISODateParts(startISO);
  const e = parseISODateParts(endISO);
  const sMs = Date.UTC(s.year, s.month - 1, s.day);
  const eMs = Date.UTC(e.year, e.month - 1, e.day);
  return Math.round((eMs - sMs) / 86400000);
}

export interface BiweeklyPeriodRange {
  anchorDate: string;
  cycleIndex: number;
  startDate: string;
  endDate: string;
  nextStartDate: string;
  nextEndDate: string;
}

/**
 * Returns the 14-day biweekly window for a specific cycleIndex relative to anchorISO.
 * Each window covers [start, start + 13] inclusive (14 real calendar days).
 */
export function getBiweeklyPeriodRange(
  anchorISO: string,
  cycleIndex: number = 0,
): BiweeklyPeriodRange {
  const safeAnchor = isValidISODate(anchorISO) ? anchorISO : getTodayISODate();
  const startDate = addDaysToISODate(safeAnchor, cycleIndex * 14);
  const endDate = addDaysToISODate(startDate, 13);
  const nextStartDate = addDaysToISODate(startDate, 14);
  const nextEndDate = addDaysToISODate(nextStartDate, 13);
  return {
    anchorDate: safeAnchor,
    cycleIndex,
    startDate,
    endDate,
    nextStartDate,
    nextEndDate,
  };
}

/**
 * Resolves the 14-day cycle anchored to anchorISO that contains referenceISO.
 */
export function getBiweeklyPeriodForDate(
  anchorISO: string,
  referenceISO: string = getTodayISODate(),
): BiweeklyPeriodRange {
  const safeAnchor = isValidISODate(anchorISO) ? anchorISO : getTodayISODate();
  const safeRef = isValidISODate(referenceISO) ? referenceISO : safeAnchor;
  const diff = diffDaysISODate(safeAnchor, safeRef);
  const cycleIndex = Math.floor(diff / 14);
  return getBiweeklyPeriodRange(safeAnchor, cycleIndex);
}

export function enumerateDatesInRange(startDate: string, endDate: string): string[] {
  if (!isValidISODate(startDate) || !isValidISODate(endDate) || startDate > endDate) {
    return [];
  }

  const dates: string[] = [];
  let cursor = startDate;
  let guard = 0;
  while (cursor <= endDate && guard < 4000) {
    dates.push(cursor);
    cursor = addDaysToISODate(cursor, 1);
    guard += 1;
  }
  return dates;
}

export function formatDateForDisplay(
  isoDate: string,
  format: DateFormatPreference = 'DD MMM YYYY',
): string {
  if (!isValidISODate(isoDate)) {
    return isoDate;
  }
  const { year, month, day } = parseISODateParts(isoDate);

  switch (format) {
    case 'YYYY-MM-DD':
      return `${year}-${pad2(month)}-${pad2(day)}`;
    case 'DD/MM/YYYY':
      return `${pad2(day)}/${pad2(month)}/${year}`;
    case 'MM/DD/YYYY':
      return `${pad2(month)}/${pad2(day)}/${year}`;
    case 'DD MMM YYYY':
    default:
      return `${pad2(day)} ${MONTH_SHORT_NAMES[month - 1]} ${year}`;
  }
}

export function formatRelativeDateLabel(
  isoDate: string,
  format: DateFormatPreference = 'DD MMM YYYY',
  referenceToday?: string,
): string {
  const today = referenceToday ?? getTodayISODate();
  const yesterday = addDaysToISODate(today, -1);

  if (isoDate === today) return 'Today';
  if (isoDate === yesterday) return 'Yesterday';
  return formatDateForDisplay(isoDate, format);
}

export function formatTimeForDisplay(isoTimestamp: string): string {
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  const hours24 = parsed.getHours();
  const minutes = pad2(parsed.getMinutes());
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${minutes} ${period}`;
}

export function formatDateTimeForDisplay(
  isoTimestamp: string,
  format: DateFormatPreference = 'DD MMM YYYY',
): string {
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) {
    return isoTimestamp;
  }
  const dateStr = toISODate(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
  const timeStr = `${pad2(parsed.getHours())}:${pad2(parsed.getMinutes())}`;
  return `${formatDateForDisplay(dateStr, format)} · ${timeStr}`;
}

export function formatTransactionDateTimeRowLabel(
  transactionDate: string,
  createdAt: string,
  format: DateFormatPreference = 'DD MMM YYYY',
  referenceToday?: string,
): string {
  const dateLabel = formatRelativeDateLabel(transactionDate, format, referenceToday);
  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) {
    return dateLabel;
  }
  const hours24 = parsed.getHours();
  const minutes = pad2(parsed.getMinutes());
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${dateLabel}, ${pad2(hours12)}:${minutes} ${period}`;
}

export function getMonthLabel(year: number, month: number): string {
  return `${MONTH_SHORT_NAMES[month - 1]} ${year}`;
}

export function normalizeDateRange(
  rawStartDate: string,
  rawEndDate: string,
  fallbackDate?: string,
): { startDate: string; endDate: string; wasReversed: boolean } {
  const safeFallback = fallbackDate && isValidISODate(fallbackDate) ? fallbackDate : getTodayISODate();
  const start = isValidISODate(rawStartDate) ? rawStartDate : safeFallback;
  const end = isValidISODate(rawEndDate) ? rawEndDate : safeFallback;

  if (start > end) {
    return { startDate: end, endDate: start, wasReversed: true };
  }
  return { startDate: start, endDate: end, wasReversed: false };
}

export type AnyDatePreset =
  | 'today'
  | 'yesterday'
  | 'last_7'
  | 'last_30'
  | 'this_month'
  | 'this_year'
  | 'all_time'
  | 'custom';

export function resolveDatePresetRange(params: {
  preset: AnyDatePreset;
  referenceToday?: string;
  customStartDate?: string;
  customEndDate?: string;
  earliestTransactionDate?: string;
}): { startDate: string | null; endDate: string | null } {
  const today = params.referenceToday && isValidISODate(params.referenceToday)
    ? params.referenceToday
    : getTodayISODate();
  const { year, month } = parseISODateParts(today);

  switch (params.preset) {
    case 'today':
      return { startDate: today, endDate: today };
    case 'yesterday': {
      const yesterday = addDaysToISODate(today, -1);
      return { startDate: yesterday, endDate: yesterday };
    }
    case 'last_7':
      return { startDate: addDaysToISODate(today, -6), endDate: today };
    case 'last_30':
      return { startDate: addDaysToISODate(today, -29), endDate: today };
    case 'this_month': {
      const range = getMonthRange(year, month);
      return { startDate: range.startDate, endDate: range.endDate };
    }
    case 'this_year': {
      const range = getYearRange(year);
      return { startDate: range.startDate, endDate: range.endDate };
    }
    case 'custom': {
      const normalized = normalizeDateRange(
        params.customStartDate ?? today,
        params.customEndDate ?? today,
        today,
      );
      return { startDate: normalized.startDate, endDate: normalized.endDate };
    }
    case 'all_time':
    default:
      if (params.earliestTransactionDate && isValidISODate(params.earliestTransactionDate)) {
        return {
          startDate:
            params.earliestTransactionDate <= today ? params.earliestTransactionDate : today,
          endDate: today,
        };
      }
      return { startDate: null, endDate: null };
  }
}

export function getDobYearOptions(
  referenceToday?: string,
  minYear: number = MIN_DOB_YEAR,
): number[] {
  const todayISO =
    referenceToday && isValidISODate(referenceToday) ? referenceToday : getTodayISODate();
  const { year: maxYear } = parseISODateParts(todayISO);
  const safeMinYear = Math.min(minYear, maxYear);
  const years: number[] = [];
  for (let y = maxYear; y >= safeMinYear; y -= 1) {
    years.push(y);
  }
  return years;
}

export function clampCalendarMonthToMaxDate(
  year: number,
  month: number,
  maxDateISO: string,
): { year: number; month: number } {
  if (!isValidISODate(maxDateISO)) {
    return { year, month };
  }
  const maxParts = parseISODateParts(maxDateISO);
  const clampedYear = Math.min(Math.max(year, MIN_DOB_YEAR), maxParts.year);
  const clampedMonth =
    clampedYear === maxParts.year ? Math.min(month, maxParts.month) : month;
  return {
    year: clampedYear,
    month: Math.min(Math.max(clampedMonth, 1), 12),
  };
}

export function validateDateOfBirth(
  rawValue: string | null | undefined,
  referenceToday?: string,
): { valid: boolean; value: string | null; error?: string } {
  const trimmed = (rawValue ?? '').trim();
  if (!trimmed) {
    return { valid: true, value: null };
  }
  if (!isValidISODate(trimmed)) {
    return {
      valid: false,
      value: null,
      error: 'Please select a valid Date of Birth.',
    };
  }
  const { year } = parseISODateParts(trimmed);
  if (year < MIN_DOB_YEAR) {
    return {
      valid: false,
      value: null,
      error: `Date of Birth must be in ${MIN_DOB_YEAR} or later.`,
    };
  }
  const todayISO =
    referenceToday && isValidISODate(referenceToday) ? referenceToday : getTodayISODate();
  if (trimmed > todayISO) {
    return {
      valid: false,
      value: null,
      error: 'Date of Birth cannot be in the future.',
    };
  }
  return { valid: true, value: trimmed };
}

