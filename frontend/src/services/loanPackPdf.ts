/**
 * Loan application pack: one PDF a business can give a bank or MFI. A summary page (stress probability for 3 and 12
 * months with the main reasons, debt capacity, how the risk could be lowered), the key ratios against targets, then
 * the three financial statements, each on its own page. Everything comes from the business's own records.
 */
import type { TKey } from '@/i18n';
import type { FutureRisk, RatioSnapshot, Statements } from '@/services/analysis';
import { formatMoneyWhole } from '@/services/bookkeeping';
import { formatBenchmark, formatRatio } from '@/services/ratioFormat';
import { adviceText, driverValue, percent, reasonText } from '@/services/riskText';
import { STATEMENT_CSS, esc, statementSection } from '@/services/statementPdf';

type Translate = (key: TKey, params?: Record<string, string | number>) => string;

export interface LoanPackInput {
  statements: Statements;
  risk: FutureRisk | null;
  ratios: RatioSnapshot[];
  t: Translate;
  date: string;
}

const LEVEL_COLOR = { low: '#16a34a', moderate: '#d97706', high: '#dc2626' } as const;
const STATUS_COLOR = { green: '#16a34a', yellow: '#d97706', red: '#dc2626', not_available: '#6b7280' } as const;

const PACK_CSS = `
    .page { page-break-after: always; }
    .page:last-child { page-break-after: auto; }
    h1 { font-size: 16pt; margin: 0 0 4px; letter-spacing: 0.5px; }
    h2 { font-size: 12pt; margin: 22px 0 8px; }
    .muted { color: #555; font-size: 9pt; }
    .business { font-size: 13pt; font-weight: 700; margin: 0 0 2px; }
    .grid { display: flex; gap: 10px; margin-top: 14px; }
    .tile { flex: 1; border: 1px solid #ddd; border-radius: 8px; padding: 10px 12px; }
    .tile .label { font-size: 9pt; color: #555; }
    .tile .value { font-size: 18pt; font-weight: 700; margin: 4px 0 2px; }
    .level { display: inline-block; font-size: 8.5pt; font-weight: 700; padding: 2px 8px; border-radius: 999px; color: #fff; }
    ul { margin: 6px 0 0 18px; padding: 0; }
    li { margin: 3px 0; }
    body { font-size: 10pt; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-weight: 600; font-size: 8.5pt; color: #555; padding: 4px 6px; border-bottom: 1px solid #999; }
    td { padding: 5px 6px; border-bottom: 1px solid #e3e3e3; }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .kv td { border-bottom: 1px solid #eee; }
    .stmt-col th, .stmt-col td, .stmt-col table { font-size: 8.5pt; }
    .note { font-size: 8.5pt; color: #555; margin-top: 14px; line-height: 1.45; }`;

function levelBadge(t: Translate, level: 'low' | 'moderate' | 'high', key: 'risk.level' | 'debt.level'): string {
  return `<span class="level" style="background:${LEVEL_COLOR[level]}">${esc(t(`${key}.${level}` as TKey))}</span>`;
}

