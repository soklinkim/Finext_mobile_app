import type { Currency } from '../bookkeeping/money';

/** Shapes the backend developer must return. All money values are integer minor units (USD cents, KHR riel). */

export type AnalysisPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface AnalysisResult {
  period: AnalysisPeriod;
  currency: Currency;
  /** x-axis labels: Mon–Sun, 1st–4th Week, Jan–Jun, years */
  labels: string[];
  /** same length as labels */
  income: number[];
  expense: number[];
  totals: { income: number; expense: number };
}

export interface Target {
  id: string;
  /** i18n-able label, e.g. "Product Sale" */
  label: string;
  /** 0–100 */
  percent: number;
  icon?: 'sale' | 'goal' | 'car' | 'profit';
}

export interface CategorySlice {
  categoryId: string | null;
  name: string;
  percent: number;
  amount: number;
  currency: Currency;
}

export type StatementKind = 'income' | 'balance' | 'cashflow';

export interface StatementLine {
  key: string;
  label: string;
  current: number;
  prior?: number;
  style?: 'line' | 'subtotal' | 'total';
  /** cash-flow style: show a + on positive numbers */
  showPlus?: boolean;
}

export interface StatementSection {
  heading?: string;
  lines: StatementLine[];
}

export interface StatementKpi {
  label: string;
  value: number;
  format: 'money' | 'percent' | 'ratio';
  caption?: string;
  highlight?: boolean;
}

export interface Statement {
  kind: StatementKind;
  title: string;
  periodLabel: string;
  currency: Currency;
  kpis: StatementKpi[];
  columnHeaders: [string, string?];
  sections: StatementSection[];
  /** "Balance check … difference $0" strip; difference must be 0 */
  check?: { label: string; difference: number };
  quickRatios?: { label: string; current: number; prior?: number }[];
}

export interface Statements {
  business: string;
  period: string;
  income: Statement;
  balance: Statement;
  cashflow: Statement;
}

export interface AppNotification {
  id: string;
  group: 'today' | 'yesterday' | 'weekend';
  type: 'reminder' | 'update' | 'transaction' | 'advice';
  title: string;
  body: string;
  detail?: string;
  at: number;
}

/** Wrapper returned by every analysis call so the UI can show the "Offline · last updated …" banner. */
export interface CachedResult<T> {
  data: T;
  source: 'network' | 'cache';
  /** epoch ms the data was produced by the server (or mock) */
  fetchedAt: number;
}

export class NoCachedDataError extends Error {
  constructor() {
    super('Offline and no cached analysis available yet');
    this.name = 'NoCachedDataError';
  }
}
