import { View } from 'react-native';
import { ScreenShell } from '@/components/ScreenShell';
import { Text } from '@/components/Text';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { OfflineBanner } from '@/components/OfflineBanner';
import { useAnalysisQuery } from '@/hooks/useAnalysisQuery';
import { useI18n } from '@/i18n';
import { getJournal } from '@/services/analysis';
import { formatMoneyWhole } from '@/services/bookkeeping';
import { colors } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

const accountNames: Record<string, string> = {
  '1000': 'Cash', '1010': 'Bank & wallet', '1100': 'Accounts receivable',
  '1200': 'Inventory', '1500': 'Equipment', '1590': 'Accumulated depreciation',
  '2000': 'Accounts payable', '2100': 'Customer deposits', '2200': 'Accrued expenses',
  '2300': 'Taxes payable', '2400': 'Short-term loan', '2500': 'Other borrowing',
  '2600': 'Long-term loan', '3000': "Owner's capital", '3100': 'Retained earnings',
  '3200': "Owner's drawings", '4000': 'Sales revenue', '4100': 'Service revenue',
  '4200': 'Other income', '4900': 'Sales returns', '5000': 'Cost of goods sold',
  '6000': 'Rent', '6100': 'Wages', '6200': 'Utilities', '6400': 'Transport',
  '6500': 'Marketing', '6600': 'Repairs', '6800': 'Depreciation', '6950': 'Fees',
  '6990': 'Other expenses', '7000': 'Interest expense', '7100': 'Income tax',
};

export default function JournalScreen() {
  const { t } = useI18n();
  const dark = useAppTheme();
  const query = useAnalysisQuery(getJournal);

  return (
    <ScreenShell title={t('bookkeeping.journal')} nav="bookkeeping" padding={24}>
      {query.source === 'cache' && <OfflineBanner fetchedAt={query.fetchedAt} />}
      {query.loading && !query.data ? <LoadingState /> : null}
      {query.noCache ? <EmptyState titleKey="offline.noCache" bodyKey="offline.noCacheBody" icon="wifiOff" /> : null}
      {query.error ? <ErrorState onRetry={query.reload} error={query.error} /> : null}
      {query.data?.length === 0 ? <EmptyState titleKey="journal.empty" bodyKey="journal.body" /> : null}
      <View style={{ gap: 12 }}>
        {query.data?.map((entry) => (
          <View key={entry.id} style={{ padding: 14, borderRadius: 14, gap: 10, backgroundColor: dark ? colors.dark.surface : colors.white, borderWidth: 1, borderColor: dark ? colors.dark.border : colors.neutral[200] }}>
            <View className="flex-row justify-between items-center">
              <Text variant="caption" weight={600} tone="primary-900">{new Date(entry.date).toLocaleDateString()}</Text>
              <Text variant="micro" tone="neutral-600">{entry.source === 'system' ? 'System entry' : entry.transactionId.slice(0, 8)}</Text>
            </View>
            {entry.lines.map((line) => (
              <View key={`${entry.id}-${line.lineNo}`} className="flex-row justify-between" style={{ gap: 12 }}>
                <View className="flex-1">
                  <Text variant="body-sm" tone="neutral-900">{line.side === 'debit' ? 'Dr' : 'Cr'} · {accountNames[line.accountCode] ?? 'Account'} ({line.accountCode})</Text>
                </View>
                <Text variant="body-sm" weight={600} tone="primary-900">{formatMoneyWhole(line.amount, line.currency)}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScreenShell>
  );
}
