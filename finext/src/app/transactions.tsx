import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { ScreenShell } from '@/components/ScreenShell';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { SummaryHero } from '@/components/SummaryHero';
import { Text } from '@/components/Text';
import { TransactionRow } from '@/components/TransactionRow';
import { useLocalQuery } from '@/hooks/useLocalQuery';
import { useI18n } from '@/i18n';
import { groupByMonth, MONTHS } from '@/lib/format';
import { listTransactions } from '@/services/bookkeeping';

/** Transactions — full history grouped by month (§6.5). Reads the local database only. */
export default function Transactions() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { data, loading, error, reload } = useLocalQuery(() => listTransactions(), []);
  const groups = data ? groupByMonth(data) : [];

  return (
    <ScreenShell title={t('tx.title')} nav="bookkeeping" hero={<SummaryHero />}>
      <View className="flex-row justify-end" style={{ marginBottom: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('screen.search')} onPress={() => router.push('/search')} style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="search" size={22} />
        </Pressable>
      </View>
      {loading && !data ? <LoadingState /> : null}
      {error ? <ErrorState onRetry={reload} /> : null}
      {data && data.length === 0 ? <EmptyState titleKey="tx.empty" bodyKey="tx.emptyBody" /> : null}
      {groups.map((g) => (
        <View key={g.key} style={{ gap: 16, marginBottom: 24 }}>
          <Text variant="section" tone="primary-900">
            {MONTHS[locale][g.month]}
          </Text>
          {g.items.map((tx, i) => (
            <TransactionRow key={tx.id} tx={tx} index={i} />
          ))}
        </View>
      ))}
    </ScreenShell>
  );
}
