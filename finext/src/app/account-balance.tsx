import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenShell } from '@/components/ScreenShell';
import { StatCard } from '@/components/StatCard';
import { EmptyState, LoadingState } from '@/components/StateViews';
import { SummaryHero } from '@/components/SummaryHero';
import { Text } from '@/components/Text';
import { TransactionRow } from '@/components/TransactionRow';
import { useLocalQuery } from '@/hooks/useLocalQuery';
import { useSummary } from '@/hooks/useSummary';
import { useI18n } from '@/i18n';
import { formatMoney, listTransactions } from '@/services/bookkeeping';

/** Account Balance — totals, Income / Expense cards, latest transactions. */
export default function AccountBalance() {
  const router = useRouter();
  const { t } = useI18n();
  const { data: summary } = useSummary();
  const { data: txs, loading } = useLocalQuery(() => listTransactions({ limit: 4 }), []);
  const cur = summary?.displayCurrency ?? 'USD';

  const cards = (
    <View className="flex-row px-9" style={{ gap: 16 }}>
      <StatCard kind="income" label={t('summary.income')} amount={formatMoney(summary?.totalIncome ?? 0, cur)} />
      <StatCard kind="expense" label={t('summary.expense')} amount={formatMoney(summary?.totalExpense ?? 0, cur)} />
    </View>
  );

  return (
    <ScreenShell title={t('screen.accountBalance')} nav="home" hero={<SummaryHero between={cards} />}>
      <View className="flex-row items-center justify-between" style={{ marginBottom: 16 }}>
        <Text variant="section" tone="primary-900">
          {t('tx.title')}
        </Text>
        <Text variant="body-sm" weight={500} tone="primary-900" accessibilityRole="link" onPress={() => router.push('/transactions')}>
          {t('common.seeAll')}
        </Text>
      </View>
      <View style={{ gap: 16 }}>
        {loading && !txs ? <LoadingState /> : null}
        {txs && txs.length === 0 ? <EmptyState titleKey="tx.empty" bodyKey="tx.emptyBody" /> : null}
        {txs?.map((tx, i) => <TransactionRow key={tx.id} tx={tx} index={i} />)}
      </View>
    </ScreenShell>
  );
}
