import { View } from 'react-native';
import { Text } from './Text';
import { colors, radius } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';
import type { RatioSnapshot } from '@/services/analysis';
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

function RatioCard({ ratio }: { ratio: RatioSnapshot }) {
  const dark = useAppTheme();
  const color = STATUS_COLOR[ratio.status];
  const available = ratio.value !== null;
  const domainLow = Math.min(0, ratio.value ?? 0, ratio.benchmark, ratio.red);
  const domainHigh = Math.max(0, ratio.value ?? 0, ratio.benchmark, ratio.red);
  const span = domainHigh - domainLow || 1;
  const valuePosition = Math.max(0, Math.min(100, (((ratio.value ?? domainLow) - domainLow) / span) * 100));
  const targetPosition = Math.max(0, Math.min(100, ((ratio.benchmark - domainLow) / span) * 100));

  return (
    <View style={{ padding: 16, borderRadius: radius.card, backgroundColor: dark ? colors.dark.surface : colors.white, borderWidth: 1, borderColor: dark ? colors.dark.border : colors.neutral[200], gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text variant="body-sm" tone="neutral-600">{ratio.label}</Text>
          <Text variant="amount-lg" tone="primary-900">{formatRatio(ratio)}</Text>
        </View>
        <View style={{ backgroundColor: `${color}22`, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}>
          <Text variant="micro" weight={600} style={{ color }}>{ratio.status === 'not_available' ? 'Needs data' : ratio.status === 'green' ? 'Healthy' : ratio.status === 'yellow' ? 'Watch' : 'At risk'}</Text>
        </View>
      </View>
      <View style={{ gap: 5 }}>
        <View style={{ height: 8, borderRadius: 999, backgroundColor: dark ? colors.dark.field : colors.neutral[200], overflow: 'visible', position: 'relative' }}>
          {available && <View style={{ width: `${valuePosition}%`, height: 8, borderRadius: 999, backgroundColor: color }} />}
          <View style={{ position: 'absolute', left: `${targetPosition}%`, top: -3, height: 14, width: 2, marginLeft: -1, borderRadius: 1, backgroundColor: dark ? colors.dark.text : colors.primary[900] }} />
        </View>
        <Text variant="micro" tone="neutral-600">Target: {ratio.betterWhen === 'higher' ? '≥' : '≤'} {formatBenchmark(ratio)}</Text>
      </View>
      {ratio.status === 'not_available' && ratio.message ? <Text variant="micro" tone="neutral-600">{ratio.message}</Text> : null}
    </View>
  );
}

export function FinancialHealthChart({ ratios }: { ratios: RatioSnapshot[] }) {
  const dark = useAppTheme();
  const counts = {
    green: ratios.filter((item) => item.status === 'green').length,
    yellow: ratios.filter((item) => item.status === 'yellow').length,
    red: ratios.filter((item) => item.status === 'red').length,
    not_available: ratios.filter((item) => item.status === 'not_available').length,
  };
  const availableCount = ratios.length - counts.not_available;
  const summary = counts.red > 0 ? 'Needs attention' : counts.yellow > 0 ? 'Some areas to watch' : availableCount ? 'Looking healthy' : 'Building your snapshot';

  return (
    <View style={{ gap: 18 }}>
      <View style={{ padding: 18, borderRadius: radius.card, backgroundColor: dark ? colors.dark.surface : colors.primary[50], gap: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1, gap: 3 }}>
            <Text variant="caption" tone="neutral-600">Financial health snapshot</Text>
            <Text variant="title" tone="primary-900">{summary}</Text>
          </View>
          <Text variant="body-lg" weight={700} tone="primary-900">{counts.green}/{availableCount}</Text>
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
      </View>

      {GROUPS.map((group) => {
        const items = group.ids.map((id) => ratios.find((ratio) => ratio.id === id)).filter((ratio): ratio is RatioSnapshot => Boolean(ratio));
        if (!items.length) return null;
        return (
          <View key={group.title} style={{ gap: 9 }}>
            <Text variant="body-lg" weight={600} tone="primary-900">{group.title}</Text>
            {items.map((ratio) => <RatioCard key={ratio.id} ratio={ratio} />)}
          </View>
        );
      })}
    </View>
  );
}
