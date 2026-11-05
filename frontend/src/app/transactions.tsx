import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Icon } from '@/components/Icon';
import { DateRangeInput, dayRange, endOfDay, startOfDay, type DateRange } from '@/components/DateRangeInput';
import { MultiSelectField } from '@/components/MultiSelectField';
import { ScreenShell } from '@/components/ScreenShell';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { SummaryHero } from '@/components/SummaryHero';
import { Text } from '@/components/Text';
import { TransactionRow } from '@/components/TransactionRow';
import { useLocalQuery } from '@/hooks/useLocalQuery';
import { useI18n, type TKey } from '@/i18n';
import { colors } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';
import { getEntryTypes, listTransactions, type TransactionView } from '@/services/bookkeeping';
import { listMissedDays } from '@/services/missedDays';
import { MissedDayCard } from '@/components/MissedDayCard';

type Filter = 'in' | 'out' | 'move' | 'unpaid' | 'evidence' | 'missing';
/** Kinds of entry offered in the category list, above the individual entry types. */
const FILTERS: { id: Filter; label: TKey }[] = [
  { id: 'in', label: 'tx.filterIn' },
  { id: 'out', label: 'tx.filterOut' },
  { id: 'move', label: 'tx.filterMove' },
  { id: 'unpaid', label: 'tx.filterUnpaid' },
  { id: 'evidence', label: 'tx.filterEvidence' },
  { id: 'missing', label: 'tx.filterMissing' },
];

/** Transactions — the entries history. The search sits first: a date and one or more categories (none chosen = All). Reads the local database only. */
export default function Transactions() {
  const router = useRouter();
  const { t } = useI18n();
  const dark = useAppTheme();
  const { data, loading, error, reload } = useLocalQuery(() => listTransactions(), []);
  const { data: missedDays } = useLocalQuery(() => listMissedDays(), []);
  const params = useLocalSearchParams<{ filter?: string }>();
  const first = params.filter === 'missing' ? ['kind:missing'] : [];
  // What is chosen in the fields (several categories allowed), and what the list shows: what was chosen when Search was last pressed.
  const [categories, setCategories] = useState<string[]>(first);
  const [range, setRange] = useState<DateRange>(() => dayRange(Date.now())); // one day (today) to begin with; tap a first and a last day for a span
  const [applied, setApplied] = useState<{ categories: string[]; range: DateRange }>(() => ({ categories: first, range: dayRange(Date.now()) }));
  const dirty = range.from !== applied.range.from || range.to !== applied.range.to || categories.length !== applied.categories.length || categories.some((c) => !applied.categories.includes(c));

  const wanted = applied.categories.filter((c) => c !== 'kind:missing');
  const showMissing = applied.categories.includes('kind:missing');
  const showEntries = applied.categories.length === 0 || wanted.length > 0;
  const matches = (tx: TransactionView, c: string) => {
    switch (c) {
      case 'kind:in':
      case 'kind:out':
      case 'kind:move':
        return tx.direction === c.slice(5);
      case 'kind:unpaid':
        return tx.openBalance !== null && tx.openBalance > 0;
      case 'kind:evidence':
        return tx.evidenceCount > 0;
      default:
        return tx.typeId === c;
    }
  };
  const filtered = (data ?? []).filter((tx) => {
    if (applied.range.from !== null && applied.range.to !== null && (tx.occurredAt < startOfDay(applied.range.from) || tx.occurredAt > endOfDay(applied.range.to))) return false;
    return wanted.length === 0 || wanted.some((c) => matches(tx, c));
  });
  // The 10 entries recorded most recently (by when they were put in, not by the date they are for) among those that match.
  const recent = [...filtered].sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);
  const options = [
    ...FILTERS.map((f) => ({ value: `kind:${f.id}`, label: t(f.label) })),
    ...(['in', 'out', 'move'] as const).flatMap((direction) => getEntryTypes(direction)).map((e) => ({ value: e.id as string, label: t(`type.${e.id}` as TKey) })),
  ];
  const filtering = applied.categories.length > 0 || applied.range.from !== null;

  return (
    <ScreenShell title={t('tx.title')} nav="bookkeeping" hero={<SummaryHero />}>
      {/* Date, categories and Search side by side. The button is bright while there are changes not yet searched. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <View style={{ flex: 1.1 }}><DateRangeInput value={range} onChange={setRange} /></View>
        <View style={{ flex: 1 }}>
          <MultiSelectField title={t('search.categories')} searchable options={options} value={categories} onChange={setCategories}
            allLabel={t('tx.filterAll')} manyLabel={(count) => t('tx.categoriesCount', { count })} />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.search')} accessibilityState={{ selected: dirty }} onPress={() => setApplied({ categories, range })}
          style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
            backgroundColor: dirty ? colors.primary[900] : dark ? colors.dark.field : colors.primary[200] }}>
          <Icon name="search" size={20} color={dirty ? colors.white : colors.primary[500]} />
        </Pressable>
      </View>
      {filtering && showEntries && data ? <Text variant="micro" tone="neutral-600" style={{ marginBottom: 12 }}>{t('tx.count', { count: filtered.length })}</Text> : null}
      {showMissing ? (
        // Days with no record: tap one to fill it in with the real numbers, with 0 (nothing happened) or with the average.
        <View style={{ gap: 12 }}>
          <Text variant="section" tone="primary-900">{t('missed.filterTitle')}</Text>
          {(missedDays ?? []).map((m) => (
            <MissedDayCard key={m.day} missed={m} onOpenCalendar={() => router.push({ pathname: '/calendar', params: { day: m.day } })} />
          ))}
          {missedDays && !missedDays.length ? <Text variant="body-sm" tone="neutral-600">{t('missed.filterNone')}</Text> : null}
        </View>
      ) : null}
      {!showEntries ? null : loading && !data ? <LoadingState /> : null}
      {showEntries && error ? <ErrorState onRetry={reload} /> : null}
      {showEntries && data && data.length === 0 ? <EmptyState titleKey="tx.empty" bodyKey="tx.emptyBody" /> : null}
      {showEntries && data && data.length > 0 && filtered.length === 0 ? <EmptyState titleKey="tx.noMatch" bodyKey="tx.noMatchBody" icon="search" /> : null}
      {showEntries && recent.length > 0 && (
        <View style={{ gap: 16, marginBottom: 24 }}>
          <Text variant="section" tone="primary-900">{t('tx.recent')}</Text>
          {recent.map((tx, i) => (
            <TransactionRow key={tx.id} tx={tx} index={i} />
          ))}
        </View>
      )}
    </ScreenShell>
  );
}
