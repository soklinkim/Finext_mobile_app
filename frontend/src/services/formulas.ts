/**
 * "Where does this number come from?": the formulas behind the figures in Analysis and Statements, built from the
 * figures already on screen so what the owner is shown always adds up to what they tapped.
 *
 * The statement lines follow the backend's own build of each statement (routers/accounting.py): costs are stored as
 * negative lines, so every subtotal is the plain sum of the lines it lists.
 */
import type { FormulaInfo } from '@/components/FormulaSheet';
import type { TKey } from '@/i18n';
import type { Statement, StatementLine } from '@/services/analysis';
import { paperMoney } from '@/services/statementPdf';

import { en } from '@/i18n/en';

type Translate = (key: TKey, params?: Record<string, string | number>) => string;
const hasKey = (key: string): key is TKey => key in en;
export interface FormulaContext {
  t: Translate;
  /** standard accounting term for a label (plain-language aware) */
  term: (label: string) => string;
}

/** Subtotals and totals: the line keys they add up. 'section' means every line above it in its own section. */
const SUMS: Record<Statement['kind'], Record<string, string[] | 'section'>> = {
  income: {
    gross: ['sales', 'cogs'],
    operating: 'section',
    operatingProfit: ['gross', 'operating'],
    pbt: ['operatingProfit', 'otherIncome', 'interest'],
    net: ['pbt', 'tax'],
  },
  balance: {
    currentAssets: ['cash', 'receivables', 'inventory', 'prepaid'],
    assets: ['currentAssets', 'equipment', 'longAssets'],
    liabilities: ['payables', 'deposits', 'accrued', 'shortLoans', 'otherBorrowings', 'longLoans', 'leases'],
    equity: ['capital', 'retained', 'profit', 'drawings'],
    totalLE: ['liabilities', 'equity'],
  },
  cashflow: {
    operatingCash: ['netProfit', 'depreciation', 'receivables', 'inventory', 'prepaid', 'payables', 'deposits', 'accrued'],
    investingCash: ['equipmentCash', 'otherAssetsCash'],
    financingCash: ['debtCash', 'capitalCash', 'drawingsCash'],
    netCash: ['operatingCash', 'investingCash', 'financingCash'],
    closingCash: ['openingCash', 'netCash'],
  },
};

/** The statement's top-line figures (KPI tiles) are lines of the statement below them. */
const KPI_LINE: Record<string, string> = {
  Revenue: 'sales',
  'Net profit': 'net',
  'Total assets': 'assets',
  'Total liabilities': 'liabilities',
  "Owner's equity": 'equity',
  'Net cash change': 'netCash',
};

const QUICK_WORDS: Record<string, TKey> = {
  'Gross margin': 'formula.quick.gross',
  'Net margin': 'formula.quick.net',
  'Current ratio': 'formula.quick.current',
  'Liabilities-to-equity': 'formula.quick.leverage',
};

/** Quick ratios: numerator line(s) ÷ denominator line(s). */
const QUICK: Record<string, { top: string[]; bottom: string[] }> = {
  'Gross margin': { top: ['gross'], bottom: ['sales'] },
  'Net margin': { top: ['net'], bottom: ['sales'] },
  'Current ratio': { top: ['currentAssets'], bottom: ['payables', 'deposits', 'accrued', 'shortLoans', 'otherBorrowings'] },
  'Liabilities-to-equity': { top: ['liabilities'], bottom: ['equity'] },
};

const allLines = (statement: Statement) => statement.sections.flatMap((section) => section.lines);
const valueOf = (line: StatementLine, column: 0 | 1) => (column === 0 ? line.current : line.prior);

