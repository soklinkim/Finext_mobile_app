import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import { AnalysisLoading } from './AnalysisLoading';
import { StatusMark, type MarkKind } from './HealthCharts';
import { Button } from './Button';
import { Icon } from './Icon';
import { OfflineBanner } from './OfflineBanner';
import { Chip, ChipRow } from './Chip';
import { SelectField } from './SelectField';
import { EmptyState, ErrorState } from './StateViews';
import { Text } from './Text';
import { useAnalysisQuery } from '@/hooks/useAnalysisQuery';
import { useI18n, type TKey } from '@/i18n';
import { confirmAction } from '@/lib/confirm';
import { type LoanReadiness, type ReadinessLevel } from '@/services/analysis';
import {
  SHARE_DAYS,
  SHARE_SCOPES,
  getLoanReadiness,
  listLenders,
  listShares,
  revokeShare,
  shareWithLender,
  type Lender,
  type LoanShare,
  type ShareDecision,
  type ShareScope,
} from '@/services/loan';
import { colors, radius } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

const LEVEL_COLOR: Record<ReadinessLevel, string> = {
  ready: colors.success,
  almost: colors.warning,
  not_ready: colors.danger,
  insufficient_data: colors.neutral[500],
};
const STATUS_COLOR = { pass: colors.success, warn: colors.warning, fail: colors.danger, missing: colors.neutral[500] };
const DECISION_COLOR: Record<ShareDecision, string> = {
  new: colors.neutral[500],
  reviewing: colors.warning,
  approved: colors.success,
  declined: colors.danger,
};

