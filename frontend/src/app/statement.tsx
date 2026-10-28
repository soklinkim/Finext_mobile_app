import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Button } from '@/components/Button';
import { KpiTile } from '@/components/KpiTile';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ScreenShell } from '@/components/ScreenShell';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { PaperStatement } from '@/components/PaperStatement';
import { Text } from '@/components/Text';
import { useAnalysisQuery } from '@/hooks/useAnalysisQuery';
import { useI18n } from '@/i18n';
import { getStatements, type Statement, type StatementKind, type StatementPeriod } from '@/services/analysis';
import { formatMoneyWhole } from '@/services/bookkeeping';
import { exportStatementPdf } from '@/services/statementPdf';

function kpiValue(k: Statement['kpis'][number], currency: Statement['currency'], showPlus: boolean): string {
  if (k.format === 'percent') return `${k.value.toFixed(1)}%`;
  if (k.format === 'ratio') return `${k.value.toFixed(2)}x`;
  return formatMoneyWhole(k.value, currency, { showPlus });
}

/** Income Statement / Balance Sheet / Cash Flow (§6.29). Data comes from the analysis service and is cached for offline use. */
export default function StatementScreen() {
  const { t, term } = useI18n();
  const { kind: kindParam, period: periodParam } = useLocalSearchParams<{ kind?: string; period?: string }>();
  const kind: StatementKind = kindParam === 'balance' || kindParam === 'cashflow' ? kindParam : 'income';
  const period: StatementPeriod = periodParam === 'weekly' || periodParam === 'annual' ? periodParam : 'monthly';
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
    <ScreenShell title={t('screen.statements')} backFallbackHref="/statements" nav="statements" padding={24}>
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
            <View className="flex-row" style={{ gap: 8 }}>
              {statement.kpis.map((k) => (
                <KpiTile key={k.label} label={term(k.label)} value={kpiValue(k, statement.currency, kind === 'cashflow')} caption={k.caption} highlight={k.highlight} />
              ))}
            </View>
            {/* The statement itself as a sheet of A4 paper, like the PDF it downloads as. */}
            <PaperStatement statement={statement} business={q.data.business} />
            {statement.quickRatios && (
              <View style={{ gap: 8 }}>
                <Text variant="caption" weight={600} tone="primary-500">
                  {t('stmt.quickRatios')}
                </Text>
                <View className="flex-row" style={{ gap: 8 }}>
                  {statement.quickRatios.map((r) => {
                    const percent = r.label.toLowerCase().includes('margin');
                    const format = (value: number) => percent ? `${(value * 100).toFixed(1)}%` : `${value.toFixed(2)}x`;
                    return <KpiTile key={r.label} label={term(r.label)} value={format(r.current)} caption={r.prior !== undefined ? `${q.data!.income.columnHeaders[1]}: ${format(r.prior)}` : undefined} />;
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
