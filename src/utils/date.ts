import type { DateFormatPreference } from '@/types/models';

const MONTH_SHORT_NAMES = [
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
  const date = new Date(year, month - 1, day + deltaDays);
  return toISODate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export function enumerateDatesInRange(startDate: string, endDate: string): string[] {
  if (!isValidISODate(startDate) || !isValidISODate(endDate) || startDate > endDate) {
    return [];
  }

  const dates: string[] = [];
  let cursor = startDate;
  // Guard against accidental unbounded loops
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

export function getMonthLabel(year: number, month: number): string {
  return `${MONTH_SHORT_NAMES[month - 1]} ${year}`;
}
