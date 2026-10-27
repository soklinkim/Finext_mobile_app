import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Button } from './Button';
import { Chip, ChipRow } from './Chip';
import { Icon } from './Icon';
import { OfflineBanner } from './OfflineBanner';
import { SegmentedControl } from './SegmentedControl';
import { EmptyState, ErrorState } from './StateViews';
import { Text } from './Text';
import { TextField } from './TextField';
import { useAnalysisQuery } from '@/hooks/useAnalysisQuery';
import { useI18n, type TKey } from '@/i18n';
import { checkLoan, getFutureRisk, type FutureRisk, type ProposedLoan, type RiskAdvice, type RiskDriver, type RiskLevel } from '@/services/analysis';
import { formatMoneyWhole, parseAmountInput } from '@/services/bookkeeping';
import { adviceText, driverValue, percent, reasonText } from '@/services/riskText';
import { colors, radius } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

const LEVEL_COLOR: Record<RiskLevel, string> = { low: colors.success, moderate: colors.warning, high: colors.danger };
type Model = Extract<FutureRisk['model'], { available: true }>;
type Stress = Extract<FutureRisk['stress3m'], { available: true }>;
type Capacity = Extract<FutureRisk['debtCapacity'], { available: true }>;

function monthName(month: string, locale: string): string {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number - 1, 1)).toLocaleDateString(locale === 'km' ? 'km-KH' : 'en-GB', { month: 'short', timeZone: 'UTC' });
}

function useCard() {
  const dark = useAppTheme();
  return {
    dark,
    card: { padding: 16, borderRadius: radius.card, backgroundColor: dark ? colors.dark.surface : colors.white, borderWidth: 1, borderColor: dark ? colors.dark.border : colors.neutral[200], gap: 14 } as const,
    soft: dark ? colors.dark.field : colors.primary[50],
    track: dark ? colors.dark.field : colors.neutral[200],
    line: dark ? colors.dark.border : colors.neutral[200],
  };
}

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: `${color}26` }}>
      <Text variant="micro" weight={600} style={{ color }}>{label}</Text>
    </View>
  );
}

function Divider() {
  const { line } = useCard();
  return <View style={{ height: 1, backgroundColor: line }} />;
}

/** Card title, an optional one-line subtitle, and an optional item on the right (e.g. the level). */
function CardHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body-lg" weight={700} tone="primary-900">{title}</Text>
        {subtitle ? <Text variant="micro" tone="neutral-600">{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

/** Label (and a muted hint under it) on the left, value on the right. */
function Row({ label, hint, value, valueColor }: { label: string; hint?: string; value: string; valueColor?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }} accessible accessibilityLabel={`${label}: ${value}`}>
      <View style={{ flex: 1, gap: 1 }}>
        <Text variant="body-sm" tone="primary-900">{label}</Text>
        {hint ? <Text variant="micro" tone="neutral-500">{hint}</Text> : null}
      </View>
      <Text variant="body" weight={700} tone="primary-900" style={{ ...(valueColor ? { color: valueColor } : {}) }}>{value}</Text>
    </View>
  );
}

/** The percentage in a ring coloured by level, the level beside it, and one short line under the level. */
function Gauge({ probability, level, label, note }: { probability: number; level: RiskLevel; label: string; note?: string }) {
  const { t } = useI18n();
  const { dark } = useCard();
  const color = LEVEL_COLOR[level];
  const levelText = t(`risk.level.${level}` as TKey);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
      <View
        accessible
        accessibilityLabel={`${label}: ${percent(probability)}%, ${levelText}`}
        style={{ width: 76, height: 76, borderRadius: 38, borderWidth: 6, borderColor: color, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? colors.dark.surface : colors.white }}
      >
        <Text variant="title-lg" weight={700} tone="primary-900">{percent(probability)}%</Text>
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        <Pill label={levelText} color={color} />
        {note ? <Text variant="micro" tone="neutral-600">{note}</Text> : null}
      </View>
    </View>
  );
}

