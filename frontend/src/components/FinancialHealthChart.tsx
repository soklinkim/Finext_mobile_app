import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { LegendSwatch, Sparkline, useChartColors, useWidth, ZoneBar } from './HealthCharts';
import { Text } from './Text';
import { useAnalysisQuery } from '@/hooks/useAnalysisQuery';
import { useLocalQuery } from '@/hooks/useLocalQuery';
import { useI18n, type TKey } from '@/i18n';
import { colors, radius, tint } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';
import { getHealthHistory, type HealthHistoryMonth, type RatioSnapshot } from '@/services/analysis';
import { formatMoney, getCashTrend } from '@/services/bookkeeping';
import { healthRatioFormula } from '@/services/formulas';
import { formatRatio } from '@/services/ratioFormat';

type Status = RatioSnapshot['status'];
type Period = 'monthly' | 'quarterly';
type Compare = 'past' | 'standard';

const STATUS_COLOR: Record<Status, string> = { green: colors.success, yellow: colors.warning, red: colors.danger, not_available: colors.neutral[500] };
const STATUS_WORD: Record<Status, string> = { green: 'On track', yellow: 'Watch', red: 'At risk', not_available: 'Needs data' };

const HISTORY_MONTHS = 6;
/** A personal goal needs at least this many complete months; with fewer, the standard target stands in. */
const MIN_PAST_MONTHS = 3;

/** The last complete months the server could check (a month whose books do not balance has no figures). */
function recentMonths(history: HealthHistoryMonth[] | undefined): HealthHistoryMonth[] {
  return (history ?? []).filter((month) => month.integrity.ok && month.features).slice(-HISTORY_MONTHS);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** The smallest gap that still counts as a real difference, in the ratio's own units (so a goal near 0 still works). */
function scaleOf(id: string): number {
  if (id.endsWith('_days')) return 5;
  if (id.includes('margin') || id.includes('expense_ratio') || id === 'revenue_growth') return 0.05;
  return 0.2;
}

interface Judged {
  ratio: RatioSnapshot;
  status: Status;
  /** what to aim for: the business's own usual level, or the standard target */
  goal: number;
  /** "My past months" was asked for but there is not enough history for this ratio yet */
  fallback: boolean;
  history: (number | null)[];
}

/**
 * Status against the chosen comparison. Standard targets: the server's own green / yellow / red. My past months: the
 * median of the last complete months is the goal; within 5% of it (or better) is on track, within 20% is to watch,
 * further is at risk. A ratio past the standard red line stays at risk whatever its history.
 */
function judge(ratio: RatioSnapshot, months: HealthHistoryMonth[], compare: Compare, period: Period): Judged {
  const history = months.map((month) => month.features?.[ratio.id] ?? null);
  const past = history.filter((value): value is number => value !== null && Number.isFinite(value));
  const standard = { ratio, status: ratio.status, goal: ratio.benchmark, fallback: false, history };
  if (compare === 'standard' || ratio.status === 'not_available' || ratio.value === null) return standard;
  // Quarter-on-quarter growth has no monthly history to compare with.
  if (past.length < MIN_PAST_MONTHS || (period === 'quarterly' && ratio.id === 'revenue_growth')) return { ...standard, fallback: true };
  const goal = median(past);
  const gap = ratio.betterWhen === 'higher' ? goal - ratio.value : ratio.value - goal;
  const relative = gap / Math.max(Math.abs(goal), scaleOf(ratio.id));
  const status: Status = ratio.status === 'red' || relative > 0.2 ? 'red' : relative > 0.05 ? 'yellow' : 'green';
  return { ratio, status, goal, fallback: false, history };
}

/** 0–100: every ratio on track counts fully, every one to watch counts half, at risk counts nothing. */
function scoreOf(items: Judged[]): number | null {
  const ready = items.filter((item) => item.status !== 'not_available');
  if (!ready.length) return null;
  const points = ready.reduce((sum, item) => sum + (item.status === 'green' ? 1 : item.status === 'yellow' ? 0.5 : 0), 0);
  return Math.round((points / ready.length) * 100);
}

/** Text colour for a status: readable on white in light mode, bright on the dark surface. */
function statusText(status: Status, dark: boolean): string {
  if (status === 'yellow') return dark ? colors.warning : colors.warningText;
  if (status === 'red') return dark ? colors.danger : colors.dangerText;
  if (status === 'green') return dark ? colors.success : colors.successText;
  return dark ? colors.dark.faint : colors.neutral[500];
}

// ------------------------------------------------------------------------------------------------ score

/** A 270° gauge, open at the bottom, filled to the score. */
function ScoreGauge({ score, color }: { score: number | null; color: string }) {
  const { track } = useChartColors();
  const { t } = useI18n();
  const size = 128;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = size / 2;
  const point = (degrees: number) => {
    const a = (degrees * Math.PI) / 180;
    return `${c + r * Math.sin(a)} ${c - r * Math.cos(a)}`;
  };
  const arc = (from: number, to: number) => `M ${point(from)} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${point(to)}`;
  const end = -135 + (270 * (score ?? 0)) / 100;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Path d={arc(-135, 135)} stroke={track} strokeWidth={stroke} strokeLinecap="round" fill="none" />
        {score !== null && score > 0 && <Path d={arc(-135, Math.max(end, -134))} stroke={color} strokeWidth={stroke} strokeLinecap="round" fill="none" />}
      </Svg>
      <Text variant="title-lg" weight={700} tone="primary-900" style={{ fontSize: 36, lineHeight: 42 }}>{score ?? '—'}</Text>
      <Text variant="micro" tone="neutral-600">{t('health.outOf')}</Text>
    </View>
  );
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: tint(color, 0.16) }}>
      <Text variant="micro" weight={700} style={{ color }}>{label}</Text>
    </View>
  );
}