function summaryPage({ statements, risk, t, date }: LoanPackInput): string {
  const tiles: string[] = [];
  const parts: string[] = [];
  const notAvailable = `<div class="muted">${esc(t('pack.notAvailable'))}</div>`;

  const stress = risk?.stress3m;
  tiles.push(`<div class="tile"><div class="label">${esc(t('pack.pdfStress3'))}</div>${stress?.available
    ? `<div class="value">${percent(stress.probability)}%</div>${levelBadge(t, stress.riskClass, 'risk.level')}` : notAvailable}</div>`);
  const model = risk?.model;
  tiles.push(`<div class="tile"><div class="label">${esc(t('pack.pdfRisk12'))}</div>${model?.available
    ? `<div class="value">${percent(model.probability)}%</div>${levelBadge(t, model.riskClass, 'risk.level')}` : notAvailable}</div>`);
  const capacity = risk?.debtCapacity;
  if (capacity?.available) {
    const money = (n: number) => esc(formatMoneyWhole(Math.round(n), capacity.currency));
    tiles.push(`<div class="tile"><div class="label">${esc(t('pack.pdfAffordable'))}</div><div class="value">${money(capacity.affordableMonthlyInstalment)}</div>${levelBadge(t, capacity.level, 'debt.level')}</div>`);
    parts.push(`<h2>${esc(t('pack.pdfDebt'))}</h2><table class="kv"><tbody>
      <tr><td>${esc(t('debt.capacity'))} (${esc(t('debt.perMonth'))})</td><td class="num">${money(capacity.monthlyCapacity)}</td></tr>
      <tr><td>${esc(t('pack.pdfExisting'))}</td><td class="num">${money(capacity.existingMonthlyInstalments)}</td></tr>
      <tr><td>${esc(t('pack.pdfCover', { target: capacity.targetDscr }))}</td><td class="num">${capacity.dscr === null ? '—' : esc(t('risk.times', { value: capacity.dscr.toFixed(1) }))}</td></tr>
    </tbody></table>`);
    const notes = capacity.reasons.filter((r) => !r.code.startsWith('loan_'));
    if (notes.length) parts.push(`<ul>${notes.map((r) => `<li>${esc(reasonText(t, r))}</li>`).join('')}</ul>`);
  } else {
    tiles.push(`<div class="tile"><div class="label">${esc(t('pack.pdfAffordable'))}</div>${notAvailable}</div>`);
  }
  if (model?.available && model.topDrivers.length) {
    parts.push(`<h2>${esc(t('pack.pdfReasons'))}</h2><ul>${model.topDrivers.slice(0, 5).map((d) =>
      `<li>${esc(t(`risk.f.${d.feature}` as TKey))}: ${esc(driverValue(t, d))} — ${esc(t(d.direction === 'raises risk' ? 'risk.raises' : 'risk.lowers'))}</li>`).join('')}</ul>`);
  }
  if (stress?.available && stress.stressedNow.length) {
    parts.push(`<h2>${esc(t('stress.nowTitle'))}</h2><ul>${stress.stressedNow.map((c) => `<li>${esc(t(`stress.now.${c}` as TKey))}</li>`).join('')}</ul>`);
  }
  if (risk?.advice?.length) {
    parts.push(`<h2>${esc(t('pack.pdfAdvice'))}</h2><ul>${risk.advice.map((a) => `<li>${esc(adviceText(t, a))}</li>`).join('')}</ul>`);
  }
  return `<section class="page">
    <h1>${esc(t('pack.pdfTitle'))}</h1>
    <p class="business">${esc(statements.business)}</p>
    <p class="muted">${esc(statements.period)} · ${esc(t('pack.pdfPrepared', { date }))}</p>
    <h2>${esc(t('pack.pdfSummary'))}</h2>
    <div class="grid">${tiles.join('')}</div>
    ${parts.join('')}
    <p class="note">${esc(t('pack.pdfMethod'))}</p>
  </section>`;
}

function ratiosPage({ ratios, t }: LoanPackInput): string {
  if (!ratios.length) return '';
  const rows = ratios.map((r) => `<tr><td>${esc(r.label)}</td><td class="num">${esc(formatRatio(r))}</td>
    <td class="num">${r.betterWhen === 'higher' ? '≥' : '≤'} ${esc(formatBenchmark(r))}</td>
    <td class="num" style="color:${STATUS_COLOR[r.status]};font-weight:600">${esc(t(`pack.status.${r.status}` as TKey))}</td></tr>`).join('');
  return `<section class="page"><h1>${esc(t('pack.pdfRatios'))}</h1>
    <table><thead><tr><th>${esc(t('pack.pdfRatio'))}</th><th class="num">${esc(t('pack.pdfValue'))}</th><th class="num">${esc(t('pack.pdfTarget'))}</th><th class="num">${esc(t('pack.pdfStatus'))}</th></tr></thead>
    <tbody>${rows}</tbody></table></section>`;
}

export function loanPackHtml(input: LoanPackInput): string {
  const { statements } = input;
  const pages = [
    summaryPage(input),
    ratiosPage(input),
    ...[statements.income, statements.balance, statements.cashflow].map((s) => `<section class="page">${statementSection(s, statements.business)}</section>`),
  ].filter(Boolean);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(input.t('pack.pdfTitle'))} — ${esc(statements.business)}</title>
    <style>${STATEMENT_CSS}${PACK_CSS}</style></head><body>${pages.join('')}</body></html>`;
}