function ShortTermView({ stress }: { stress: Stress }) {
  const { t, locale } = useI18n();
  const { soft } = useCard();
  const money = (amount: number) => formatMoneyWhole(Math.round(amount), stress.currency);
  // Only the signs that appear in some futures; repayment cover only when there are loan instalments.
  const conditions = (['cash_runway', 'negative_cash_flow', 'dscr'] as const)
    .filter((c) => (c !== 'dscr' || stress.instalments.some((x) => x > 0)) && stress.conditions[c] >= 0.01);
  return (
    <>
      <Gauge probability={stress.probability} level={stress.riskClass} label={t('stress.title')} note={t('stress.basis', { months: stress.basedOnMonths })} />
      {stress.stressedNow.length > 0 && (
        <View style={{ borderRadius: 10, padding: 10, gap: 2, backgroundColor: `${colors.danger}14` }}>
          <Text variant="caption" weight={600} style={{ color: colors.danger }}>{t('stress.nowTitle')}</Text>
          {stress.stressedNow.map((c) => <Text key={c} variant="micro" tone="neutral-600">{t(`stress.now.${c}` as TKey)}</Text>)}
        </View>
      )}
      <Divider />
      <Text variant="caption" weight={600} tone="neutral-600">{t('stress.conditionsTitle')}</Text>
      {conditions.length === 0
        ? <Text variant="body-sm" tone="neutral-600">{t('stress.noConditions')}</Text>
        : conditions.map((c) => (
          <Row key={c} label={t(`stress.condition.${c}` as TKey)} value={`${percent(stress.conditions[c])}%`}
            valueColor={stress.conditions[c] > 0.3 ? colors.danger : stress.conditions[c] >= 0.1 ? colors.warning : undefined} />
        ))}
      <Divider />
      <Text variant="caption" weight={600} tone="neutral-600">{t('stress.cashTitle')}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {stress.cash.map((m) => {
          const short = m.median < stress.runwayFloor;
          return (
            <View key={m.month} style={{ flex: 1, minWidth: 0, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 6, alignItems: 'center', gap: 2, backgroundColor: short ? `${colors.danger}14` : soft }}
              accessible accessibilityLabel={`${monthName(m.month, locale)}: ${money(m.median)} (${money(m.low)} – ${money(m.high)})`}>
              <Text variant="micro" tone="neutral-600">{monthName(m.month, locale)}</Text>
              <Text variant="caption" weight={700} tone="primary-900" numberOfLines={1} adjustsFontSizeToFit style={{ ...(short ? { color: colors.danger } : {}) }}>{money(m.median)}</Text>
            </View>
          );
        })}
      </View>
      <Text variant="micro" tone="neutral-500">{t('stress.floor', { amount: money(stress.runwayFloor) })} {t('stress.note')}</Text>
    </>
  );
}

function LongTermView({ model }: { model: Model }) {
  const { t } = useI18n();
  const valueOf = (driver: RiskDriver) => driverValue(t, driver);
  return (
    <>
      <Gauge probability={model.probability} level={model.riskClass} label={t('risk.title')}
        note={model.confidence === 'low' ? t('risk.lowConfidence', { count: model.months }) : undefined} />
      <Divider />
      <Text variant="caption" weight={600} tone="neutral-600">{t('risk.whyTitle')}</Text>
      {model.topDrivers.slice(0, 3).map((driver) => {
        const raises = driver.direction === 'raises risk';
        const color = raises ? colors.danger : colors.success;
        return (
          <View key={driver.feature} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }} accessible
            accessibilityLabel={`${t(`risk.f.${driver.feature}` as TKey)}: ${valueOf(driver)}, ${t(raises ? 'risk.raises' : 'risk.lowers')}`}>
            <View style={{ width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: `${color}1f`, marginTop: 1 }}>
              <Text variant="micro" weight={700} style={{ color }}>{raises ? '↑' : '↓'}</Text>
            </View>
            <View style={{ flex: 1, gap: 1 }}>
              <Text variant="body-sm" tone="primary-900">{t(`risk.f.${driver.feature}` as TKey)}</Text>
              <Text variant="micro" tone="neutral-600">{valueOf(driver)} · <Text variant="micro" style={{ color }}>{t(raises ? 'risk.raises' : 'risk.lowers')}</Text></Text>
            </View>
          </View>
        );
      })}
      <Text variant="micro" tone="neutral-500">{t('risk.note')}</Text>
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
      <CardHeader title={t(horizon === '3' ? 'stress.title' : 'risk.title')} subtitle={t(horizon === '3' ? 'stress.horizon' : 'risk.horizon')} />
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

