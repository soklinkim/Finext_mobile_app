import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/Button';
import { DateInput } from '@/components/DateInput';
import { ScreenShell } from '@/components/ScreenShell';
import { SelectField } from '@/components/SelectField';
import { EmptyState } from '@/components/StateViews';
import { Text } from '@/components/Text';
import { TransactionRow } from '@/components/TransactionRow';
import { useI18n, type TKey } from '@/i18n';
import { getEntryTypes, searchTransactions, type TransactionView } from '@/services/bookkeeping';

/** Search — category (every entry type: Money in, Money out, Move money) and date. Runs against the local database. */
export default function Search() {
  const { t } = useI18n();
  const [typeId, setTypeId] = useState<string | null>(null);
  const [date, setDate] = useState<number | null>(null);
  const [results, setResults] = useState<TransactionView[] | null>(null);

  const run = async () => setResults(await searchTransactions({ typeId, date: date ? new Date(date) : null }));

  return (
    <ScreenShell
      title={t('screen.search')}
      nav="analysis"
    >
      <View style={{ gap: 24 }}>
        <View style={{ gap: 8 }}>
          <Text variant="body-lg" tone="primary-900" weight={500}>
            {t('search.categories')}
          </Text>
          <SelectField
            size="form"
            placeholder={t('search.selectCategory')}
            searchable
            options={(['in', 'out', 'move'] as const).flatMap((direction) => getEntryTypes(direction)).map((e) => ({ value: e.id, label: t(`type.${e.id}` as TKey) }))}
            value={typeId}
            onChange={setTypeId}
          />
        </View>
        <View style={{ gap: 8 }}>
          <Text variant="body-lg" tone="primary-900" weight={500}>
            {t('search.date')}
          </Text>
          <DateInput value={date} onChange={setDate} />
        </View>
        <View className="items-center">
          <Button variant="tint" label={t('common.search')} icon="search" onPress={run} />
        </View>
        {results && results.length === 0 ? <EmptyState titleKey="search.none" icon="search" /> : null}
        {results?.map((tx, i) => <TransactionRow key={tx.id} tx={tx} index={i} />)}
      </View>
    </ScreenShell>
  );
}
