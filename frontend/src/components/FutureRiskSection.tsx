import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from './Button';
import { Chip, ChipRow } from './Chip';
import { FinHealthCard } from './FinHealthCard';
import { BeforeAfterBar, CashFanChart, DivergingBars, ShareBar, StackedBar, TargetMeter, useChartColors } from './HealthCharts';
import { Icon, type IconName } from './Icon';
import { OfflineBanner } from './OfflineBanner';
import { EmptyState, ErrorState } from './StateViews';
import { Text } from './Text';
import { TextField } from './TextField';
import { WhatIfCard } from './WhatIfCard';
import { useAnalysisQuery } from '@/hooks/useAnalysisQuery';
import { useI18n, type TKey } from '@/i18n';
import { checkLoan, getFutureRisk, type FutureRisk, type ProposedLoan, type RiskAdvice, type RiskDriver, type RiskLevel } from '@/services/analysis';
import { formatUpdated } from '@/lib/format';
import { formatMoneyWhole, parseAmountInput } from '@/services/bookkeeping';
import { adviceText, driverValue, percent, reasonText } from '@/services/riskText';
import { colors, radius } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

const LEVEL_COLOR: Record<RiskLevel, string> = { low: colors.success, moderate: colors.warning, high: colors.danger };
const LEVEL_ORDER: RiskLevel[] = ['low', 'moderate', 'high'];
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

/** A step of the Health story: an icon tile and a blue heading (the same style as Edit Profile and Settings). */
export function StoryHeading({ icon, title }: { icon: IconName; title: string }) {
  const { dark } = useCard();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? colors.dark.field : colors.primary[50] }}>
        <Icon name={icon} size={18} color={dark ? colors.dark.primary : colors.primary[500]} />
      </View>
      <Text variant="title" weight={700} tone="primary-900" accessibilityRole="header" style={{ flex: 1 }}>{title}</Text>
    </View>
  );
}

/**
 * Where an AI answer comes from, under every AI card: the months of books it read, when, that it is an estimate, and
 * a link to the AI Use Statement. `compact` keeps only the last two.
 */
function TrustFooter({ months, fetchedAt, compact }: { months?: number; fetchedAt?: number; compact?: boolean }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const facts = [
    !compact && months ? t('trust.basis', { months }) : null,
    !compact && fetchedAt ? t('trust.updated', { time: formatUpdated(fetchedAt, locale) }) : null,
    t('trust.estimate'),
  ].filter(Boolean);
  return (
    <View style={{ gap: 6 }}>
      <Divider />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="info" size={14} color={colors.neutral[500]} />
        <Text variant="micro" tone="neutral-500" style={{ flex: 1 }}>{facts.join(' · ')}</Text>
      </View>
      <Pressable accessibilityRole="link" onPress={() => router.push('/policy/ai')} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }}>
        <Text variant="caption" weight={600} tone="primary-500">{t('trust.how')}</Text>
        <Icon name="chevronRight" size={14} color={colors.primary[500]} />
      </Pressable>
    </View>
  );
}

/** One horizon in the headline: its percentage and level, or "not yet" with how many months there are. */
function HorizonTile({ label, answer }: { label: string; answer: FutureRisk['model'] | FutureRisk['stress3m'] }) {
  const { t } = useI18n();
  const { soft } = useCard();
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 6, padding: 12, borderRadius: 12, backgroundColor: soft }}
      accessible accessibilityLabel={answer.available ? `${label}: ${percent(answer.probability)}%, ${t(`risk.level.${answer.riskClass}` as TKey)}` : `${label}: ${t('verdict.notYet')}`}>
      <Text variant="micro" weight={600} tone="neutral-600">{label}</Text>
      {answer.available ? (
        <>
          <Text variant="title-lg" weight={700} tone="primary-900">{percent(answer.probability)}%</Text>
          <Pill label={t(`risk.level.${answer.riskClass}` as TKey)} color={LEVEL_COLOR[answer.riskClass]} />
        </>
      ) : (
        <>
          <Text variant="body-lg" weight={700} tone="neutral-500">{t('verdict.notYet')}</Text>
          <Text variant="micro" tone="neutral-500">{t('risk.needsHistory', { count: answer.months })}</Text>
        </>
      )}
    </View>
  );
}

