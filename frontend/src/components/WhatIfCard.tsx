import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { BeforeAfterBar } from './HealthCharts';
import { StepSlider } from './StepSlider';
import { Text } from './Text';
import { useI18n } from '@/i18n';
import { whatIf, type WhatIf, type WhatIfChanges } from '@/services/analysis';
import { formatMoneyWhole } from '@/services/bookkeeping';
import { percent } from '@/services/riskText';
import { colors, radius } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

type Levers = { price: number; costs: number; collect: number | null; drawings: number };
const NONE: Levers = { price: 0, costs: 0, collect: null, drawings: 0 };

function toChanges(levers: Levers, daysNow: number | null): WhatIfChanges {
  return {
    ...(levers.price ? { priceChange: levers.price / 100 } : {}),
    ...(levers.costs ? { costCut: levers.costs / 100 } : {}),
    ...(levers.collect !== null && daysNow !== null && levers.collect < Math.round(daysNow) ? { collectDays: levers.collect } : {}),
    ...(levers.drawings ? { drawingsCut: levers.drawings / 100 } : {}),
  };
}

function Lever({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 2 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <Text variant="body-sm" weight={600} tone="primary-900">{title}</Text>
        <Text variant="micro" tone="neutral-600" style={{ flexShrink: 1, textAlign: 'right' }}>{hint}</Text>
      </View>
      {children}
    </View>
  );
}

/**
 * Try a change: the owner moves levers (prices, running costs, how fast customers pay, what they take out) and the
 * 3-month stress and 12-month risk are recalculated on the changed books by the same AI. Nothing is saved.
 */