function ScoreHeader({ items }: { items: Judged[] }) {
  const { t } = useI18n();
  const dark = useAppTheme();
  const score = scoreOf(items);
  const count = (status: Status) => items.filter((item) => item.status === status).length;
  const first = items.find((item) => item.status === 'red') ?? items.find((item) => item.status === 'yellow');
  const tier: TKey = score === null ? 'health.tier.building' : score >= 80 ? 'health.tier.healthy' : score >= 55 ? 'health.tier.fair' : 'health.tier.weak';
  const color = score === null ? colors.neutral[500] : score >= 80 ? colors.success : score >= 55 ? colors.warning : colors.danger;
  const name = first?.ratio.label.toLowerCase() ?? '';
  const summary = score === null ? t('health.summary.building')
    : !first ? t('health.summary.allGood')
      : first.status === 'red' ? t('health.summary.risk', { name }) : t('health.summary.watch', { name });
  const chips = (['green', 'yellow', 'red'] as const).filter((status) => count(status) > 0);
  const chipKey: Record<'green' | 'yellow' | 'red', TKey> = { green: 'health.chip.good', yellow: 'health.chip.watch', red: 'health.chip.risk' };
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }} accessible accessibilityLabel={`${score ?? ''} ${t('health.outOf')}. ${t(tier)}. ${summary}`}>
        <ScoreGauge score={score} color={color} />
        <View style={{ flex: 1, gap: 6 }}>
          <Text variant="title" weight={700} tone="primary-900">{t(tier)}</Text>
          <Text variant="body-sm" tone="neutral-600">{summary}</Text>
          {chips.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {chips.map((status) => <Chip key={status} label={t(chipKey[status], { count: count(status) })} color={statusText(status, dark)} />)}
            </View>
          )}
        </View>
      </View>
      {score !== null && <Text variant="micro" tone="neutral-500">{t('health.scoreHow')}</Text>}
    </View>
  );
}

