import { View } from 'react-native';
import { BalanceSummary } from './BalanceSummary';
import { BudgetProgress } from './BudgetProgress';
import { useSummary } from '@/hooks/useSummary';
import type { TKey } from '@/i18n';

/** Hero block shared by Account Balance, Analysis, Categories, Statements…: totals + budget bar, computed locally. */
export function SummaryHero({ statusKey, between }: { statusKey?: TKey; between?: React.ReactNode }) {
  const { data, error } = useSummary();
  if (!data || error) return null;
  return (
    <View style={{ gap: 20, paddingTop: 8, paddingBottom: 16 }}>
      <BalanceSummary balance={data?.totalBalance ?? 0} expense={data?.totalExpense ?? 0} currency={data?.displayCurrency ?? 'USD'} />
      <BudgetProgress
        percent={data?.budgetPercent ?? 0}
        target={data?.budgetTarget ?? 0}
        currency={data?.displayCurrency ?? 'USD'}
        status={data?.budgetStatus ?? 'ok'}
        statusKey={statusKey}
        between={between}
      />
    </View>
  );
}
