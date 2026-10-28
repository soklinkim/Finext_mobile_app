import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { LegendSwatch, Sparkline, StatusColumns, StatusMark, useChartColors, ZoneBar, type MarkKind, type StatusColumn } from './HealthCharts';
import { Icon } from './Icon';
import { Text } from './Text';
import { useAnalysisQuery } from '@/hooks/useAnalysisQuery';
import { useI18n } from '@/i18n';
import { colors, radius } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';
import { getHealthHistory, type HealthHistoryMonth, type RatioSnapshot } from '@/services/analysis';
import { formatBenchmark, formatRatio } from '@/services/ratioFormat';

type Status = RatioSnapshot['status'];

const STATUS_COLOR: Record<Status, string> = {
  green: colors.success,
  yellow: colors.warning,
  red: colors.danger,
  not_available: colors.neutral[500],
};

const GROUPS = [
  { title: 'Profitability', ids: ['gross_margin', 'net_margin', 'ebitda_margin', 'operating_expense_ratio', 'revenue_growth'] },
  { title: 'Liquidity', ids: ['current_ratio'] },
  { title: 'Efficiency', ids: ['inventory_days', 'receivable_days'] },
  { title: 'Debt & repayment', ids: ['debt_to_equity', 'interest_coverage', 'debt_to_asset', 'dscr'] },
];

const HISTORY_MONTHS = 6;

function monthLabel(period: string, locale: string): string {
  const [year, month] = period.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(locale === 'km' ? 'km-KH' : 'en-GB', { month: 'short', timeZone: 'UTC' });
}

/** The last complete months the server could check (a month whose books do not balance has no figures). */
function recentMonths(history: HealthHistoryMonth[] | undefined): HealthHistoryMonth[] {
  return (history ?? []).filter((month) => month.integrity.ok && month.features).slice(-HISTORY_MONTHS);
}

const STATUS_MARK: Record<Status, MarkKind> = { green: 'good', yellow: 'watch', red: 'bad', not_available: 'none' };
const STATUS_WORD: Record<Status, string> = { green: 'Good', yellow: 'Watch', red: 'At risk', not_available: 'Needs data' };

/**
 * One line per ratio: mark, name, what to aim for, and the figure. Tap for the detail (where it sits between
 * the limits, and its trend). A ratio without enough data shows no figure, only why.
 */
