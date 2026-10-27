import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Button } from '@/components/Button';
import { DateInput } from '@/components/DateInput';
import { ScreenShell } from '@/components/ScreenShell';
import { SelectField } from '@/components/SelectField';
import { EmptyState } from '@/components/StateViews';
import { Text } from '@/components/Text';
import { TextField } from '@/components/TextField';
import { TransactionRow } from '@/components/TransactionRow';
import { useLocalQuery } from '@/hooks/useLocalQuery';
import { useI18n } from '@/i18n';
import { colors } from '@/theme';
import { listCategories, searchTransactions, type TransactionView } from '@/services/bookkeeping';
import { useAppTheme } from '@/theme/AppTheme';

/** Search — text, category, date and Income / Expense. Runs against the local database. */
export default function Search() {
  const { t } = useI18n();
  const dark = useAppTheme();
  const { data: categories } = useLocalQuery(() => listCategories(), []);
  const [text, setText] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [date, setDate] = useState<number | null>(null);
  const [report, setReport] = useState<'in' | 'out'>('out');
  const [results, setResults] = useState<TransactionView[] | null>(null);

  const run = async () => setResults(await searchTransactions({ text, categoryId, date: date ? new Date(date) : null, direction: report }));

  return (
    <ScreenShell
      title={t('screen.search')}
      lightHeader
      nav="analysis"
      hero={
        <View className="px-9" style={{ paddingBottom: 16 }}>
          <TextField value={text} onChangeText={setText} placeholder={t('search.placeholder')} returnKeyType="search" onSubmitEditing={run} accessibilityLabel={t('screen.search')} />
        </View>
      }
    >
      <View style={{ gap: 24 }}>
        <View style={{ gap: 8 }}>
          <Text variant="body-lg" tone="primary-900" weight={500}>
            {t('search.categories')}
          </Text>
          <SelectField
            size="form"
            placeholder={t('search.selectCategory')}
            options={(categories ?? []).map((c) => ({ value: c.id, label: c.name }))}
            value={categoryId}
            onChange={setCategoryId}
          />
        </View>
        <View style={{ gap: 8 }}>
          <Text variant="body-lg" tone="primary-900" weight={500}>
            {t('search.date')}
          </Text>
          <DateInput value={date} onChange={setDate} />
        </View>
        <View style={{ gap: 8 }}>
          <Text variant="body-lg" tone="primary-900" weight={500}>
            {t('search.report')}
          </Text>
          <View className="flex-row" style={{ gap: 32 }}>
            {(['in', 'out'] as const).map((d) => (
              <Pressable key={d} accessibilityRole="radio" accessibilityState={{ selected: report === d }} onPress={() => setReport(d)} className="flex-row items-center" style={{ gap: 8, minHeight: 44 }}>
                <View className="items-center justify-center" style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.primary[200] }}>
                  {report === d && <View className="bg-primary-200" style={{ width: 10, height: 10, borderRadius: 5, ...(dark ? { backgroundColor: colors.dark.primary } : {}) }} />}
                </View>
                <Text variant="body-lg" weight={400} tone="primary-900">
                  {d === 'in' ? t('summary.income') : t('summary.expense')}
                </Text>
              </Pressable>
            ))}
          </View>
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
