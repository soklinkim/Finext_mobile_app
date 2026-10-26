import { useState } from 'react';
import { View } from 'react-native';
import { Button } from './Button';
import { Chip, ChipRow } from './Chip';
import { OfflineBanner } from './OfflineBanner';
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
type Capacity = Extract<FutureRisk['debtCapacity'], { available: true }>;

function useCard() {
  const dark = useAppTheme();
  return {
    dark,
    card: { padding: 16, borderRadius: radius.card, backgroundColor: dark ? colors.dark.surface : colors.white, borderWidth: 1, borderColor: dark ? colors.dark.border : colors.neutral[200], gap: 12 } as const,
    soft: dark ? colors.dark.field : colors.primary[50],
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

function DistressCard({ model }: { model: Model }) {
  const { t } = useI18n();
  const { card, soft, dark } = useCard();
  const valueOf = useDriverValue();
  const color = LEVEL_COLOR[model.riskClass];
  const level = t(`risk.level.${model.riskClass}` as TKey);
  return (
    <View style={card}>
      <View style={{ gap: 2 }}>
        <Text variant="body-lg" weight={700} tone="primary-900">{t('risk.title')}</Text>
        <Text variant="micro" tone="neutral-600">{t('risk.horizon')}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, padding: 12, borderRadius: radius.card, backgroundColor: soft }}>
        <View
          accessible
          accessibilityLabel={t('risk.gaugeLabel', { percent: percent(model.probability), level })}
          style={{ width: 84, height: 84, borderRadius: 42, borderWidth: 7, borderColor: color, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? colors.dark.surface : colors.white }}
        >
          <Text variant="amount-xl" tone="primary-900">{percent(model.probability)}%</Text>
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <Pill label={level} color={color} />
          <Text variant="body-sm" tone="neutral-600">{t('risk.chance', { percent: percent(model.probability) })}</Text>
          {model.confidence === 'low' && <Text variant="micro" tone="neutral-600">{t('risk.lowConfidence', { count: model.months })}</Text>}
        </View>
      </View>
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
      {risk.model.available
        ? <DistressCard model={risk.model} />
        : <NotYet title={t('risk.title')} body={t('risk.needsHistory', { count: risk.model.months })} />}
      {risk.debtCapacity.available
        ? <DebtCapacityCard capacity={risk.debtCapacity} />
        : <NotYet title={t('debt.title')} body={t('debt.needsHistory', { count: risk.debtCapacity.months })} />}
    </View>
  );
}
