/** The future-risk results in words, shared by the risk cards and the loan application pack PDF. */
import type { TKey } from '@/i18n';
import type { RiskAdvice, RiskDriver } from '@/services/analysis';
import { formatMoneyWhole } from '@/services/bookkeeping';

type Translate = (key: TKey, params?: Record<string, string | number>) => string;

const DAYS = new Set(['inventory_days', 'payable_days', 'receivable_days', 'liquid_days_of_expenses']);
const TIMES = new Set(['current_ratio', 'quick_ratio', 'cash_ratio', 'interest_coverage', 'asset_turnover', 'long_term_liabilities_to_equity', 'cash_earnings_to_liabilities']);

/** A probability as a whole percentage ("<1" below 1%). */
export const percent = (p: number) => (p < 0.01 ? '<1' : String(Math.round(p * 100)));

/** The business's own figure in a form people read: days, times, percentages, or why it is missing. */
export function driverValue(t: Translate, driver: RiskDriver): string {
  if (driver.reason) return t(`risk.gap.${driver.reason}` as TKey);
  const v = driver.value;
  if (v === null) return '—';
  if (DAYS.has(driver.feature)) return t('risk.days', { value: Math.round(v) });
  if (TIMES.has(driver.feature)) return t('risk.times', { value: v.toFixed(Math.abs(v) >= 10 ? 0 : 2) });
  if (driver.feature === 'sales_growth') return `${v >= 1 ? '+' : ''}${Math.round((v - 1) * 100)}%`;
  return `${Math.round(v * 100)}%`;
}

export function reasonText(t: Translate, reason: { code: string; params: Record<string, number> }): string {
  return t(`debt.reason.${reason.code}` as TKey, reason.params);
}

/** The change in words, with its numbers filled in (amounts as money, shares as percentages). */
export function adviceText(t: Translate, item: RiskAdvice): string {
  const p = item.params;
  const money = (amount: number | null | undefined) => formatMoneyWhole(Math.round(amount ?? 0), item.currency);
  const pct = (share: number | null | undefined) => String(Math.round((share ?? 0) * 100));
  switch (item.code) {
    case 'break_even': {
      const options = [
        p.costCut !== null && p.costCut !== undefined && p.costCut <= 0.5 ? t('advice.orCutCosts', { percent: pct(p.costCut) }) : null,
        p.marginPoints !== null && p.marginPoints !== undefined && p.marginPoints <= 0.15 ? t('advice.orRaiseMargin', { points: pct(p.marginPoints) }) : null,
      ].filter(Boolean);
      return t('advice.break_even', { gap: money(p.monthlyGap) }) + (options.length ? ` ${t('advice.forExample')} ${options.join(t('advice.or'))}.` : '');
    }
    case 'collect_receivables':
    case 'reduce_stock':
      return t(`advice.${item.code}` as TKey, { now: Math.round(p.daysNow ?? 0), target: Math.round(p.daysTarget ?? 0), cash: money(p.cash) });
    case 'cut_costs':
      return t('advice.cut_costs', { percent: pct(p.share), monthly: money(p.monthly) });
    case 'raise_margin':
      return t('advice.raise_margin', { points: pct(p.points), monthly: money(p.monthly) });
    case 'limit_drawings':
      return t('advice.limit_drawings', { cap: money(p.monthlyCap), now: money(p.monthlyNow) });
    case 'longer_loan_term':
      return t('advice.longer_loan_term', { now: money(p.monthlyNow), after: money(p.monthlyAfter) });
  }
}
