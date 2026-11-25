import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Rect } from 'react-native-svg';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { CategoryBreakdownItem, DailyTotalItem } from '@/types/reports';
import { formatMoney } from '@/utils/money';

interface CategoryDonutChartProps {
  items: readonly CategoryBreakdownItem[];
  totalMinor: number;
  currencyCode: string;
  maxLegendItems?: number;
}

export function CategoryDonutChart({
  items,
  totalMinor,
  currencyCode,
  maxLegendItems = 6,
}: CategoryDonutChartProps) {
  const theme = useTheme();
  const size = 148;
  const strokeWidth = 22;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  if (items.length === 0 || totalMinor <= 0) {
    return (
      <Text style={[styles.emptyChartText, { color: theme.textSecondary }]}>
        No expense data in this period to chart.
      </Text>
    );
  }

  const { segments } = items.reduce<{
    offset: number;
    segments: {
      key: string;
      color: string;
      strokeDasharray: string;
      strokeDashoffset: number;
    }[];
  }>(
    (acc, item) => {
      const ratio = item.totalMinor / totalMinor;
      const strokeLength = ratio * circumference;
      acc.segments.push({
        key: item.categoryId ?? item.categoryName,
        color: item.color,
        strokeDasharray: `${strokeLength} ${circumference - strokeLength}`,
        strokeDashoffset: -acc.offset,
      });
      acc.offset += strokeLength;
      return acc;
    },
    { offset: 0, segments: [] },
  );

  const visibleLegend = items.slice(0, maxLegendItems);

  return (
    <View style={styles.donutLayout}>
      <View style={styles.donutWrap}>
        <Svg width={size} height={size}>
          <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={theme.surfaceElevated}
              strokeWidth={strokeWidth}
              fill="transparent"
            />
            {segments.map((seg) => (
              <Circle
                key={seg.key}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke={seg.color}
                strokeWidth={strokeWidth}
                strokeDasharray={seg.strokeDasharray}
                strokeDashoffset={seg.strokeDashoffset}
                strokeLinecap="butt"
                fill="transparent"
              />
            ))}
          </G>
        </Svg>
        <View style={styles.donutCenter}>
          <Text style={[styles.donutCenterLabel, { color: theme.textMuted }]}>
            Spent
          </Text>
          <Text
            style={[styles.donutCenterValue, { color: theme.text }]}
            numberOfLines={1}
            adjustsFontSizeToFit>
            {formatMoney(totalMinor, currencyCode)}
          </Text>
        </View>
      </View>

      <View style={styles.legendList}>
        {visibleLegend.map((item) => (
          <View key={item.categoryId ?? item.categoryName} style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: item.color }]} />
            <Text style={[styles.legendName, { color: theme.text }]} numberOfLines={1}>
              {item.categoryName}
            </Text>
            <Text style={[styles.legendPct, { color: theme.textSecondary }]}>
              {item.percentage.toFixed(0)}%
            </Text>
            <Text style={[styles.legendAmt, { color: theme.text }]}>
              {formatMoney(item.totalMinor, currencyCode)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

interface IncomeExpenseBarChartProps {
  incomeMinor: number;
  expenseMinor: number;
  currencyCode: string;
}

export function IncomeExpenseBarChart({
  incomeMinor,
  expenseMinor,
  currencyCode,
}: IncomeExpenseBarChartProps) {
  const theme = useTheme();
  const maxVal = Math.max(incomeMinor, expenseMinor, 1);
  const chartHeight = 110;
  const barWidth = 44;

  const incomeHeight = Math.max(
    incomeMinor > 0 ? 6 : 0,
    Math.round((incomeMinor / maxVal) * chartHeight),
  );
  const expenseHeight = Math.max(
    expenseMinor > 0 ? 6 : 0,
    Math.round((expenseMinor / maxVal) * chartHeight),
  );

  return (
    <View style={styles.barComparisonWrap}>
      <View style={styles.barColumn}>
        <Text style={[styles.barValue, { color: theme.income }]}>
          {formatMoney(incomeMinor, currencyCode)}
        </Text>
        <Svg width={barWidth} height={chartHeight}>
          <Rect
            x={0}
            y={0}
            width={barWidth}
            height={chartHeight}
            rx={8}
            fill={theme.surfaceElevated}
          />
          {incomeHeight > 0 ? (
            <Rect
              x={0}
              y={chartHeight - incomeHeight}
              width={barWidth}
              height={incomeHeight}
              rx={8}
              fill={theme.income}
            />
          ) : null}
        </Svg>
        <Text style={[styles.barLabel, { color: theme.textSecondary }]}>Income</Text>
      </View>

      <View style={styles.barColumn}>
        <Text style={[styles.barValue, { color: theme.expense }]}>
          {formatMoney(expenseMinor, currencyCode)}
        </Text>
        <Svg width={barWidth} height={chartHeight}>
          <Rect
            x={0}
            y={0}
            width={barWidth}
            height={chartHeight}
            rx={8}
            fill={theme.surfaceElevated}
          />
          {expenseHeight > 0 ? (
            <Rect
              x={0}
              y={chartHeight - expenseHeight}
              width={barWidth}
              height={expenseHeight}
              rx={8}
              fill={theme.expense}
            />
          ) : null}
        </Svg>
        <Text style={[styles.barLabel, { color: theme.textSecondary }]}>Expenses</Text>
      </View>
    </View>
  );
}

interface DailySpendingTrendChartProps {
  dailyTotals: readonly DailyTotalItem[];
  currencyCode: string;
}

export function DailySpendingTrendChart({
  dailyTotals,
  currencyCode,
}: DailySpendingTrendChartProps) {
  const theme = useTheme();
  if (dailyTotals.length === 0) {
    return (
      <Text style={[styles.emptyChartText, { color: theme.textSecondary }]}>
        No daily data available for this range.
      </Text>
    );
  }

  // Bucket into at most 31 bars if range is a full year so SVG remains legible
  const bucketSize = dailyTotals.length > 31 ? Math.ceil(dailyTotals.length / 24) : 1;
  const buckets: { label: string; expenseMinor: number }[] = [];

  for (let i = 0; i < dailyTotals.length; i += bucketSize) {
    const slice = dailyTotals.slice(i, i + bucketSize);
    const total = slice.reduce((sum, item) => sum + item.expenseMinor, 0);
    buckets.push({
      label: slice[0].date.slice(5),
      expenseMinor: total,
    });
  }

  const maxExpense = Math.max(...buckets.map((b) => b.expenseMinor), 1);
  const width = 300;
  const height = 110;
  const gap = 3;
  const barW = Math.max(3, (width - gap * (buckets.length - 1)) / buckets.length);

  return (
    <View style={styles.trendWrap}>
      <View style={styles.trendMetaRow}>
        <Text style={[styles.trendCaption, { color: theme.textSecondary }]}>
          {bucketSize > 1 ? `Grouped (${bucketSize}-day buckets)` : 'Daily expense trend'}
        </Text>
        <Text style={[styles.trendPeak, { color: theme.text }]}>
          Peak: {formatMoney(maxExpense === 1 && buckets.every((b) => b.expenseMinor === 0) ? 0 : maxExpense, currencyCode)}
        </Text>
      </View>

      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        {buckets.map((bucket, idx) => {
          const barH =
            bucket.expenseMinor > 0
              ? Math.max(4, Math.round((bucket.expenseMinor / maxExpense) * (height - 8)))
              : 2;
          const x = idx * (barW + gap);
          const y = height - barH;
          return (
            <Rect
              key={`${bucket.label}-${idx}`}
              x={x}
              y={y}
              width={barW}
              height={barH}
              rx={2}
              fill={bucket.expenseMinor > 0 ? theme.primary : theme.border}
            />
          );
        })}
      </Svg>

      <View style={styles.trendAxisLabels}>
        <Text style={[styles.axisText, { color: theme.textMuted }]}>
          {dailyTotals[0].date}
        </Text>
        <Text style={[styles.axisText, { color: theme.textMuted }]}>
          {dailyTotals[dailyTotals.length - 1].date}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  emptyChartText: {
    fontSize: 13,
    paddingVertical: Spacing.two,
  },
  donutLayout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    flexWrap: 'wrap',
  },
  donutWrap: {
    width: 148,
    height: 148,
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutCenter: {
    position: 'absolute',
    width: 90,
    alignItems: 'center',
  },
  donutCenterLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  donutCenterValue: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  legendList: {
    flex: 1,
    minWidth: 160,
    gap: Spacing.one + 2,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  legendPct: {
    fontSize: 12,
    width: 34,
    textAlign: 'right',
  },
  legendAmt: {
    fontSize: 12,
    fontWeight: '600',
  },
  barComparisonWrap: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    paddingVertical: Spacing.two,
  },
  barColumn: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  barValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  barLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  trendWrap: {
    gap: Spacing.two,
  },
  trendMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  trendCaption: {
    fontSize: 12,
  },
  trendPeak: {
    fontSize: 12,
    fontWeight: '600',
  },
  trendAxisLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  axisText: {
    fontSize: 11,
  },
});
