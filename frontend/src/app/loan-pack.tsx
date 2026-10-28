import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/Button';
import { Chip, ChipRow } from '@/components/Chip';
import { Icon } from '@/components/Icon';
import { OfflineBanner } from '@/components/OfflineBanner';
import { PdfPreview } from '@/components/PdfPreview';
import { ScreenShell } from '@/components/ScreenShell';
import { EmptyState, ErrorState, LoadingState } from '@/components/StateViews';
import { Text } from '@/components/Text';
import { useAnalysisQuery } from '@/hooks/useAnalysisQuery';
import { useI18n, type TKey } from '@/i18n';
import { getFutureRisk, getRatios, getStatements, type StatementPeriod } from '@/services/analysis';
import { formatMoneyWhole } from '@/services/bookkeeping';
import { loanPackHtml } from '@/services/loanPackPdf';
import { percent } from '@/services/riskText';
import { colors, radius } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

const INCLUDED: TKey[] = ['pack.item.statements', 'pack.item.ratios', 'pack.item.stress', 'pack.item.debt', 'pack.item.advice'];
const LEVEL_COLOR = { low: colors.success, moderate: colors.warning, high: colors.danger } as const;

/** Loan application pack: one PDF for a lender with the statements, ratios and the AI risk assessment. */
export default function LoanPack() {
  const { t, locale } = useI18n();
  const dark = useAppTheme();
  const [period, setPeriod] = useState<StatementPeriod>('annual');
  const loadStatements = useCallback(() => getStatements(period), [period]);
  const statements = useAnalysisQuery(loadStatements);
  const risk = useAnalysisQuery(getFutureRisk);
  const ratios = useAnalysisQuery(getRatios);
  // The pack to download, shown in a preview first; null while the preview is closed.
  const [preview, setPreview] = useState<string | null>(null);
  const card = { padding: 16, borderRadius: radius.card, backgroundColor: dark ? colors.dark.surface : colors.white, borderWidth: 1, borderColor: dark ? colors.dark.border : colors.neutral[200], gap: 12 } as const;

  const ready = Boolean(statements.data) && !risk.loading && !ratios.loading;
  const open = () => {
    if (!statements.data) return;
    setPreview(loanPackHtml({
      statements: statements.data,
      risk: risk.data ?? null,
      ratios: ratios.data ?? [],
      t,
      date: new Date().toLocaleDateString(locale === 'km' ? 'km-KH' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    }));
  };

  const summary: { label: string; value: string; level?: 'low' | 'moderate' | 'high'; levelKey?: 'risk.level' | 'debt.level' }[] = [];
  const r = risk.data;
  if (r?.stress3m.available) summary.push({ label: t('pack.pdfStress3'), value: `${percent(r.stress3m.probability)}%`, level: r.stress3m.riskClass, levelKey: 'risk.level' });
  if (r?.model.available) summary.push({ label: t('pack.pdfRisk12'), value: `${percent(r.model.probability)}%`, level: r.model.riskClass, levelKey: 'risk.level' });
  if (r?.debtCapacity.available) {
    summary.push({ label: t('pack.pdfAffordable'), value: formatMoneyWhole(Math.round(r.debtCapacity.affordableMonthlyInstalment), r.debtCapacity.currency), level: r.debtCapacity.level, levelKey: 'debt.level' });
  }

  return (
    <ScreenShell title={t('pack.title')} backFallbackHref="/statements" nav="statements" padding={24}>
      <View style={{ gap: 16 }}>
        {statements.source === 'cache' && <OfflineBanner fetchedAt={statements.fetchedAt} />}
        <Text variant="body-sm" tone="neutral-600">{t('pack.intro')}</Text>

        <View style={card}>
          <Text variant="caption" weight={600} tone="neutral-600">{t('pack.period')}</Text>
          <ChipRow>
            {(['monthly', 'annual'] as const).map((p) => (
              <Chip key={p} label={t(p === 'monthly' ? 'stmt.monthly' : 'stmt.annual')} selected={period === p} onPress={() => setPeriod(p)} />
            ))}
          </ChipRow>
          {statements.data && <Text variant="micro" tone="neutral-600">{statements.data.business} · {statements.data.period}</Text>}
        </View>

        {statements.loading && !statements.data ? <LoadingState /> : null}
        {statements.noCache ? <EmptyState titleKey="offline.noCache" bodyKey="offline.noCacheBody" icon="wifiOff" /> : null}
        {statements.data === null && <EmptyState titleKey="data.noStatementsTitle" bodyKey="data.noStatementsBody" />}
        {statements.error ? <ErrorState onRetry={statements.reload} error={statements.error} /> : null}

        {statements.data && (
          <>
            {summary.length > 0 && (
              <View style={card}>
                <Text variant="caption" weight={600} tone="neutral-600">{t('pack.pdfSummary')}</Text>
                {summary.map((item) => (
                  <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <Text variant="body-sm" tone="primary-900" style={{ flex: 1 }}>{item.label}</Text>
                    <Text variant="body" weight={700} tone="primary-900">{item.value}</Text>
                    {item.level && item.levelKey && (
                      <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: `${LEVEL_COLOR[item.level]}26` }}>
                        <Text variant="micro" weight={600} style={{ color: LEVEL_COLOR[item.level] }}>{t(`${item.levelKey}.${item.level}` as TKey)}</Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}

            <View style={card}>
              <Text variant="caption" weight={600} tone="neutral-600">{t('pack.included')}</Text>
              {INCLUDED.map((key) => (
                <View key={key} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                  <Icon name="check" size={16} color={colors.success} />
                  <Text variant="body-sm" tone="primary-900" style={{ flex: 1 }}>{t(key)}</Text>
                </View>
              ))}
            </View>

            <Button label={t('pack.download')} icon="download" onPress={open} loading={!ready} disabled={!ready} />
            <Text variant="micro" tone="neutral-500">{t('pack.consent')}</Text>
          </>
        )}
      </View>
      <PdfPreview html={preview} title={`${t('pack.pdfTitle')} — ${statements.data?.business ?? ''}`} onClose={() => setPreview(null)} failedMessage={t('pack.failed')} />
    </ScreenShell>
  );
}