// ------------------------------------------------------------------------------------------------ cash

function CashLine({ points }: { points: number[] }) {
  const { series } = useChartColors();
  const [width, onLayout] = useWidth();
  const height = 56;
  const low = Math.min(...points);
  const high = Math.max(...points);
  const span = high - low || 1;
  const pad = 4;
  const x = (i: number) => pad + (i / Math.max(1, points.length - 1)) * (width - pad * 2);
  const y = (v: number) => (high === low ? height / 2 : pad + (1 - (v - low) / span) * (height - pad * 2));
  const d = points.map((v, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(v)}`).join(' ');
  return (
    <View onLayout={onLayout} style={{ height }}>
      {width > 0 && <Svg width={width} height={height}><Path d={d} stroke={series} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" /></Svg>}
    </View>
  );
}

function CashCard() {
  const { t } = useI18n();
  const dark = useAppTheme();
  const { data } = useLocalQuery(() => getCashTrend(7), []);
  if (!data) return null;
  const change = formatMoney(data.change, data.currency, { showPlus: true });
  return (
    <View accessible accessibilityLabel={`${t('health.cash.title')}: ${formatMoney(data.today, data.currency)}, ${t('health.cash.change', { amount: change })}`}
      style={{ padding: 16, gap: 8, borderRadius: radius.card, borderWidth: 1, borderColor: dark ? colors.dark.border : colors.neutral[200], backgroundColor: dark ? colors.dark.surface : colors.white }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <Text variant="body-sm" tone="neutral-600">{t('health.cash.title')}</Text>
        <Text variant="body-sm" tone="neutral-600">{t('health.cash.range')}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        <Text variant="title-lg" weight={700} tone="primary-900">{formatMoney(data.today, data.currency)}</Text>
        {data.change !== 0 && <Text variant="caption" weight={600} tone={data.change > 0 ? 'money-in' : 'money-out'}>{t('health.cash.change', { amount: change })}</Text>}
      </View>
      <CashLine points={data.points} />
    </View>
  );
}

// ------------------------------------------------------------------------------------------------ ratios

function RatioRow({ item, first, expanded, onToggle }: { item: Judged; first: boolean; expanded: boolean; onToggle: () => void }) {
  const { t } = useI18n();
  const dark = useAppTheme();
  const { muted, grid } = useChartColors();
  const { ratio, status, goal, history } = item;
  const ready = ratio.status !== 'not_available';
  const shown = ratio.value === null ? null : formatRatio(ratio);
  const goalText = t(ratio.betterWhen === 'higher' ? 'health.goal.atLeast' : 'health.goal.under', { value: formatRatio({ ...ratio, value: goal }) });
  // Not ready, or a figure that does not apply ("No interest", "No repayments due"): the server's reason instead.
  const right = ready && shown ? goalText : (ratio.message ?? t('health.group.notready'));
  const description = t(`health.desc.${ratio.id}` as TKey);
  const formulaText = healthRatioFormula(ratio.id, t);
  const hasTrend = history.filter((value) => value !== null).length >= 2;
  return (
    <View style={{ paddingVertical: 14, gap: 12, ...(first ? {} : { borderTopWidth: 1, borderTopColor: grid }) }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={onToggle}
        accessibilityLabel={`${ratio.label}: ${shown ?? right}, ${STATUS_WORD[status]}. ${ready && shown ? goalText : ''}`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: STATUS_COLOR[status] }} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="body" weight={600} tone={ready ? 'primary-900' : 'neutral-600'}>{ratio.label}</Text>
          <Text variant="caption" tone="neutral-600">{description}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2, maxWidth: '45%' }}>
          {shown && <Text variant="body-lg" weight={700} style={{ color: status === 'green' ? (dark ? colors.dark.primary : colors.primary[900]) : statusText(status, dark) }}>{shown}</Text>}
          <Text variant="micro" tone="neutral-600" style={{ textAlign: 'right' }}>{right}</Text>
        </View>
      </Pressable>
      {expanded && (
        <View style={{ gap: 12, paddingLeft: 22 }}>
          <ZoneBar value={ratio.value} red={ratio.red} yellow={ratio.yellow} target={ratio.benchmark} betterWhen={ratio.betterWhen} faded={!ready}
            labels={{ bad: ratio.betterWhen === 'higher' ? 'Too low' : 'Too high', watch: 'Watch', good: 'Good' }}
            targetLabel={`Standard ${formatRatio({ ...ratio, value: ratio.benchmark })}`}
            accessibilityLabel={`${ratio.label}: ${shown ?? '—'} against the standard target ${formatRatio({ ...ratio, value: ratio.benchmark })}`} />
          {formulaText ? (
            <View style={{ gap: 2 }}>
              <Text variant="micro" weight={700} tone="neutral-600">{t('formula.how')}</Text>
              <Text variant="body-sm" weight={600} tone="primary-900">{ratio.label} = {formulaText}</Text>
              {shown ? <Text variant="caption" tone="neutral-600">{`= ${shown}`}</Text> : null}
            </View>
          ) : null}
          {hasTrend && (
            <View style={{ gap: 4 }}>
              <Sparkline values={history} target={goal} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="micro" tone="neutral-500">Past {history.length} months</Text>
                <LegendSwatch color={muted} label="Goal" dashed />
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function RatioGroup({ title, items }: { title: string; items: Judged[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!items.length) return null;
  return (
    <View>
      <Text variant="body-sm" weight={600} tone="neutral-600" style={{ paddingTop: 4 }}>{title}</Text>
      {items.map((item, index) => (
        <RatioRow key={item.ratio.id} item={item} first={index === 0} expanded={open === item.ratio.id}
          onToggle={() => setOpen(open === item.ratio.id ? null : item.ratio.id)} />
      ))}
    </View>
  );
}

/**
 * Health tab, top part, kept simple: a score out of 100 from the ratio statuses, cash today with its last 7 days,
 * then this month's ratios that need attention. Ratios on track are folded away behind one tap; ratios without enough
 * data are not listed. Each ratio is judged against the business's own past months (the standard target until 3
 * complete months are recorded).
 */
export function FinancialHealthChart({ ratios: serverRatios }: { ratios: RatioSnapshot[] }) {
  const { t, term } = useI18n();
  const dark = useAppTheme();
  const [showOnTrack, setShowOnTrack] = useState(false);
  const history = useAnalysisQuery(getHealthHistory);
  const months = recentMonths(history.data);
  // Ratio names come from the server in accounting terms; plain language swaps in everyday words.
  const items = serverRatios.map((ratio) => judge({ ...ratio, label: term(ratio.label) }, months, 'past', 'monthly'));
  const byStatus = (...statuses: Status[]) => statuses.flatMap((status) => items.filter((item) => item.status === status));
  const attention = byStatus('red', 'yellow');
  const onTrack = byStatus('green');
  return (
    <View style={{ gap: 20 }}>
      <ScoreHeader items={items} />
      <CashCard />
      {(attention.length > 0 || onTrack.length > 0) && (
        <View style={{ gap: 12 }}>
          <Text variant="title" weight={700} tone="primary-900">{t('health.ratios')}</Text>
          <RatioGroup title={t('health.group.attention')} items={attention} />
          {onTrack.length > 0 && (showOnTrack
            ? <RatioGroup title={t('health.group.ontrack')} items={onTrack} />
            : (
              <Pressable accessibilityRole="button" onPress={() => setShowOnTrack(true)} hitSlop={6}
                style={{ alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: dark ? colors.dark.field : colors.primary[50] }}>
                <Text variant="body-sm" weight={600} tone="primary-900">{t('health.showOnTrack', { count: onTrack.length })}</Text>
              </Pressable>
            ))}
        </View>
      )}
    </View>
  );
}
