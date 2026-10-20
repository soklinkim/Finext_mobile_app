/**
 * Mock server responses for the analysis service.
 * TODO: replace with server API — every function exported from ./index.ts calls one of
 * these; swap the body of the `fetcher` passed to withCache() for an HTTP request that
 * returns the same shape (see README "What the backend developer needs to build").
 * Numbers mirror the Figma screens and the FINEXT_FINANCE_RULES §8.4 sample shop.
 */
import type {
  AnalysisPeriod,
  AnalysisResult,
  AppNotification,
  CategorySlice,
  Statement,
  StatementLine,
  Statements,
  Target,
} from './types';

const usd = (dollars: number) => Math.round(dollars * 100);
const wait = (ms = 450) => new Promise<void>((r) => setTimeout(r, ms));

const CHARTS: Record<AnalysisPeriod, { labels: string[]; income: number[]; expense: number[] }> = {
  daily: {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    income: [3400, 700, 7200, 500, 10000, 2800, 3000],
    expense: [7600, 2000, 2500, 4400, 8600, 600, 5800],
  },
  weekly: {
    labels: ['1st Week', '2nd Week', '3rd Week', '4th Week'],
    income: [1000, 900, 2100, 4900],
    expense: [1900, 3200, 7400, 3100],
  },
  monthly: {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    income: [9000, 12000, 8000, 14000, 6000, 11000],
    expense: [6000, 7000, 9000, 10000, 4000, 8000],
  },
  yearly: {
    labels: ['2021', '2022', '2023', '2024', '2025', '2026'],
    income: [30000, 42000, 51000, 62000, 71000, 40000],
    expense: [26000, 35000, 44000, 56000, 64400, 33000],
  },
};

export async function mockAnalysis(period: AnalysisPeriod): Promise<AnalysisResult> {
  await wait();
  const c = CHARTS[period];
  return {
    period,
    currency: 'USD',
    labels: c.labels,
    income: c.income.map(usd),
    expense: c.expense.map(usd),
    totals: { income: usd(4120), expense: usd(1187.4) },
  };
}

export async function mockTargets(): Promise<Target[]> {
  await wait(250);
  return [
    { id: 'product-sale', label: 'Product Sale', percent: 30, icon: 'sale' },
    { id: 'profit-goals', label: 'Profit On Goals', percent: 30, icon: 'profit' },
    { id: 'savings-goals', label: 'Savings On Goals', percent: 65, icon: 'car' },
  ];
}

export async function mockCategoryBreakdown(): Promise<CategorySlice[]> {
  await wait(300);
  return [
    { categoryId: null, name: 'Rent', percent: 57, amount: usd(674.4), currency: 'USD' },
    { categoryId: null, name: 'Food', percent: 25, amount: usd(295.8), currency: 'USD' },
    { categoryId: null, name: 'Groceries', percent: 18, amount: usd(217.2), currency: 'USD' },
  ];
}

export async function mockNotifications(): Promise<AppNotification[]> {
  await wait(250);
  const now = Date.now();
  const at = (daysAgo: number) => now - daysAgo * 86_400_000;
  return [
    { id: 'n1', group: 'today', type: 'reminder', title: 'Reminder!', body: 'Set up your automatic savings to meet your savings goal…', at: at(0) },
    { id: 'n2', group: 'today', type: 'update', title: 'New Update', body: 'Set up your automatic savings to meet your savings goal…', at: at(0) },
    { id: 'n3', group: 'yesterday', type: 'transaction', title: 'Transactions', body: 'A new transaction has been registered', detail: 'Groceries | Pantry | -$100,00', at: at(1) },
    { id: 'n4', group: 'yesterday', type: 'reminder', title: 'Reminder!', body: 'Set up your automatic savings to meet your savings goal…', at: at(1) },
    { id: 'n5', group: 'weekend', type: 'advice', title: 'Expense Record', body: 'We recommend that you be more attentive to your finances.', at: at(3) },
    { id: 'n6', group: 'weekend', type: 'transaction', title: 'Transactions', body: 'A new transaction has been registered', detail: 'Food | Dinner | -$70,40', at: at(3) },
  ];
}

// ---- statements: Sample Grocery Shop, year to 31 Dec 2025 (FINANCE_RULES §8.4) -------------------------------------

