import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { BarChartCard } from '@/components/BarChartCard';
import { AnalysisLoading } from '@/components/AnalysisLoading';
import { FinancialHealthChart } from '@/components/FinancialHealthChart';
import { FinHealthCard } from '@/components/FinHealthCard';
import { FutureRiskSection } from '@/components/FutureRiskSection';
import { IncomeExpenseForecastCard } from '@/components/IncomeExpenseForecastCard';
import { LoanReadinessSection } from '@/components/LoanReadinessSection';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ScreenShell } from '@/components/ScreenShell';
import { SegmentedControl } from '@/components/SegmentedControl';
import { EmptyState, ErrorState } from '@/components/StateViews';
import { SummaryHero } from '@/components/SummaryHero';
import { TargetCard } from '@/components/TargetRing';
import { Text } from '@/components/Text';
import { useAnalysisQuery } from '@/hooks/useAnalysisQuery';
import { useI18n } from '@/i18n';
import { getAnalysis, getRatios, getTargets, type AnalysisPeriod } from '@/services/analysis';
import { formatMoney } from '@/services/bookkeeping';
import { colors, radius } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

export default function Analysis() {
  const router = useRouter();
  const { t } = useI18n();
  const dark = useAppTheme();
  const [period, setPeriod] = useState<AnalysisPeriod>('daily');
  const [section, setSection] = useState<'performance' | 'health' | 'loan'>('performance');
  const loadAnalysis = useCallback(() => getAnalysis(period), [period]);
  const analysis = useAnalysisQuery(loadAnalysis);
  const targets = useAnalysisQuery(getTargets);
  const ratios = useAnalysisQuery(getRatios);
  const target = targets.data?.find((x) => x.id === 'product-sale');
  const usingCache = analysis.source === 'cache' || targets.source === 'cache' || ratios.source === 'cache';

  return (
    <ScreenShell title={t('screen.analysis')} nav="analysis" hero={<SummaryHero statusKey="budget.okSale" />}>
      {usingCache && <OfflineBanner fetchedAt={analysis.fetchedAt ?? targets.fetchedAt ?? ratios.fetchedAt} />}
      <View style={{ marginBottom: 20 }}>
        <SegmentedControl
          variant="underline"
          options={[
            { value: 'performance', label: t('analysis.performance') },
            { value: 'health', label: t('analysis.healthShort') },
            { value: 'loan', label: t('analysis.loanTab') },
          ]}
          value={section}
          onChange={setSection}
        />
      </View>

      {section === 'performance' && (
        <View style={{ gap: 24 }}>
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
          {analysis.loading && !analysis.data ? <AnalysisLoading mode="performance" /> : null}
          {analysis.noCache ? <EmptyState titleKey="offline.noCache" bodyKey="offline.noCacheBody" icon="wifiOff" /> : null}
          {analysis.error ? <ErrorState onRetry={analysis.reload} error={analysis.error} /> : null}
          {analysis.data && analysis.data.labels.length === 0 && <EmptyState titleKey="data.noActivityTitle" bodyKey="data.noActivityBody" />}
          {analysis.data && analysis.data.labels.length > 0 && (
            <>
              <BarChartCard
                title={t('analysis.incomeExpenses')}
                labels={analysis.data.labels}
                income={analysis.data.income}
                expense={analysis.data.expense}
                currency={analysis.data.currency}
                onSearch={() => router.push('/search')}
                onCalendar={() => router.push('/calendar')}
              />
              <View style={{ flexDirection: 'row', gap: 9 }}>
                {[
                  { label: t('summary.income'), amount: analysis.data.totals.income, color: colors.primary[500] },
                  { label: t('summary.expense'), amount: analysis.data.totals.expense, color: colors.accent.expense },
                  { label: t('analysis.net'), amount: analysis.data.totals.income - analysis.data.totals.expense, color: analysis.data.totals.income >= analysis.data.totals.expense ? colors.success : colors.danger },
                ].map((metric) => (
                  <View key={metric.label} accessible accessibilityLabel={`${metric.label} ${formatMoney(metric.amount, analysis.data!.currency)}`} style={{ flex: 1, minWidth: 0, padding: 12, borderRadius: radius.card, backgroundColor: dark ? colors.dark.surface : colors.white, borderWidth: 1, borderColor: dark ? colors.dark.border : colors.neutral[200], borderTopWidth: 3, borderTopColor: metric.color, gap: 5 }}>
                    <Text variant="micro" tone="neutral-600" numberOfLines={1}>{metric.label}</Text>
                    <Text variant="body" weight={700} tone="primary-900" adjustsFontSizeToFit numberOfLines={1}>{formatMoney(metric.amount, analysis.data!.currency)}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
          {!analysis.loading && <IncomeExpenseForecastCard />}
          {target && (
            <View className="items-center" style={{ gap: 12 }}>
              <Text variant="body" tone="primary-900">{t('analysis.targets')}</Text>
              <TargetCard percent={target.percent} label={target.label} />
            </View>
          )}
        </View>
      )}

      {section === 'health' && (
        <View style={{ marginTop: 24, gap: 12 }}>
          {ratios.loading && !ratios.data ? <AnalysisLoading mode="health" /> : null}
          {ratios.noCache ? <EmptyState titleKey="offline.noCache" bodyKey="offline.noCacheBody" icon="wifiOff" /> : null}
          {ratios.error ? <ErrorState onRetry={ratios.reload} error={ratios.error} /> : null}
          {ratios.data && ratios.data.length > 0 && <FinancialHealthChart ratios={ratios.data} />}
          {!ratios.loading && <View style={{ marginTop: 12 }}><FutureRiskSection /></View>}
          {/* What the owner tells us, next to what the books show */}
          {!ratios.loading && <View style={{ marginTop: 12 }}><FinHealthCard /></View>}
        </View>
      )}

      {section === 'loan' && (
        <View style={{ marginTop: 24 }}>
          <LoanReadinessSection />
        </View>
      )}
    </ScreenShell>
  );
}