function LoanCheck({ currency }: { currency: Capacity['currency'] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
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

  if (!open) {
    return (
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="body-sm" weight={600} tone="primary-900">{t('debt.check.open')}</Text>
          <Text variant="micro" tone="neutral-600">{t('debt.check.body')}</Text>
        </View>
        <Icon name="chevronRight" size={18} color={colors.primary[500]} />
      </Pressable>
    );
  }

  const capacity = result?.debtCapacity.available ? result.debtCapacity : null;
  const proposed = capacity?.proposed;
  return (
    <View style={{ gap: 12 }}>
      <Text variant="body-sm" weight={600} tone="primary-900">{t('debt.check.title')}</Text>
      <TextField variant="form" label={t('debt.check.amount', { currency })} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><TextField variant="form" label={t('debt.check.term')} value={term} onChangeText={setTerm} keyboardType="number-pad" /></View>
        <View style={{ flex: 1 }}><TextField variant="form" label={t('debt.check.rate')} value={rate} onChangeText={setRate} keyboardType="decimal-pad" /></View>
      </View>
      <ChipRow>
        <Chip label={t('debt.check.flat')} selected={rateType === 'flat'} onPress={() => setRateType('flat')} />
        <Chip label={t('debt.check.declining')} selected={rateType === 'declining'} onPress={() => setRateType('declining')} />
        <Chip label={t('debt.check.monthly')} selected={frequency === 'monthly'} onPress={() => setFrequency('monthly')} />
        <Chip label={t('debt.check.weekly')} selected={frequency === 'weekly'} onPress={() => setFrequency('weekly')} />
      </ChipRow>
      <Button label={t('debt.check.submit')} onPress={submit} loading={busy} size="sm" />
      {error && <Text variant="body-sm" style={{ color: colors.danger }}>{error}</Text>}
      {capacity && proposed && (
        <View accessibilityLiveRegion="polite" style={{ gap: 6, borderRadius: 10, padding: 12, backgroundColor: `${proposed.fits ? colors.success : colors.danger}14` }}>
          <Text variant="body-sm" weight={600} style={{ color: proposed.fits ? colors.success : colors.danger }}>
            {proposed.fits
              ? t('debt.check.fits', { instalment: formatMoneyWhole(proposed.monthlyInstalment, currency), cover: (proposed.dscrWith ?? 0).toFixed(1) })
              : t('debt.check.tooMuch', { instalment: formatMoneyWhole(proposed.monthlyInstalment, currency), affordable: formatMoneyWhole(capacity.affordableMonthlyInstalment, currency) })}
          </Text>
          {!proposed.fits && proposed.maxAmount !== null && proposed.maxAmount > 0 && (
            <Text variant="body-sm" tone="primary-900">{t('debt.check.max', { amount: formatMoneyWhole(proposed.maxAmount, currency) })}</Text>
          )}
          {proposed.stress3m && (
            <Text variant="micro" tone="neutral-600">
              {t('debt.check.stressChange', { before: percent(proposed.stress3m.probabilityBefore), after: percent(proposed.stress3m.probabilityAfter) })}
            </Text>
          )}
          {proposed.model && (
            <Text variant="micro" tone="neutral-600">
              {t('debt.check.riskChange', { before: percent(proposed.model.probabilityBefore), after: percent(proposed.model.probabilityAfter) })}
            </Text>
          )}
          {proposed.model && <Text variant="micro" tone="neutral-500">{t('debt.check.assumption')}</Text>}
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
  const coverColor = capacity.dscr === null ? undefined : capacity.dscr < 1 ? colors.danger : capacity.dscr < capacity.targetDscr ? colors.warning : undefined;
  return (
    <View style={card}>
      <CardHeader title={t('debt.title')} subtitle={t('debt.subtitle')} right={<Pill label={t(`debt.level.${capacity.level}` as TKey)} color={color} />} />
      <View style={{ borderRadius: 10, padding: 12, backgroundColor: `${color}14` }}>
        <Text variant="body-sm" weight={600} tone="primary-900">
          {capacity.affordableMonthlyInstalment > 0 ? t('debt.affordable', { amount: money(capacity.affordableMonthlyInstalment) }) : t('debt.noRoom')}
        </Text>
      </View>
      <Row label={t('debt.capacity')} hint={t('debt.capacityHint')} value={money(capacity.monthlyCapacity)} valueColor={capacity.monthlyCapacity <= 0 ? colors.danger : undefined} />
      <Row label={t('debt.instalments')} hint={t('debt.perMonth')} value={money(capacity.existingMonthlyInstalments)} />
      <Row label={t('debt.cover')} hint={t('debt.coverHint', { target: capacity.targetDscr })}
        value={capacity.dscr === null ? '—' : t('risk.times', { value: capacity.dscr.toFixed(1) })} valueColor={coverColor} />
      {reasons.length > 0 && <Divider />}
      {reasons.map((reason) => (
        <View key={reason.code} style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, marginTop: 7, backgroundColor: reason.code === 'schedule_missing' ? colors.neutral[500] : colors.warning }} />
          <Text variant="body-sm" tone="primary-900" style={{ flex: 1 }}>{reasonText(t, reason)}</Text>
        </View>
      ))}
      <Divider />
      <LoanCheck currency={capacity.currency} />
    </View>
  );
}

/** One line of what the change does: each improved figure as "label before → after". */
function Effects({ item }: { item: RiskAdvice }) {
  const { t } = useI18n();
  const money = (n: number) => formatMoneyWhole(Math.round(n), item.currency);
  const parts: { label: string; before: string; after: string }[] = [];
  if (item.stress3m && item.stress3m.after < item.stress3m.before) parts.push({ label: t('stress.tab3'), before: `${percent(item.stress3m.before)}%`, after: `${percent(item.stress3m.after)}%` });
  if (item.model12m && item.model12m.after < item.model12m.before - 0.001) parts.push({ label: t('stress.tab12'), before: `${percent(item.model12m.before)}%`, after: `${percent(item.model12m.after)}%` });
  if (!parts.length && item.cash3m && item.cash3m.after > item.cash3m.before) parts.push({ label: t('advice.cash3m'), before: money(item.cash3m.before), after: money(item.cash3m.after) });
  return (
    <Text variant="micro" tone="neutral-600">
      {parts.map((part, i) => (
        <Text key={part.label} variant="micro" tone="neutral-600">
          {i ? '  ·  ' : ''}{part.label} {part.before} → <Text variant="micro" weight={700} style={{ color: colors.success }}>{part.after}</Text>
        </Text>
      ))}
    </Text>
  );
}

function AdviceCard({ advice, lowRisk }: { advice: RiskAdvice[]; lowRisk: boolean }) {
  const { t } = useI18n();
  const { card } = useCard();
  if (!advice.length && !lowRisk) return null;
  return (
    <View style={card}>
      <CardHeader title={t('advice.title')} subtitle={advice.length ? t('advice.subtitle') : undefined} />
      {advice.length === 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: `${colors.success}1f` }}>
            <Text variant="micro" weight={700} style={{ color: colors.success }}>✓</Text>
          </View>
          <Text variant="body-sm" tone="neutral-600" style={{ flex: 1 }}>{t('advice.lowRisk')}</Text>
        </View>
      )}
      {advice.map((item, index) => (
        <View key={item.code} style={{ gap: 14 }}>
          {index > 0 && <Divider />}
          <View style={{ flexDirection: 'row', gap: 10 }} accessible>
            <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary[900] }}>
              <Text variant="micro" weight={700} tone="white">{index + 1}</Text>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text variant="body-sm" tone="primary-900">{adviceText(t, item)}</Text>
              <Effects item={item} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

function NotYet({ title, body }: { title: string; body: string }) {
  const { card } = useCard();
  return (
    <View style={card}>
      <CardHeader title={title} />
      <Text variant="body-sm" tone="neutral-600">{body}</Text>
    </View>
  );
}

/** Financial health, looking ahead: stress in 3 and 12 months, how to lower it, and the debt capacity check. */
export function FutureRiskSection() {
  const { t } = useI18n();
  const query = useAnalysisQuery(getFutureRisk);
  const risk = query.data;
  const heading = <Text variant="title-lg" weight={700} tone="primary-900">{t('analysis.futureRisk')}</Text>;
  // Say what is happening rather than hiding the section: loading, offline with nothing saved, or the error itself.
  if (!risk) {
    return (
      <View style={{ gap: 12 }}>
        {heading}
        {query.loading ? <ActivityIndicator color={colors.primary[500]} style={{ paddingVertical: 24 }} /> : null}
        {!query.loading && query.noCache ? <EmptyState titleKey="offline.noCache" bodyKey="offline.noCacheBody" icon="wifiOff" /> : null}
        {!query.loading && query.error ? <ErrorState onRetry={query.reload} error={query.error} /> : null}
      </View>
    );
  }
  return (
    <View style={{ gap: 16 }}>
      {heading}
      {query.source === 'cache' && <OfflineBanner fetchedAt={query.fetchedAt} />}
      <RiskCard risk={risk} />
      {risk.advice && (risk.stress3m.available || risk.model.available) && (
        <AdviceCard
          advice={risk.advice}
          lowRisk={[risk.stress3m, risk.model].every((answer) => !answer.available || answer.riskClass === 'low')}
        />
      )}
      {risk.debtCapacity.available
        ? <DebtCapacityCard capacity={risk.debtCapacity} />
        : <NotYet title={t('debt.title')} body={t('debt.needsHistory', { count: risk.debtCapacity.months })} />}
    </View>
  );
}