const L = (key: string, label: string, current: number, prior?: number, style?: StatementLine['style'], showPlus?: boolean): StatementLine => ({
  key,
  label,
  current: usd(current),
  prior: prior === undefined ? undefined : usd(prior),
  style,
  showPlus,
});

function incomeStatement(): Statement {
  return {
    kind: 'income',
    title: 'Income Statement',
    periodLabel: 'For the period ended 31 December 2025 · Amounts in USD',
    currency: 'USD',
    kpis: [
      { label: 'Net profit', value: usd(6650), format: 'money', caption: '+75% vs 2024', highlight: true },
      { label: 'Gross margin', value: 35.2, format: 'percent', caption: '2024: 33.9%' },
      { label: 'Net margin', value: 9.4, format: 'percent', caption: '2024: 6.1%' },
    ],
    columnHeaders: ['2025', '2024'],
    sections: [
      {
        heading: 'Revenue',
        lines: [
          L('sales', 'Sales revenue', 71000, 62000),
          L('cogs', 'Cost of goods sold', 46000, 41000),
          L('gross', 'Gross profit', 25000, 21000, 'subtotal'),
        ],
      },
      {
        heading: 'Operating expenses',
        lines: [
          L('wages', 'Salaries & wages', 7800, 7200),
          L('rent', 'Rent', 3600, 3600),
          L('utilities', 'Utilities', 1300, 1200),
          L('marketing', 'Marketing & advertising', 1000, 800),
          L('transport', 'Transport & delivery', 1200, 1100),
          L('depreciation', 'Depreciation', 1600, 1500),
          L('otherOpex', 'Other operating expenses', 1000, 900),
          L('opex', 'Total operating expenses', 17500, 16300, 'subtotal'),
          L('opProfit', 'Operating profit', 7500, 4700, 'subtotal'),
        ],
      },
      {
        heading: 'Other items',
        lines: [
          L('otherIncome', 'Other income', 300, 0),
          L('interest', 'Interest expense', 800, 700),
          L('pbt', 'Profit before tax', 7000, 4000, 'subtotal'),
          L('tax', 'Income tax', 350, 200),
          L('net', 'Net profit', 6650, 3800, 'total'),
        ],
      },
    ],
  };
}

function balanceSheet(): Statement {
  return {
    kind: 'balance',
    title: 'Balance Sheet',
    periodLabel: 'As at 31 December 2025 · Amounts in USD',
    currency: 'USD',
    kpis: [
      { label: 'Total assets', value: usd(33950), format: 'money', caption: '2024: $29,300', highlight: true },
      { label: 'Liabilities', value: usd(15200), format: 'money', caption: '2024: $16,200' },
      { label: "Owner's equity", value: usd(18750), format: 'money', caption: '2024: $13,100' },
    ],
    columnHeaders: ['2025', '2024'],
    sections: [
      {
        heading: 'Assets · Current assets',
        lines: [
          L('cash', 'Cash & bank balances', 4950, 4200),
          L('ar', 'Accounts receivable', 4300, 3500),
          L('inventory', 'Inventory', 9500, 8000),
          L('prepaid', 'Prepaid & other current assets', 700, 600),
          L('tca', 'Total current assets', 19450, 16300, 'subtotal'),
        ],
      },
      {
        heading: 'Non-current assets',
        lines: [
          L('ppe', 'Property, equipment & vehicles (net)', 13500, 12000),
          L('olta', 'Other long-term assets', 1000, 1000),
          L('tnca', 'Total non-current assets', 14500, 13000, 'subtotal'),
          L('ta', 'TOTAL ASSETS', 33950, 29300, 'total'),
        ],
      },
      {
        heading: 'Liabilities · Current liabilities',
        lines: [
          L('ap', 'Accounts payable', 5200, 4500),
          L('deposits', 'Customer deposits & deferred revenue', 600, 500),
          L('accrued', 'Accrued expenses & taxes payable', 900, 700),
          L('stl', 'Short-term loans (bank / MFI)', 2500, 3000),
          L('osb', 'Other short-term borrowings', 1000, 1500),
          L('tcl', 'Total current liabilities', 10200, 10200, 'subtotal'),
        ],
      },
      {
        heading: 'Non-current liabilities',
        lines: [
          L('ltl', 'Long-term loans (bank / MFI)', 5000, 6000),
          L('lease', 'Lease obligations', 0, 0),
          L('tncl', 'Total non-current liabilities', 5000, 6000, 'subtotal'),
          L('tl', 'TOTAL LIABILITIES', 15200, 16200, 'total'),
        ],
      },
      {
        heading: "Owner's equity",
        lines: [
          L('capital', "Owner's capital", 12000, 10000),
          L('re', 'Retained earnings brought forward', 3100, 1700),
          L('np', 'Net profit for the period', 6650, 3800),
          L('drawings', "Less: owner's drawings", -3000, -2400),
          L('te', "TOTAL OWNER'S EQUITY", 18750, 13100, 'subtotal'),
          L('tle', 'TOTAL LIABILITIES & EQUITY', 33950, 29300, 'total'),
        ],
      },
    ],
    check: { label: 'Balance check: assets = liabilities + equity', difference: 0 },
    quickRatios: [
      { label: 'Current ratio', current: 1.91, prior: 1.6 },
      { label: 'Debt-to-equity', current: 0.81, prior: 1.24 },
    ],
  };
}

