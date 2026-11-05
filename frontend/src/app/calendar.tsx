import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { CalendarGrid } from '@/components/CalendarGrid';
import { HalfDonut } from '@/components/HalfDonut';
import { MissedDayCard } from '@/components/MissedDayCard';
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
import { clearDayAnswer, dayKey, dayStart, getDayAnswers, getDayEstimates, listEstimatedDays, listMissedDays, listZeroDays, removeEstimates } from '@/services/missedDays';
import { MONTHS } from '@/lib/format';
import { colors } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

/** Calendar — Spends (local, per day) | Categories (analysis half-donut, cached offline). Missed days are flagged red. */
export default function CalendarScreen() {
  const { t, locale } = useI18n();
  const dark = useAppTheme();
  // Opened from a missed-day reminder: start on that day.
  const params = useLocalSearchParams<{ day?: string }>();
  const start = params.day && /^\d{4}-\d{2}-\d{2}$/.test(params.day) ? new Date(dayStart(params.day)) : new Date();
  const [cursor, setCursor] = useState({ year: start.getFullYear(), month: start.getMonth() });
  const [selected, setSelected] = useState<Date>(start);
  const [tab, setTab] = useState<'spends' | 'categories'>('spends');

  const { data: txs } = useLocalQuery(() => listTransactionsOnDate(selected), [selected.getTime()]);
  const { data: active } = useLocalQuery(() => listActiveDays(cursor.year, cursor.month), [cursor.year, cursor.month]);
  const { data: missed } = useLocalQuery(() => listMissedDays(), []);
  const { data: answers } = useLocalQuery(getDayAnswers, []);
  const { data: estimatedDays } = useLocalQuery(() => listEstimatedDays(cursor.year, cursor.month), [cursor.year, cursor.month]);
  const { data: zeroDays } = useLocalQuery(() => listZeroDays(cursor.year, cursor.month), [cursor.year, cursor.month, JSON.stringify(answers ?? {})]);
  const { data: dayEstimates } = useLocalQuery(() => getDayEstimates(dayKey(selected)), [selected.getTime()]);
  const [removing, setRemoving] = useState(false);
  // The categories chart follows the month shown in the calendar.
  const monthKey = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}`;
  const loadBreakdown = useCallback(() => getCategoryBreakdown(monthKey), [monthKey]);
  const breakdown = useAnalysisQuery(loadBreakdown);

  const inMonth = (day: string) => {
    const d = new Date(dayStart(day));
    return d.getFullYear() === cursor.year && d.getMonth() === cursor.month;
  };
  const missedDays = (missed ?? []).filter((m) => inMonth(m.day)).map((m) => new Date(m.date).getDate());
  const selectedKey = dayKey(selected);
  const selectedMissed = (missed ?? []).find((m) => m.day === selectedKey);
  const selectedAnswer = answers?.[selectedKey];

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

  const legend = (color: string, label: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
      <Text variant="caption" tone="neutral-600">{label}</Text>
    </View>
  );

  return (
    <ScreenShell title={t('screen.calendar')} nav="analysis" hero={<View style={{ height: 64 }} />}>
      <CalendarGrid year={cursor.year} month={cursor.month} onMonthChange={(year, month) => setCursor({ year, month })} selected={selected} onSelect={setSelected}
        activeDays={active ?? []} missedDays={missedDays} estimatedDays={estimatedDays ?? []} zeroDays={zeroDays ?? []} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 12 }}>
        {legend(colors.success, t('missed.legendRecorded'))}
        {legend(colors.warning, t('missed.legendZero'))}
        {legend(colors.danger, t('missed.legendMissed'))}
      </View>
      <View className="flex-row" style={{ gap: 16, marginTop: 24, marginBottom: 24 }}>
        {pill('spends', t('calendar.spends'))}
        {pill('categories', t('calendar.categories'))}
      </View>
      {tab === 'spends' ? (
        <View style={{ gap: 16 }}>
          {selectedMissed && <MissedDayCard missed={selectedMissed} />}
          {selectedAnswer === 'zero' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Text variant="body-sm" tone="neutral-600" style={{ flex: 1 }}>{t('missed.markedZero')}</Text>
              <Pressable accessibilityRole="button" hitSlop={8} onPress={() => void clearDayAnswer(selectedKey)}>
                <Text variant="caption" weight={600} style={{ color: dark ? colors.dark.primary : colors.primary[500] }}>{t('missed.undo')}</Text>
              </Pressable>
            </View>
          )}
          {(dayEstimates?.estimates.length ?? 0) > 0 && (dayEstimates?.hasReal ? (
            // Real entries were added after the estimate: keeping both would count the day twice.
            <View style={{ gap: 8, padding: 12, borderRadius: 10, backgroundColor: dark ? colors.dark.field : '#FFF4E0' }}>
              <Text variant="body-sm" weight={600} tone="neutral-900">{t('missed.bothTitle')}</Text>
              <Text variant="caption" tone="neutral-600">{t('missed.bothBody')}</Text>
              <Pressable accessibilityRole="button" disabled={removing} hitSlop={8} onPress={() => { setRemoving(true); void removeEstimates(selectedKey).finally(() => setRemoving(false)); }}>
                <Text variant="caption" weight={700} style={{ color: dark ? colors.dark.primary : colors.primary[500] }}>{t('missed.removeEstimates')}</Text>
              </Pressable>
            </View>
          ) : <Text variant="body-sm" tone="neutral-600">{t('missed.markedEstimate')}</Text>)}
          {txs && txs.length === 0 && !selectedMissed && selectedAnswer !== 'zero' ? <EmptyState titleKey="calendar.noSpends" /> : null}
          {txs?.map((tx, i) => <TransactionRow key={tx.id} tx={tx} index={i} />)}
        </View>
      ) : (
        <View>
          <Text variant="body" weight={600} tone="primary-900" style={{ textAlign: 'center', marginBottom: 12 }}>{t('calendar.categoriesFor', { month: `${MONTHS[locale][cursor.month]} ${cursor.year}` })}</Text>
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
