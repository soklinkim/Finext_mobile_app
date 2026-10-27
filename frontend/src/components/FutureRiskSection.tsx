import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from './Button';
import { Chip, ChipRow } from './Chip';
import { OfflineBanner } from './OfflineBanner';
import { SegmentedControl } from './SegmentedControl';
import { Text } from './Text';
import { TextField } from './TextField';
import { useAnalysisQuery } from '@/hooks/useAnalysisQuery';
import { useI18n, type TKey } from '@/i18n';
import { checkLoan, getFutureRisk, type FutureRisk, type ProposedLoan, type RiskDriver, type RiskLevel } from '@/services/analysis';
import { formatMoneyWhole, parseAmountInput } from '@/services/bookkeeping';
import { colors, radius } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

const LEVEL_COLOR: Record<RiskLevel, string> = { low: colors.success, moderate: colors.warning, high: colors.danger };
const DAYS = new Set(['inventory_days', 'payable_days', 'receivable_days', 'liquid_days_of_expenses']);
const TIMES = new Set(['current_ratio', 'quick_ratio', 'cash_ratio', 'interest_coverage', 'asset_turnover', 'long_term_liabilities_to_equity', 'cash_earnings_to_liabilities']);

type Model = Extract<FutureRisk['model'], { available: true }>;
type Stress = Extract<FutureRisk['stress3m'], { available: true }>;

function monthName(month: string, locale: string): string {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number - 1, 1)).toLocaleDateString(locale === 'km' ? 'km-KH' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
type Capacity = Extract<FutureRisk['debtCapacity'], { available: true }>;

function useCard() {
  const dark = useAppTheme();
  return {
    dark,
    card: { padding: 16, borderRadius: radius.card, backgroundColor: dark ? colors.dark.surface : colors.white, borderWidth: 1, borderColor: dark ? colors.dark.border : colors.neutral[200], gap: 12 } as const,
    soft: dark ? colors.dark.field : colors.primary[50],
    track: dark ? colors.dark.field : colors.neutral[200],
  };
}

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: `${color}26` }}>
      <Text variant="micro" weight={600} style={{ color }}>{label}</Text>
    </View>
  );
}

const percent = (p: number) => (p < 0.01 ? '<1' : String(Math.round(p * 100)));

/** The business's own figure in a form people read: days, times, percentages, or why it is missing. */
function useDriverValue() {
  const { t } = useI18n();
  return (driver: RiskDriver) => {
    if (driver.reason) return t(`risk.gap.${driver.reason}` as TKey);
    const v = driver.value;
    if (v === null) return '—';
    if (DAYS.has(driver.feature)) return t('risk.days', { value: Math.round(v) });
    if (TIMES.has(driver.feature)) return t('risk.times', { value: v.toFixed(Math.abs(v) >= 10 ? 0 : 2) });
    if (driver.feature === 'sales_growth') return `${v >= 1 ? '+' : ''}${Math.round((v - 1) * 100)}%`;
    return `${Math.round(v * 100)}%`;
  };
}

/** The percentage in a ring coloured by level, with the level and a line or two beside it. */
function Gauge({ probability, level, label, children }: { probability: number; level: RiskLevel; label: string; children?: ReactNode }) {
  const { t } = useI18n();
  const { soft, dark } = useCard();
  const color = LEVEL_COLOR[level];
  const levelText = t(`risk.level.${level}` as TKey);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, padding: 12, borderRadius: radius.card, backgroundColor: soft }}>
      <View
        accessible
        accessibilityLabel={`${label}: ${percent(probability)}%, ${levelText}`}
        style={{ width: 84, height: 84, borderRadius: 42, borderWidth: 7, borderColor: color, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? colors.dark.surface : colors.white }}
      >
        <Text variant="amount-xl" tone="primary-900">{percent(probability)}%</Text>
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        <Pill label={levelText} color={color} />
        <Text variant="body-sm" tone="neutral-600">{t('risk.chance', { percent: percent(probability) })}</Text>
        {children}
      </View>
    </View>
  );
}

