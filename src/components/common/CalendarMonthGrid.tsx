import { useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getDaysInMonth, toISODate } from '@/utils/date';

export const CALENDAR_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export interface CalendarDayIndicator {
  hasIncome?: boolean;
  hasExpense?: boolean;
}

export interface CalendarGridMetrics {
  cellSize: number;
  rowWidth: number;
  circleSize: number;
}

export function computeCalendarGridMetrics(containerWidth: number): CalendarGridMetrics {
  const safeWidth = Math.max(containerWidth, 210);
  const cellSize = Math.floor(safeWidth / 7);
  const rowWidth = cellSize * 7;
  const circleSize = Math.max(26, Math.min(cellSize - 6, 38));
  return { cellSize, rowWidth, circleSize };
}

interface CalendarMonthGridProps {
  year: number;
  month: number;
  selectedDate?: string;
  rangeStart?: string;
  rangeEnd?: string;
  minDate?: string;
  maxDate?: string;
  todayISO: string;
  indicators?: Map<string, CalendarDayIndicator>;
  showDots?: boolean;
  onSelectDate: (isoDate: string) => void;
}

export function CalendarMonthGrid({
  year,
  month,
  selectedDate,
  rangeStart,
  rangeEnd,
  minDate,
  maxDate,
  todayISO,
  indicators,
  showDots = false,
  onSelectDate,
}: CalendarMonthGridProps) {
  const theme = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const fallbackWidth = Math.min(windowWidth - Spacing.six, 360);
  const [measuredWidth, setMeasuredWidth] = useState(fallbackWidth);

  const metrics = computeCalendarGridMetrics(measuredWidth);
  const rowHeight = showDots ? metrics.cellSize + 10 : metrics.cellSize;

  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = getDaysInMonth(year, month);
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return (
    <View
      style={styles.wrapper}
      onLayout={(e) => {
        const next = Math.floor(e.nativeEvent.layout.width);
        if (next > 0 && Math.abs(next - measuredWidth) >= 1) {
          setMeasuredWidth(next);
        }
      }}>
      <View style={[styles.weekRow, { width: metrics.rowWidth }]}>
        {CALENDAR_WEEKDAYS.map((day) => (
          <View key={day} style={[styles.weekCell, { width: metrics.cellSize }]}>
            <Text style={[styles.weekdayText, { color: theme.textMuted }]}>{day}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.grid, { width: metrics.rowWidth }]}>
        {cells.map((day, idx) => {
          if (day === null) {
            return (
              <View
                key={`empty-${idx}`}
                style={{ width: metrics.cellSize, height: rowHeight }}
              />
            );
          }

          const cellISO = toISODate(year, month, day);
          const isBeforeMin = Boolean(minDate && cellISO < minDate);
          const isAfterMax = Boolean(maxDate && cellISO > maxDate);
          const isDisabled = isBeforeMin || isAfterMax;

          const isSingleSelected = selectedDate ? cellISO === selectedDate : false;
          const isRangeStart = rangeStart ? cellISO === rangeStart : false;
          const isRangeEnd = rangeEnd ? cellISO === rangeEnd : false;
          const isRangeEdge = isRangeStart || isRangeEnd;
          const isInRange = Boolean(
            rangeStart && rangeEnd && cellISO > rangeStart && cellISO < rangeEnd,
          );
          const isSelected = isSingleSelected || isRangeEdge;
          const isToday = cellISO === todayISO;
          const info = showDots ? indicators?.get(cellISO) : undefined;

          return (
            <Pressable
              key={cellISO}
              disabled={isDisabled}
              onPress={() => {
                if (!isDisabled) {
                  onSelectDate(cellISO);
                }
              }}
              accessibilityRole="button"
              accessibilityLabel={cellISO}
              accessibilityState={{ disabled: isDisabled, selected: isSelected }}
              style={[
                styles.dayCell,
                { width: metrics.cellSize, height: rowHeight },
                isInRange && {
                  backgroundColor: theme.primarySoft,
                },
              ]}>
              <View
                style={[
                  styles.dayCircle,
                  {
                    width: metrics.circleSize,
                    height: metrics.circleSize,
                    borderRadius: Radius.full,
                  },
                  isSelected && !isDisabled && { backgroundColor: theme.primary },
                  !isSelected &&
                    !isInRange &&
                    isToday &&
                    !isDisabled && {
                      borderWidth: 1.5,
                      borderColor: theme.primary,
                    },
                ]}>
                <Text
                  style={[
                    styles.dayText,
                    Platform.OS === 'android' && styles.androidTextFix,
                    {
                      color: isDisabled
                        ? theme.textMuted
                        : isSelected
                          ? theme.primaryText
                          : isInRange
                            ? theme.primary
                            : theme.text,
                      opacity: isDisabled ? 0.42 : 1,
                      fontWeight: isSelected || isToday ? '700' : '500',
                    },
                  ]}>
                  {day}
                </Text>
              </View>

              {showDots ? (
                <View style={styles.dotRow}>
                  {info?.hasIncome ? (
                    <View
                      style={[
                        styles.dot,
                        { backgroundColor: theme.income },
                      ]}
                    />
                  ) : null}
                  {info?.hasExpense ? (
                    <View
                      style={[
                        styles.dot,
                        { backgroundColor: theme.expense },
                      ]}
                    />
                  ) : null}
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    alignItems: 'center',
    gap: Spacing.one,
  },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  weekCell: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  weekdayText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: {
    fontSize: 14,
    lineHeight: 18,
    textAlign: 'center',
  },
  androidTextFix: {
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  dotRow: {
    flexDirection: 'row',
    gap: 3,
    height: 6,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 4.5,
    height: 4.5,
    borderRadius: 2.5,
  },
});