/** What a statement line is: its parts if it is a subtotal or total, otherwise where its figure comes from. */
export function statementLineInfo(statement: Statement, line: StatementLine, column: 0 | 1, { t, term }: FormulaContext): FormulaInfo | null {
  const value = valueOf(line, column);
  if (value === undefined) return null;
  const money = (n: number | undefined) => (n === undefined ? '—' : paperMoney(n, statement.currency));
  const title = term(line.label);
  const rule = SUMS[statement.kind][line.key];
  let parts: StatementLine[] | undefined;
  if (rule === 'section') {
    const section = statement.sections.find((s) => s.lines.some((l) => l.key === line.key));
    parts = section?.lines.slice(0, section.lines.indexOf(line));
  } else if (rule) {
    const byKey = new Map(allLines(statement).map((l) => [l.key, l]));
    parts = rule.map((key) => byKey.get(key)).filter((l): l is StatementLine => Boolean(l));
  }
  if (parts && parts.length) {
    return {
      title,
      result: money(value),
      formula: `${title} = ${parts.map((p) => term(p.label)).join(' + ')}`,
      withNumbers: `= ${parts.map((p) => money(valueOf(p, column))).join(' + ')} = ${money(value)}`,
      parts: parts.map((p) => ({ label: term(p.label), value: money(valueOf(p, column)) })),
      explanation: t('formula.sumWords', { title }),
      note: t('formula.sumNote'),
    };
  }
  // A figure that comes straight from entries: say which kinds of entry, and how much each added.
  const specific = `formula.line.${statement.kind}.${line.key}` as TKey;
  const explanation = hasKey(specific) ? t(specific) : t(`formula.leaf.${statement.kind}` as TKey);
  const sources = column === 0 ? line.sources : undefined; // the breakdown is for the current period only
  if (sources && sources.length) {
    const label = (source: string) => {
      if (source === 'depreciation') return t('formula.source.depreciation');
      if (source === 'opening') return t('formula.source.opening');
      const name = t(`type.${source}` as TKey);
      return line.key === 'cogs' ? `${name} (${t('formula.cost')})` : name;
    };
    return {
      title,
      result: money(value),
      formula: `${title} = ${sources.map((s) => label(s.source)).join(' + ')}`,
      withNumbers: `= ${sources.map((s) => money(s.amount)).join(' + ')} = ${money(value)}`,
      explanation,
      parts: sources.map((s) => ({ label: label(s.source), value: money(s.amount) })),
    };
  }
  // The profit lines repeat the income statement's net profit.
  const formula = line.key === 'profit' || line.key === 'netProfit' ? `${title} = ${term('Net profit')}` : `${title} = ${t(`formula.leafSymbol.${statement.kind}` as TKey)}`;
  return { title, result: money(value), formula, explanation };
}

/** A tile at the top of a statement: the line it repeats. */
export function statementKpiInfo(statement: Statement, label: string, ctx: FormulaContext): FormulaInfo | null {
  const key = KPI_LINE[label];
  const line = key ? allLines(statement).find((l) => l.key === key) : undefined;
  return line ? statementLineInfo(statement, line, 0, ctx) : null;
}

/** A quick ratio under a statement: one figure divided by another, both taken from the lines above. */
export function quickRatioInfo(statement: Statement, label: string, shown: string, { t, term }: FormulaContext): FormulaInfo | null {
  const rule = QUICK[label];
  if (!rule) return null;
  const byKey = new Map(allLines(statement).map((l) => [l.key, l]));
  const sum = (keys: string[]) => keys.map((k) => byKey.get(k)).filter((l): l is StatementLine => Boolean(l));
  const top = sum(rule.top);
  const bottom = sum(rule.bottom);
  const money = (n: number) => paperMoney(n, statement.currency);
  const total = (lines: StatementLine[]) => lines.reduce((acc, l) => acc + l.current, 0);
  const name = (lines: StatementLine[]) => lines.map((l) => term(l.label)).join(' + ');
  return {
    title: term(label),
    result: shown,
    explanation: t(QUICK_WORDS[label]),
    formula: `${term(label)} = (${name(top)}) ÷ (${name(bottom)})`,
    withNumbers: `= (${top.map((l) => money(l.current)).join(' + ')}) ÷ (${bottom.map((l) => money(l.current)).join(' + ')}) = ${shown}`,
    parts: [
      ...top.map((l) => ({ label: term(l.label), value: money(l.current) })),
      ...(bottom.length > 1 ? bottom.map((l) => ({ label: `${term(l.label)} (${t('formula.divisor')})`, value: money(l.current) })) : []),
      { label: bottom.length > 1 ? t('formula.divisorTotal') : `${term(bottom[0]?.label ?? '')} (${t('formula.divisor')})`, value: money(total(bottom)) },
    ],
  };
}

