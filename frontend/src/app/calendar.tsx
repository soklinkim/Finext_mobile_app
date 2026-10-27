import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { CalendarGrid } from '@/components/CalendarGrid';
import { HalfDonut } from '@/components/HalfDonut';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ScreenShell } from '@/components/ScreenShell';
import { EmptyState, LoadingState } from '@/components/StateViews';
import { Text } from '@/components/Text';
import { TransactionRow } from '@/components/TransactionRow';
import { useAnalysisQuery } from '@/hooks/useAnalysisQuery';
import { useLocalQuery } from '@/hooks/useLocalQuery';
import { useI18n } from '@/i18n';
import { getCategoryBreakdown } from '@/services/analysis';
import { listActiveDays, listTransactionsOnDate } from '@/services/bookkeeping';
import { colors } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

/** Calendar — Spends (local, per day) | Categories (analysis half-donut, cached offline). */
export default function CalendarScreen() {
  const { t } = useI18n();
  const dark = useAppTheme();
  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selected, setSelected] = useState<Date>(today);
  const [tab, setTab] = useState<'spends' | 'categories'>('spends');

  const { data: txs } = useLocalQuery(() => listTransactionsOnDate(selected), [selected.getTime()]);
  const { data: active } = useLocalQuery(() => listActiveDays(cursor.year, cursor.month), [cursor.year, cursor.month]);
  const breakdown = useAnalysisQuery(getCategoryBreakdown);

  const pill = (value: 'spends' | 'categories', label: string) => (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: tab === value }}
      onPress={() => setTab(value)}
      className={`flex-1 items-center justify-center rounded-pill ${tab === value ? 'bg-primary-200' : 'bg-primary-50'}`}
      style={{ height: 36, ...(dark ? { backgroundColor: (tab === value ? colors.dark.subtle : colors.dark.surface) } : {}) }}
    >
      <Text variant="body" weight={500} tone="primary-900">
        {label}
      </Text>
    </Pressable>
  );

  return (
    <ScreenShell title={t('screen.calendar')} lightHeader nav="analysis" hero={<View style={{ height: 64 }} />}>
      <CalendarGrid year={cursor.year} month={cursor.month} onMonthChange={(year, month) => setCursor({ year, month })} selected={selected} onSelect={setSelected} activeDays={active ?? []} />
      <View className="flex-row" style={{ gap: 16, marginTop: 24, marginBottom: 24 }}>
        {pill('spends', t('calendar.spends'))}
        {pill('categories', t('calendar.categories'))}
      </View>
      {tab === 'spends' ? (
        <View style={{ gap: 16 }}>
          {txs && txs.length === 0 ? <EmptyState titleKey="calendar.noSpends" /> : null}
          {txs?.map((tx, i) => <TransactionRow key={tx.id} tx={tx} index={i} />)}
        </View>
      ) : (
        <View>
          {breakdown.source === 'cache' && <OfflineBanner fetchedAt={breakdown.fetchedAt} />}
          {breakdown.loading && !breakdown.data ? <LoadingState /> : null}
          {breakdown.noCache ? <EmptyState titleKey="offline.noCache" bodyKey="offline.noCacheBody" icon="wifiOff" /> : null}
          {breakdown.data && breakdown.data.length === 0 && <EmptyState titleKey="data.noActivityTitle" bodyKey="data.noActivityBody" />}
          {breakdown.data && breakdown.data.length > 0 && <HalfDonut slices={breakdown.data.map((s) => ({ name: s.name, percent: s.percent }))} />}
        </View>
      )}
    </ScreenShell>
  );
}
