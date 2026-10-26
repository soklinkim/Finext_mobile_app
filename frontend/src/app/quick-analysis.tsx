import { useCallback } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { BarChartCard } from '@/components/BarChartCard';
import { Icon } from '@/components/Icon';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ScreenShell } from '@/components/ScreenShell';
import { EmptyState, LoadingState } from '@/components/StateViews';
import { GoalRing } from '@/components/TargetRing';
import { Text } from '@/components/Text';
import { TransactionRow } from '@/components/TransactionRow';
import { useAnalysisQuery } from '@/hooks/useAnalysisQuery';
import { useLocalQuery } from '@/hooks/useLocalQuery';
import { useI18n } from '@/i18n';
import { getAnalysis, getTargets } from '@/services/analysis';
import { formatMoney, getFoodSpendLastWeek, getPeriodTotals, listTransactions } from '@/services/bookkeeping';
import { MONTHS } from '@/lib/format';
import { colors } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

/** Quick Analysis — weekly revenue / food (local), savings goal (cached), month chart (cached), latest rows (local). */
export default function QuickAnalysis() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const dark = useAppTheme();
  const { data: week } = useLocalQuery(() => getPeriodTotals('weekly'), []);
  const { data: food } = useLocalQuery(getFoodSpendLastWeek, []);
  const { data: txs } = useLocalQuery(() => listTransactions({ limit: 3 }), []);
  const targets = useAnalysisQuery(getTargets);
  const loadWeeklyChart = useCallback(() => getAnalysis('weekly'), []);
  const chart = useAnalysisQuery(loadWeeklyChart);
  const savings = targets.data?.find((x) => x.id === 'savings-goals');
  const cur = week?.currency ?? 'USD';

  const hero = (
    <View className="flex-row items-center px-9" style={{ gap: 16, paddingVertical: 16 }}>
      {savings && <GoalRing percent={savings.percent} icon="car" label={t('quick.savings')} />}
      {savings && <View className="bg-white" style={{ width: 1, alignSelf: 'stretch', backgroundColor: dark ? colors.dark.border : undefined }} />}
      <View className="flex-1" style={{ gap: 12 }}>
        <View className="flex-row items-center" style={{ gap: 12 }}>
          <Icon name="salary" size={36} strokeWidth={1.5} />
          <View className="flex-1">
            <Text variant="caption" tone="primary-900" weight={400}>
              {t('quick.revenue')}
            </Text>
            <Text variant="body-lg" weight={700} tone="primary-900" adjustsFontSizeToFit numberOfLines={1}>
              {formatMoney(week?.moneyIn ?? 0, cur)}
            </Text>
          </View>
        </View>
        <View className="bg-white" style={{ height: 1, backgroundColor: dark ? colors.dark.border : undefined }} />
        <View className="flex-row items-center" style={{ gap: 12 }}>
          <Icon name="food" size={36} strokeWidth={1.5} />
          <View className="flex-1">
            <Text variant="caption" tone="primary-900" weight={400}>
              {t('quick.food')}
            </Text>
            <Text variant="body-lg" weight={700} tone="expense" adjustsFontSizeToFit numberOfLines={1}>
              {formatMoney(-(food?.amount ?? 0), cur)}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );

  return (
    <ScreenShell title={t('screen.quickAnalysis')} nav="analysis" hero={hero}>
      {chart.source === 'cache' && <OfflineBanner fetchedAt={chart.fetchedAt} />}
      {chart.loading && !chart.data ? <LoadingState /> : null}
      {chart.noCache ? <EmptyState titleKey="offline.noCache" bodyKey="offline.noCacheBody" icon="wifiOff" /> : null}
      {chart.data && chart.data.labels.length === 0 && <EmptyState titleKey="data.noActivityTitle" bodyKey="data.noActivityBody" />}
      {chart.data && chart.data.labels.length > 0 && (
        <BarChartCard
          title={t('quick.monthExpenses', { month: MONTHS[locale][new Date().getMonth()] })}
          labels={chart.data.labels}
          income={chart.data.income}
          expense={chart.data.expense}
          currency={chart.data.currency}
          onSearch={() => router.push('/search')}
          onCalendar={() => router.push('/calendar')}
        />
      )}
      <View style={{ marginTop: 24, gap: 16 }}>{txs?.map((tx, i) => <TransactionRow key={tx.id} tx={tx} index={i} />)}</View>
    </ScreenShell>
  );
}