function cashFlow(): Statement {
  return {
    kind: 'cashflow',
    title: 'Cash Flow Statement',
    periodLabel: 'For the period ended 31 December 2025 · Amounts in USD',
    currency: 'USD',
    kpis: [
      { label: 'Operating', value: usd(6850), format: 'money', caption: 'Day-to-day', highlight: true },
      { label: 'Investing', value: usd(-3100), format: 'money', caption: 'Long-term assets' },
      { label: 'Financing', value: usd(-3000), format: 'money', caption: 'Loans & owner' },
    ],
    columnHeaders: ['2025'],
    sections: [
      {
        heading: 'Operating activities',
        lines: [
          L('np', 'Net profit', 6650),
          L('dep', 'Add back: depreciation', 1600, undefined, 'line', true),
          L('ar', '(Increase) / decrease in accounts receivable', -800, undefined, 'line', true),
          L('inv', '(Increase) / decrease in inventory', -1500, undefined, 'line', true),
          L('pre', '(Increase) / decrease in prepaid & other current assets', -100, undefined, 'line', true),
          L('ap', 'Increase / (decrease) in accounts payable', 700, undefined, 'line', true),
          L('dep2', 'Increase / (decrease) in customer deposits', 100, undefined, 'line', true),
          L('acc', 'Increase / (decrease) in accrued expenses & taxes', 200, undefined, 'line', true),
          L('cfo', 'Net cash from operating activities', 6850, undefined, 'subtotal'),
        ],
      },
      {
        heading: 'Investing activities',
        lines: [
          L('ppe', '(Purchase) / sale of property, equipment & vehicles', -3100, undefined, 'line', true),
          L('olta', '(Increase) / decrease in other long-term assets', 0),
          L('cfi', 'Net cash from investing activities', -3100, undefined, 'subtotal'),
        ],
      },
      {
        heading: 'Financing activities',
        lines: [
          L('stl', 'Increase / (repayment) of short-term loans', -500, undefined, 'line', true),
          L('osb', 'Increase / (repayment) of other short-term borrowings', -500, undefined, 'line', true),
          L('ltl', 'Increase / (repayment) of long-term loans', -1000, undefined, 'line', true),
          L('lease', 'Increase / (repayment) of lease obligations', 0),
          L('cap', "Owner's capital contributed", 2000, undefined, 'line', true),
          L('draw', "Less: owner's drawings", -3000, undefined, 'line', true),
          L('cff', 'Net cash from financing activities', -3000, undefined, 'subtotal'),
        ],
      },
      {
        heading: 'Cash summary',
        lines: [
          L('net', 'Net increase / (decrease) in cash', 750, undefined, 'subtotal', true),
          L('start', 'Cash at start of period', 4200),
          L('end', 'Cash at end of period', 4950, undefined, 'total'),
        ],
      },
    ],
    check: { label: 'Check: ties to Balance Sheet cash', difference: 0 },
  };
}

export async function mockStatements(): Promise<Statements> {
  await wait(600);
  return {
    business: 'Sample Grocery Shop',
    period: 'Dec 2025',
    income: incomeStatement(),
    balance: balanceSheet(),
    cashflow: cashFlow(),
  };
}
