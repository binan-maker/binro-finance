import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Stop,
} from 'react-native-svg';

import type { CurrencyConfig } from '@/constants/currencies';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type {
  CategoryBreakdownItem,
  ComparisonBucket,
  DailyTotalItem,
  SpendingTrendPoint,
  SpendingTrendSeries,
  TrendPoint,
} from '@/types/reports';
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
  hideLegend?: boolean;
}

export function CategoryDonutChart({
  items,
  totalMinor,
  currencyCode,
  catalog,
  maxLegendItems = 5,
  compact = false,
  hideLegend = false,
}: CategoryDonutChartProps) {
  const theme = useTheme();
  const size = compact ? 118 : 148;
  const strokeWidth = compact ? 16 : 22;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  if (items.length === 0 || totalMinor <= 0) {
    return (
      <Text style={[styles.emptyChartText, { color: theme.textSecondary }]}>
        No expense data in this period to chart.
      </Text>
    );
  }

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
    <View style={[styles.donutLayout, hideLegend && styles.donutCentered]}>
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

      {!hideLegend ? (
        <View style={styles.legendList}>
          {displayItems.map((item) => (
            <View key={item.categoryId ?? item.categoryName} style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: item.color }]} />
              <Text style={[styles.legendName, { color: theme.text }]} numberOfLines={1}>
                {item.categoryName}
              </Text>
              <Text
                style={[styles.legendAmt, { color: theme.textSecondary }]}
                numberOfLines={1}>
                {formatMoney(item.totalMinor, currencyCode, { catalog })}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

interface IncomeExpenseComparisonChartProps {
  buckets: readonly ComparisonBucket[];
  currencyCode: string;
  catalog?: readonly CurrencyConfig[];
}

export function IncomeExpenseComparisonChart({
  buckets,
  currencyCode,
  catalog,
}: IncomeExpenseComparisonChartProps) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const hasData = buckets.some((b) => b.incomeMinor > 0 || b.expenseMinor > 0);
  if (buckets.length === 0 || !hasData) {
    return (
      <Text style={[styles.emptyChartText, { color: theme.textSecondary }]}>
        No income or expense activity in this period to compare.
      </Text>
    );
  }

  const maxVal = Math.max(
    ...buckets.map((b) => Math.max(b.incomeMinor, b.expenseMinor)),
    1,
  );
  const chartHeight = 128;
  const availableWidth = Math.max(width - 80, 240);
  const groupMinWidth = buckets.length <= 8 ? availableWidth / buckets.length : 42;
  const labelStride = Math.max(1, Math.ceil(buckets.length / 7));

  const selectedBucket =
    buckets.find((b) => b.key === selectedKey) ??
    [...buckets].reverse().find((b) => b.incomeMinor > 0 || b.expenseMinor > 0) ??
    buckets[0];

  return (
    <View style={styles.comparisonChartWrap}>
      {/* Legend + Active Bucket Tooltip */}
      <View style={styles.comparisonTopMeta}>
        <View style={styles.legendPills}>
          <View style={styles.miniLegend}>
            <View style={[styles.miniDot, { backgroundColor: theme.income }]} />
            <Text style={[styles.miniLegendText, { color: theme.textSecondary }]}>
              Income
            </Text>
          </View>
          <View style={styles.miniLegend}>
            <View style={[styles.miniDot, { backgroundColor: theme.expense }]} />
            <Text style={[styles.miniLegendText, { color: theme.textSecondary }]}>
              Expenses
            </Text>
          </View>
        </View>

        {selectedBucket ? (
          <View
            style={[
              styles.tooltipBadge,
              { backgroundColor: theme.surfaceElevated, borderColor: theme.border },
            ]}>
            <Text style={[styles.tooltipTitle, { color: theme.text }]}>
              {selectedBucket.label}:
            </Text>
            <Text style={[styles.tooltipVal, { color: theme.income }]}>
              +{formatMoney(selectedBucket.incomeMinor, currencyCode, { catalog })}
            </Text>
            <Text style={[styles.tooltipVal, { color: theme.expense }]}>
              -{formatMoney(selectedBucket.expenseMinor, currencyCode, { catalog })}
            </Text>
          </View>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={buckets.length > 8}
        contentContainerStyle={[
          styles.groupedBarsScroll,
          { minWidth: availableWidth },
        ]}>
        {buckets.map((bucket, idx) => {
          const isSelected = selectedBucket?.key === bucket.key;
          const incH =
            bucket.incomeMinor > 0
              ? Math.max(5, Math.round((bucket.incomeMinor / maxVal) * (chartHeight - 10)))
              : 2;
          const expH =
            bucket.expenseMinor > 0
              ? Math.max(5, Math.round((bucket.expenseMinor / maxVal) * (chartHeight - 10)))
              : 2;
          const showLabel =
            idx === 0 || idx === buckets.length - 1 || idx % labelStride === 0;

          return (
            <Pressable
              key={bucket.key}
              onPress={() => setSelectedKey(bucket.key)}
              accessibilityRole="button"
              accessibilityLabel={`${bucket.label}: income ${formatMoney(bucket.incomeMinor, currencyCode, { catalog })}, expense ${formatMoney(bucket.expenseMinor, currencyCode, { catalog })}`}
              style={[
                styles.bucketCol,
                { width: groupMinWidth },
                isSelected && {
                  backgroundColor: `${theme.surfaceElevated}`,
                  borderRadius: Radius.sm,
                },
              ]}>
              <View style={[styles.pairBarsWrap, { height: chartHeight }]}>
                <View
                  style={[
                    styles.singleBar,
                    {
                      height: incH,
                      backgroundColor:
                        bucket.incomeMinor > 0 ? theme.income : theme.border,
                    },
                  ]}
                />
                <View
                  style={[
                    styles.singleBar,
                    {
                      height: expH,
                      backgroundColor:
                        bucket.expenseMinor > 0 ? theme.expense : theme.border,
                    },
                  ]}
                />
              </View>
              <Text
                style={[
                  styles.bucketLabel,
                  {
                    color: isSelected ? theme.text : theme.textMuted,
                    opacity: showLabel || isSelected ? 1 : 0,
                  },
                ]}
                numberOfLines={1}>
                {bucket.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

interface DynamicSpendingTrendChartProps {
  trend: SpendingTrendSeries;
  currencyCode: string;
  catalog?: readonly CurrencyConfig[];
}

export function DynamicSpendingTrendChart({
  trend,
  currencyCode,
  catalog,
}: DynamicSpendingTrendChartProps) {
  const theme = useTheme();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const hasSpending = trend.points.some((p) => p.amountMinor > 0);
  if (trend.points.length === 0 || !hasSpending) {
    return (
      <Text style={[styles.emptyChartText, { color: theme.textSecondary }]}>
        No expense activity recorded in this period.
      </Text>
    );
  }

  const maxAmount = Math.max(...trend.points.map((p) => p.amountMinor), 1);
  const chartHeight = 112;
  const labelStride = Math.max(1, Math.ceil(trend.points.length / 6));

  const peakPoint = trend.points.reduce(
    (best, pt) => (pt.amountMinor > best.amountMinor ? pt : best),
    trend.points[0],
  );
  const selectedPoint =
    trend.points.find((p) => p.key === selectedKey) ?? peakPoint;

  return (
    <View style={styles.trendWrap}>
      <View style={styles.trendMetaRow}>
        <Text style={[styles.trendCaption, { color: theme.textSecondary }]}>
          {trend.subtitle}
        </Text>
        <Text style={[styles.trendPeak, { color: theme.text }]}>
          {selectedPoint.detailLabel}:{' '}
          {formatMoney(selectedPoint.amountMinor, currencyCode, { catalog })}
        </Text>
      </View>

      <View style={styles.trendBarsRow}>
        {trend.points.map((pt) => {
          const barH =
            pt.amountMinor > 0
              ? Math.max(5, Math.round((pt.amountMinor / maxAmount) * (chartHeight - 10)))
              : 3;
          const isSelected = selectedPoint.key === pt.key;
          return (
            <Pressable
              key={pt.key}
              onPress={() => setSelectedKey(pt.key)}
              accessibilityRole="button"
              accessibilityLabel={`${pt.detailLabel}: ${formatMoney(pt.amountMinor, currencyCode, { catalog })}`}
              style={styles.trendBarSlot}>
              <View style={[styles.trendBarTrack, { height: chartHeight }]}>
                <View
                  style={[
                    styles.trendBarFill,
                    {
                      height: barH,
                      backgroundColor:
                        pt.amountMinor === 0
                          ? theme.border
                          : isSelected
                            ? theme.primaryBright
                            : theme.primary,
                      opacity: pt.amountMinor === 0 ? 0.5 : isSelected ? 1 : 0.8,
                    },
                  ]}
                />
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.trendAxisLabels}>
        {trend.points.map((pt, idx) => {
          const show =
            idx === 0 || idx === trend.points.length - 1 || idx % labelStride === 0;
          if (!show) return null;
          return (
            <Text key={pt.key} style={[styles.axisText, { color: theme.textMuted }]}>
              {pt.label}
            </Text>
          );
        })}
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
  return (
    <IncomeExpenseComparisonChart
      buckets={[
        {
          key: 'total',
          label: 'Period',
          incomeMinor,
          expenseMinor,
        },
      ]}
      currencyCode={currencyCode}
      catalog={catalog}
    />
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
  const points: SpendingTrendPoint[] = dailyTotals.map((d) => ({
    key: d.date,
    label: d.date.slice(5),
    detailLabel: d.date,
    amountMinor: d.expenseMinor,
  }));
  return (
    <DynamicSpendingTrendChart
      trend={{
        mode: 'daily',
        subtitle: 'Daily expense trend',
        points,
      }}
      currencyCode={currencyCode}
      catalog={catalog}
    />
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
  donutCentered: {
    justifyContent: 'center',
  },
  donutWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutCenter: {
    position: 'absolute',
    width: 78,
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
  comparisonChartWrap: {
    gap: Spacing.two,
  },
  comparisonTopMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  legendPills: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  miniLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  miniDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  miniLegendText: {
    fontSize: 12,
    fontWeight: '600',
  },
  tooltipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  tooltipTitle: {
    fontSize: 11,
    fontWeight: '700',
  },
  tooltipVal: {
    fontSize: 11,
    fontWeight: '700',
  },
  groupedBarsScroll: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingVertical: 4,
  },
  bucketCol: {
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 2,
    gap: 6,
  },
  pairBarsWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  singleBar: {
    width: 10,
    borderRadius: 4,
  },
  bucketLabel: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  trendWrap: {
    gap: Spacing.two,
  },
  trendMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  trendCaption: {
    fontSize: 12,
    fontWeight: '500',
  },
  trendPeak: {
    fontSize: 12,
    fontWeight: '700',
  },
  trendBarsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
  },
  trendBarSlot: {
    flex: 1,
    alignItems: 'center',
  },
  trendBarTrack: {
    width: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  trendBarFill: {
    width: '82%',
    maxWidth: 18,
    minWidth: 3,
    borderRadius: 4,
  },
  trendAxisLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  axisText: {
    fontSize: 10,
    fontWeight: '600',
  },
});
