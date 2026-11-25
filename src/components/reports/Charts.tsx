import { StyleSheet, Text, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';

import type { CurrencyConfig } from '@/constants/currencies';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { CategoryBreakdownItem, DailyTotalItem, TrendPoint } from '@/types/reports';
import { formatMoney } from '@/utils/money';

interface FinancialTrendLineChartProps {
  points: readonly TrendPoint[];
  currencyCode: string;
  catalog?: readonly CurrencyConfig[];
  height?: number;
}

export function FinancialTrendLineChart({
  points,
  currencyCode,
  catalog,
  height = 104,
}: FinancialTrendLineChartProps) {
  const theme = useTheme();

  if (points.length === 0) {
    return (
      <View style={[styles.trendEmpty, { height: 64 }]}>
        <Text style={[styles.emptyChartText, { color: theme.textMuted }]}>
          Add transactions to see your balance trend.
        </Text>
      </View>
    );
  }

  const width = 320;
  const padX = 8;
  const padTop = 10;
  const padBottom = 10;
  const plotHeight = height - padTop - padBottom;
  const plotWidth = width - padX * 2;

  const values = points.map((p) => p.valueMinor);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const span = maxVal - minVal;

  const coords = points.map((pt, index) => {
    const x =
      points.length === 1
        ? width / 2
        : padX + (index / (points.length - 1)) * plotWidth;
    const ratio = span === 0 ? 0.5 : (pt.valueMinor - minVal) / span;
    const y = padTop + (1 - ratio) * plotHeight;
    return { x, y, pt };
  });

  const linePath = coords
    .map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(' ');

  const first = coords[0];
  const last = coords[coords.length - 1];
  const areaPath =
    coords.length > 1
      ? `${linePath} L ${last.x.toFixed(1)} ${height} L ${first.x.toFixed(1)} ${height} Z`
      : '';

  return (
    <View style={styles.trendLineWrap}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <Defs>
          <LinearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={theme.primary} stopOpacity="0.28" />
            <Stop offset="100%" stopColor={theme.primary} stopOpacity="0.0" />
          </LinearGradient>
        </Defs>

        <Line
          x1={padX}
          y1={padTop}
          x2={width - padX}
          y2={padTop}
          stroke={theme.border}
          strokeDasharray="3 4"
          strokeWidth={1}
        />
        <Line
          x1={padX}
          y1={padTop + plotHeight / 2}
          x2={width - padX}
          y2={padTop + plotHeight / 2}
          stroke={theme.border}
          strokeDasharray="3 4"
          strokeWidth={1}
        />
        <Line
          x1={padX}
          y1={height - padBottom}
          x2={width - padX}
          y2={height - padBottom}
          stroke={theme.border}
          strokeDasharray="3 4"
          strokeWidth={1}
        />

        {areaPath ? <Path d={areaPath} fill="url(#trendGrad)" /> : null}

        {coords.length > 1 ? (
          <Path
            d={linePath}
            fill="none"
            stroke={theme.primary}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        <Circle
          cx={last.x}
          cy={last.y}
          r={4}
          fill={theme.primary}
          stroke={theme.surface}
          strokeWidth={2}
        />
      </Svg>

      <View style={styles.trendAxisLabels}>
        <Text style={[styles.axisText, { color: theme.textMuted }]}>
          {points[0].label} ({formatMoney(points[0].valueMinor, currencyCode, { catalog })})
        </Text>
        <Text style={[styles.axisText, { color: theme.textMuted }]}>
          {points[points.length - 1].label}
        </Text>
      </View>
    </View>
  );
}

interface CategoryDonutChartProps {
  items: readonly CategoryBreakdownItem[];
  totalMinor: number;
  currencyCode: string;
  catalog?: readonly CurrencyConfig[];
  maxLegendItems?: number;
  compact?: boolean;
}

export function CategoryDonutChart({
  items,
  totalMinor,
  currencyCode,
  catalog,
  maxLegendItems = 5,
  compact = false,
}: CategoryDonutChartProps) {
  const theme = useTheme();
  const size = compact ? 118 : 140;
  const strokeWidth = compact ? 16 : 20;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  if (items.length === 0 || totalMinor <= 0) {
    return (
      <Text style={[styles.emptyChartText, { color: theme.textSecondary }]}>
        No expense data in this period to chart.
      </Text>
    );
  }

  // Group overflow categories into "Others" so card stays compact and complete
  let displayItems: CategoryBreakdownItem[] = [];
  if (items.length <= maxLegendItems) {
    displayItems = [...items];
  } else {
    const top = items.slice(0, maxLegendItems - 1);
    const rest = items.slice(maxLegendItems - 1);
    const restTotal = rest.reduce((sum, i) => sum + i.totalMinor, 0);
    const restCount = rest.reduce((sum, i) => sum + i.transactionCount, 0);
    displayItems = [
      ...top,
      {
        categoryId: '__others__',
        categoryName: 'Others',
        color: '#475569',
        icon: 'tag',
        totalMinor: restTotal,
        percentage:
          totalMinor > 0 ? Math.round((restTotal / totalMinor) * 1000) / 10 : 0,
        transactionCount: restCount,
      },
    ];
  }

  const { segments } = displayItems.reduce<{
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

  return (
    <View style={styles.donutLayout}>
      <View style={[styles.donutWrap, { width: size, height: size }]}>
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
            {formatMoney(totalMinor, currencyCode, { catalog })}
          </Text>
        </View>
      </View>

      <View style={styles.legendList}>
        {displayItems.map((item) => (
          <View key={item.categoryId ?? item.categoryName} style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: item.color }]} />
            <Text style={[styles.legendName, { color: theme.text }]} numberOfLines={1}>
              {item.categoryName}
            </Text>
            <Text style={[styles.legendAmt, { color: theme.textSecondary }]} numberOfLines={1}>
              {formatMoney(item.totalMinor, currencyCode, { catalog })}
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
  catalog?: readonly CurrencyConfig[];
}

export function IncomeExpenseBarChart({
  incomeMinor,
  expenseMinor,
  currencyCode,
  catalog,
}: IncomeExpenseBarChartProps) {
  const theme = useTheme();
  const maxVal = Math.max(incomeMinor, expenseMinor, 1);
  const chartHeight = 108;
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
          {formatMoney(incomeMinor, currencyCode, { catalog })}
        </Text>
        <Svg width={barWidth} height={chartHeight}>
          <Rect
            x={0}
            y={0}
            width={barWidth}
            height={chartHeight}
            rx={10}
            fill={theme.surfaceElevated}
          />
          {incomeHeight > 0 ? (
            <Rect
              x={0}
              y={chartHeight - incomeHeight}
              width={barWidth}
              height={incomeHeight}
              rx={10}
              fill={theme.income}
            />
          ) : null}
        </Svg>
        <Text style={[styles.barLabel, { color: theme.textSecondary }]}>Income</Text>
      </View>

      <View style={styles.barColumn}>
        <Text style={[styles.barValue, { color: theme.expense }]}>
          {formatMoney(expenseMinor, currencyCode, { catalog })}
        </Text>
        <Svg width={barWidth} height={chartHeight}>
          <Rect
            x={0}
            y={0}
            width={barWidth}
            height={chartHeight}
            rx={10}
            fill={theme.surfaceElevated}
          />
          {expenseHeight > 0 ? (
            <Rect
              x={0}
              y={chartHeight - expenseHeight}
              width={barWidth}
              height={expenseHeight}
              rx={10}
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
  catalog?: readonly CurrencyConfig[];
}

export function DailySpendingTrendChart({
  dailyTotals,
  currencyCode,
  catalog,
}: DailySpendingTrendChartProps) {
  const theme = useTheme();
  if (dailyTotals.length === 0) {
    return (
      <Text style={[styles.emptyChartText, { color: theme.textSecondary }]}>
        No daily data available for this range.
      </Text>
    );
  }

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
          Peak:{' '}
          {formatMoney(
            maxExpense === 1 && buckets.every((b) => b.expenseMinor === 0)
              ? 0
              : maxExpense,
            currencyCode,
            { catalog },
          )}
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
  trendEmpty: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  trendLineWrap: {
    gap: Spacing.one,
  },
  donutLayout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  donutWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutCenter: {
    position: 'absolute',
    width: 76,
    alignItems: 'center',
  },
  donutCenterLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  donutCenterValue: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  legendList: {
    flex: 1,
    gap: Spacing.one + 2,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  legendName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
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
