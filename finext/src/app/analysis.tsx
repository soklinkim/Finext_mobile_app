import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { BarChartCard } from '@/components/BarChartCard';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ScreenShell } from '@/components/ScreenShell';
import { SegmentedControl } from '@/components/SegmentedControl';
import { StatCard } from '@/components/StatCard';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { SummaryHero } from '@/components/SummaryHero';
import { TargetCard } from '@/components/TargetRing';
import { Text } from '@/components/Text';
import { useAnalysisQuery } from '@/hooks/useAnalysisQuery';
import { useI18n } from '@/i18n';
import { getAnalysis, getTargets, type AnalysisPeriod } from '@/services/analysis';
import { formatMoney } from '@/services/bookkeeping';

/** Analysis — Daily / Weekly / Monthly / Year. Chart, targets and totals come from the analysis service (cached offline). */
export default function Analysis() {
  const router = useRouter();
  const { t } = useI18n();
  const [period, setPeriod] = useState<AnalysisPeriod>('daily');
  const analysis = useAnalysisQuery(() => getAnalysis(period), [period]);
  const targets = useAnalysisQuery(getTargets, []);
  const target = targets.data?.find((x) => x.id === 'product-sale');
  const usingCache = analysis.source === 'cache' || targets.source === 'cache';

  return (
    <ScreenShell title={t('screen.analysis')} nav="analysis" hero={<SummaryHero statusKey="budget.okSale" />}>
      {usingCache && <OfflineBanner fetchedAt={analysis.fetchedAt ?? targets.fetchedAt} />}
      <SegmentedControl
        options={[
          { value: 'daily', label: t('period.daily') },
          { value: 'weekly', label: t('period.weekly') },
          { value: 'monthly', label: t('period.monthly') },
          { value: 'yearly', label: t('period.yearly') },
        ]}
        value={period}
        onChange={setPeriod}
      />
      <View style={{ marginTop: 24, gap: 24 }}>
        {analysis.loading && !analysis.data ? <LoadingState /> : null}
        {analysis.noCache ? <EmptyState titleKey="offline.noCache" bodyKey="offline.noCacheBody" icon="wifiOff" /> : null}
        {analysis.error ? <ErrorState onRetry={analysis.reload} /> : null}
        {analysis.data && (
          <BarChartCard
            title={t('analysis.incomeExpenses')}
            labels={analysis.data.labels}
            income={analysis.data.income}
            expense={analysis.data.expense}
            currency={analysis.data.currency}
            onSearch={() => router.push('/search')}
            onCalendar={() => router.push('/calendar')}
          />
        )}
        {target && (
          <View className="items-center" style={{ gap: 12 }}>
            <Text variant="body" tone="primary-900">
              {t('analysis.targets')}
            </Text>
            <TargetCard percent={target.percent} label={target.label} />
          </View>
        )}
        {analysis.data && (
          <View className="flex-row">
            <StatCard variant="plain" kind="income" label={t('summary.income')} amount={formatMoney(analysis.data.totals.income, analysis.data.currency)} />
            <StatCard variant="plain" kind="expense" label={t('summary.expense')} amount={formatMoney(analysis.data.totals.expense, analysis.data.currency)} />
          </View>
        )}
      </View>
    </ScreenShell>
  );
}