export function WhatIfCard() {
  const { t } = useI18n();
  const dark = useAppTheme();
  const [levers, setLevers] = useState<Levers>(NONE);
  const [result, setResult] = useState<WhatIf | null>(null);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);
  const seq = useRef(0);

  const run = useCallback((next: Levers, daysNow: number | null) => {
    const id = ++seq.current;
    setBusy(true);
    setFailed(false);
    whatIf(toChanges(next, daysNow))
      .then((answer) => { if (id === seq.current) setResult(answer); })
      .catch(() => { if (id === seq.current) setFailed(true); })
      .finally(() => { if (id === seq.current) setBusy(false); });
  }, []);

  useEffect(() => {
    // First answer (no change) after mounting, like useAnalysisQuery: it brings the figures that label each lever.
    let active = true;
    Promise.resolve().then(() => { if (active) run(NONE, null); });
    return () => { active = false; };
  }, [run]);

  if (result && !result.available) return null; // the section already says how many months are still needed
  const card = { padding: 16, borderRadius: radius.card, backgroundColor: dark ? colors.dark.surface : colors.white, borderWidth: 1, borderColor: dark ? colors.dark.border : colors.neutral[200], gap: 16 } as const;
  const baseline = result?.available ? result.baseline : null;
  const money = (n: number) => formatMoneyWhole(Math.round(n), baseline?.currency ?? 'USD');
  const daysNow = baseline?.receivableDays ?? null;
  const commit = (next: Levers) => { setLevers(next); run(next, daysNow); };
  const changed = Object.keys(toChanges(levers, daysNow)).length > 0;

  return (
    <View style={card}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="body-lg" weight={700} tone="primary-900">{t('whatif.title')}</Text>
          <Text variant="micro" tone="neutral-600">{t('whatif.subtitle')}</Text>
        </View>
        {busy ? <ActivityIndicator size="small" color={colors.primary[500]} /> : changed ? (
          <Pressable accessibilityRole="button" onPress={() => commit(NONE)} hitSlop={8}>
            <Text variant="caption" weight={600} style={{ color: colors.primary[500] }}>{t('whatif.reset')}</Text>
          </Pressable>
        ) : null}
      </View>

      {baseline && (
        <View style={{ gap: 14 }}>
          <Lever title={t('whatif.price')} hint={levers.price ? t('whatif.priceHint', { percent: levers.price, amount: money(baseline.monthlyRevenue * levers.price / 100) }) : t('whatif.none')}>
            <StepSlider value={levers.price} min={0} max={20} step={1} accessibilityLabel={t('whatif.price')} accessibilityValue={`${levers.price}%`}
              onChange={(price) => setLevers((l) => ({ ...l, price }))} onCommit={(price) => commit({ ...levers, price })} />
          </Lever>
          {baseline.monthlyCosts > 0 && (
            <Lever title={t('whatif.costs')} hint={levers.costs ? t('whatif.costsHint', { percent: levers.costs, amount: money(baseline.monthlyCosts * levers.costs / 100) }) : t('whatif.none')}>
              <StepSlider value={levers.costs} min={0} max={30} step={5} accessibilityLabel={t('whatif.costs')} accessibilityValue={`${levers.costs}%`}
                onChange={(costs) => setLevers((l) => ({ ...l, costs }))} onCommit={(costs) => commit({ ...levers, costs })} />
            </Lever>
          )}
          {daysNow !== null && daysNow >= 7 && (
            <Lever title={t('whatif.collect')} hint={t('whatif.collectHint', { days: levers.collect ?? Math.round(daysNow), now: Math.round(daysNow) })}>
              <StepSlider value={levers.collect ?? Math.round(daysNow)} min={0} max={Math.round(daysNow)} step={1} accessibilityLabel={t('whatif.collect')}
                accessibilityValue={`${levers.collect ?? Math.round(daysNow)}`}
                onChange={(collect) => setLevers((l) => ({ ...l, collect }))} onCommit={(collect) => commit({ ...levers, collect })} />
            </Lever>
          )}
          {baseline.monthlyDrawings > 0 && (
            <Lever title={t('whatif.drawings')} hint={levers.drawings ? t('whatif.drawingsHint', { percent: levers.drawings, amount: money(baseline.monthlyDrawings * levers.drawings / 100) }) : t('whatif.none')}>
              <StepSlider value={levers.drawings} min={0} max={100} step={10} accessibilityLabel={t('whatif.drawings')} accessibilityValue={`${levers.drawings}%`}
                onChange={(drawings) => setLevers((l) => ({ ...l, drawings }))} onCommit={(drawings) => commit({ ...levers, drawings })} />
            </Lever>
          )}
        </View>
      )}

      {result?.available && (
        <View style={{ gap: 10, borderRadius: 10, padding: 12, backgroundColor: dark ? colors.dark.field : colors.primary[50] }} accessibilityLiveRegion="polite">
          <Text variant="caption" weight={600} tone="primary-900">{t('whatif.results')}</Text>
          {result.before.stress3m && result.after.stress3m && (
            <BeforeAfterBar label={t('advice.stress3m')} before={result.before.stress3m.probability} after={result.after.stress3m.probability}
              beforeText={`${percent(result.before.stress3m.probability)}%`} afterText={`${percent(result.after.stress3m.probability)}%`} />
          )}
          {result.before.model12m && result.after.model12m && (
            <BeforeAfterBar label={t('advice.model12m')} before={result.before.model12m.probability} after={result.after.model12m.probability}
              beforeText={`${percent(result.before.model12m.probability)}%`} afterText={`${percent(result.after.model12m.probability)}%`} />
          )}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[
              { key: 'profit', label: t('whatif.profit'), before: result.before.monthlyProfit, after: result.after.monthlyProfit },
              ...(result.before.cash3m !== null && result.after.cash3m !== null ? [{ key: 'cash', label: t('whatif.cash3m'), before: result.before.cash3m, after: result.after.cash3m }] : []),
            ].map((figure) => (
              <View key={figure.key} style={{ flex: 1, minWidth: 0, gap: 2, borderRadius: 8, padding: 10, backgroundColor: dark ? colors.dark.surface : colors.white }}>
                <Text variant="micro" tone="neutral-600" numberOfLines={1}>{figure.label}</Text>
                <Text variant="body-sm" weight={700} tone="primary-900" numberOfLines={1} adjustsFontSizeToFit>{money(figure.after)}</Text>
                <Text variant="micro" tone="neutral-500" numberOfLines={1}>{t('whatif.now', { amount: money(figure.before) })}</Text>
              </View>
            ))}
          </View>
          {levers.drawings > 0 && <Text variant="micro" tone="neutral-500">{t('whatif.drawingsNote')}</Text>}
        </View>
      )}
      {failed && <Text variant="micro" style={{ color: colors.danger }}>{t('whatif.failed')}</Text>}
    </View>
  );
}