/** The Income / Expenses / Net tiles on the Performance tab. */
export function performanceInfo(
  kind: 'income' | 'expense' | 'net',
  data: { labels: string[]; income: number[]; expense: number[]; totals: { income: number; expense: number }; incomeSources?: { source: string; amount: number }[]; expenseSources?: { source: string; amount: number }[]; currency: Statement['currency'] },
  { t }: FormulaContext,
): FormulaInfo {
  const money = (n: number) => paperMoney(n, data.currency);
  if (kind === 'net') {
    return {
      title: t('analysis.net'),
      result: money(data.totals.income - data.totals.expense),
      formula: `${t('analysis.net')} = ${t('summary.income')} − ${t('summary.expense')}`,
      withNumbers: `= ${money(data.totals.income)} − ${money(data.totals.expense)} = ${money(data.totals.income - data.totals.expense)}`,
      explanation: t('formula.perf.net'),
      parts: [
        { label: t('summary.income'), value: money(data.totals.income) },
        { label: `− ${t('summary.expense')}`, value: money(data.totals.expense) },
      ],
    };
  }
  const series = kind === 'income' ? data.income : data.expense;
  const title = t(kind === 'income' ? 'summary.income' : 'summary.expense');
  const sources = kind === 'income' ? data.incomeSources : data.expenseSources;
  if (sources && sources.length) {
    // Costs posted by a sale are its goods' cost; loan repayments count only for their interest.
    const label = (source: string) => {
      if (source === 'system_depreciation') return t('formula.source.depreciation');
      const name = t(`type.${source}` as TKey);
      if (kind === 'expense' && source === 'product_sale') return `${name} (${t('formula.cost')})`;
      if (kind === 'expense' && source === 'loan_repayment') return `${name} (${t('formula.interest')})`;
      return name;
    };
    return {
      title,
      result: money(data.totals[kind]),
      formula: `${title} = ${sources.map((s) => label(s.source)).join(' + ')}`,
      explanation: t(kind === 'income' ? 'formula.perf.income' : 'formula.perf.expense'),
      parts: sources.map((s) => ({ label: label(s.source), value: money(s.amount) })),
    };
  }
  return {
    title,
    result: money(data.totals[kind]),
    formula: `${title} = ${data.labels.join(' + ')}`,
    withNumbers: `= ${data.labels.map((_, i) => money(series[i] ?? 0)).join(' + ')} = ${money(data.totals[kind])}`,
    explanation: t(kind === 'income' ? 'formula.perf.income' : 'formula.perf.expense'),
    parts: data.labels.map((label, i) => ({ label, value: money(series[i] ?? 0) })),
  };
}

const HEALTH_RATIOS = ['current_ratio', 'gross_margin', 'net_margin', 'ebitda_margin', 'operating_expense_ratio', 'revenue_growth', 'inventory_days', 'receivable_days', 'debt_to_equity', 'debt_to_asset', 'interest_coverage', 'dscr'];

/** The formula behind a health ratio (in words), or null for a ratio this app has no formula text for. */
export function healthRatioFormula(id: string, t: Translate): string | null {
  return HEALTH_RATIOS.includes(id) ? t(`formula.ratio.${id}` as TKey) : null;
}
