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

export interface ForecastPoint {
  month: string;
  income: number;
  expense: number;
  net: number;
  netLower: number;
  netUpper: number;
}

export interface IncomeExpenseForecast {
  model: 'linear_trend_v1';
  currency: Currency;
  history: { month: string; income: number; expense: number }[];
  activeMonths: number;
  readiness: {
    level: 'low' | 'moderate' | 'high';
    activeMonths: number;
    windowMonths: number;
    forecastEligible: boolean;
  };
  basicAnalysis: {
    totalIncome: number;
    totalExpense: number;
    net: number;
    averageIncomePerActiveMonth: number;
    averageExpensePerActiveMonth: number;
  };
  ruleInsight: 'no_recent_activity' | 'early_data' | 'no_recorded_income' | 'expenses_exceed_income' | 'income_covers_expenses';
  available: boolean;
  reason?: string;
  note: string;
  forecast: ForecastPoint[];
}

export type RiskLevel = 'low' | 'moderate' | 'high';

/** One reason behind the distress score; `reason` is set when the business's own figure is missing (why). */
export interface RiskDriver {
  feature: string;
  label: string;
  value: number | null;
  reason: string | null;
  direction: 'raises risk' | 'lowers risk';
  contribution: number;
}

export interface RiskReason {
  code: string;
  text: string;
  params: Record<string, number>;
}

export interface ProposedLoan {
  amount: number;
  termMonths: number;
  annualInterestRate: number;
  rateType: 'flat' | 'declining';
  repaymentFrequency: 'weekly' | 'monthly';
  installmentAmount?: number;
}

export type AdviceCode = 'break_even' | 'collect_receivables' | 'reduce_stock' | 'cut_costs' | 'raise_margin' | 'limit_drawings' | 'longer_loan_term';

/** One change the owner can make, re-scored with the same 3-month projection and 12-month model. */
export interface RiskAdvice {
  code: AdviceCode;
  /** Amounts in minor units; shares and points as fractions (0.1 = 10%). */
  params: Record<string, number | null>;
  currency: Currency;
  gain: number;
  stress3m: { before: number; after: number } | null;
  model12m: { before: number; after: number } | null;
  conditions: Partial<Record<'cash_runway' | 'negative_cash_flow' | 'dscr', { before: number; after: number }>>;
  cash3m: { before: number; after: number } | null;
}

/** GET /accounting/risk and POST /accounting/risk/loan-check (Layer 2). Amounts in the display currency's minor units. */
export interface FutureRisk {
  /** How to lower the risk (GET /accounting/risk only; empty when the risk is low). */
  advice?: RiskAdvice[];
  model:
    | { available: false; reason: 'not_enough_history'; months: number; text: string }
    | {
        available: true;
        asOf: string;
        months: number;
        confidence: 'low' | 'normal';
        probability: number;
        riskClass: RiskLevel;
        alert: boolean;
        topDrivers: RiskDriver[];
        modelVersion: string;
        horizonMonths: number;
        note: string;
      };
  /** Probability of stress in the next 3 months: a projection from the business's own recent months. */
  stress3m:
    | { available: false; reason: 'not_enough_history'; months: number; text: string }
    | {
        available: true;
        asOf: string;
        horizonMonths: number;
        probability: number;
        riskClass: RiskLevel;
        paths: number;
        basedOnMonths: number;
        currency: Currency;
        /** Share of futures in which each stress condition is met (they can overlap). */
        conditions: { cash_runway: number; negative_cash_flow: number; dscr: number };
        cash: { month: string; median: number; low: number; high: number }[];
        startingCash: number;
        usualMonthlyExpenses: number;
        runwayFloor: number;
        instalments: number[];
        scheduleMissing: boolean;
        stressedNow: ('cash_runway' | 'negative_cash_flow' | 'dscr')[];
        note: string;
      };
  debtCapacity:
    | { available: false; reason: 'not_enough_history'; months: number; text: string }
    | {
        available: true;
        asOf: string;
        currency: Currency;
        level: RiskLevel;
        monthlyCapacity: number;
        existingMonthlyInstalments: number;
        dscr: number | null;
        targetDscr: number;
        affordableMonthlyInstalment: number;
        instalmentsToRevenue: number | null;
        debt: number;
        scheduleMissing: boolean;
        weakening: boolean;
        reasons: RiskReason[];
        proposed?: {
          monthlyInstalment: number;
          dscrWith: number | null;
          fits: boolean;
          maxAmount: number | null;
          model?: { probabilityBefore: number; probabilityAfter: number; riskClassBefore: RiskLevel; riskClassAfter: RiskLevel; assumption: string };
          stress3m?: { probabilityBefore: number; probabilityAfter: number; riskClassBefore: RiskLevel; riskClassAfter: RiskLevel };
        };
      };
}

