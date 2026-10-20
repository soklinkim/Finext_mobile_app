import { Alert, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { KpiTile } from '@/components/KpiTile';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ScreenShell } from '@/components/ScreenShell';
import { SegmentedControl } from '@/components/SegmentedControl';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { StatementTable } from '@/components/StatementTable';
import { Text } from '@/components/Text';
import { useAnalysisQuery } from '@/hooks/useAnalysisQuery';
import { useI18n } from '@/i18n';
import { colors, tint } from '@/theme';
import { getStatements, type Statement, type StatementKind } from '@/services/analysis';
import { formatMoneyWhole } from '@/services/bookkeeping';

function kpiValue(k: Statement['kpis'][number], currency: Statement['currency'], showPlus: boolean): string {
  if (k.format === 'percent') return `${k.value.toFixed(1)}%`;
  if (k.format === 'ratio') return `${k.value.toFixed(2)}x`;
  return formatMoneyWhole(k.value, currency, { showPlus });
}

/** Income Statement / Balance Sheet / Cash Flow (§6.29). Data comes from the analysis service and is cached for offline use. */
export default function StatementScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const { kind: kindParam } = useLocalSearchParams<{ kind?: string }>();
  const kind: StatementKind = kindParam === 'balance' || kindParam === 'cashflow' ? kindParam : 'income';
  const q = useAnalysisQuery(getStatements, []);
  const statement = q.data?.[kind];

  return (
    <ScreenShell title={t('screen.statements')} nav="statements" lightHeader={false} padding={24}>
      <View style={{ gap: 16 }}>
        <SegmentedControl
          variant="tab"
          options={[
            { value: 'income', label: t('stmt.tabIncome') },
            { value: 'balance', label: t('stmt.tabBalance') },
            { value: 'cashflow', label: t('stmt.tabCashflow') },
          ]}
          value={kind}
          onChange={(k) => router.setParams({ kind: k })}
        />
        {q.source === 'cache' && <OfflineBanner fetchedAt={q.fetchedAt} />}
        <Button label={t('stmt.download')} icon="download" onPress={() => Alert.alert(t('stmt.download'), t('stmt.downloadNote'))} />
        {q.loading && !q.data ? <LoadingState /> : null}
        {q.noCache ? <EmptyState titleKey="offline.noCache" bodyKey="offline.noCacheBody" icon="wifiOff" /> : null}
        {q.error ? <ErrorState onRetry={q.reload} /> : null}
        {statement && q.data && (
          <>
            <View>
              <Text variant="micro" weight={300} tone="neutral-600">
                {q.data.business}
              </Text>
              <View className="flex-row items-center justify-between">
                <Text variant="title" tone="primary-900" style={{ flex: 1 }}>
                  {statement.title}
                </Text>
                <View className="flex-row items-center bg-primary-50 rounded-pill" style={{ paddingHorizontal: 12, minHeight: 32, gap: 6 }} accessibilityLabel={q.data.period}>
                  <Text variant="caption" weight={500} tone="primary-900">
                    {q.data.period}
                  </Text>
                  <Icon name="chevronDown" size={14} />
                </View>
              </View>
              <Text variant="micro" weight={300} tone="neutral-600">
                {statement.periodLabel}
              </Text>
            </View>
            <View className="flex-row" style={{ gap: 8 }}>
              {statement.kpis.map((k) => (
                <KpiTile key={k.label} label={k.label} value={kpiValue(k, statement.currency, kind === 'cashflow')} caption={k.caption} highlight={k.highlight} />
              ))}
            </View>
            <StatementTable statement={statement} />
            {statement.check && (
              <View
                accessible
                className="flex-row items-center rounded-field"
                style={{ backgroundColor: tint(colors.success, 0.15), paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}
              >
                <Icon name="check" size={16} />
                <Text variant="caption" tone="primary-900" style={{ flex: 1 }}>
                  {statement.check.label} ({t('stmt.difference')} {formatMoneyWhole(statement.check.difference, statement.currency)})
                </Text>
              </View>
            )}
            {statement.quickRatios && (
              <View style={{ gap: 8 }}>
                <Text variant="caption" weight={600} tone="primary-500">
                  {t('stmt.quickRatios')}
                </Text>
                <View className="flex-row" style={{ gap: 8 }}>
                  {statement.quickRatios.map((r) => (
                    <KpiTile key={r.label} label={r.label} value={`${r.current.toFixed(2)}x`} caption={r.prior !== undefined ? `${q.data!.income.columnHeaders[1]}: ${r.prior.toFixed(2)}x` : undefined} />
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </View>
    </ScreenShell>
  );
}
