import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { AnalysisLoading } from './AnalysisLoading';
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
import { OnlineRequiredError, type LoanReadiness, type ReadinessLevel } from '@/services/analysis';
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

function ScoreCard({ readiness }: { readiness: LoanReadiness }) {
  const { t } = useI18n();
  const { dark } = useCard();
  const color = LEVEL_COLOR[readiness.level];
  return (
    <View style={{ padding: 16, borderRadius: radius.card, backgroundColor: dark ? colors.dark.surface : colors.primary[50], gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <View
          accessible
          accessibilityLabel={t('loan.scoreLabel', { score: readiness.score ?? '—' })}
          style={{ width: 84, height: 84, borderRadius: 42, borderWidth: 7, borderColor: color, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? colors.dark.field : colors.white }}
        >
          <Text variant="amount-xl" tone="primary-900">{readiness.level === 'insufficient_data' ? '—' : readiness.score ?? '—'}</Text>
          <Text variant="micro" tone="neutral-600">/ 100</Text>
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <Pill label={t(`loan.level.${readiness.level}` as TKey)} color={color} />
          <Text variant="body-sm" tone="neutral-600">{t(`loan.levelBody.${readiness.level}` as TKey)}</Text>
        </View>
      </View>
      <Text variant="micro" tone="neutral-600">{t('loan.coverage', { percent: Math.round(readiness.coverage * 100) })}</Text>
    </View>
  );
}

function Pillars({ readiness }: { readiness: LoanReadiness }) {
  const { t } = useI18n();
  const { card, track } = useCard();
  return (
    <View style={card}>
      <Text variant="body" weight={700} tone="primary-900">{t('loan.breakdown')}</Text>
      {readiness.pillars.map((pillar) => (
        <View key={pillar.id} style={{ gap: 6 }} accessible accessibilityLabel={`${t(`loan.pillar.${pillar.id}` as TKey)}: ${pillar.score ?? t('loan.noData')}`}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="caption" weight={500} tone="primary-900">{t(`loan.pillar.${pillar.id}` as TKey)} <Text variant="micro" tone="neutral-500">· {pillar.weight}%</Text></Text>
            <Text variant="caption" weight={700} tone="primary-900">{pillar.score ?? '—'}</Text>
          </View>
          <View style={{ height: 7, borderRadius: 99, backgroundColor: track, overflow: 'hidden' }}>
            <View style={{ width: `${pillar.score ?? 0}%`, height: '100%', borderRadius: 99, backgroundColor: colors.primary[500] }} />
          </View>
        </View>
      ))}
    </View>
  );
}

function Improvements({ readiness }: { readiness: LoanReadiness }) {
  const { t } = useI18n();
  const { card } = useCard();
  const items = readiness.improvements.slice(0, 5).map((id) => readiness.checks.find((check) => check.id === id)!).filter(Boolean);
  return (
    <View style={card}>
      <Text variant="body" weight={700} tone="primary-900">{t('loan.improveTitle')}</Text>
      {items.length === 0 ? (
        <Text variant="body-sm" tone="neutral-600">{t('loan.improveNone')}</Text>
      ) : (
        items.map((check) => (
          <View key={check.id} style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 7, backgroundColor: STATUS_COLOR[check.status] }} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="caption" weight={600} tone="primary-900">{t(`loan.check.${check.id}` as TKey)}</Text>
              <Text variant="micro" tone="neutral-600">{t(`loan.tip.${check.id}` as TKey)}</Text>
            </View>
          </View>
        ))
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
      {readiness.error ? <ErrorState onRetry={readiness.reload} message={readiness.error.message} onlineRequired={readiness.error instanceof OnlineRequiredError} /> : null}
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