/** GET /accounting/unusual: a recent entry that looks like a mistake, with its reason. Amounts in the entry's own currency. */
export interface UnusualEntry {
  id: string;
  title: string;
  typeId: string;
  direction: 'in' | 'out' | 'move';
  amount: number;
  currency: Currency;
  occurredAt: number;
  code: 'duplicate' | 'spike' | 'extra_zero' | 'maybe_expense' | 'future_date';
  params: { otherId?: string; otherAt?: number; usual?: number; times?: number; usualType?: string };
}

/** POST /accounting/risk/what-if: the owner's levers. Shares are fractions (0.1 = 10%); omitted means no change. */
export interface WhatIfChanges {
  priceChange?: number;
  costCut?: number;
  collectDays?: number;
  drawingsCut?: number;
}

export interface WhatIfAnswers {
  stress3m: { probability: number; riskClass: RiskLevel } | null;
  model12m: { probability: number; riskClass: RiskLevel } | null;
  /** Middle path of cash at the end of the 3 months, minor units. */
  cash3m: number | null;
  netMargin: number | null;
  receivableDays: number | null;
  monthlyProfit: number;
}

export type WhatIf =
  | { available: false; reason: 'not_enough_history'; months: number }
  | {
      available: true;
      /** The business's current monthly figures, to label each lever in money (minor units). */
      baseline: { currency: Currency; monthlyRevenue: number; monthlyCosts: number; monthlyDrawings: number; receivableDays: number | null };
      before: WhatIfAnswers;
      after: WhatIfAnswers;
    };

export type ReadinessLevel = 'ready' | 'almost' | 'not_ready' | 'insufficient_data';
export type ReadinessPillarId = 'repayment' | 'strength' | 'profitability' | 'records' | 'documents';

/** GET /loan/readiness — transparent score built on the server from the business's own records. */
export interface LoanReadiness {
  score: number | null;
  level: ReadinessLevel;
  /** 0–1 weighted share of checks that had enough data */
  coverage: number;
  currency: Currency;
  pillars: { id: ReadinessPillarId; label: string; weight: number; score: number | null }[];
  checks: {
    id: string;
    pillar: ReadinessPillarId;
    label: string;
    status: 'pass' | 'warn' | 'fail' | 'missing';
    value: number | null;
    format: 'percent' | 'times' | 'months' | 'days' | null;
    note: string | null;
  }[];
  /** check ids to work on, most important first */
  improvements: string[];
  missing: string[];
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
export type StatementPeriod = 'weekly' | 'monthly' | 'annual';

export interface Summary {
  displayCurrency: 'USD' | 'KHR';
  totalBalance: number;
  totalExpense: number;
  totalIncome: number;
  budgetTarget: number;
  budgetPercent: number;
  budgetStatus: 'ok' | 'warning' | 'danger';
}

export type BudgetStatus = Summary['budgetStatus'];

export class AccountingDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccountingDataError';
  }
}

export class OnlineRequiredError extends Error {
  constructor(message = 'Connect to the internet to generate this report.') {
    super(message);
    this.name = 'OnlineRequiredError';
  }
}

/** The device is online but the FINEXT server did not answer (not running, wrong address, blocked by a firewall). */
export class ServerUnreachableError extends OnlineRequiredError {
  constructor(message = 'The FINEXT server could not be reached.') {
    super(message);
    this.name = 'ServerUnreachableError';
  }
}

/** An HTTP/API failure; unlike an offline state, retrying requires fixing the response cause. */
export class ApiRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

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
  /** Formal heading lines: business name, statement name, period (e.g. "AS AT 31 DECEMBER 2024"). Absent in older cached data. */
  heading?: [string, string, string];
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

export interface RatioSnapshot {
  id: string;
  label: string;
  value: number | null;
  status: 'green' | 'yellow' | 'red' | 'not_available';
  benchmark: number;
  yellow: number;
  red: number;
  betterWhen: 'higher' | 'lower';
  message?: string | null;
}

/** GET /accounting/snapshots: one complete month. `features` holds each ratio's value (same units as RatioSnapshot.value). */
export interface HealthHistoryMonth {
  period: string;
  complete?: boolean;
  integrity: { ok: boolean };
  features: Record<string, number | null> | null;
  ratioStatus?: Record<string, RatioSnapshot['status']>;
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
