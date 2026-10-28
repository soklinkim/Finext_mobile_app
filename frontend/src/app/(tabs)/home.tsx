import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BalanceSummary } from '@/components/BalanceSummary';
import { BellButton } from '@/components/BellButton';
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
import { formatMoney, getPeriodTotals, getSettings, listTransactions, type RollingPeriod } from '@/services/bookkeeping';
import { colors, radius } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

const FEATHER = require('../../../assets/images/feather.png');

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
  const dark = useAppTheme();
  const [period, setPeriod] = useState<RollingPeriod>('weekly');
  const { data: summary } = useSummary();
  const { data: settings } = useLocalQuery(getSettings, []);
  const { data: totals } = useLocalQuery(() => getPeriodTotals(period), [period]);
  const { data: recent } = useLocalQuery(() => listTransactions({ limit: 3 }), []);
  const targets = useAnalysisQuery(getTargets);
  const profit = targets.data?.find((x) => x.id === 'profit-goals');

  const currency = summary?.displayCurrency ?? 'USD';
  const businessName = settings?.businessName?.trim();

  const hero = (
    <View style={{ gap: 20, paddingTop: 8, paddingBottom: 16 }}>
      <View className="flex-row items-center px-6" style={{ gap: 12 }}>
        {/* FINEXT mark, then the greeting small and the business name as the headline. */}
        <Image source={FEATHER} style={{ width: 40, height: 40 }} resizeMode="contain" accessibilityLabel="FINEXT" />
        <View style={{ flex: 1, gap: 1 }}>
          <Text variant="caption" tone="primary-900" numberOfLines={1}>{t(greetingKey())}</Text>
          <Text variant="body-lg" tone="primary-900" weight={700} numberOfLines={1}>{businessName || 'FINEXT'}</Text>
        </View>
        <BellButton />
      </View>
      <BalanceSummary
        balance={summary?.totalBalance ?? 0}
        expense={summary?.totalExpense ?? 0}
        currency={currency}
        onPress={() => router.push('/account-balance')}
        accessibilityLabel={t('screen.accountBalance')}
      />
      <BudgetProgress percent={summary?.budgetPercent ?? 0} target={summary?.budgetTarget ?? 0} currency={currency} status={summary?.budgetStatus ?? 'ok'} />
    </View>
  );

  return (
    <ScreenShell noHeader hero={hero} nav="home">
      <Pressable accessibilityRole="button" accessibilityLabel={t('screen.quickAnalysis')} onPress={() => router.push('/quick-analysis')} className="bg-primary-50 flex-row items-center" style={{ borderRadius: radius.card, padding: 20, gap: 16, ...(dark ? { backgroundColor: colors.dark.surface } : {}) }}>
        {profit && <GoalRing percent={profit.percent} icon="dollar" label={t('home.profitGoals')} />}
        {profit && <View className="bg-primary-500" style={{ width: 1, alignSelf: 'stretch', ...(dark ? { backgroundColor: colors.dark.border } : {}) }} />}
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
          <View className="bg-primary-500" style={{ height: 1, ...(dark ? { backgroundColor: colors.dark.border } : {}) }} />
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
