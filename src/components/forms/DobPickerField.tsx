import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  AppButton,
  BottomSheetModal,
  CalendarMonthGrid,
} from '@/components/common';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { DateFormatPreference } from '@/types/models';
import {
  clampCalendarMonthToMaxDate,
  formatDateForDisplay,
  getDobYearOptions,
  getTodayISODate,
  isValidISODate,
  MIN_DOB_YEAR,
  MONTH_SHORT_NAMES,
  parseISODateParts,
  validateDateOfBirth,
} from '@/utils/date';

type PickerViewMode = 'calendar' | 'months' | 'years';

interface DobPickerFieldProps {
  label?: string;
  value: string; // '' or 'YYYY-MM-DD'
  dateFormat: DateFormatPreference;
  onChange: (isoDate: string) => void;
  error?: string | null;
  placeholder?: string;
}

export function DobPickerField({
  label = 'Date of Birth',
  value,
  dateFormat,
  onChange,
  error,
  placeholder = 'Select date of birth',
}: DobPickerFieldProps) {
  const theme = useTheme();
  const todayISO = getTodayISODate();
  const todayParts = parseISODateParts(todayISO);
  const minDateISO = `${MIN_DOB_YEAR}-01-01`;

  const hasValidValue = isValidISODate(value);
  const yearOptions = getDobYearOptions(todayISO, MIN_DOB_YEAR);

  const [visible, setVisible] = useState(false);
  const [viewMode, setViewMode] = useState<PickerViewMode>('calendar');
  const [viewYear, setViewYear] = useState(
    hasValidValue ? parseISODateParts(value).year : Math.max(MIN_DOB_YEAR, todayParts.year - 25),
  );
  const [viewMonth, setViewMonth] = useState(
    hasValidValue ? parseISODateParts(value).month : todayParts.month,
  );
  const [draftDate, setDraftDate] = useState<string>(hasValidValue ? value : '');

  const openModal = () => {
    const valid = isValidISODate(value) && value <= todayISO;
    if (valid) {
      const parts = parseISODateParts(value);
      setViewYear(parts.year);
      setViewMonth(parts.month);
      setDraftDate(value);
    } else {
      const defaultYear = Math.max(MIN_DOB_YEAR, todayParts.year - 25);
      setViewYear(defaultYear);
      setViewMonth(todayParts.month);
      setDraftDate('');
    }
    setViewMode('calendar');
    setVisible(true);
  };

  const isAtMinMonth = viewYear <= MIN_DOB_YEAR && viewMonth <= 1;
  const isAtMaxMonth =
    viewYear > todayParts.year ||
    (viewYear === todayParts.year && viewMonth >= todayParts.month);

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
    const clamped = clampCalendarMonthToMaxDate(nextYear, nextMonth, todayISO);
    setViewYear(clamped.year);
    setViewMonth(clamped.month);
  };

  const handleSelectYear = (year: number) => {
    const clamped = clampCalendarMonthToMaxDate(year, viewMonth, todayISO);
    setViewYear(clamped.year);
    setViewMonth(clamped.month);
    setViewMode('calendar');
  };

  const handleSelectMonth = (monthIndex: number) => {
    const clamped = clampCalendarMonthToMaxDate(viewYear, monthIndex, todayISO);
    setViewYear(clamped.year);
    setViewMonth(clamped.month);
    setViewMode('calendar');
  };

  const handleConfirm = () => {
    const check = validateDateOfBirth(draftDate, todayISO);
    if (!check.valid) {
      return;
    }
    onChange(check.value ?? '');
    setVisible(false);
  };

  const handleClear = () => {
    setDraftDate('');
    onChange('');
    setVisible(false);
  };

  const draftDisplay =
    draftDate && isValidISODate(draftDate)
      ? formatDateForDisplay(draftDate, dateFormat)
      : 'No date selected';

  return (
    <View style={styles.container}>
      {label ? (
        <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
      ) : null}

      <Pressable
        onPress={openModal}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[
          styles.fieldButton,
          {
            backgroundColor: theme.surface,
            borderColor: error ? theme.danger : theme.border,
          },
        ]}>
        <View style={styles.fieldLeft}>
          <Ionicons
            name="calendar-outline"
            size={18}
            color={hasValidValue ? theme.textSecondary : theme.textMuted}
          />
          <Text
            style={[
              styles.fieldText,
              { color: hasValidValue ? theme.text : theme.textMuted },
            ]}
            numberOfLines={1}>
            {hasValidValue ? formatDateForDisplay(value, dateFormat) : placeholder}
          </Text>
        </View>
        <Text style={[styles.actionLabel, { color: theme.primary }]}>
          {hasValidValue ? 'Change' : 'Select'}
        </Text>
      </Pressable>

      {error ? (
        <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>
      ) : null}

      <BottomSheetModal
        visible={visible}
        onClose={() => setVisible(false)}
        variant="center"
        maxWidth={380}>
        <View style={styles.headerBlock}>
          <Text style={[styles.modalTitle, { color: theme.text }]}>
            Date of Birth
          </Text>
          <Text style={[styles.selectedPreview, { color: theme.textSecondary }]}>
            {draftDisplay}
          </Text>
        </View>

        <View style={styles.navHeader}>
          <Pressable
            onPress={() => stepMonth(-1)}
            disabled={isAtMinMonth || viewMode !== 'calendar'}
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            style={[
              styles.navBtn,
              {
                borderColor: theme.border,
                opacity: isAtMinMonth || viewMode !== 'calendar' ? 0.35 : 1,
              },
            ]}>
            <Ionicons name="chevron-back" size={18} color={theme.text} />
          </Pressable>

          <View style={styles.selectorRow}>
            <Pressable
              onPress={() =>
                setViewMode((prev) => (prev === 'months' ? 'calendar' : 'months'))
              }
              accessibilityRole="button"
              accessibilityLabel="Select month"
              style={[
                styles.selectorButton,
                {
                  backgroundColor:
                    viewMode === 'months' ? theme.primarySoft : theme.surfaceElevated,
                  borderColor: viewMode === 'months' ? theme.primary : theme.border,
                },
              ]}>
              <Text
                style={[
                  styles.selectorText,
                  { color: viewMode === 'months' ? theme.primary : theme.text },
                ]}>
                {MONTH_SHORT_NAMES[viewMonth - 1]}
              </Text>
              <Ionicons
                name={viewMode === 'months' ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={viewMode === 'months' ? theme.primary : theme.textSecondary}
              />
            </Pressable>

            <Pressable
              onPress={() =>
                setViewMode((prev) => (prev === 'years' ? 'calendar' : 'years'))
              }
              accessibilityRole="button"
              accessibilityLabel="Select year"
              style={[
                styles.selectorButton,
                {
                  backgroundColor:
                    viewMode === 'years' ? theme.primarySoft : theme.surfaceElevated,
                  borderColor: viewMode === 'years' ? theme.primary : theme.border,
                },
              ]}>
              <Text
                style={[
                  styles.selectorText,
                  { color: viewMode === 'years' ? theme.primary : theme.text },
                ]}>
                {viewYear}
              </Text>
              <Ionicons
                name={viewMode === 'years' ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={viewMode === 'years' ? theme.primary : theme.textSecondary}
              />
            </Pressable>
          </View>

          <Pressable
            onPress={() => stepMonth(1)}
            disabled={isAtMaxMonth || viewMode !== 'calendar'}
            accessibilityRole="button"
            accessibilityLabel="Next month"
            style={[
              styles.navBtn,
              {
                borderColor: theme.border,
                opacity: isAtMaxMonth || viewMode !== 'calendar' ? 0.35 : 1,
              },
            ]}>
            <Ionicons name="chevron-forward" size={18} color={theme.text} />
          </Pressable>
        </View>

        {viewMode === 'years' ? (
          <ScrollView
            style={styles.gridScroll}
            contentContainerStyle={styles.yearGrid}
            showsVerticalScrollIndicator>
            {yearOptions.map((yr) => {
              const selected = yr === viewYear;
              return (
                <Pressable
                  key={yr}
                  onPress={() => handleSelectYear(yr)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[
                    styles.yearCell,
                    {
                      backgroundColor: selected
                        ? theme.primary
                        : theme.surfaceElevated,
                      borderColor: selected ? theme.primary : theme.border,
                    },
                  ]}>
                  <Text
                    style={[
                      styles.gridCellText,
                      { color: selected ? theme.primaryText : theme.text },
                    ]}>
                    {yr}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : viewMode === 'months' ? (
          <View style={styles.monthGrid}>
            {MONTH_SHORT_NAMES.map((mName, idx) => {
              const monthNum = idx + 1;
              const isFutureMonth =
                viewYear === todayParts.year && monthNum > todayParts.month;
              const selected = monthNum === viewMonth;
              return (
                <Pressable
                  key={mName}
                  disabled={isFutureMonth}
                  onPress={() => handleSelectMonth(monthNum)}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isFutureMonth, selected }}
                  style={[
                    styles.monthCell,
                    {
                      backgroundColor: selected
                        ? theme.primary
                        : theme.surfaceElevated,
                      borderColor: selected ? theme.primary : theme.border,
                      opacity: isFutureMonth ? 0.38 : 1,
                    },
                  ]}>
                  <Text
                    style={[
                      styles.gridCellText,
                      {
                        color: selected
                          ? theme.primaryText
                          : isFutureMonth
                            ? theme.textMuted
                            : theme.text,
                      },
                    ]}>
                    {mName}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <CalendarMonthGrid
            year={viewYear}
            month={viewMonth}
            selectedDate={draftDate || undefined}
            minDate={minDateISO}
            maxDate={todayISO}
            todayISO={todayISO}
            onSelectDate={(cellISO) => {
              if (cellISO <= todayISO && cellISO >= minDateISO) {
                setDraftDate(cellISO);
              }
            }}
          />
        )}

        <View style={styles.footerActions}>
          {(draftDate || hasValidValue) ? (
            <View style={styles.clearWrap}>
              <AppButton
                label="Clear"
                variant="ghost"
                size="sm"
                onPress={handleClear}
              />
            </View>
          ) : (
            <View style={styles.clearSpacer} />
          )}

          <View style={styles.rightActions}>
            <AppButton
              label="Cancel"
              variant="outline"
              size="sm"
              onPress={() => setVisible(false)}
            />
            <AppButton
              label="Confirm"
              size="sm"
              onPress={handleConfirm}
            />
          </View>
        </View>
      </BottomSheetModal>
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
    gap: Spacing.two,
  },
  fieldLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flex: 1,
  },
  fieldText: {
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 12,
    fontWeight: '500',
  },
  headerBlock: {
    gap: 2,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  selectedPreview: {
    fontSize: 13,
    fontWeight: '500',
  },
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  selectorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  selectorText: {
    fontSize: 14,
    fontWeight: '700',
  },
  gridScroll: {
    maxHeight: 260,
    flexShrink: 1,
    flexGrow: 0,
  },
  yearGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  yearCell: {
    width: '22.5%',
    flexGrow: 1,
    minWidth: 68,
    paddingVertical: Spacing.two + 2,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  monthCell: {
    width: '30.5%',
    flexGrow: 1,
    paddingVertical: Spacing.two + 4,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridCellText: {
    fontSize: 14,
    fontWeight: '600',
  },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  clearWrap: {
    alignItems: 'flex-start',
  },
  clearSpacer: {
    width: 1,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
