import { View } from 'react-native';
import { OfflineBanner } from './OfflineBanner';
import { Text } from './Text';
import { useAnalysisQuery } from '@/hooks/useAnalysisQuery';
import { useI18n, type TKey } from '@/i18n';
import { getIncomeExpenseForecast, type IncomeExpenseForecast } from '@/services/analysis';
import { formatMoneyWhole } from '@/services/bookkeeping';
import { colors, radius } from '@/theme';
import { useAppTheme } from '@/theme/AppTheme';

function formatMonth(month: string, locale: string, style: 'long' | 'short' = 'long'): string {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number - 1, 1)).toLocaleDateString(locale === 'km' ? 'km-KH' : 'en-GB', {
    month: style,
    ...(style === 'long' ? { year: 'numeric' as const } : {}),
    timeZone: 'UTC',
  });
}

/** One column per completed month: income and expense bars side by side; empty months show a flat stub. */
function MonthHistory({ history, locale, label }: { history: IncomeExpenseForecast['history']; locale: string; label: string }) {
  const dark = useAppTheme();
  const max = Math.max(1, ...history.flatMap((point) => [point.income, point.expense]));
  const track = dark ? colors.dark.field : colors.neutral[200];
  const CHART_HEIGHT = 56;
  const barHeight = (amount: number) => (amount > 0 ? Math.max(3, (amount / max) * CHART_HEIGHT) : 0);

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ flexDirection: 'row', gap: 6 }}>
      {history.map((point) => {
        const active = point.income > 0 || point.expense > 0;
        return (
          <View key={point.month} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
            <View style={{ height: CHART_HEIGHT, flexDirection: 'row', alignItems: 'flex-end', gap: 3 }}>
              {active ? (
                <>
                  <View style={{ width: 7, height: barHeight(point.income), borderRadius: 3, backgroundColor: colors.primary[500] }} />
                  <View style={{ width: 7, height: barHeight(point.expense), borderRadius: 3, backgroundColor: colors.accent.expense }} />
                </>
              ) : (
                <View style={{ width: 17, height: 3, borderRadius: 3, backgroundColor: track }} />
              )}
            </View>
            <Text variant="micro" tone={active ? 'primary-900' : 'neutral-500'} numberOfLines={1}>{formatMonth(point.month, locale, 'short')}</Text>
          </View>
        );
      })}
    </View>
  );
}