function ShortTermView({ stress }: { stress: Stress }) {
  const { t, locale } = useI18n();
  const { track } = useCard();
  const money = (amount: number) => formatMoneyWhole(Math.round(amount), stress.currency);
  const conditions = (['cash_runway', 'negative_cash_flow', 'dscr'] as const).filter((c) => c !== 'dscr' || stress.instalments.some((x) => x > 0));
  return (
    <>
      <Gauge probability={stress.probability} level={stress.riskClass} label={t('stress.title')}>
        <Text variant="micro" tone="neutral-600">{t('stress.basis', { months: stress.basedOnMonths })}</Text>
      </Gauge>
      {stress.stressedNow.length > 0 && (
        <View style={{ borderLeftWidth: 3, borderLeftColor: colors.danger, paddingLeft: 10, paddingVertical: 3, gap: 2 }}>
          <Text variant="body-sm" weight={600} tone="primary-900">{t('stress.nowTitle')}</Text>
          {stress.stressedNow.map((c) => <Text key={c} variant="micro" tone="neutral-600">{t(`stress.now.${c}` as TKey)}</Text>)}
        </View>
      )}
      <Text variant="body" weight={700} tone="primary-900">{t('stress.conditionsTitle')}</Text>
      {conditions.map((c) => (
        <View key={c} style={{ gap: 4 }} accessible accessibilityLabel={`${t(`stress.condition.${c}` as TKey)}: ${percent(stress.conditions[c])}%`}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <Text variant="caption" tone="primary-900" style={{ flex: 1 }}>{t(`stress.condition.${c}` as TKey)}</Text>
            <Text variant="caption" weight={700} tone="primary-900">{percent(stress.conditions[c])}%</Text>
          </View>
          <View style={{ height: 6, borderRadius: 99, backgroundColor: track, overflow: 'hidden' }}>
            <View style={{ width: `${stress.conditions[c] * 100}%`, height: '100%', borderRadius: 99, backgroundColor: stress.conditions[c] > 0.3 ? colors.danger : stress.conditions[c] >= 0.1 ? colors.warning : colors.success }} />
          </View>
        </View>
      ))}
      <Text variant="body" weight={700} tone="primary-900">{t('stress.cashTitle')}</Text>
      {stress.cash.map((m) => (
        <View key={m.month} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
          <Text variant="caption" tone="primary-900">{monthName(m.month, locale)}</Text>
          <Text variant="caption" tone="neutral-600">
            <Text variant="caption" weight={700} style={{ color: m.median < stress.runwayFloor ? colors.danger : undefined }} tone="primary-900">{money(m.median)}</Text>
            {'  '}({money(m.low)} – {money(m.high)})
          </Text>
        </View>
      ))}
      <Text variant="micro" tone="neutral-600">{t('stress.floor', { amount: money(stress.runwayFloor) })}</Text>
      <Text variant="micro" tone="neutral-600">{t('stress.note')}</Text>
    </>
  );
}

function LongTermView({ model }: { model: Model }) {
  const { t } = useI18n();
  const valueOf = useDriverValue();
  return (
    <>
      <Gauge probability={model.probability} level={model.riskClass} label={t('risk.title')}>
        {model.confidence === 'low' && <Text variant="micro" tone="neutral-600">{t('risk.lowConfidence', { count: model.months })}</Text>}
      </Gauge>
      <Text variant="body" weight={700} tone="primary-900">{t('risk.whyTitle')}</Text>
      {model.topDrivers.slice(0, 3).map((driver) => {
        const raises = driver.direction === 'raises risk';
        return (
          <View key={driver.feature} style={{ flexDirection: 'row', gap: 10 }} accessible>
            <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 7, backgroundColor: raises ? colors.danger : colors.success }} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="body-sm" weight={500} tone="primary-900">{t(`risk.f.${driver.feature}` as TKey)}: {valueOf(driver)}</Text>
              <Text variant="micro" style={{ color: raises ? colors.danger : colors.success }}>{t(raises ? 'risk.raises' : 'risk.lowers')}</Text>
            </View>
          </View>
        );
      })}
      <Text variant="micro" tone="neutral-600">{t('risk.note')}</Text>
    </>
  );
}

