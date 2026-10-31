import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Chip } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { MonthPickerModal, describeMonths, monthKey } from '@/components/MonthPickerModal';
import { ScreenShell } from '@/components/ScreenShell';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { SummaryHero } from '@/components/SummaryHero';
import { Text } from '@/components/Text';
import { TransactionRow } from '@/components/TransactionRow';
import { useLocalQuery } from '@/hooks/useLocalQuery';
import { useI18n, type TKey } from '@/i18n';
import { groupByMonth, MONTHS } from '@/lib/format';
import { colors } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';
import { listTransactions } from '@/services/bookkeeping';

type Filter = 'all' | 'in' | 'out' | 'move' | 'unpaid' | 'evidence';
const FILTERS: { id: Filter; label: TKey }[] = [
  { id: 'all', label: 'tx.filterAll' },
  { id: 'in', label: 'tx.filterIn' },
  { id: 'out', label: 'tx.filterOut' },
  { id: 'move', label: 'tx.filterMove' },
  { id: 'unpaid', label: 'tx.filterUnpaid' },
  { id: 'evidence', label: 'tx.filterEvidence' },
];

/** Transactions — full history grouped by month (§6.5), with filters by type, unpaid, evidence and month. Reads the local database only. */
export default function Transactions() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { data, loading, error, reload } = useLocalQuery(() => listTransactions(), []);
  const dark = useAppTheme();
  const [kind, setKind] = useState<Filter>('all');
  const [months, setMonths] = useState<number[] | null>(null); // null = every month
  const [picker, setPicker] = useState(false);

  const filtered = (data ?? []).filter((tx) => {
    if (months) {
      const when = new Date(tx.occurredAt);
      if (!months.includes(monthKey(when.getFullYear(), when.getMonth()))) return false;
    }
    switch (kind) {
      case 'in':
      case 'out':
      case 'move':
        return tx.direction === kind;
      case 'unpaid':
        return tx.openBalance !== null && tx.openBalance > 0;
      case 'evidence':
        return tx.evidenceCount > 0;
      default:
        return true;
    }
  });
  const groups = groupByMonth(filtered);
  const filtering = kind !== 'all' || months !== null;

  return (
    <ScreenShell title={t('tx.title')} nav="bookkeeping" hero={<SummaryHero />}>
      <View className="flex-row justify-end" style={{ marginBottom: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('screen.search')} onPress={() => router.push('/search')} style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="search" size={22} />
        </Pressable>
      </View>
      {/* Filters: the month, then what kind of entry. Everything is checked on the phone. */}
      <View style={{ gap: 10, marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('overview.month')}
            onPress={() => setPicker(true)}
            className="flex-row items-center rounded-pill bg-primary-50"
            style={{ paddingHorizontal: 14, minHeight: 36, gap: 8, ...(dark ? { backgroundColor: colors.dark.surface } : {}) }}
          >
            <Icon name="calendar" size={16} color={colors.primary[500]} />
            <Text variant="body-sm" weight={500} tone="primary-900">
              {months ? describeMonths(months, locale, (count) => t('overview.monthsCount', { count })) : t('tx.allMonths')}
            </Text>
            <Icon name="chevronDown" size={14} />
          </Pressable>
          {months ? (
            <Pressable accessibilityRole="button" accessibilityLabel={t('tx.allMonths')} onPress={() => setMonths(null)} hitSlop={10}>
              <Icon name="close" size={18} />
            </Pressable>
          ) : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 8 }} keyboardShouldPersistTaps="handled">
          {FILTERS.map((f) => (
            <Chip key={f.id} label={t(f.label)} selected={kind === f.id} onPress={() => setKind(f.id)} />
          ))}
        </ScrollView>
        {filtering && data ? <Text variant="micro" tone="neutral-600">{t('tx.count', { count: filtered.length })}</Text> : null}
      </View>
      <MonthPickerModal visible={picker} title={t('overview.month')} value={months ?? []} onChange={setMonths} onClose={() => setPicker(false)} />
      {loading && !data ? <LoadingState /> : null}
      {error ? <ErrorState onRetry={reload} /> : null}
      {data && data.length === 0 ? <EmptyState titleKey="tx.empty" bodyKey="tx.emptyBody" /> : null}
      {data && data.length > 0 && filtered.length === 0 ? <EmptyState titleKey="tx.noMatch" bodyKey="tx.noMatchBody" icon="search" /> : null}
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
