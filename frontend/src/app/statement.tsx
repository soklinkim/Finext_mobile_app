import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { KpiTile } from '@/components/KpiTile';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ScreenShell } from '@/components/ScreenShell';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { StatementTable } from '@/components/StatementTable';
import { Text } from '@/components/Text';
import { useAnalysisQuery } from '@/hooks/useAnalysisQuery';
import { useI18n } from '@/i18n';
import { colors, tint } from '@/theme';
import { getStatements, type Statement, type StatementKind, type StatementPeriod } from '@/services/analysis';
import { formatMoneyWhole } from '@/services/bookkeeping';
import { exportStatementPdf } from '@/services/statementPdf';
import { useAppTheme } from '@/theme/AppTheme';

function kpiValue(k: Statement['kpis'][number], currency: Statement['currency'], showPlus: boolean): string {
  if (k.format === 'percent') return `${k.value.toFixed(1)}%`;
  if (k.format === 'ratio') return `${k.value.toFixed(2)}x`;
  return formatMoneyWhole(k.value, currency, { showPlus });
}

/** Income Statement / Balance Sheet / Cash Flow (§6.29). Data comes from the analysis service and is cached for offline use. */
export default function StatementScreen() {
  const { t } = useI18n();
  const dark = useAppTheme();
  const { kind: kindParam, period: periodParam } = useLocalSearchParams<{ kind?: string; period?: string }>();
  const kind: StatementKind = kindParam === 'balance' || kindParam === 'cashflow' ? kindParam : 'income';
  const period: StatementPeriod = periodParam === 'weekly' || periodParam === 'annual' ? periodParam : 'monthly';
  const periodTitle = periodParam === 'weekly' ? t('stmt.weekly') : periodParam === 'annual' ? t('stmt.annual') : periodParam === 'monthly' ? t('stmt.monthly') : null;
  const loadStatements = useCallback(() => getStatements(period), [period]);
  const q = useAnalysisQuery(loadStatements);
  const statement = q.data?.[kind];
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);

  const download = async () => {
    if (!statement || !q.data) return;
    setExporting(true);
    setExportError(false);
    try {
      await exportStatementPdf(statement, q.data.business);
    } catch {
      setExportError(true);
    } finally {
      setExporting(false);
    }
  };

  return (
    <ScreenShell title={t('screen.statements')} backFallbackHref="/statements" nav="statements" lightHeader={false} padding={24}>
      <View style={{ gap: 16 }}>
        {q.source === 'cache' && <OfflineBanner fetchedAt={q.fetchedAt} />}
        <Button label={t('stmt.download')} icon="download" onPress={download} loading={exporting} disabled={!statement} />
        {exportError ? <Text variant="micro" tone="danger">{t('stmt.downloadFailed')}</Text> : null}
        {q.loading && !q.data ? <LoadingState /> : null}
        {q.noCache ? <EmptyState titleKey="offline.noCache" bodyKey="offline.noCacheBody" icon="wifiOff" /> : null}
        {q.data === null && <EmptyState titleKey="data.noStatementsTitle" bodyKey="data.noStatementsBody" />}
        {q.error ? <ErrorState onRetry={q.reload} error={q.error} /> : null}
        {statement && q.data && (
          <>
            {statement.heading ? (
              <View accessibilityRole="header" style={{ gap: 4 }}>
                {statement.heading.map((line, i) => (
                  <Text key={i} variant={i === 0 ? 'body-lg' : 'body'} weight={700} tone="primary-900">
                    {line}
                  </Text>
                ))}
              </View>
            ) : (
              <View>
                <Text variant="micro" weight={300} tone="neutral-600">
                  {q.data.business}
                </Text>
                <View className="flex-row items-center justify-between">
                  <Text variant="title" tone="primary-900" style={{ flex: 1 }}>
                    {periodTitle ?? statement.title}
                  </Text>
                  <View className="flex-row items-center bg-primary-50 rounded-pill" style={{ paddingHorizontal: 12, minHeight: 32, gap: 6, ...(dark ? { backgroundColor: colors.dark.surface } : {}) }} accessibilityLabel={q.data.period}>
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
            )}
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
                  {statement.quickRatios.map((r) => {
                    const percent = r.label.toLowerCase().includes('margin');
                    const format = (value: number) => percent ? `${(value * 100).toFixed(1)}%` : `${value.toFixed(2)}x`;
                    return <KpiTile key={r.label} label={r.label} value={format(r.current)} caption={r.prior !== undefined ? `${q.data!.income.columnHeaders[1]}: ${format(r.prior)}` : undefined} />;
                  })}
                </View>
              </View>
            )}
          </>
        )}
      </View>
    </ScreenShell>
  );
}