export function IncomeExpenseForecastCard() {
  const { t, locale } = useI18n();
  const dark = useAppTheme();
  const query = useAnalysisQuery(getIncomeExpenseForecast);
  const forecast = query.data;

  if (query.noCache || query.error) return null;
  if (query.loading && !forecast) {
    const skeleton = dark ? colors.dark.field : colors.neutral[200];
    return (
      <View accessibilityRole="progressbar" accessibilityLabel={t('analysis.loading')} style={{ padding: 16, borderRadius: radius.card, backgroundColor: dark ? colors.dark.surface : colors.white, borderWidth: 1, borderColor: dark ? colors.dark.border : colors.neutral[200], gap: 16 }}>
        <View style={{ width: 190, height: 15, borderRadius: 8, backgroundColor: skeleton }} />
        {[0, 1, 2].map((key) => (
          <View key={key} style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ width: 100, height: 12, borderRadius: 6, backgroundColor: skeleton }} />
              <View style={{ width: 72, height: 12, borderRadius: 6, backgroundColor: skeleton }} />
            </View>
            <View style={{ width: '100%', height: 8, borderRadius: 8, backgroundColor: skeleton }} />
          </View>
        ))}
      </View>
    );
  }
  if (!forecast) return null;

  const maxValue = Math.max(1, ...forecast.forecast.flatMap((point) => [point.income, point.expense]));
  const windowMonths = forecast.readiness.windowMonths;
  const isEmpty = forecast.activeMonths === 0;
  const surface = dark ? colors.dark.surface : colors.white;
  const border = dark ? colors.dark.border : colors.neutral[200];
  const coverageColor = forecast.readiness.level === 'high' ? colors.success : forecast.readiness.level === 'moderate' ? colors.warning : colors.neutral[500];
  const coverageLabel = {
    low: t('analysis.coverageLow'),
    moderate: t('analysis.coverageModerate'),
    high: t('analysis.coverageHigh'),
  }[forecast.readiness.level];
  const insightColor = forecast.ruleInsight === 'expenses_exceed_income' ? colors.warning : forecast.ruleInsight === 'income_covers_expenses' ? colors.success : colors.neutral[600];
  const insightKey = ({
    no_recent_activity: 'analysis.insightNoRecent',
    early_data: 'analysis.insightEarlyData',
    no_recorded_income: 'analysis.insightNoIncome',
    expenses_exceed_income: 'analysis.insightExpensesHigh',
    income_covers_expenses: 'analysis.insightIncomeCovers',
  } as const)[forecast.ruleInsight] as TKey;

  return (
    <View style={{ padding: 16, borderRadius: radius.card, backgroundColor: surface, borderWidth: 1, borderColor: border, gap: 14 }}>
      {query.source === 'cache' && <OfflineBanner fetchedAt={query.fetchedAt} />}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="body-lg" weight={700} tone="primary-900">{t(forecast.available ? 'analysis.forecastTitle' : 'analysis.basicInsightsTitle')}</Text>
          {!isEmpty && <Text variant="micro" tone="neutral-600">{t('analysis.forecastCaption', { count: forecast.activeMonths, months: windowMonths })}</Text>}
        </View>
        {!isEmpty && (
          <View style={{ borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: `${coverageColor}22` }}>
            <Text variant="micro" weight={600} style={{ color: coverageColor }}>{coverageLabel}</Text>
          </View>
        )}
      </View>

      <MonthHistory history={forecast.history} locale={locale} label={t('analysis.historyChartLabel', { months: windowMonths })} />

      {!forecast.available && (
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {Array.from({ length: windowMonths }, (_, index) => (
              <View key={index} style={{ flex: 1, height: 5, borderRadius: 99, backgroundColor: index < forecast.activeMonths ? colors.primary[500] : dark ? colors.dark.field : colors.neutral[200] }} />
            ))}
          </View>
          <Text variant="micro" tone="neutral-600">{t('analysis.forecastProgress', { count: forecast.activeMonths, months: windowMonths })}</Text>
        </View>
      )}

      {isEmpty ? (
        <Text variant="body-sm" tone="neutral-600">{t('analysis.forecastEmptyBody', { months: windowMonths })}</Text>
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: 7 }}>
            {[
              { key: 'income', label: t('summary.income'), amount: forecast.basicAnalysis.totalIncome, color: colors.primary[500] },
              { key: 'expense', label: t('summary.expense'), amount: forecast.basicAnalysis.totalExpense, color: colors.accent.expense },
              { key: 'net', label: t('analysis.net'), amount: forecast.basicAnalysis.net, color: forecast.basicAnalysis.net >= 0 ? colors.success : colors.danger },
            ].map((metric) => (
              <View key={metric.key} style={{ flex: 1, minWidth: 0, borderTopWidth: 3, borderTopColor: metric.color, borderRadius: 10, padding: 9, backgroundColor: dark ? colors.dark.field : colors.primary[50], gap: 3 }}>
                <Text variant="micro" tone="neutral-600" numberOfLines={1}>{metric.label}</Text>
                <Text variant="caption" weight={700} tone="primary-900" numberOfLines={1} adjustsFontSizeToFit>{formatMoneyWhole(metric.amount, forecast.currency, { showPlus: metric.key === 'net' })}</Text>
              </View>
            ))}
          </View>

          <View style={{ borderLeftWidth: 3, borderLeftColor: insightColor, paddingLeft: 10, paddingVertical: 3 }}>
            <Text variant="body-sm" tone="neutral-600">{t(insightKey)}</Text>
          </View>
        </>
      )}

      {forecast.available && (
        <View style={{ gap: 12 }}>
          {forecast.forecast.map((point) => (
            <View key={point.month} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text variant="caption" weight={600} tone="primary-900">{formatMonth(point.month, locale)}</Text>
                <Text variant="caption" weight={700} style={{ color: point.net >= 0 ? colors.success : colors.danger }}>
                  {t('analysis.net')}: {formatMoneyWhole(point.net, forecast.currency, { showPlus: true })}
                </Text>
              </View>
              {([
                { key: 'income', label: t('summary.income'), amount: point.income, color: colors.primary[500] },
                { key: 'expense', label: t('summary.expense'), amount: point.expense, color: colors.accent.expense },
              ]).map((metric) => (
                <View key={metric.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text variant="micro" tone="neutral-600" style={{ width: 56 }}>{metric.label}</Text>
                  <View style={{ flex: 1, height: 7, borderRadius: 99, backgroundColor: dark ? colors.dark.field : colors.neutral[200], overflow: 'hidden' }}>
                    <View style={{ width: `${(metric.amount / maxValue) * 100}%`, height: '100%', borderRadius: 99, backgroundColor: metric.color }} />
                  </View>
                  <Text variant="micro" weight={500} tone="primary-900" style={{ width: 72, textAlign: 'right' }} numberOfLines={1} adjustsFontSizeToFit>
                    {formatMoneyWhole(metric.amount, forecast.currency)}
                  </Text>
                </View>
              ))}
              <Text variant="micro" tone="neutral-600">
                {t('analysis.forecastRange')}: {formatMoneyWhole(point.netLower, forecast.currency)} – {formatMoneyWhole(point.netUpper, forecast.currency)}
              </Text>
            </View>
          ))}
        </View>
      )}
      {forecast.available && <Text variant="micro" tone="neutral-600">{t('analysis.forecastDisclaimer')}</Text>}
    </View>
  );
}
