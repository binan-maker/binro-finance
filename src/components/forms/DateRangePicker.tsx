import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import {
  AppButton,
  BottomSheetModal,
  CalendarMonthGrid,
} from '@/components/common';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { DateFormatPreference } from '@/types/models';
import {
  addDaysToISODate,
  formatDateForDisplay,
  getMonthLabel,
  getMonthRange,
  getTodayISODate,
  isValidISODate,
  normalizeDateRange,
  parseISODateParts,
} from '@/utils/date';

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  dateFormat: DateFormatPreference;
  onChange: (range: { startDate: string; endDate: string; wasReversed: boolean }) => void;
  startLabel?: string;
  endLabel?: string;
}

export function DateRangePicker({
  startDate,
  endDate,
  dateFormat,
  onChange,
  startLabel = 'Start Date',
  endLabel = 'End Date',
}: DateRangePickerProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const normalized = normalizeDateRange(startDate, endDate);

  const [visible, setVisible] = useState(false);
  const [selectingEnd, setSelectingEnd] = useState(false);
  const [draftStart, setDraftStart] = useState(normalized.startDate);
  const [draftEnd, setDraftEnd] = useState(normalized.endDate);
  const [adjustedNotice, setAdjustedNotice] = useState(false);

  const initialParts = parseISODateParts(normalized.startDate);
  const [viewYear, setViewYear] = useState(initialParts.year);
  const [viewMonth, setViewMonth] = useState(initialParts.month);

  const openModal = (target: 'start' | 'end') => {
    const safe = normalizeDateRange(startDate, endDate);
    setDraftStart(safe.startDate);
    setDraftEnd(safe.endDate);
    setSelectingEnd(target === 'end');
    setAdjustedNotice(safe.wasReversed);

    const anchor = target === 'end' ? safe.endDate : safe.startDate;
    const parts = parseISODateParts(anchor);
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

  const handleTapDay = (cellISO: string) => {
    if (!selectingEnd) {
      setDraftStart(cellISO);
      if (cellISO > draftEnd) {
        setDraftEnd(cellISO);
        setAdjustedNotice(true);
      } else {
        setAdjustedNotice(false);
      }
      setSelectingEnd(true);
    } else {
      if (cellISO < draftStart) {
        setDraftEnd(draftStart);
        setDraftStart(cellISO);
        setAdjustedNotice(true);
      } else {
        setDraftEnd(cellISO);
        setAdjustedNotice(false);
      }
      setSelectingEnd(false);
    }
  };

  const handleApply = () => {
    const finalRange = normalizeDateRange(draftStart, draftEnd);
    onChange(finalRange);
    setVisible(false);
  };

  const today = getTodayISODate();
  const orderedDraft = normalizeDateRange(draftStart, draftEnd);
  const modalMaxWidth = Math.min(width - Spacing.four, 400);

  return (
    <View style={styles.container}>
      <View style={styles.triggerRow}>
        <Pressable
          onPress={() => openModal('start')}
          accessibilityRole="button"
          accessibilityLabel={`${startLabel}: ${formatDateForDisplay(normalized.startDate, dateFormat)}`}
          style={({ pressed }) => [
            styles.dateCard,
            { backgroundColor: theme.surface, borderColor: theme.border },
            pressed && styles.pressed,
          ]}>
          <Text style={[styles.dateCardLabel, { color: theme.textSecondary }]}>
            {startLabel}
          </Text>
          <View style={styles.dateValueRow}>
            <Ionicons name="calendar-outline" size={15} color={theme.primary} />
            <Text style={[styles.dateCardValue, { color: theme.text }]} numberOfLines={1}>
              {formatDateForDisplay(normalized.startDate, dateFormat)}
            </Text>
          </View>
        </Pressable>

        <View style={styles.arrowWrap}>
          <Ionicons name="arrow-forward" size={16} color={theme.textMuted} />
        </View>

        <Pressable
          onPress={() => openModal('end')}
          accessibilityRole="button"
          accessibilityLabel={`${endLabel}: ${formatDateForDisplay(normalized.endDate, dateFormat)}`}
          style={({ pressed }) => [
            styles.dateCard,
            { backgroundColor: theme.surface, borderColor: theme.border },
            pressed && styles.pressed,
          ]}>
          <Text style={[styles.dateCardLabel, { color: theme.textSecondary }]}>
            {endLabel}
          </Text>
          <View style={styles.dateValueRow}>
            <Ionicons name="calendar-outline" size={15} color={theme.primary} />
            <Text style={[styles.dateCardValue, { color: theme.text }]} numberOfLines={1}>
              {formatDateForDisplay(normalized.endDate, dateFormat)}
            </Text>
          </View>
        </Pressable>
      </View>

      <BottomSheetModal
        visible={visible}
        onClose={() => setVisible(false)}
        variant="center"
        maxWidth={modalMaxWidth}>
        <View style={styles.modalTopRow}>
          <Text style={[styles.modalTitle, { color: theme.text }]}>
            Select Date Range
          </Text>
          <Pressable
            onPress={() => setVisible(false)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close calendar">
            <Ionicons name="chevron-down" size={22} color={theme.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.stepTabs}>
          <Pressable
            onPress={() => {
              setSelectingEnd(false);
              if (isValidISODate(orderedDraft.startDate)) {
                const p = parseISODateParts(orderedDraft.startDate);
                setViewYear(p.year);
                setViewMonth(p.month);
              }
            }}
            style={[
              styles.stepTab,
              {
                backgroundColor: !selectingEnd
                  ? theme.primarySoft
                  : theme.surfaceElevated,
                borderColor: !selectingEnd ? theme.primary : theme.border,
              },
            ]}>
            <Text style={[styles.stepTabCaption, { color: theme.textSecondary }]}>
              {startLabel}
            </Text>
            <Text
              style={[
                styles.stepTabDate,
                { color: !selectingEnd ? theme.primary : theme.text },
              ]}
              numberOfLines={1}>
              {formatDateForDisplay(orderedDraft.startDate, dateFormat)}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              setSelectingEnd(true);
              if (isValidISODate(orderedDraft.endDate)) {
                const p = parseISODateParts(orderedDraft.endDate);
                setViewYear(p.year);
                setViewMonth(p.month);
              }
            }}
            style={[
              styles.stepTab,
              {
                backgroundColor: selectingEnd
                  ? theme.primarySoft
                  : theme.surfaceElevated,
                borderColor: selectingEnd ? theme.primary : theme.border,
              },
            ]}>
            <Text style={[styles.stepTabCaption, { color: theme.textSecondary }]}>
              {endLabel}
            </Text>
            <Text
              style={[
                styles.stepTabDate,
                { color: selectingEnd ? theme.primary : theme.text },
              ]}
              numberOfLines={1}>
              {formatDateForDisplay(orderedDraft.endDate, dateFormat)}
            </Text>
          </Pressable>
        </View>

        {adjustedNotice ? (
          <Text style={[styles.noticeText, { color: theme.textSecondary }]}>
            Dates ordered automatically from earliest to latest.
          </Text>
        ) : null}

        <View style={styles.shortcutsRow}>
          <Pressable
            onPress={() => {
              const s = addDaysToISODate(today, -6);
              setDraftStart(s);
              setDraftEnd(today);
              setAdjustedNotice(false);
              setSelectingEnd(false);
            }}
            style={[
              styles.shortcutChip,
              { backgroundColor: theme.surfaceElevated, borderColor: theme.border },
            ]}>
            <Text style={[styles.shortcutText, { color: theme.text }]}>Last 7d</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              const s = addDaysToISODate(today, -29);
              setDraftStart(s);
              setDraftEnd(today);
              setAdjustedNotice(false);
              setSelectingEnd(false);
            }}
            style={[
              styles.shortcutChip,
              { backgroundColor: theme.surfaceElevated, borderColor: theme.border },
            ]}>
            <Text style={[styles.shortcutText, { color: theme.text }]}>Last 30d</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              const p = parseISODateParts(today);
              const m = getMonthRange(p.year, p.month);
              setDraftStart(m.startDate);
              setDraftEnd(m.endDate);
              setAdjustedNotice(false);
              setSelectingEnd(false);
            }}
            style={[
              styles.shortcutChip,
              { backgroundColor: theme.surfaceElevated, borderColor: theme.border },
            ]}>
            <Text style={[styles.shortcutText, { color: theme.text }]}>This Month</Text>
          </Pressable>
        </View>

        <View style={styles.monthHeader}>
          <Pressable
            onPress={() => stepMonth(-1)}
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            style={[styles.navBtn, { borderColor: theme.border }]}>
            <Ionicons name="chevron-back" size={18} color={theme.text} />
          </Pressable>
          <Text style={[styles.monthTitle, { color: theme.text }]}>
            {getMonthLabel(viewYear, viewMonth)}
          </Text>
          <Pressable
            onPress={() => stepMonth(1)}
            accessibilityRole="button"
            accessibilityLabel="Next month"
            style={[styles.navBtn, { borderColor: theme.border }]}>
            <Ionicons name="chevron-forward" size={18} color={theme.text} />
          </Pressable>
        </View>

        <CalendarMonthGrid
          year={viewYear}
          month={viewMonth}
          rangeStart={orderedDraft.startDate}
          rangeEnd={orderedDraft.endDate}
          todayISO={today}
          onSelectDate={handleTapDay}
        />

        <View style={styles.modalActions}>
          <View style={styles.flex1}>
            <AppButton
              label="Cancel"
              variant="outline"
              onPress={() => setVisible(false)}
              fullWidth
            />
          </View>
          <View style={styles.flex1}>
            <AppButton label="Apply Range" onPress={handleApply} fullWidth />
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
  triggerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  dateCard: {
    flex: 1,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.two + 2,
    gap: 3,
  },
  dateCardLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  dateValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateCardValue: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  arrowWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.78,
  },
  modalTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  stepTabs: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  stepTab: {
    flex: 1,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.two,
    gap: 2,
  },
  stepTabCaption: {
    fontSize: 11,
    fontWeight: '600',
  },
  stepTabDate: {
    fontSize: 13,
    fontWeight: '700',
  },
  noticeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  shortcutsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  shortcutChip: {
    paddingHorizontal: Spacing.two + 4,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  shortcutText: {
    fontSize: 12,
    fontWeight: '600',
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  modalActions: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  flex1: {
    flex: 1,
  },
});
