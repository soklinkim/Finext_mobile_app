import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Button } from '@/components/Button';
import { KpiTile } from '@/components/KpiTile';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ScreenShell } from '@/components/ScreenShell';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { PaperStatement } from '@/components/PaperStatement';
import { PdfPreview } from '@/components/PdfPreview';
import { Text } from '@/components/Text';
import { useAnalysisQuery } from '@/hooks/useAnalysisQuery';
import { useI18n, type TKey } from '@/i18n';
import { getStatements, type Statement, type StatementKind, type StatementPeriod } from '@/services/analysis';
import { formatMoneyWhole } from '@/services/bookkeeping';
import { statementHtml } from '@/services/statementPdf';

function kpiValue(k: Statement['kpis'][number], currency: Statement['currency'], showPlus: boolean): string {
  if (k.format === 'percent') return `${k.value.toFixed(1)}%`;
  if (k.format === 'ratio') return `${k.value.toFixed(2)}x`;
  return formatMoneyWhole(k.value, currency, { showPlus });
}

const REPORT_NAME: Record<StatementPeriod, TKey> = { weekly: 'stmt.weekly', monthly: 'stmt.monthly', annual: 'stmt.annual' };

/** Income Statement / Balance Sheet / Cash Flow (§6.29). Data comes from the analysis service and is cached for offline use. */
export default function StatementScreen() {
  const { t, term } = useI18n();
  const { kind: kindParam, period: periodParam } = useLocalSearchParams<{ kind?: string; period?: string }>();
  const kind: StatementKind = kindParam === 'balance' || kindParam === 'cashflow' ? kindParam : 'income';
  const period: StatementPeriod = periodParam === 'weekly' || periodParam === 'annual' ? periodParam : 'monthly';
  const loadStatements = useCallback(() => getStatements(period), [period]);
  const q = useAnalysisQuery(loadStatements);
  const loaded = q.data?.[kind];
  // Opened from a Weekly / Monthly / Annual Report tile: the same figures, headed as that report ("MONTHLY REPORT",
  // "OCTOBER 2026") rather than as a formal statement.
  const reportName = periodParam ? t(REPORT_NAME[period]) : null;
  const statement = loaded && reportName && q.data
    ? { ...loaded, title: reportName, heading: [q.data.business.toUpperCase(), reportName.toUpperCase(), loaded.periodLabel.toUpperCase()] as [string, string, string] }
    : loaded;
  // The page to download, shown in a preview first; null while the preview is closed.
  const [preview, setPreview] = useState<string | null>(null);

  return (
    <ScreenShell title={t('screen.statements')} backFallbackHref="/statements" nav="statements" padding={24}>
      <View style={{ gap: 16 }}>
        {q.source === 'cache' && <OfflineBanner fetchedAt={q.fetchedAt} />}
        <Button label={t('stmt.download')} icon="download" onPress={() => statement && q.data && setPreview(statementHtml(statement, q.data.business))} disabled={!statement} />
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
      <PdfPreview html={preview} title={statement?.title ?? t('screen.statements')} onClose={() => setPreview(null)} failedMessage={t('stmt.downloadFailed')} />
    </ScreenShell>
  );
}
