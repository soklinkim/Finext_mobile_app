import { useState } from 'react';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { Icon } from './Icon';
import { Text } from './Text';
import { colors, fontFamily, radius } from '@/theme';
import { useI18n } from '@/i18n';
import { formatAxis } from '@/lib/format';
import { formatMoney, type Currency } from '@/services/bookkeeping';
import { useAppTheme } from '@/theme/AppTheme';

interface Props {
  title: string;
  labels: string[];
  /** minor units, same length as labels */
  income: number[];
  expense: number[];
  currency: Currency;
  onSearch?: () => void;
  onCalendar?: () => void;
}

const HEIGHT = 210;
const TOP = 12;
const BOTTOM = 28;
const LEFT = 34;

/** Round the max up to a 1 / 2 / 5 × 10ⁿ value so the y-axis reads 1k, 5k, 10k, 15k… */
function niceMax(max: number): number {
  if (max <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  for (const m of [1, 1.5, 2, 3, 5, 7.5, 10]) if (m * pow >= max) return m * pow;
  return 10 * pow;
}

/** §6.7 — primary-50 card, paired bars (income primary-200, expense accent-expense), dotted gridlines. */
export function BarChartCard({ title, labels, income, expense, currency, onSearch, onCalendar }: Props) {
  const { t, locale } = useI18n();
  const dark = useAppTheme();
  const [width, setWidth] = useState(300);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const toUnits = (minor: number) => (currency === 'USD' ? minor / 100 : minor);
  const max = niceMax(Math.max(1, ...income.map(toUnits), ...expense.map(toUnits)));
  // Small axis ranges can round several fractions to the same integer (for
  // example, max=1 produces [0, 1, 1, 1]). Keep each SVG child key unique.
  const ticks = [...new Set([0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f)))];
  const plotH = HEIGHT - TOP - BOTTOM;
  const plotW = width - LEFT;
  const slot = plotW / Math.max(labels.length, 1);
  const barWidth = Math.max(4, Math.min(12, slot * 0.27));
  const barGap = Math.max(2, Math.min(5, slot * 0.1));
  const y = (v: number) => TOP + plotH - (Math.min(v, max) / max) * plotH;

  const summary = labels
    .map((l, i) => `${l}: ${t('chart.income')} ${formatMoney(income[i] ?? 0, currency)}, ${t('chart.expense')} ${formatMoney(expense[i] ?? 0, currency)}`)
    .join('; ');

  return (
    <View className="bg-primary-50" style={{ borderRadius: radius['2xl'], padding: 24, backgroundColor: dark ? colors.dark.surface : undefined }}>
      <View className="flex-row items-center justify-between" style={{ marginBottom: 8 }}>
        <Text variant="body" tone="primary-900">
          {title}
        </Text>
        <View className="flex-row" style={{ gap: 8 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.search')} onPress={onSearch} className="items-center justify-center rounded-sm bg-primary-200" style={{ width: 32, height: 32, backgroundColor: dark ? colors.dark.field : undefined }}>
            <Icon name="search" size={18} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.calendar')} onPress={onCalendar} className="items-center justify-center rounded-sm bg-primary-200" style={{ width: 32, height: 32, backgroundColor: dark ? colors.dark.field : undefined }}>
            <Icon name="calendar" size={18} />
          </Pressable>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary[500] }} />
          <Text variant="micro" tone="neutral-600">{t('chart.income')}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent.expense }} />
          <Text variant="micro" tone="neutral-600">{t('chart.expense')}</Text>
        </View>
      </View>
      <View onLayout={onLayout} accessible accessibilityLabel={`${title}. ${summary}`} accessibilityRole="image">
        <Svg width={width} height={HEIGHT}>
          {ticks.map((tick) => (
            <Line key={tick} x1={LEFT} x2={width} y1={y(tick)} y2={y(tick)} stroke={dark ? colors.dark.border : colors.primary[200]} strokeWidth={1} strokeDasharray="2,3" />
          ))}
          {ticks.map((tick) => (
            <SvgText key={`l${tick}`} x={LEFT - 8} y={y(tick) + 4} fontSize={11} fill={dark ? colors.dark.muted : colors.primary[500]} textAnchor="end" fontFamily={fontFamily(400, locale)}>
              {formatAxis(tick)}
            </SvgText>
          ))}
          <Line x1={LEFT} x2={width} y1={TOP + plotH} y2={TOP + plotH} stroke={dark ? colors.dark.muted : colors.primary[900]} strokeWidth={1} />
          {labels.map((label, i) => {
            const cx = LEFT + slot * i + slot / 2;
            const inH = (TOP + plotH) - y(toUnits(income[i] ?? 0));
            const exH = (TOP + plotH) - y(toUnits(expense[i] ?? 0));
            return (
              <G key={label}>
                <Rect x={cx - barWidth - barGap / 2} y={TOP + plotH - inH} width={barWidth} height={Math.max(inH, 0)} rx={3} fill={colors.primary[500]} />
                <Rect x={cx + barGap / 2} y={TOP + plotH - exH} width={barWidth} height={Math.max(exH, 0)} rx={3} fill={colors.accent.expense} />
                <SvgText x={cx} y={HEIGHT - 8} fontSize={12} fill={dark ? colors.dark.text : colors.primary[900]} textAnchor="middle" fontFamily={fontFamily(400, locale)}>
                  {label}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      </View>
    </View>
  );
}