/** Spec C3: probability of financial stress, over the next 3 months (projection) or 12 months (trained model). */
function RiskCard({ risk }: { risk: FutureRisk }) {
  const { t } = useI18n();
  const { card } = useCard();
  const [horizon, setHorizon] = useState<'3' | '12'>('3');
  return (
    <View style={card}>
      <View style={{ gap: 2 }}>
        <Text variant="body-lg" weight={700} tone="primary-900">{t(horizon === '3' ? 'stress.title' : 'risk.title')}</Text>
        <Text variant="micro" tone="neutral-600">{t(horizon === '3' ? 'stress.horizon' : 'risk.horizon')}</Text>
      </View>
      <SegmentedControl
        options={[{ value: '3', label: t('stress.tab3') }, { value: '12', label: t('stress.tab12') }]}
        value={horizon}
        onChange={setHorizon}
      />
      {horizon === '3'
        ? risk.stress3m.available
          ? <ShortTermView stress={risk.stress3m} />
          : <Text variant="body-sm" tone="neutral-600">{t('risk.needsHistory', { count: risk.stress3m.months })}</Text>
        : risk.model.available
          ? <LongTermView model={risk.model} />
          : <Text variant="body-sm" tone="neutral-600">{t('risk.needsHistory', { count: risk.model.months })}</Text>}
    </View>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint: string }) {
  const { soft } = useCard();
  return (
    <View style={{ flex: 1, minWidth: 0, padding: 10, borderRadius: 10, backgroundColor: soft, gap: 3 }}>
      <Text variant="micro" tone="neutral-600" numberOfLines={2}>{label}</Text>
      <Text variant="body" weight={700} tone="primary-900" numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text variant="micro" tone="neutral-500" numberOfLines={2}>{hint}</Text>
    </View>
  );
}

function reasonText(t: ReturnType<typeof useI18n>['t'], reason: { code: string; params: Record<string, number> }) {
  return t(`debt.reason.${reason.code}` as TKey, reason.params);
}