function useCard() {
  const dark = useAppTheme();
  return {
    dark,
    card: { padding: 16, borderRadius: radius.card, backgroundColor: dark ? colors.dark.surface : colors.white, borderWidth: 1, borderColor: dark ? colors.dark.border : colors.neutral[200], gap: 12 } as const,
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

const SCORE_BANDS = [50, 70]; // "almost" from 50, "ready" from 70 (backend loan_readiness.assess)
const MIN_MONTHS = 3; // months with entries before there is a score (backend MIN_ACTIVE_MONTHS)
const CHECK_STATUSES = ['pass', 'warn', 'fail', 'missing'] as const;
type CheckStatus = (typeof CHECK_STATUSES)[number];
type Check = LoanReadiness['checks'][number];

const scoreColor = (score: number) => (score >= 70 ? colors.success : score >= 50 ? colors.warning : colors.danger);

const CHECK_MARK: Record<CheckStatus, MarkKind> = { pass: 'good', warn: 'watch', fail: 'bad', missing: 'none' };

function StatusIcon({ status }: { status: CheckStatus }) {
  return <StatusMark kind={CHECK_MARK[status]} />;
}

function checkValue(t: ReturnType<typeof useI18n>['t'], check: Check): string | null {
  if (check.value === null) return null;
  if (check.format === 'percent') return `${Math.round(check.value * 100)}%`;
  if (check.format === 'times') return t('risk.times', { value: check.value.toFixed(1) });
  if (check.format === 'months') return t('loan.value.months', { count: check.value });
  if (check.format === 'days') return t('loan.value.days', { count: check.value });
  return null;
}

/** Score out of 100 on a half gauge; the notches mark where "almost" (50) and "ready" (70) begin. */
function ScoreGauge({ score, color }: { score: number | null; color: string }) {
  const { dark, track } = useCard();
  const notch = dark ? colors.dark.surface : colors.primary[50];
  const W = 200;
  const stroke = 14;
  const r = (W - stroke) / 2;
  const cx = W / 2;
  const cy = r + stroke / 2;
  const arc = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const length = Math.PI * r;
  return (
    <View style={{ width: W, height: cy + stroke / 2, alignItems: 'center', justifyContent: 'flex-end' }}>
      <Svg width={W} height={cy + stroke / 2} style={{ position: 'absolute', top: 0 }}>
        <Path d={arc} stroke={track} strokeWidth={stroke} fill="none" strokeLinecap="round" />
        {score !== null && score > 0 && (
          <Path d={arc} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${(score / 100) * length} ${length}`} />
        )}
        {SCORE_BANDS.map((band) => {
          const angle = Math.PI * (1 - band / 100);
          const inner = r - stroke / 2 - 1;
          const outer = r + stroke / 2 + 1;
          return (
            <Line key={band} x1={cx + inner * Math.cos(angle)} y1={cy - inner * Math.sin(angle)} x2={cx + outer * Math.cos(angle)} y2={cy - outer * Math.sin(angle)}
              stroke={notch} strokeWidth={3} />
          );
        })}
      </Svg>
      <View style={{ alignItems: 'center' }}>
        <Text variant="amount-xl" tone="primary-900">{score ?? '—'}</Text>
        <Text variant="micro" tone="neutral-600">/ 100</Text>
      </View>
    </View>
  );
}

/** Every check in one bar, split by result, with the counts underneath. */
function ChecksBar({ checks }: { checks: Check[] }) {
  const { t } = useI18n();
  const counts = CHECK_STATUSES.map((status) => ({ status, count: checks.filter((check) => check.status === status).length }));
  const label = counts.map(({ status, count }) => `${count} ${t(`loan.status.${status}` as TKey)}`).join(', ');
  const passed = counts[0].count;
  return (
    <View style={{ gap: 8 }} accessible accessibilityLabel={`${t('loan.checksTitle')}: ${label}`}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <Text variant="caption" weight={600} tone="primary-900">{t('loan.checksTitle')}</Text>
        <Text variant="micro" tone="neutral-600">{t('loan.passedOf', { count: passed, total: checks.length })}</Text>
      </View>
      <View style={{ height: 8, flexDirection: 'row', gap: 2, borderRadius: 4, overflow: 'hidden' }}>
        {counts.filter(({ count }) => count > 0).map(({ status, count }) => (
          <View key={status} style={{ flex: count, backgroundColor: STATUS_COLOR[status] }} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4 }}>
        {counts.map(({ status, count }) => (
          <View key={status} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: STATUS_COLOR[status] }} />
            <Text variant="micro" tone="neutral-600"><Text variant="micro" weight={700} tone="primary-900">{count}</Text> {t(`loan.status.${status}` as TKey)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function ScoreCard({ readiness }: { readiness: LoanReadiness }) {
  const { t } = useI18n();
  const { dark } = useCard();
  const color = LEVEL_COLOR[readiness.level];
  const waiting = readiness.level === 'insufficient_data';
  const level = t(`loan.level.${readiness.level}` as TKey);
  // While there is no score, show what is missing (months recorded) instead of an empty gauge.
  const months = readiness.checks.find((check) => check.id === 'history')?.value ?? 0;
  const line = dark ? colors.dark.border : colors.white;
  return (
    <View style={{ padding: 16, borderRadius: radius.card, backgroundColor: dark ? colors.dark.surface : colors.primary[50], gap: 16 }}>
      <View style={{ gap: 12 }} accessible accessibilityLabel={`${t('loan.scoreLabel', { score: waiting ? '—' : readiness.score ?? '—' })}, ${level}`}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Text variant="body" weight={700} tone="primary-900">{t('loan.title')}</Text>
          <Pill label={level} color={color} />
        </View>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <ScoreGauge score={waiting ? null : readiness.score} color={color} />
          <Text variant="micro" tone="neutral-500">
            {waiting && months < MIN_MONTHS ? t('loan.monthsProgress', { count: months, months: MIN_MONTHS }) : t('loan.readyAt')}
          </Text>
        </View>
        <Text variant="body-sm" tone="neutral-600">{t(`loan.levelBody.${readiness.level}` as TKey)}</Text>
      </View>
      <View style={{ height: 1, backgroundColor: line }} />
      <View style={{ gap: 6 }}>
        <ChecksBar checks={readiness.checks} />
        <Text variant="micro" tone="neutral-500">{t('loan.coverageShort', { percent: Math.round(readiness.coverage * 100) })}</Text>
      </View>
    </View>
  );
}

/** Each area's score as a bar; tap one to see the checks behind it. */
function Pillars({ readiness }: { readiness: LoanReadiness }) {
  const { t } = useI18n();
  const { card, track } = useCard();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <View style={card}>
      <View style={{ gap: 2 }}>
        <Text variant="body" weight={700} tone="primary-900">{t('loan.breakdown')}</Text>
        <Text variant="micro" tone="neutral-600">{t('loan.tapPillar')}</Text>
      </View>
      {readiness.pillars.map((pillar, index) => {
        const expanded = open === pillar.id;
        const name = t(`loan.pillar.${pillar.id}` as TKey);
        return (
          <View key={pillar.id} style={{ gap: 10, ...(index > 0 ? { borderTopWidth: 1, borderTopColor: track, paddingTop: 12 } : {}) }}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={`${name}: ${pillar.score ?? t('loan.noData')}`}
              onPress={() => setOpen(expanded ? null : pillar.id)} style={{ gap: 7 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text variant="caption" weight={600} tone="primary-900" style={{ flex: 1 }}>{name} <Text variant="micro" tone="neutral-500">· {pillar.weight}%</Text></Text>
                <Text variant="caption" weight={700} tone="primary-900">{pillar.score ?? '—'}</Text>
                <View style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}><Icon name="chevronDown" size={16} color={colors.neutral[500]} /></View>
              </View>
              <View style={{ height: 8, borderRadius: 99, backgroundColor: track, overflow: 'hidden' }}>
                {pillar.score ? <View style={{ width: `${pillar.score}%`, height: '100%', borderRadius: 99, backgroundColor: scoreColor(pillar.score) }} /> : null}
              </View>
            </Pressable>
            {expanded && readiness.checks.filter((check) => check.pillar === pillar.id).map((check) => {
              const value = checkValue(t, check);
              return (
                <View key={check.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
                  accessible accessibilityLabel={`${t(`loan.check.${check.id}` as TKey)}: ${t(`loan.status.${check.status}` as TKey)}${value ? `, ${value}` : ''}`}>
                  <StatusIcon status={check.status} />
                  <Text variant="body-sm" tone="primary-900" style={{ flex: 1 }}>{t(`loan.check.${check.id}` as TKey)}</Text>
                  {value ? <Text variant="caption" weight={600} tone="primary-900">{value}</Text> : null}
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

/** The checks to work on first: titles only, tap one for how to fix it. */
function Improvements({ readiness }: { readiness: LoanReadiness }) {
  const { t } = useI18n();
  const { card, track } = useCard();
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const items = readiness.improvements.map((id) => readiness.checks.find((check) => check.id === id)).filter((check): check is Check => Boolean(check));
  const shown = all ? items : items.slice(0, 3);
  return (
    <View style={card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text variant="body" weight={700} tone="primary-900">{t('loan.improveTitle')}</Text>
        {items.length > 0 && <Text variant="caption" weight={700} tone="neutral-600">{items.length}</Text>}
      </View>
      {items.length === 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <StatusIcon status="pass" />
          <Text variant="body-sm" tone="neutral-600" style={{ flex: 1 }}>{t('loan.improveNone')}</Text>
        </View>
      ) : (
        shown.map((check, index) => {
          const expanded = open === check.id;
          return (
            <Pressable key={check.id} accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setOpen(expanded ? null : check.id)}
              style={{ gap: 6, ...(index > 0 ? { borderTopWidth: 1, borderTopColor: track, paddingTop: 12 } : {}) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <StatusIcon status={check.status} />
                <Text variant="body-sm" weight={600} tone="primary-900" style={{ flex: 1 }}>{t(`loan.check.${check.id}` as TKey)}</Text>
                <View style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}><Icon name="chevronDown" size={16} color={colors.neutral[500]} /></View>
              </View>
              {expanded && <Text variant="body-sm" tone="neutral-600" style={{ paddingLeft: 30 }}>{t(`loan.tip.${check.id}` as TKey)}</Text>}
            </Pressable>
          );
        })
      )}
      {items.length > 3 && (
        <Pressable accessibilityRole="button" onPress={() => setAll((value) => !value)} style={{ alignSelf: 'flex-start', paddingVertical: 2 }}>
          <Text variant="caption" weight={600} style={{ color: colors.primary[500] }}>{all ? t('loan.showLess') : t('loan.showMore', { count: items.length - 3 })}</Text>
        </Pressable>
      )}
    </View>
  );
}

function Checkbox({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={label} onPress={onToggle} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, minHeight: 36, paddingVertical: 4 }}>
      <Icon name={checked ? 'checkSquare' : 'square'} size={20} color={checked ? colors.primary[900] : colors.neutral[500]} />
      <Text variant="body-sm" tone="primary-900" style={{ flex: 1 }}>{label}</Text>
    </Pressable>
  );
}

function ShareForm({ lenders, onDone, onCancel }: { lenders: Lender[]; onDone: (share: LoanShare) => void; onCancel: () => void }) {
  const { t, locale } = useI18n();
  const { card } = useCard();
  const [lenderId, setLenderId] = useState<string | null>(lenders.length === 1 ? lenders[0].id : null);
  const [scopes, setScopes] = useState<ShareScope[]>(SHARE_SCOPES);
  const [days, setDays] = useState<`${(typeof SHARE_DAYS)[number]}`>('90');
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openedAt] = useState(() => Date.now());
  const lender = lenders.find((item) => item.id === lenderId);
  const until = new Date(openedAt + Number(days) * 86_400_000).toLocaleDateString(locale === 'km' ? 'km-KH' : 'en-GB');
  // Say what is still needed instead of leaving a silently disabled button.
  const missing = !lenderId ? t('loan.needBank') : scopes.length === 0 ? t('loan.needScope') : !consent ? t('loan.needConsent') : null;
  const toggle = (scope: ShareScope) => setScopes((current) => (current.includes(scope) ? current.filter((s) => s !== scope) : [...current, scope]));

  const submit = async () => {
    if (!lenderId) return;
    setSaving(true);
    setError(null);
    try {
      onDone(await shareWithLender({ lenderId, scopes, days: Number(days) as (typeof SHARE_DAYS)[number] }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('state.error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={card}>
      <Text variant="body" weight={700} tone="primary-900">{t('loan.shareTitle')}</Text>
      <SelectField
        label={t('loan.bank')}
        placeholder={t('loan.pickBank')}
        options={lenders.map((item) => ({ value: item.id, label: item.name }))}
        value={lenderId}
        onChange={setLenderId}
      />
      <View style={{ gap: 2 }}>
        <Text variant="caption" weight={600} tone="primary-900">{t('loan.whatToShare')}</Text>
        {SHARE_SCOPES.map((scope) => (
          <Checkbox key={scope} label={t(`loan.scope.${scope}` as TKey)} checked={scopes.includes(scope)} onToggle={() => toggle(scope)} />
        ))}
        <Text variant="micro" tone="neutral-600">{t('loan.alwaysShared')}</Text>
      </View>
      <View style={{ gap: 6 }}>
        <Text variant="caption" weight={600} tone="primary-900">{t('loan.howLong')}</Text>
        <ChipRow>
          {SHARE_DAYS.map((d) => (
            <Chip key={d} label={t('loan.days', { count: d })} selected={days === `${d}`} onPress={() => setDays(`${d}`)} />
          ))}
        </ChipRow>
      </View>
      <Checkbox
        label={t('loan.consent', { bank: lender?.name ?? t('loan.theBank'), date: until })}
        checked={consent}
        onToggle={() => setConsent((v) => !v)}
      />
      {error ? <Text variant="micro" tone="danger">{error}</Text> : null}
      <View className="flex-row" style={{ gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button size="sm" variant="soft" label={t('common.cancel')} onPress={onCancel} />
        </View>
        <View style={{ flex: 1.6 }}>
          <Button size="sm" label={t('loan.shareButton')} onPress={submit} loading={saving} disabled={!!missing} />
        </View>
      </View>
      {missing ? <Text variant="micro" tone="neutral-600" style={{ textAlign: 'center' }}>{missing}</Text> : null}
    </View>
  );
}

/** Shared → Viewed → Under review → Decision, with the date each step happened. */
function ShareProgress({ share, date }: { share: LoanShare; date: (ms: number | null | undefined) => string }) {
  const { t } = useI18n();
  const { track } = useCard();
  const decided = share.decision === 'approved' || share.decision === 'declined';
  const steps = [
    { key: 'shared', label: t('loan.step.shared'), at: share.createdAt, color: colors.primary[500] },
    { key: 'viewed', label: t('loan.step.viewed'), at: share.firstViewedAt ?? null, color: colors.primary[500] },
    { key: 'reviewing', label: t('loan.step.reviewing'), at: share.reviewingAt, color: colors.warning },
    {
      key: 'decision',
      label: decided ? t(`loan.decision.${share.decision}` as TKey) : t('loan.step.decision'),
      at: decided ? share.decidedAt : null,
      color: share.decision === 'declined' ? colors.danger : colors.success,
    },
  ];
  // A bank can review before the view is logged (or decide straight away); show earlier steps as done too.
  const lastDone = steps.reduce((last, step, index) => (step.at ? index : last), 0);
  const nextLabel = lastDone < steps.length - 1 ? steps[lastDone + 1].label : null;
  return (
    <View accessible accessibilityLabel={`${steps.slice(0, lastDone + 1).map((s) => s.label).join(', ')}${nextLabel ? `. ${t('loan.step.next', { step: nextLabel })}` : ''}`} style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {steps.map((step, index) => {
          const done = index <= lastDone;
          return (
            <View key={step.key} style={[{ flexDirection: 'row', alignItems: 'center' }, index > 0 ? { flex: 1 } : { flexShrink: 0 }]}>
              {index > 0 && <View style={{ flex: 1, height: 2, backgroundColor: done ? step.color : track }} />}
              <View style={{ width: 12, height: 12, flexShrink: 0, borderRadius: 6, backgroundColor: done ? step.color : 'transparent', borderWidth: 2, borderColor: done ? step.color : track }} />
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row' }}>
        {steps.map((step, index) => (
          <View key={step.key} style={{ flex: 1, alignItems: index === 0 ? 'flex-start' : index === steps.length - 1 ? 'flex-end' : 'center' }}>
            <Text variant="micro" weight={index <= lastDone ? 600 : 400} tone={index <= lastDone ? 'primary-900' : 'neutral-500'} numberOfLines={1}>{step.label}</Text>
            <Text variant="micro" tone="neutral-500">{index <= lastDone && step.at ? date(step.at) : ' '}</Text>
          </View>
        ))}
      </View>
      {share.active && nextLabel ? <Text variant="micro" tone="neutral-600">{t('loan.step.waiting', { step: nextLabel.toLowerCase() })}</Text> : null}
    </View>
  );
}

function ShareCard({ share, onRevoke }: { share: LoanShare; onRevoke: () => void }) {
  const { t, locale } = useI18n();
  const { card } = useCard();
  const date = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleDateString(locale === 'km' ? 'km-KH' : 'en-GB') : '');
  const state = share.active
    ? t('loan.accessUntil', { date: date(share.expiresAt) })
    : share.revokedAt
      ? t('loan.revokedOn', { date: date(share.revokedAt) })
      : t('loan.expiredOn', { date: date(share.expiresAt) });
  return (
    <View style={[card, !share.active && { opacity: 0.7 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text variant="body" weight={700} tone="primary-900" style={{ flex: 1 }} numberOfLines={1}>{share.lenderName}</Text>
        <Pill label={t(`loan.decision.${share.decision}` as TKey)} color={DECISION_COLOR[share.decision]} />
      </View>
      <ShareProgress share={share} date={date} />
      {share.decisionNote ? (
        <View style={{ borderLeftWidth: 3, borderLeftColor: DECISION_COLOR[share.decision], paddingLeft: 10 }}>
          <Text variant="body-sm" tone="neutral-900">“{share.decisionNote}”</Text>
        </View>
      ) : null}
      <Text variant="micro" tone="neutral-600">{t('loan.sharing', { items: share.scopes.map((s) => t(`loan.scope.${s}` as TKey)).join(', ') })}</Text>
      <Text variant="micro" tone="neutral-600">
        {state}
        {share.viewCount ? ` · ${t('loan.viewed', { count: share.viewCount, date: date(share.lastViewedAt) })}` : ` · ${t('loan.notViewed')}`}
      </Text>
      {share.active && <Button size="sm" variant="soft" label={t('loan.stopSharing')} onPress={onRevoke} />}
    </View>
  );
}

function BankSharing() {
  const { t } = useI18n();
  const [lenders, setLenders] = useState<Lender[] | null>(null);
  const [shares, setShares] = useState<LoanShare[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(() => {
    setError(null);
    Promise.all([listLenders(), listShares()])
      .then(([l, s]) => {
        setLenders(l);
        setShares(s);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : t('state.error')));
  }, [t]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) load();
    });
    return () => {
      active = false;
    };
  }, [load]);

  const revoke = (share: LoanShare) => confirmAction(
    t('loan.stopTitle', { bank: share.lenderName }),
    t('loan.stopBody'),
    t('loan.stopSharing'),
    t('common.cancel'),
    async () => {
      try {
        await revokeShare(share.id);
        load();
      } catch (e) {
        setError(e instanceof Error ? e.message : t('state.error'));
      }
    },
  );

  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 4 }}>
        <Text variant="title" weight={700} tone="primary-900">{t('loan.banksTitle')}</Text>
        <Text variant="body-sm" tone="neutral-600">{t('loan.banksBody')}</Text>
      </View>
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!error && lenders === null ? <ActivityIndicator color={colors.primary[500]} style={{ paddingVertical: 16 }} /> : null}
      {lenders !== null && shares.map((share) => <ShareCard key={share.id} share={share} onRevoke={() => revoke(share)} />)}
      {lenders !== null && lenders.length === 0 && shares.length === 0 ? <EmptyState titleKey="loan.noBanksTitle" bodyKey="loan.noBanksBody" /> : null}
      {lenders !== null && lenders.length > 0 && (formOpen ? (
        <ShareForm
          lenders={lenders}
          onCancel={() => setFormOpen(false)}
          onDone={() => {
            setFormOpen(false);
            load();
          }}
        />
      ) : (
        <Button size="sm" icon="plus" label={t('loan.shareWithBank')} onPress={() => setFormOpen(true)} />
      ))}
    </View>
  );
}

/** Analysis › Loan readiness: the score and how to improve it, then consent-based sharing with partner banks. */
export function LoanReadinessSection() {
  const { t } = useI18n();
  const readiness = useAnalysisQuery(getLoanReadiness);
  return (
    <View style={{ gap: 16 }}>
      {readiness.source === 'cache' && <OfflineBanner fetchedAt={readiness.fetchedAt} />}
      {readiness.loading && !readiness.data ? <AnalysisLoading mode="health" /> : null}
      {readiness.error ? <ErrorState onRetry={readiness.reload} error={readiness.error} /> : null}
      {readiness.data && (
        <>
          <ScoreCard readiness={readiness.data} />
          <Improvements readiness={readiness.data} />
          <Pillars readiness={readiness.data} />
          <Text variant="micro" tone="neutral-600">{t('loan.disclaimer')}</Text>
        </>
      )}
      <View style={{ marginTop: 8 }}>
        <BankSharing />
      </View>
    </View>
  );
}
