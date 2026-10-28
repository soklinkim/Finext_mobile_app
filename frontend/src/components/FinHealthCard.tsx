import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Button } from './Button';
import { ProbabilityRing, TargetMeter } from './HealthCharts';
import { Text } from './Text';
import { useI18n, type TKey } from '@/i18n';
import { formatInputDate } from '@/lib/format';
import type { RiskLevel } from '@/services/analysis';
import { getCheckIn, PILLARS, scoreAnswers, type SavedCheckIn, type Tier } from '@/services/finHealth';
import { colors, radius } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

const TIER_COLOR: Record<Tier, string> = { healthy: colors.success, coping: colors.warning, vulnerable: colors.danger };
const LEVEL_COLOR: Record<RiskLevel, string> = { low: colors.success, moderate: colors.warning, high: colors.danger };
/** The check-in tier that says the same as each AI level, to tell whether the two agree. */
const SAME_AS: Record<RiskLevel, Tier> = { low: 'healthy', moderate: 'coping', high: 'vulnerable' };

/**
 * Owner check-in on the Health tab: the FinHealth Score of the owner's household, next to (never inside) the AI's
 * answer from the books. Before the first check-in it invites the owner to take it. With `booksLevel` (the AI's
 * overall level) it opens with the two side by side and whether they agree.
 */
export function FinHealthCard({ booksLevel }: { booksLevel?: RiskLevel | null }) {
  const { t } = useI18n();
  const router = useRouter();
  const dark = useAppTheme();
  const [saved, setSaved] = useState<SavedCheckIn | null | undefined>(undefined);

  // Reload whenever the tab comes back into view, so a finished check-in shows straight away.
  useFocusEffect(useCallback(() => {
    let active = true;
    void getCheckIn().then((value) => { if (active) setSaved(value); });
    return () => { active = false; };
  }, []));

  if (saved === undefined) return null;
  const result = saved ? scoreAnswers(saved.answers) : null;
  const open = () => router.push('/finhealth');
  const card = { padding: 16, borderRadius: radius.card, backgroundColor: dark ? colors.dark.surface : colors.white, borderWidth: 1, borderColor: dark ? colors.dark.border : colors.neutral[200], gap: 14 } as const;

  return (
    <View style={card}>
      <View style={{ gap: 2 }}>
        <Text variant="body-lg" weight={700} tone="primary-900">{t('fh.title')}</Text>
        <Text variant="micro" tone="neutral-600">{t('fh.subtitle')}</Text>
      </View>

      {result && saved ? (
        <>
          {booksLevel && (
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {[
                  { label: t('compare.books'), value: t(`risk.level.${booksLevel}` as TKey), color: LEVEL_COLOR[booksLevel] },
                  { label: t('compare.you'), value: t(`fh.tier.${result.tier}` as TKey), color: TIER_COLOR[result.tier] },
                ].map((side) => (
                  <View key={side.label} accessible accessibilityLabel={`${side.label}: ${side.value}`}
                    style={{ flex: 1, minWidth: 0, gap: 4, padding: 12, borderRadius: 12, borderTopWidth: 3, borderTopColor: side.color, backgroundColor: dark ? colors.dark.field : colors.primary[50] }}>
                    <Text variant="micro" weight={600} tone="neutral-600">{side.label}</Text>
                    <Text variant="body-sm" weight={700} style={{ color: side.color }}>{side.value}</Text>
                  </View>
                ))}
              </View>
              <Text variant="body-sm" tone="primary-900">{t(SAME_AS[booksLevel] === result.tier ? 'compare.agree' : 'compare.differ')}</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}
            accessible accessibilityLabel={`${t('fh.score')} ${result.score}, ${t(`fh.tier.${result.tier}` as TKey)}`}>
            <ProbabilityRing probability={result.score / 100} color={TIER_COLOR[result.tier]}>
              <Text variant="title-lg" weight={700} tone="primary-900">{result.score}</Text>
            </ProbabilityRing>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="micro" tone="neutral-600">{t('fh.score')}</Text>
              <Text variant="body" weight={700} style={{ color: TIER_COLOR[result.tier] }}>{t(`fh.tier.${result.tier}` as TKey)}</Text>
              <Text variant="micro" tone="neutral-600">{t(`fh.tierBody.${result.tier}` as TKey)}</Text>
            </View>
          </View>
          <View style={{ gap: 10 }}>
            {PILLARS.map((pillar) => (
              <View key={pillar} style={{ gap: 4 }} accessible accessibilityLabel={`${t(`fh.${pillar}` as TKey)} ${result.pillars[pillar]} / 100`}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text variant="caption" weight={600} tone="primary-900">{t(`fh.${pillar}` as TKey)}</Text>
                  <Text variant="caption" weight={600} tone="primary-900">{result.pillars[pillar]}</Text>
                </View>
                <TargetMeter value={result.pillars[pillar]} target={80} max={100}
                  color={result.pillars[pillar] >= 80 ? colors.success : result.pillars[pillar] >= 40 ? colors.warning : colors.danger} />
              </View>
            ))}
          </View>
          <Text variant="micro" tone="neutral-500">{t('fh.answered', { date: formatInputDate(Date.parse(saved.answeredAt)) })}</Text>
          <Text variant="micro" tone="neutral-500">{t('fh.separate')}</Text>
          <Button label={t('fh.retake')} variant="soft" size="sm" onPress={open} />
        </>
      ) : (
        <Button label={t('fh.start')} icon="plus" onPress={open} />
      )}
      <Text variant="micro" tone="neutral-500">{t('fh.credit')}</Text>
    </View>
  );
}