/** The worst level among the answers that are available. */
function overallLevel(risk: FutureRisk): RiskLevel | null {
  const levels = [risk.stress3m, risk.model].flatMap((answer) => (answer.available ? [answer.riskClass] : []));
  return levels.length ? levels.reduce((a, b) => (LEVEL_ORDER.indexOf(b) > LEVEL_ORDER.indexOf(a) ? b : a)) : null;
}

/** Step 1, the answer: one overall verdict, both horizons side by side, and the main reason in a line. */
function VerdictCard({ risk, fetchedAt }: { risk: FutureRisk; fetchedAt?: number }) {
  const { t } = useI18n();
  const { card } = useCard();
  const level = overallLevel(risk);
  const model = risk.model.available ? risk.model : null;
  const raising = model?.topDrivers.find((d) => d.direction === 'raises risk');
  const main = raising ?? model?.topDrivers.find((d) => d.direction === 'lowers risk');
  const stressedNow = risk.stress3m.available ? risk.stress3m.stressedNow : [];
  const months = model?.months ?? (risk.stress3m.available ? risk.stress3m.basedOnMonths : undefined);
  return (
    <View style={card}>
      {level && (
        <View style={{ gap: 4, borderLeftWidth: 4, borderLeftColor: LEVEL_COLOR[level], paddingLeft: 12 }}>
          <Text variant="caption" tone="neutral-600">{t('verdict.overall')}</Text>
          <Text variant="title-lg" weight={700} style={{ color: LEVEL_COLOR[level] }}>{t(`risk.level.${level}` as TKey)}</Text>
          <Text variant="body-sm" tone="primary-900">{t(`verdict.body.${level}` as TKey)}</Text>
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <HorizonTile label={t('verdict.3m')} answer={risk.stress3m} />
        <HorizonTile label={t('verdict.12m')} answer={risk.model} />
      </View>
      {main && (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
          <Icon name={raising ? 'expense' : 'income'} size={16} color={raising ? colors.warning : colors.success} />
          <Text variant="body-sm" tone="primary-900" style={{ flex: 1 }}>
            {t(raising ? 'verdict.mainRaise' : 'verdict.mainHelp', { reason: t(`risk.f.${main.feature}` as TKey), detail: driverValue(t, main) })}
          </Text>
        </View>
      )}
      {stressedNow.length > 0 && (
        <View style={{ borderRadius: 10, padding: 10, gap: 2, backgroundColor: `${colors.danger}14` }}>
          <Text variant="caption" weight={600} style={{ color: colors.danger }}>{t('stress.nowTitle')}</Text>
          {stressedNow.map((c) => <Text key={c} variant="micro" tone="neutral-600">{t(`stress.now.${c}` as TKey)}</Text>)}
        </View>
      )}
      {model?.confidence === 'low' && <Text variant="micro" tone="neutral-600">{t('risk.lowConfidence', { count: model.months })}</Text>}
      <TrustFooter months={months} fetchedAt={fetchedAt} />
    </View>
  );
}

function ShortTermView({ stress }: { stress: Stress }) {
  const { t, locale } = useI18n();
  const { series } = useChartColors();
  const money = (amount: number) => formatMoneyWhole(Math.round(amount), stress.currency);
  const points = stress.cash.map((m) => ({ label: monthName(m.month, locale), median: m.median, low: m.low, high: m.high }));
  const readout = (p: { label: string; median: number; low: number; high: number }) =>
    t('stress.readout', { month: p.label, median: money(p.median), low: money(p.low), high: money(p.high) });
  // Only the signs that appear in some futures; repayment cover only when there are loan instalments.
  const conditions = (['cash_runway', 'negative_cash_flow', 'dscr'] as const)
    .filter((c) => (c !== 'dscr' || stress.instalments.some((x) => x > 0)) && stress.conditions[c] >= 0.01);
  return (
    <>
      <Text variant="micro" tone="neutral-600">{t('stress.basis', { months: stress.basedOnMonths })}</Text>
      <Text variant="caption" weight={600} tone="neutral-600">{t('stress.conditionsTitle')}</Text>
      {conditions.length === 0
        ? <Text variant="body-sm" tone="neutral-600">{t('stress.noConditions')}</Text>
        : conditions.map((c) => (
          <ShareBar key={c} label={t(`stress.condition.${c}` as TKey)} share={stress.conditions[c]} value={`${percent(stress.conditions[c])}%`}
            color={stress.conditions[c] > 0.3 ? colors.danger : stress.conditions[c] >= 0.1 ? colors.warning : series} />
        ))}
      <Divider />
      <Text variant="caption" weight={600} tone="neutral-600">{t('stress.cashTitle')}</Text>
      {points.length > 0 && (
        <CashFanChart
          start={{ label: t('stress.now'), value: stress.startingCash }}
          points={points}
          floor={stress.runwayFloor}
          money={money}
          startLabel={t('stress.now')}
          floorLabel={t('stress.floorShort')}
          legend={{ median: t('stress.median'), range: t('stress.range') }}
          readout={readout}
          accessibilityLabel={`${t('stress.cashTitle')}: ${points.map(readout).join('; ')}`}
        />
      )}
      <Text variant="micro" tone="neutral-500">{t('stress.tapHint')} {t('stress.note')}</Text>
    </>
  );
}

function LongTermView({ model }: { model: Model }) {
  const { t } = useI18n();
  const valueOf = (driver: RiskDriver) => driverValue(t, driver);
  return (
    <>
      <Text variant="caption" weight={600} tone="neutral-600">{t('risk.whyTitle')}</Text>
      <DivergingBars
        leftLabel={t('risk.lowers')}
        rightLabel={t('risk.raises')}
        items={model.topDrivers.slice(0, 5).map((driver) => ({
          key: driver.feature,
          label: t(`risk.f.${driver.feature}` as TKey),
          detail: valueOf(driver),
          amount: (driver.direction === 'raises risk' ? 1 : -1) * Math.abs(driver.contribution),
        }))}
      />
      <Text variant="micro" tone="neutral-500">{t('risk.note')}</Text>
    </>
  );
}

/** Small two-option toggle that sits in a card header (the big SegmentedControl is for page-level tabs). */
function HorizonToggle({ value, onChange }: { value: '3' | '12'; onChange: (value: '3' | '12') => void }) {
  const { t } = useI18n();
  const { soft } = useCard();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', alignSelf: 'flex-start', padding: 3, gap: 2, borderRadius: 999, backgroundColor: soft }}>
      {(['3', '12'] as const).map((option) => {
        const selected = value === option;
        return (
          <Pressable key={option} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => onChange(option)}
            style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, ...(selected ? { backgroundColor: colors.primary[900] } : {}) }}>
            <Text variant="micro" weight={600} tone={selected ? 'white' : 'primary-900'}>{t(option === '3' ? 'stress.tab3' : 'stress.tab12')}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Step 2, why: what moves each answer (spec C3), one horizon at a time; the 12-month reasons first. */
function WhyCard({ risk }: { risk: FutureRisk }) {
  const { t } = useI18n();
  const { card } = useCard();
  const [horizon, setHorizon] = useState<'3' | '12'>(risk.model.available ? '12' : '3');
  return (
    <View style={card}>
      <CardHeader title={t(horizon === '3' ? 'stress.title' : 'risk.title')} subtitle={t(horizon === '3' ? 'stress.horizon' : 'risk.horizon')} />
      <HorizonToggle value={horizon} onChange={setHorizon} />
      {horizon === '3'
        ? risk.stress3m.available
          ? <ShortTermView stress={risk.stress3m} />
          : <Text variant="body-sm" tone="neutral-600">{t('risk.needsHistory', { count: risk.stress3m.months })}</Text>
        : risk.model.available
          ? <LongTermView model={risk.model} />
          : <Text variant="body-sm" tone="neutral-600">{t('risk.needsHistory', { count: risk.model.months })}</Text>}
      <TrustFooter compact />
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
  const { dark } = useCard();
  const { series } = useChartColors();
  // The money available for repayments, split into what loans already take, what a new loan could take, and the margin kept back.
  const existing = capacity.existingMonthlyInstalments;
  const room = capacity.affordableMonthlyInstalment;
  const buffer = Math.max(0, capacity.monthlyCapacity - existing - room);
  const split = [
    { key: 'existing', label: t('debt.instalments'), value: existing, color: existing > capacity.monthlyCapacity ? colors.danger : dark ? colors.dark.primary : colors.primary[900], text: money(existing) },
    { key: 'room', label: t('debt.room'), value: room, color: series, text: money(room) },
    { key: 'buffer', label: t('debt.buffer'), value: buffer, color: dark ? colors.dark.subtle : colors.primary[200], text: money(buffer) },
  ];
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
      {capacity.monthlyCapacity > 0 && (
        <View style={{ gap: 8 }}>
          <Text variant="caption" weight={600} tone="neutral-600">{t('debt.split')}</Text>
          <StackedBar parts={split} accessibilityLabel={`${t('debt.split')}: ${split.map((part) => `${part.label} ${part.text}`).join(', ')}`} />
        </View>
      )}
      <Divider />
      <Row label={t('debt.cover')} hint={t('debt.coverHint', { target: capacity.targetDscr })}
        value={capacity.dscr === null ? '—' : t('risk.times', { value: capacity.dscr.toFixed(1) })} valueColor={coverColor} />
      {capacity.dscr !== null && (
        <TargetMeter value={capacity.dscr} target={capacity.targetDscr} max={Math.max(capacity.targetDscr * 2, capacity.dscr)} color={coverColor ?? colors.success} />
      )}
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

/** What the change does: each improved probability as a before → after bar; otherwise the cash it brings, as text. */
function Effects({ item }: { item: RiskAdvice }) {
  const { t } = useI18n();
  const money = (n: number) => formatMoneyWhole(Math.round(n), item.currency);
  const bars: { label: string; before: number; after: number }[] = [];
  if (item.stress3m && item.stress3m.after < item.stress3m.before) bars.push({ label: t('advice.stress3m'), ...item.stress3m });
  if (item.model12m && item.model12m.after < item.model12m.before - 0.001) bars.push({ label: t('advice.model12m'), ...item.model12m });
  if (bars.length) {
    return (
      <View style={{ gap: 8, marginTop: 2 }}>
        {bars.map((bar) => (
          <BeforeAfterBar key={bar.label} label={bar.label} before={bar.before} after={bar.after} beforeText={`${percent(bar.before)}%`} afterText={`${percent(bar.after)}%`} />
        ))}
      </View>
    );
  }
  const parts: { label: string; before: string; after: string }[] = [];
  if (item.cash3m && item.cash3m.after > item.cash3m.before) parts.push({ label: t('advice.cash3m'), before: money(item.cash3m.before), after: money(item.cash3m.after) });
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
      <TrustFooter compact />
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

const UNLOCK_MONTHS = 6;

/** Before there are enough complete months: what unlocks and how far along the business is (like the health snapshot). */
function LockedCard({ months }: { months: number }) {
  const { t } = useI18n();
  const { dark } = useCard();
  const done = Math.min(months, UNLOCK_MONTHS);
  return (
    <View style={{ padding: 18, borderRadius: radius.card, backgroundColor: dark ? colors.dark.surface : colors.primary[50], gap: 12 }}>
      <View style={{ gap: 3 }}>
        <Text variant="caption" tone="neutral-600">{t('risk.lockedLabel')}</Text>
        <Text variant="title" tone="primary-900">{t('risk.lockedTitle', { months: UNLOCK_MONTHS })}</Text>
      </View>
      <View accessibilityRole="progressbar" accessibilityLabel={t('risk.lockedProgress', { count: done, months: UNLOCK_MONTHS })} style={{ flexDirection: 'row', gap: 4 }}>
        {Array.from({ length: UNLOCK_MONTHS }, (_, index) => (
          <View key={index} style={{ flex: 1, height: 6, borderRadius: 99, backgroundColor: index < done ? colors.primary[500] : dark ? colors.dark.field : colors.white }} />
        ))}
      </View>
      <Text variant="micro" tone="neutral-600">{t('risk.lockedProgress', { count: done, months: UNLOCK_MONTHS })}</Text>
    </View>
  );
}

/**
 * The Health tab as a story: the answer, why, what to do, whether the business can borrow, and the owner's own
 * check-in next to the books. The ratio details follow on the Analysis screen.
 */
export function FutureRiskSection() {
  const { t } = useI18n();
  const query = useAnalysisQuery(getFutureRisk);
  const risk = query.data;
  const answer = <StoryHeading icon="shield" title={t('story.answer')} />;
  const checkIn = (
    <View style={{ gap: 12 }}>
      <StoryHeading icon="user" title={t('story.booksVsYou')} />
      <FinHealthCard booksLevel={risk ? overallLevel(risk) : null} />
    </View>
  );
  // Say what is happening rather than hiding the section: loading, offline with nothing saved, or the error itself.
  if (!risk) {
    return (
      <View style={{ gap: 28 }}>
        <View style={{ gap: 12 }}>
          {answer}
          {query.loading ? <ActivityIndicator color={colors.primary[500]} style={{ paddingVertical: 24 }} /> : null}
          {!query.loading && query.noCache ? <EmptyState titleKey="offline.noCache" bodyKey="offline.noCacheBody" icon="wifiOff" /> : null}
          {!query.loading && query.error ? <ErrorState onRetry={query.reload} error={query.error} /> : null}
        </View>
        {!query.loading && checkIn}
      </View>
    );
  }
  const scored = risk.stress3m.available || risk.model.available;
  const recorded = risk.stress3m.available ? risk.stress3m.basedOnMonths : risk.stress3m.months;
  // Not enough records for any of it yet: one compact card with progress, not empty cards and tabs.
  if (!scored && !risk.debtCapacity.available) {
    return (
      <View style={{ gap: 28 }}>
        <View style={{ gap: 12 }}>
          {answer}
          <LockedCard months={recorded} />
        </View>
        {checkIn}
      </View>
    );
  }
  return (
    <View style={{ gap: 28 }}>
      <View style={{ gap: 12 }}>
        {answer}
        {query.source === 'cache' && <OfflineBanner fetchedAt={query.fetchedAt} />}
        {scored ? <VerdictCard risk={risk} fetchedAt={query.fetchedAt} /> : <LockedCard months={recorded} />}
      </View>
      {scored && (
        <View style={{ gap: 12 }}>
          <StoryHeading icon="info" title={t('story.why')} />
          <WhyCard risk={risk} />
        </View>
      )}
      {scored && (
        <View style={{ gap: 12 }}>
          <StoryHeading icon="star" title={t('story.whatToDo')} />
          {risk.advice && (
            <AdviceCard advice={risk.advice} lowRisk={[risk.stress3m, risk.model].every((a) => !a.available || a.riskClass === 'low')} />
          )}
          <WhatIfCard />
        </View>
      )}
      <View style={{ gap: 12 }}>
        <StoryHeading icon="dollar" title={t('story.borrow')} />
        {risk.debtCapacity.available
          ? <DebtCapacityCard capacity={risk.debtCapacity} />
          : <NotYet title={t('debt.title')} body={t('debt.needsHistory', { count: risk.debtCapacity.months })} />}
      </View>
      {checkIn}
    </View>
  );
}
