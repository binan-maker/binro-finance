import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/common';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { DateFormatPreference } from '@/types/models';
import {
  addDaysToISODate,
  formatDateForDisplay,
  getDaysInMonth,
  getMonthLabel,
  getTodayISODate,
  isValidISODate,
  parseISODateParts,
  toISODate,
} from '@/utils/date';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

interface DatePickerFieldProps {
  label?: string;
  value: string; // YYYY-MM-DD
  dateFormat: DateFormatPreference;
  onChange: (isoDate: string) => void;
  error?: string | null;
}

export function DatePickerField({
  label = 'Date',
  value,
  dateFormat,
  onChange,
  error,
}: DatePickerFieldProps) {
  const theme = useTheme();
  const safeValue = isValidISODate(value) ? value : getTodayISODate();
  const initialParts = parseISODateParts(safeValue);

  const [visible, setVisible] = useState(false);
  const [viewYear, setViewYear] = useState(initialParts.year);
  const [viewMonth, setViewMonth] = useState(initialParts.month);

  const openModal = () => {
    const parts = parseISODateParts(safeValue);
    setViewYear(parts.year);
    setViewMonth(parts.month);
    setVisible(true);
  };

  const stepMonth = (delta: number) => {
    let nextMonth = viewMonth + delta;
    let nextYear = viewYear;
    if (nextMonth < 1) {
      nextMonth = 12;
      nextYear -= 1;
    } else if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    setViewMonth(nextMonth);
    setViewYear(nextYear);
  };

  const firstWeekday = new Date(viewYear, viewMonth - 1, 1).getDay();
  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  const today = getTodayISODate();
  const yesterday = addDaysToISODate(today, -1);

  return (
    <View style={styles.container}>
      {label ? (
        <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
      ) : null}

      <Pressable
        onPress={openModal}
        accessibilityRole="button"
        style={[
          styles.fieldButton,
          {
            backgroundColor: theme.surface,
            borderColor: error ? theme.danger : theme.border,
          },
        ]}>
        <View style={styles.fieldLeft}>
          <Ionicons name="calendar-outline" size={18} color={theme.textSecondary} />
          <Text style={[styles.fieldText, { color: theme.text }]}>
            {formatDateForDisplay(safeValue, dateFormat)}
          </Text>
        </View>
        <Text style={[styles.changeLabel, { color: theme.primary }]}>Change</Text>
      </Pressable>

      {error ? (
        <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>
      ) : null}

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
          <Pressable
            style={[
              styles.modalCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
            onPress={(e) => e.stopPropagation()}>
            <View style={styles.monthHeader}>
              <Pressable
                onPress={() => stepMonth(-1)}
                accessibilityRole="button"
                style={[styles.navBtn, { borderColor: theme.border }]}>
                <Ionicons name="chevron-back" size={18} color={theme.text} />
              </Pressable>
              <Text style={[styles.monthTitle, { color: theme.text }]}>
                {getMonthLabel(viewYear, viewMonth)}
              </Text>
              <Pressable
                onPress={() => stepMonth(1)}
                accessibilityRole="button"
                style={[styles.navBtn, { borderColor: theme.border }]}>
                <Ionicons name="chevron-forward" size={18} color={theme.text} />
              </Pressable>
            </View>

            <View style={styles.quickShortcuts}>
              <Pressable
                onPress={() => {
                  onChange(today);
                  setVisible(false);
                }}
                style={[
                  styles.quickChip,
                  {
                    backgroundColor:
                      safeValue === today ? theme.primarySoft : theme.surfaceElevated,
                    borderColor: safeValue === today ? theme.primary : theme.border,
                  },
                ]}>
                <Text
                  style={[
                    styles.quickChipText,
                    { color: safeValue === today ? theme.primary : theme.text },
                  ]}>
                  Today
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  onChange(yesterday);
                  setVisible(false);
                }}
                style={[
                  styles.quickChip,
                  {
                    backgroundColor:
                      safeValue === yesterday ? theme.primarySoft : theme.surfaceElevated,
                    borderColor: safeValue === yesterday ? theme.primary : theme.border,
                  },
                ]}>
                <Text
                  style={[
                    styles.quickChipText,
                    { color: safeValue === yesterday ? theme.primary : theme.text },
                  ]}>
                  Yesterday
                </Text>
              </Pressable>
            </View>

            <View style={styles.weekRow}>
              {WEEKDAYS.map((day) => (
                <Text key={day} style={[styles.weekdayText, { color: theme.textMuted }]}>
                  {day}
                </Text>
              ))}
            </View>

            <View style={styles.grid}>
              {cells.map((day, idx) => {
                if (day === null) {
                  return <View key={`empty-${idx}`} style={styles.dayCell} />;
                }

                const cellISO = toISODate(viewYear, viewMonth, day);
                const isSelected = cellISO === safeValue;
                const isToday = cellISO === today;

                return (
                  <Pressable
                    key={cellISO}
                    onPress={() => {
                      onChange(cellISO);
                      setVisible(false);
                    }}
                    style={[
                      styles.dayCell,
                      isSelected && { backgroundColor: theme.primary },
                      !isSelected &&
                        isToday && {
                          borderWidth: 1,
                          borderColor: theme.primary,
                        },
                    ]}>
                    <Text
                      style={[
                        styles.dayText,
                        {
                          color: isSelected ? theme.primaryText : theme.text,
                          fontWeight: isSelected || isToday ? '700' : '500',
                        },
                      ]}>
                      {day}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <AppButton
              label="Close"
              variant="outline"
              onPress={() => setVisible(false)}
              fullWidth
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.one + 2,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  fieldButton: {
    minHeight: 46,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three - 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  fieldText: {
    fontSize: 15,
    fontWeight: '500',
  },
  changeLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 12,
    fontWeight: '500',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.three,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: Radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  quickShortcuts: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  quickChip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  quickChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  weekRow: {
    flexDirection: 'row',
  },
  weekdayText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.285%',
    aspectRatio: 1,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: {
    fontSize: 14,
  },
});
