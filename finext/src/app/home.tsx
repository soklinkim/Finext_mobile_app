import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BalanceSummary } from '@/components/BalanceSummary';
import { BudgetProgress } from '@/components/BudgetProgress';
import { Icon } from '@/components/Icon';
import { ScreenShell } from '@/components/ScreenShell';
import { SegmentedControl } from '@/components/SegmentedControl';
import { EmptyState } from '@/components/StateViews';
import { GoalRing } from '@/components/TargetRing';
import { Text } from '@/components/Text';
import { TransactionRow } from '@/components/TransactionRow';
import { useAnalysisQuery } from '@/hooks/useAnalysisQuery';
import { useLocalQuery } from '@/hooks/useLocalQuery';
import { useSummary } from '@/hooks/useSummary';
import { useI18n, type TKey } from '@/i18n';
import { getTargets } from '@/services/analysis';
import { formatMoney, getPeriodTotals, listTransactions, type RollingPeriod } from '@/services/bookkeeping';
import { radius } from '@/theme';

const IN_KEY: Record<RollingPeriod, TKey> = { daily: 'home.inToday', weekly: 'home.inWeek', monthly: 'home.inMonth' };
const OUT_KEY: Record<RollingPeriod, TKey> = { daily: 'home.outToday', weekly: 'home.outWeek', monthly: 'home.outMonth' };

function greetingKey(): TKey {
  const h = new Date().getHours();
  return h < 12 ? 'home.morning' : h < 18 ? 'home.afternoon' : 'home.evening';
}

/** Home (dashboard) — all numbers local except the goal ring, which is an analysis target (cached offline). */
export default function Home() {
  const router = useRouter();
  const { t } = useI18n();
  const [period, setPeriod] = useState<RollingPeriod>('weekly');
  const { data: summary } = useSummary();
  const { data: totals } = useLocalQuery(() => getPeriodTotals(period), [period]);
  const { data: recent } = useLocalQuery(() => listTransactions({ limit: 3 }), []);
  const targets = useAnalysisQuery(getTargets, []);
  const profit = targets.data?.find((x) => x.id === 'profit-goals');

  const currency = summary?.displayCurrency ?? 'USD';

  const hero = (
    <View style={{ gap: 20, paddingTop: 8, paddingBottom: 16 }}>
      <View className="flex-row items-start justify-between px-9">
        <View>
          <Text variant="title" tone="primary-900" weight={700}>
            {t('home.welcome')}
          </Text>
          <Text variant="caption" tone="primary-900" weight={400}>
            {t(greetingKey())}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.notifications')}
          onPress={() => router.push('/notifications')}
          className="items-center justify-center rounded-pill bg-primary-50"
          style={{ width: 32, height: 32 }}
        >
          <Icon name="bell" size={18} />
        </Pressable>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={t('screen.accountBalance')} onPress={() => router.push('/account-balance')}>
        <BalanceSummary balance={summary?.totalBalance ?? 0} expense={summary?.totalExpense ?? 0} currency={currency} />
      </Pressable>
      <BudgetProgress percent={summary?.budgetPercent ?? 0} target={summary?.budgetTarget ?? 0} currency={currency} status={summary?.budgetStatus ?? 'ok'} />
    </View>
  );

  return (
    <ScreenShell noHeader hero={hero} nav="home">
      <Pressable accessibilityRole="button" accessibilityLabel={t('screen.quickAnalysis')} onPress={() => router.push('/quick-analysis')} className="bg-primary-50 flex-row items-center" style={{ borderRadius: radius['2xl'], padding: 20, gap: 16 }}>
        <GoalRing percent={profit?.percent ?? 0} icon="dollar" label={t('home.profitGoals')} />
        <View className="bg-primary-500" style={{ width: 1, alignSelf: 'stretch' }} />
        <View className="flex-1" style={{ gap: 12 }}>
          <View className="flex-row items-center" style={{ gap: 12 }}>
            <Icon name="income" size={36} strokeWidth={1.5} />
            <View className="flex-1">
              <Text variant="caption" tone="primary-900" weight={400}>
                {t(IN_KEY[period])}
              </Text>
              <Text variant="body-lg" weight={700} tone="primary-900" adjustsFontSizeToFit numberOfLines={1}>
                {formatMoney(totals?.moneyIn ?? 0, currency)}
              </Text>
            </View>
          </View>
          <View className="bg-primary-500" style={{ height: 1 }} />
          <View className="flex-row items-center" style={{ gap: 12 }}>
            <Icon name="expense" size={36} strokeWidth={1.5} />
            <View className="flex-1">
              <Text variant="caption" tone="primary-900" weight={400}>
                {t(OUT_KEY[period])}
              </Text>
              <Text variant="body-lg" weight={700} tone="primary-900" adjustsFontSizeToFit numberOfLines={1}>
                {formatMoney(-(totals?.moneyOut ?? 0), currency)}
              </Text>
            </View>
          </View>
        </View>
      </Pressable>

      <View style={{ marginTop: 24 }}>
        <SegmentedControl
          options={[
            { value: 'daily', label: t('period.daily') },
            { value: 'weekly', label: t('period.weekly') },
            { value: 'monthly', label: t('period.monthly') },
          ]}
          value={period}
          onChange={setPeriod}
        />
      </View>

      <View style={{ marginTop: 24, gap: 16 }}>
        {recent && recent.length === 0 ? <EmptyState titleKey="tx.empty" bodyKey="tx.emptyBody" /> : null}
        {recent?.map((tx, i) => <TransactionRow key={tx.id} tx={tx} index={i} />)}
      </View>
    </ScreenShell>
  );
}
