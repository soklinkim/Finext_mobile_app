import { useCallback } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { BarChartCard } from '@/components/BarChartCard';
import { Icon } from '@/components/Icon';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ScreenShell } from '@/components/ScreenShell';
import { EmptyState, LoadingState } from '@/components/StateViews';
import { Text } from '@/components/Text';
import { TransactionRow } from '@/components/TransactionRow';
import { useAnalysisQuery } from '@/hooks/useAnalysisQuery';
import { useLocalQuery } from '@/hooks/useLocalQuery';
import { useI18n } from '@/i18n';
import { getAnalysis } from '@/services/analysis';
import { formatMoney, getPeriodTotals, listTransactions } from '@/services/bookkeeping';
import { MONTHS } from '@/lib/format';
import { colors, radius, tint } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

/** Quick Analysis — weekly money in / money out (local), month chart (cached), latest rows (local). */
export default function QuickAnalysis() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { data: week } = useLocalQuery(() => getPeriodTotals('weekly'), []);
  const { data: txs } = useLocalQuery(() => listTransactions({ limit: 3 }), []);
  const loadWeeklyChart = useCallback(() => getAnalysis('weekly'), []);
  const dark = useAppTheme();
  const chart = useAnalysisQuery(loadWeeklyChart);
  const cur = week?.currency ?? 'USD';

  const hero = (
    <View className="flex-row items-center px-9" style={{ gap: 16, paddingVertical: 16 }}>
      <View className="flex-1" style={{ gap: 12 }}>
        <View className="flex-row items-center" style={{ gap: 12, padding: 10, borderRadius: radius.md, backgroundColor: tint(colors.success, 0.24), borderWidth: 1.5, borderColor: tint(colors.success, 0.7) }}>
          <Icon name="salary" size={36} strokeWidth={1.75} color={dark ? colors.success : colors.successText} />
          <View className="flex-1">
            <Text variant="caption" tone="primary-900" weight={400}>
              {t('quick.moneyIn')}
            </Text>
            <Text variant="body-lg" weight={700} tone="money-in" adjustsFontSizeToFit numberOfLines={1}>
              {formatMoney(week?.moneyIn ?? 0, cur)}
            </Text>
          </View>
        </View>
        <View className="flex-row items-center" style={{ gap: 12, padding: 10, borderRadius: radius.md, backgroundColor: tint(colors.danger, 0.18), borderWidth: 1.5, borderColor: tint(colors.danger, 0.6) }}>
          <Icon name="expense" size={36} strokeWidth={1.75} color={dark ? colors.danger : colors.dangerText} />
          <View className="flex-1">
            <Text variant="caption" tone="primary-900" weight={400}>
              {t('quick.moneyOut')}
            </Text>
            <Text variant="body-lg" weight={700} tone="money-out" adjustsFontSizeToFit numberOfLines={1}>
              {formatMoney(-(week?.moneyOut ?? 0), cur)}
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