function RatioRow({ ratio, history, expanded, onToggle, first }: { ratio: RatioSnapshot; history: (number | null)[]; expanded: boolean; onToggle: () => void; first: boolean }) {
  const { muted, grid } = useChartColors();
  const ready = ratio.status !== 'not_available';
  const target = `${formatBenchmark(ratio)} or ${ratio.betterWhen === 'higher' ? 'more' : 'less'}`;
  const hasTrend = history.filter((value) => value !== null).length >= 2;
  return (
    <View style={{ gap: 12, paddingVertical: 12, ...(first ? {} : { borderTopWidth: 1, borderTopColor: grid }) }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={onToggle}
        accessibilityLabel={`${ratio.label}: ${ready ? formatRatio(ratio) : 'not enough data yet'}, ${STATUS_WORD[ratio.status]}. Aim for ${target}.`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <StatusMark kind={STATUS_MARK[ratio.status]} />
        <View style={{ flex: 1, gap: 1 }}>
          <Text variant="body-sm" weight={600} tone={ready ? 'primary-900' : 'neutral-600'}>{ratio.label}</Text>
          <Text variant="micro" tone="neutral-500">{ready ? `Aim for ${target}` : (ratio.message ?? 'Not enough data yet')}</Text>
        </View>
        <Text variant="body" weight={700} tone={ready ? 'primary-900' : 'neutral-500'}>{ready ? formatRatio(ratio) : '—'}</Text>
        <View style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}><Icon name="chevronDown" size={16} color={colors.neutral[500]} /></View>
      </Pressable>
      {expanded && (
        <View style={{ gap: 12, paddingLeft: 30 }}>
          <ZoneBar
            value={ratio.value}
            red={ratio.red}
            yellow={ratio.yellow}
            target={ratio.benchmark}
            betterWhen={ratio.betterWhen}
            faded={!ready}
            labels={{ bad: ratio.betterWhen === 'higher' ? 'Too low' : 'Too high', watch: 'Watch', good: 'Good' }}
            targetLabel={`Target ${formatBenchmark(ratio)}`}
            accessibilityLabel={`${ratio.label}: ${formatRatio(ratio)}. Aim for ${target}.`}
          />
          {!ready && ratio.value !== null && <Text variant="micro" tone="neutral-500">Early figure so far: {formatRatio(ratio)} (hollow dot). It counts once the period is complete.</Text>}
          {hasTrend && (
            <View style={{ gap: 4 }} accessible accessibilityLabel={`${ratio.label}, past ${history.length} months: ${history.map((value) => (value === null ? 'no figure' : formatRatio({ ...ratio, value }))).join(', ')}`}>
              <Sparkline values={history} target={ratio.benchmark} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="micro" tone="neutral-500">Past {history.length} months</Text>
                <LegendSwatch color={muted} label="Target" dashed />
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

/** One card per area: a count of good / watch / at risk in the heading, then a row per ratio (ready ones first). */
function RatioGroup({ title, items, historyOf }: { title: string; items: RatioSnapshot[]; historyOf: (id: string) => (number | null)[] }) {
  const dark = useAppTheme();
  const [open, setOpen] = useState<string | null>(null);
  const sorted = [...items].sort((a, b) => Number(a.status === 'not_available') - Number(b.status === 'not_available'));
  const tally = (['green', 'yellow', 'red'] as const).map((status) => ({ status, count: items.filter((ratio) => ratio.status === status).length })).filter(({ count }) => count > 0);
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4, borderRadius: radius.card, backgroundColor: dark ? colors.dark.surface : colors.white, borderWidth: 1, borderColor: dark ? colors.dark.border : colors.neutral[200] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingBottom: 2 }}>
        <Text variant="body-lg" weight={600} tone="primary-900">{title}</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {tally.map(({ status, count }) => (
            <View key={status} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: STATUS_COLOR[status] }} />
              <Text variant="micro" tone="neutral-600"><Text variant="micro" weight={700} tone="primary-900">{count}</Text> {STATUS_WORD[status].toLowerCase()}</Text>
            </View>
          ))}
        </View>
      </View>
      {sorted.map((ratio, index) => (
        <RatioRow key={ratio.id} ratio={ratio} history={historyOf(ratio.id)} first={index === 0}
          expanded={open === ratio.id} onToggle={() => setOpen(open === ratio.id ? null : ratio.id)} />
      ))}
    </View>
  );
}

/** Healthy / watch / at-risk counts for the ratios on this screen, one column per past month. */
function HealthOverTime({ months }: { months: HealthHistoryMonth[] }) {
  const { locale } = useI18n();
  const ids = GROUPS.flatMap((group) => group.ids);
  const columns: StatusColumn[] = months.map((month) => {
    const statuses = ids.map((id) => month.ratioStatus?.[id]);
    return {
      label: monthLabel(month.period, locale),
      green: statuses.filter((status) => status === 'green').length,
      yellow: statuses.filter((status) => status === 'yellow').length,
      red: statuses.filter((status) => status === 'red').length,
    };
  });
  const readout = (column: StatusColumn) => `${column.label}: ${column.green} healthy · ${column.yellow} watch · ${column.red} at risk`;
  return (
    <View style={{ gap: 6 }}>
      <Text variant="caption" weight={600} tone="neutral-600">Past {columns.length} months</Text>
      <StatusColumns columns={columns} readout={readout} accessibilityLabel={`Ratios by month: ${columns.map(readout).join('; ')}`} />
    </View>
  );
}

export function FinancialHealthChart({ ratios: serverRatios }: { ratios: RatioSnapshot[] }) {
  const dark = useAppTheme();
  const { term } = useI18n();
  // Ratio names come from the server in accounting terms; plain language swaps in everyday words.
  const ratios = serverRatios.map((ratio) => ({ ...ratio, label: term(ratio.label) }));
  const history = useAnalysisQuery(getHealthHistory);
  const months = recentMonths(history.data);
  const historyOf = (id: string) => months.map((month) => month.features?.[id] ?? null);
  const counts = {
    green: ratios.filter((item) => item.status === 'green').length,
    yellow: ratios.filter((item) => item.status === 'yellow').length,
    red: ratios.filter((item) => item.status === 'red').length,
    not_available: ratios.filter((item) => item.status === 'not_available').length,
  };
  const availableCount = ratios.length - counts.not_available;
  // At risk first, then to watch, in the order the groups list them.
  const attention = [...ratios.filter((ratio) => ratio.status === 'red'), ...ratios.filter((ratio) => ratio.status === 'yellow')];
  const summary = counts.red > 0 ? 'Needs attention' : counts.yellow > 0 ? 'Some areas to watch' : availableCount ? 'Looking healthy' : 'Building your snapshot';

  return (
    <View style={{ gap: 18 }}>
      <View style={{ padding: 18, borderRadius: radius.card, backgroundColor: dark ? colors.dark.surface : colors.primary[50], gap: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1, gap: 3 }}>
            <Text variant="caption" tone="neutral-600">Financial health snapshot</Text>
            <Text variant="title" tone="primary-900">{summary}</Text>
          </View>
          {availableCount > 0 && (
            <View style={{ alignItems: 'flex-end' }}>
              <Text variant="body-lg" weight={700} tone="primary-900">{counts.green} of {availableCount}</Text>
              <Text variant="micro" tone="neutral-600">healthy</Text>
            </View>
          )}
        </View>
        <View accessibilityRole="progressbar" accessibilityLabel={`${counts.green} healthy, ${counts.yellow} to watch, ${counts.red} at risk`} style={{ height: 10, flexDirection: 'row', borderRadius: 999, overflow: 'hidden', backgroundColor: dark ? colors.dark.field : colors.neutral[200] }}>
          {(['green', 'yellow', 'red'] as const).map((status) => counts[status] > 0 && (
            <View key={status} style={{ width: `${(counts[status] / Math.max(availableCount, 1)) * 100}%`, backgroundColor: STATUS_COLOR[status] }} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
          {(['green', 'yellow', 'red', 'not_available'] as const).map((status) => (
            <View key={status} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: STATUS_COLOR[status] }} />
              <Text variant="micro" tone="neutral-600">{counts[status]} {status === 'green' ? 'healthy' : status === 'yellow' ? 'watch' : status === 'red' ? 'at risk' : 'not ready'}</Text>
            </View>
          ))}
        </View>
        {attention.length > 0 && (
          <View style={{ gap: 8, borderRadius: 10, padding: 12, backgroundColor: dark ? colors.dark.field : colors.white }}>
            <Text variant="caption" weight={600} tone="primary-900">What to look at</Text>
            {attention.slice(0, 3).map((ratio) => (
              <View key={ratio.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
                accessible accessibilityLabel={`${ratio.label}: ${formatRatio(ratio)}, ${STATUS_WORD[ratio.status]}. Aim for ${formatBenchmark(ratio)} or ${ratio.betterWhen === 'higher' ? 'more' : 'less'}.`}>
                <StatusMark kind={STATUS_MARK[ratio.status]} />
                <View style={{ flex: 1, gap: 1 }}>
                  <Text variant="body-sm" tone="primary-900">{ratio.label}</Text>
                  <Text variant="micro" tone="neutral-500">Aim for {formatBenchmark(ratio)} or {ratio.betterWhen === 'higher' ? 'more' : 'less'}</Text>
                </View>
                <Text variant="body-sm" weight={700} tone="primary-900">{formatRatio(ratio)}</Text>
              </View>
            ))}
            {attention.length > 3 && <Text variant="micro" tone="neutral-600">+{attention.length - 3} more in the list below</Text>}
          </View>
        )}
        {months.length >= 2 && <HealthOverTime months={months} />}
      </View>

      {GROUPS.map((group) => {
        const items = group.ids.map((id) => ratios.find((ratio) => ratio.id === id)).filter((ratio): ratio is RatioSnapshot => Boolean(ratio));
        if (!items.length) return null;
        return <RatioGroup key={group.title} title={group.title} items={items} historyOf={historyOf} />;
      })}
    </View>
  );
}