function LoanCheck({ currency }: { currency: Capacity['currency'] }) {
  const { t } = useI18n();
  const [amount, setAmount] = useState('');
  const [term, setTerm] = useState('12');
  const [rate, setRate] = useState('');
  const [rateType, setRateType] = useState<ProposedLoan['rateType']>('flat');
  const [frequency, setFrequency] = useState<ProposedLoan['repaymentFrequency']>('monthly');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FutureRisk | null>(null);

  const submit = async () => {
    const loan: ProposedLoan = {
      amount: parseAmountInput(amount, currency),
      termMonths: Number(term),
      annualInterestRate: Number(rate.replace(',', '.')),
      rateType,
      repaymentFrequency: frequency,
    };
    if (!(loan.amount > 0) || !Number.isInteger(loan.termMonths) || loan.termMonths < 1 || loan.termMonths > 360 || rate.trim() === '' || !(loan.annualInterestRate >= 0 && loan.annualInterestRate <= 100)) {
      setError(t('debt.check.invalid'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setResult(await checkLoan(loan));
    } catch {
      setError(t('debt.check.failed'));
    } finally {
      setBusy(false);
    }
  };

  const capacity = result?.debtCapacity.available ? result.debtCapacity : null;
  const proposed = capacity?.proposed;
  return (
    <View style={{ gap: 10 }}>
      <View style={{ gap: 2 }}>
        <Text variant="body" weight={700} tone="primary-900">{t('debt.check.title')}</Text>
        <Text variant="micro" tone="neutral-600">{t('debt.check.body')}</Text>
      </View>
      <TextField variant="form" label={t('debt.check.amount', { currency })} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><TextField variant="form" label={t('debt.check.term')} value={term} onChangeText={setTerm} keyboardType="number-pad" /></View>
        <View style={{ flex: 1 }}><TextField variant="form" label={t('debt.check.rate')} value={rate} onChangeText={setRate} keyboardType="decimal-pad" /></View>
      </View>
      <ChipRow>
        <Chip label={t('debt.check.flat')} selected={rateType === 'flat'} onPress={() => setRateType('flat')} />
        <Chip label={t('debt.check.declining')} selected={rateType === 'declining'} onPress={() => setRateType('declining')} />
      </ChipRow>
      <ChipRow>
        <Chip label={t('debt.check.monthly')} selected={frequency === 'monthly'} onPress={() => setFrequency('monthly')} />
        <Chip label={t('debt.check.weekly')} selected={frequency === 'weekly'} onPress={() => setFrequency('weekly')} />
      </ChipRow>
      <Button label={t('debt.check.submit')} onPress={submit} loading={busy} size="sm" />
      {error && <Text variant="body-sm" style={{ color: colors.danger }}>{error}</Text>}
      {capacity && proposed && (
        <View accessibilityLiveRegion="polite" style={{ gap: 6, borderLeftWidth: 3, borderLeftColor: proposed.fits ? colors.success : colors.danger, paddingLeft: 10 }}>
          <Text variant="body-sm" weight={600} tone="primary-900">
            {proposed.fits
              ? t('debt.check.fits', { instalment: formatMoneyWhole(proposed.monthlyInstalment, currency), cover: (proposed.dscrWith ?? 0).toFixed(1) })
              : t('debt.check.tooMuch', { instalment: formatMoneyWhole(proposed.monthlyInstalment, currency), affordable: formatMoneyWhole(capacity.affordableMonthlyInstalment, currency) })}
          </Text>
          {!proposed.fits && proposed.maxAmount !== null && proposed.maxAmount > 0 && (
            <Text variant="body-sm" tone="neutral-600">{t('debt.check.max', { amount: formatMoneyWhole(proposed.maxAmount, currency) })}</Text>
          )}
          {capacity.reasons.filter((r) => r.code.startsWith('loan_')).map((r) => (
            <Text key={r.code} variant="micro" tone="neutral-600">{reasonText(t, r)}</Text>
          ))}
          {proposed.stress3m && (
            <Text variant="body-sm" tone="neutral-600">
              {t('debt.check.stressChange', { before: percent(proposed.stress3m.probabilityBefore), after: percent(proposed.stress3m.probabilityAfter) })}
            </Text>
          )}
          {proposed.model && (
            <>
              <Text variant="body-sm" tone="neutral-600">
                {t('debt.check.riskChange', { before: percent(proposed.model.probabilityBefore), after: percent(proposed.model.probabilityAfter) })}
              </Text>
              <Text variant="micro" tone="neutral-500">{t('debt.check.assumption')}</Text>
            </>
          )}
        </View>
      )}
    </View>
  );
}

function DebtCapacityCard({ capacity }: { capacity: Capacity }) {
  const { t } = useI18n();
  const { card } = useCard();
  const color = LEVEL_COLOR[capacity.level];
  const money = (amount: number) => formatMoneyWhole(Math.round(amount), capacity.currency);
  const reasons = capacity.reasons.filter((r) => !r.code.startsWith('loan_'));
  return (
    <View style={card}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="body-lg" weight={700} tone="primary-900">{t('debt.title')}</Text>
          <Text variant="micro" tone="neutral-600">{t('debt.subtitle')}</Text>
        </View>
        <Pill label={t(`debt.level.${capacity.level}` as TKey)} color={color} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Figure label={t('debt.capacity')} value={money(capacity.monthlyCapacity)} hint={t('debt.capacityHint')} />
        <Figure label={t('debt.instalments')} value={money(capacity.existingMonthlyInstalments)} hint={t('debt.perMonth')} />
        <Figure label={t('debt.cover')} value={capacity.dscr === null ? '—' : t('risk.times', { value: capacity.dscr.toFixed(1) })} hint={t('debt.coverHint', { target: capacity.targetDscr })} />
      </View>
      <View style={{ borderLeftWidth: 3, borderLeftColor: color, paddingLeft: 10, paddingVertical: 3 }}>
        <Text variant="body-sm" tone="neutral-600">
          {capacity.affordableMonthlyInstalment > 0 ? t('debt.affordable', { amount: money(capacity.affordableMonthlyInstalment) }) : t('debt.noRoom')}
        </Text>
      </View>
      {reasons.map((reason) => (
        <View key={reason.code} style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 7, backgroundColor: reason.code === 'schedule_missing' ? colors.neutral[500] : colors.warning }} />
          <Text variant="body-sm" tone="primary-900" style={{ flex: 1 }}>{reasonText(t, reason)}</Text>
        </View>
      ))}
      <LoanCheck currency={capacity.currency} />
    </View>
  );
}

function NotYet({ title, body }: { title: string; body: string }) {
  const { card } = useCard();
  return (
    <View style={card}>
      <Text variant="body-lg" weight={700} tone="primary-900">{title}</Text>
      <Text variant="body-sm" tone="neutral-600">{body}</Text>
    </View>
  );
}

/** Financial health, looking ahead: the AI distress estimate (12 months) and the debt capacity check. */
export function FutureRiskSection() {
  const { t } = useI18n();
  const query = useAnalysisQuery(getFutureRisk);
  const risk = query.data;
  if (query.noCache || query.error || !risk) return null;
  return (
    <View style={{ gap: 12 }}>
      <Text variant="body" weight={700} tone="primary-900">{t('analysis.futureRisk')}</Text>
      {query.source === 'cache' && <OfflineBanner fetchedAt={query.fetchedAt} />}
      <RiskCard risk={risk} />
      {risk.debtCapacity.available
        ? <DebtCapacityCard capacity={risk.debtCapacity} />
        : <NotYet title={t('debt.title')} body={t('debt.needsHistory', { count: risk.debtCapacity.months })} />}
    </View>
  );
}
