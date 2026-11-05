/**
 * Bookkeeping entry service — offline-first. Entries are collected and queued locally;
 * authoritative accounting totals and reports are calculated by the backend. UI code
 * must go through this module and never import `@/db` directly.
 */
import { and, desc, eq, gt, gte, isNull, lte, like, or } from 'drizzle-orm';
import { db, initDatabase, newRowMeta, schema } from '@/db/client';
import { seedInitialData, STARTING_ROW_UPDATED_AT } from '@/db/seed';
import { formatInputDate } from '@/lib/format';
import { getLanguagePreference } from '@/services/preferences';
import type { Bank, BusinessAsset, Category, Settings, Transaction } from '@/db/schema';
import { emitChange } from './events';
import { evidenceCounts, listEvidence, removeEvidence } from './evidence';
import { getEntryType, type Direction, type GroupId } from './entryTypes';
import { convertMinor, type Currency } from './money';

export * from './entryTypes';
export * from './money';
export * from './evidence';
export { subscribeToChanges } from './events';
export type { Bank, BusinessAsset, Category, Settings, Transaction };

const DAY = 24 * 60 * 60 * 1000;

/** Open the local DB, apply migrations and add standard reference data on first launch. */
export function initBookkeeping(): void {
  initDatabase(seedInitialData);
}

// ---------------------------------------------------------------- settings

export async function getSettings(): Promise<Settings> {
  const row = db.select().from(schema.settings).where(eq(schema.settings.id, 'app')).get();
  if (!row) throw new Error('settings row missing: database was not seeded');
  return row;
}

export type SettingsPatch = Partial<Omit<Settings, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'syncStatus'>>;

export async function updateSettings(patch: SettingsPatch): Promise<Settings> {
  db.update(schema.settings)
    .set({ ...patch, updatedAt: Date.now(), syncStatus: 'pending' })
    .where(eq(schema.settings.id, 'app'))
    .run();
  emitChange();
  return getSettings();
}

export interface OnboardingAsset {
  kind: BusinessAsset['kind'];
  name: string;
  /** for kind = 'cash_bank': the bank / wallet this balance sits in (created if new) */
  bankName?: string;
  /** minor units */
  amount: number;
  currency: Currency;
}

export interface OnboardingFinancialEntry {
  section: 'balance_sheet' | 'income_statement';
  entryKey: string;
  amount: number;
  currency: Currency;
  asOf?: number;
  periodStart?: number;
  periodEnd?: number;
}

export interface OnboardingInput {
  startOption: 'new' | 'existing';
  profile: Partial<Pick<Settings, 'businessName' | 'businessIndustry' | 'registrationStatus' | 'registrationNumber' | 'startOperationDate' | 'ownerName' | 'location' | 'contact' | 'mainProducts'>>;
  /** opening balances entered on "1. Enter Business Assets" */
  assets?: OnboardingAsset[];
  financialEntries?: OnboardingFinancialEntry[];
  asOf?: number;
}

export async function completeOnboarding(input: OnboardingInput): Promise<void> {
  const now = Date.now();
  for (const a of input.assets ?? []) {
    if (a.amount <= 0) continue;
    let bankId: string | null = null;
    if (a.kind === 'cash_bank' && a.bankName) {
      let bank = db.select().from(schema.banks).where(and(eq(schema.banks.name, a.bankName), isNull(schema.banks.deletedAt))).get();
      if (!bank) {
        bank = { ...newRowMeta(now), name: a.bankName, kind: 'bank', logoKey: null };
        db.insert(schema.banks).values(bank).run();
      }
      bankId = bank.id;
    }
    db.insert(schema.businessAssets)
      .values({ ...newRowMeta(now), kind: a.kind, name: a.name, bankId, amount: a.amount, currency: a.currency, asOf: input.asOf ?? now })
      .run();
  }
  for (const entry of input.financialEntries ?? []) {
    db.insert(schema.onboardingFinancialEntries)
      .values({ ...newRowMeta(now), ...entry, asOf: entry.asOf ?? input.asOf ?? null, periodStart: entry.periodStart ?? null, periodEnd: entry.periodEnd ?? null })
      .run();
  }
  // A business starting fresh in Finext begins today; ratios start "after the first complete month" from here.
  const current = await getSettings();
  const startOperationDate = input.profile.startOperationDate ?? current.startOperationDate ?? (input.startOption === 'new' ? formatInputDate(now) : null);
  // The language picked on the launch screen becomes the account's language, so every device that signs in gets it.
  const language = await getLanguagePreference();
  await updateSettings({ ...input.profile, language, startOperationDate, startOption: input.startOption, onboardingStatus: 'completed' });
}

// ---------------------------------------------------------------- reference data

export async function listBanks(): Promise<Bank[]> {
  return db.select().from(schema.banks).where(isNull(schema.banks.deletedAt)).all();
}

export interface LoanOption {
  /** exactly the name the loan was recorded under; a repayment must carry it to match the loan */
  name: string;
  /** still to repay, in the display currency (minor units) */
  remaining: number;
  currency: Currency;
}

/** Loans received so far (not reversed), with what is still to repay, for the "Which loan?" list on a repayment. */
export async function listLoans(): Promise<LoanOption[]> {
  const s = await getSettings();
  const rows = allLive();
  const { reversed } = relations(rows);
  const loans = new Map<string, LoanOption>();
  const inDisplay = (r: Transaction, amount: number) => convertMinor(amount, r.currency, s.displayCurrency, r.exchangeRate);
  for (const r of rows) {
    if (r.typeId !== 'loan_received' || reversed.has(r.id)) continue;
    const meta = metaOf(r);
    const name = String(meta.lender ?? r.counterparty ?? '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const loan = loans.get(key) ?? { name, remaining: 0, currency: s.displayCurrency };
    loan.remaining += inDisplay(r, r.amount);
    loans.set(key, loan);
  }
  for (const r of rows) {
    if (r.typeId !== 'loan_repayment' || reversed.has(r.id)) continue;
    const loan = loans.get(String(metaOf(r).loanName ?? '').trim().toLowerCase());
    if (loan) loan.remaining -= inDisplay(r, r.amount - Number(metaOf(r).interest ?? 0));
  }
  return [...loans.values()];
}

export async function addBank(name: string, kind: Bank['kind'] = 'bank'): Promise<Bank> {
  const bank = { ...newRowMeta(), name: name.trim(), kind, logoKey: null };
  db.insert(schema.banks).values(bank).run();
  emitChange();
  return bank;
}

export async function listCategories(kind?: Category['kind']): Promise<Category[]> {
  const where = kind ? and(isNull(schema.categories.deletedAt), eq(schema.categories.kind, kind)) : isNull(schema.categories.deletedAt);
  return db.select().from(schema.categories).where(where).all();
}

export async function addCategory(name: string, kind: Category['kind'] = 'expense', icon = 'more'): Promise<Category> {
  const row = { ...newRowMeta(), name: name.trim(), icon, kind, builtIn: false, targetAmount: null, targetCurrency: null };
  db.insert(schema.categories).values(row).run();
  emitChange();
  return row;
}

/** Rename one of the user's own categories or goals (built-in ones keep their names). */
export async function renameCategory(id: string, name: string): Promise<void> {
  db.update(schema.categories)
    .set({ name: name.trim(), updatedAt: Date.now(), syncStatus: 'pending' })
    .where(and(eq(schema.categories.id, id), eq(schema.categories.builtIn, false)))
    .run();
  emitChange();
}

/** Delete one of the user's own categories or goals. Tagged entries are kept; lists still show the old name. */
export async function deleteCategory(id: string): Promise<void> {
  const now = Date.now();
  db.update(schema.categories)
    .set({ deletedAt: now, updatedAt: now, syncStatus: 'pending' })
    .where(and(eq(schema.categories.id, id), eq(schema.categories.builtIn, false)))
    .run();
  emitChange();
}

export interface CategorySpending {
  currency: Currency;
  thisMonth: number;
  lastMonth: number;
  /** Every entry tagged with the category, newest first. */
  entries: TransactionView[];
}

/** Spending tagged with a category this month and last month (display currency), and its entries. */
export async function getCategorySpending(categoryId: string): Promise<CategorySpending> {
  const s = await getSettings();
  const now = new Date();
  const thisStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
  const rows = allLive();
  const rel = relations(rows);
  let thisMonth = 0;
  let lastMonth = 0;
  for (const t of rows) {
    if (t.categoryId !== categoryId || t.direction !== 'out' || !countsAsIncomeOrSpend(t, rel)) continue;
    const v = convertMinor(t.amount, t.currency, s.displayCurrency, t.exchangeRate);
    if (t.occurredAt >= thisStart) thisMonth += v;
    else if (t.occurredAt >= lastStart) lastMonth += v;
  }
  return { currency: s.displayCurrency, thisMonth, lastMonth, entries: await searchTransactions({ categoryId }) };
}

// ---------------------------------------------------------------- savings goals

/** Marks the money account that holds savings (created on the first "Add to savings"). */
const SAVINGS_ACCOUNT = 'savings';

export interface SavingsGoal {
  id: string;
  name: string;
  icon: string;
  builtIn: boolean;
  /** Minor units in `currency`; null until the owner sets one. */
  targetAmount: number | null;
  currency: Currency;
  /** Total moved into savings for this goal, in `currency`. */
  saved: number;
}

/**
 * Goals with what has been saved for each. Putting money aside is a transfer into the Savings account tagged with
 * the goal: money moves between the business's own accounts, so profit and the statements are not affected.
 */
export async function listSavingsGoals(): Promise<SavingsGoal[]> {
  const s = await getSettings();
  const goals = await listCategories('savings');
  const rows = allLive();
  const rel = relations(rows);
  return goals.map((goal) => {
    const currency = (goal.targetCurrency ?? s.displayCurrency) as Currency;
    const saved = rows
      .filter((t) => t.categoryId === goal.id && t.typeId === 'transfer' && !rel.reversed.has(t.id))
      .reduce((sum, t) => sum + convertMinor(t.amount, t.currency, currency, t.exchangeRate), 0);
    return { id: goal.id, name: goal.name, icon: goal.icon, builtIn: goal.builtIn, targetAmount: goal.targetAmount ?? null, currency, saved };
  });
}

export async function setGoalTarget(id: string, targetMinor: number, currency: Currency): Promise<void> {
  db.update(schema.categories)
    .set({ targetAmount: Math.round(targetMinor), targetCurrency: currency, updatedAt: Date.now(), syncStatus: 'pending' })
    .where(eq(schema.categories.id, id))
    .run();
  emitChange();
}

function savingsAccount(): Bank {
  const existing = db.select().from(schema.banks)
    .where(and(isNull(schema.banks.deletedAt), eq(schema.banks.logoKey, SAVINGS_ACCOUNT)))
    .get();
  if (existing) return existing;
  const bank = { ...newRowMeta(), name: 'Savings', kind: 'bank' as const, logoKey: SAVINGS_ACCOUNT };
  db.insert(schema.banks).values(bank).run();
  return bank;
}

export interface SavingsDepositInput {
  goalId: string;
  amount: number; // positive minor units
  currency: Currency;
  /** The cash / bank / wallet account the money comes from. */
  fromBankId: string;
  title: string;
}

/** Put money aside for a goal: a transfer from the chosen account into the Savings account, tagged with the goal. */
export async function addToSavings(input: SavingsDepositInput): Promise<AddResult> {
  const account = savingsAccount();
  return addTransaction({
    typeId: 'transfer',
    amount: input.amount,
    currency: input.currency,
    payMethod: 'bank',
    bankId: input.fromBankId,
    toBankId: account.id,
    categoryId: input.goalId,
    title: input.title,
  });
}

export async function listBusinessAssets(): Promise<BusinessAsset[]> {
  return db.select().from(schema.businessAssets).where(isNull(schema.businessAssets.deletedAt)).all();
}

// ---------------------------------------------------------------- transactions (reads)

export interface TransactionView {
  id: string;
  title: string;
  typeId: string;
  direction: Direction;
  amount: number; // minor units, positive
  currency: Currency;
  /** signed for display: in = +, out = -, move = positive-neutral */
  signed: number;
  occurredAt: number;
  /** when the entry was recorded in the app (not the date it is for) */
  createdAt: number;
  categoryName: string | null;
  categoryIcon: string | null;
  payMethod: Transaction['payMethod'];
  counterparty: string | null;
  note: string | null;
  bankName: string | null;
  syncStatus: Transaction['syncStatus'];
  /** 'reversed' = cancelled by a reversal; 'reversal' / 'payment' / 'writeOff' = follow-up rows linked to another entry */
  status: 'reversed' | 'reversal' | 'payment' | 'writeOff' | null;
  /** pay-later entries only: amount still owed (0 once fully paid or written off) */
  openBalance: number | null;
  /** pay-later entries only: amount written off because the customer will not pay */
  writtenOff: number | null;
  /** how many evidence photos are attached */
  evidenceCount: number;
}

/** "Mark as paid" and "Reverse" (spec: Actions) are recorded as their own entries linked to the original. */
export const PAYMENT_TYPES = ['customer_payment', 'supplier_payment'] as const;
export const REVERSAL_TYPE = 'reversal';
/** "Write off unpaid amount" (spec: Actions): a customer will not pay. A bad-debt cost; no money moves. */
export const WRITE_OFF_TYPE = 'write_off';

function metaOf(t: Pick<Transaction, 'meta'>): Record<string, unknown> {
  try {
    return t.meta ? (JSON.parse(t.meta) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const isPayment = (t: Pick<Transaction, 'typeId'>) => (PAYMENT_TYPES as readonly string[]).includes(t.typeId);
/** Payments and write-offs: both reduce what is still owed on a pay-later entry. */
const isSettlement = (t: Pick<Transaction, 'typeId'>) => isPayment(t) || t.typeId === WRITE_OFF_TYPE;

/** Links between live entries: which are reversed, and how much has been paid against each pay-later entry. */
function relations(rows: Transaction[]) {
  const reversed = new Set<string>();
  for (const r of rows) if (r.typeId === REVERSAL_TYPE) reversed.add(String(metaOf(r).reversesId ?? ''));
  const paid = new Map<string, number>();
  const writtenOff = new Map<string, number>();
  for (const r of rows) {
    if (!isSettlement(r) || reversed.has(r.id)) continue;
    const settles = String(metaOf(r).settlesId ?? '');
    paid.set(settles, (paid.get(settles) ?? 0) + r.amount);
    if (r.typeId === WRITE_OFF_TYPE) writtenOff.set(settles, (writtenOff.get(settles) ?? 0) + r.amount);
  }
  return { reversed, paid, writtenOff, evidence: evidenceCounts() };
}
type Relations = ReturnType<typeof relations>;

/** Follow-up rows and cancelled entries are not new income or spending (the original was already counted). */
const countsAsIncomeOrSpend = (t: Transaction, rel: Relations) =>
  t.typeId !== REVERSAL_TYPE && !isPayment(t) && !rel.reversed.has(t.id);

function toView(
  t: Transaction,
  cats: Map<string, Category>,
  banks: Map<string, Bank>,
  rel?: Relations,
): TransactionView {
  const cat = t.categoryId ? cats.get(t.categoryId) : undefined;
  const reversed = rel?.reversed.has(t.id) ?? false;
  const owedOn = t.payMethod === 'later' && !reversed && t.typeId !== REVERSAL_TYPE && t.typeId !== WRITE_OFF_TYPE;
  return {
    id: t.id,
    title: t.title,
    typeId: t.typeId,
    direction: t.direction,
    amount: t.amount,
    currency: t.currency,
    signed: t.direction === 'out' ? -t.amount : t.amount,
    occurredAt: t.occurredAt,
    createdAt: t.createdAt,
    categoryName: cat?.name ?? null,
    categoryIcon: cat?.icon ?? null,
    payMethod: t.payMethod,
    counterparty: t.counterparty,
    note: t.note,
    bankName: t.bankId ? (banks.get(t.bankId)?.name ?? null) : null,
    syncStatus: t.syncStatus,
    status: reversed ? 'reversed' : t.typeId === REVERSAL_TYPE ? 'reversal' : isPayment(t) ? 'payment' : t.typeId === WRITE_OFF_TYPE ? 'writeOff' : null,
    openBalance: owedOn ? Math.max(0, t.amount - (rel?.paid.get(t.id) ?? 0)) : null,
    writtenOff: owedOn ? (rel?.writtenOff.get(t.id) ?? 0) : null,
    evidenceCount: rel?.evidence.get(t.id) ?? 0,
  };
}

function lookups() {
  const cats = new Map(db.select().from(schema.categories).all().map((c) => [c.id, c]));
  const banks = new Map(db.select().from(schema.banks).all().map((b) => [b.id, b]));
  const rel = relations(db.select().from(schema.transactions).where(isNull(schema.transactions.deletedAt)).all());
  return { cats, banks, rel };
}

const live = () => isNull(schema.transactions.deletedAt);

/** Live entries on or after a date: used to match imported bank statement rows (likely duplicates, the type used before). */
export async function listEntriesSince(since: number): Promise<Transaction[]> {
  return db.select().from(schema.transactions).where(and(live(), gte(schema.transactions.occurredAt, since))).all();
}

export async function listTransactions(opts: { limit?: number; offset?: number } = {}): Promise<TransactionView[]> {
  const { cats, banks, rel } = lookups();
  const q = db.select().from(schema.transactions).where(live()).orderBy(desc(schema.transactions.occurredAt));
  const rows = opts.limit ? q.limit(opts.limit).offset(opts.offset ?? 0).all() : q.all();
  return rows.map((r) => toView(r, cats, banks, rel));
}

export async function listTransactionsOnDate(date: Date): Promise<TransactionView[]> {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = start.getTime() + DAY - 1;
  const { cats, banks, rel } = lookups();
  return db
    .select()
    .from(schema.transactions)
    .where(and(live(), gte(schema.transactions.occurredAt, start.getTime()), lte(schema.transactions.occurredAt, end)))
    .orderBy(desc(schema.transactions.occurredAt))
    .all()
    .map((r) => toView(r, cats, banks, rel));
}

/** Days of the given month (0-based month) that have at least one transaction. */
export async function listActiveDays(year: number, month: number): Promise<number[]> {
  const start = new Date(year, month, 1).getTime();
  const end = new Date(year, month + 1, 1).getTime() - 1;
  const rows = db
    .select({ at: schema.transactions.occurredAt })
    .from(schema.transactions)
    .where(and(live(), gte(schema.transactions.occurredAt, start), lte(schema.transactions.occurredAt, end)))
    .all();
  return [...new Set(rows.map((r) => new Date(r.at).getDate()))];
}

export interface SearchQuery {
  text?: string;
  categoryId?: string | null;
  /** one entry type, e.g. 'product_sale' or 'rent' */
  typeId?: string | null;
  /** inclusive day */
  date?: Date | null;
  direction?: 'in' | 'out';
}

export async function searchTransactions(q: SearchQuery): Promise<TransactionView[]> {
  const conds = [live()];
  if (q.direction) conds.push(eq(schema.transactions.direction, q.direction));
  if (q.categoryId) conds.push(eq(schema.transactions.categoryId, q.categoryId));
  if (q.typeId) conds.push(eq(schema.transactions.typeId, q.typeId));
  if (q.text?.trim()) {
    const like$ = `%${q.text.trim()}%`;
    conds.push(or(like(schema.transactions.title, like$), like(schema.transactions.note, like$), like(schema.transactions.counterparty, like$))!);
  }
  if (q.date) {
    const start = new Date(q.date);
    start.setHours(0, 0, 0, 0);
    conds.push(gte(schema.transactions.occurredAt, start.getTime()), lte(schema.transactions.occurredAt, start.getTime() + DAY - 1));
  }
  const { cats, banks, rel } = lookups();
  return db
    .select()
    .from(schema.transactions)
    .where(and(...conds))
    .orderBy(desc(schema.transactions.occurredAt))
    .all()
    .map((r) => toView(r, cats, banks, rel));
}

// ---------------------------------------------------------------- local account picker data

function allLive(): Transaction[] {
  return db.select().from(schema.transactions).where(live()).all();
}

export interface AccountBalance {
  bankId: string;
  name: string;
  kind: Bank['kind'];
  byCurrency: Record<Currency, number>;
}

/** Balance of every cash / bank / wallet account in its own currencies (minor units). */
export async function getAccountBalances(): Promise<AccountBalance[]> {
  const banks = db.select().from(schema.banks).where(isNull(schema.banks.deletedAt)).all();
  const map = new Map<string, AccountBalance>(
    banks.map((b) => [b.id, { bankId: b.id, name: b.name, kind: b.kind, byCurrency: { KHR: 0, USD: 0 } }]),
  );
  const add = (id: string | null, currency: Currency, delta: number) => {
    if (id && map.has(id)) map.get(id)!.byCurrency[currency] += delta;
  };
  for (const a of db.select().from(schema.businessAssets).where(and(isNull(schema.businessAssets.deletedAt), eq(schema.businessAssets.kind, 'cash_bank'))).all()) {
    add(a.bankId, a.currency, a.amount);
  }
  for (const t of allLive()) {
    if (t.payMethod === 'later') continue; // not cash yet: sits in "owed to me" / "I owe"
    if (t.direction === 'in') add(t.bankId, t.currency, t.amount);
    else if (t.direction === 'out') add(t.bankId, t.currency, -t.amount);
    else {
      add(t.bankId, t.currency, -t.amount);
      add(t.toBankId, t.currency, t.amount);
    }
  }
  return [...map.values()];
}

/**
 * Cash and bank money over the last `days` days, from this device's books (works offline): one closing figure per day,
 * oldest first, ending today, plus how much it changed over the window. Same rule as the account balances: a
 * "pay later" entry is not cash yet, and moving money between accounts changes no total.
 */
export async function getCashTrend(days = 7): Promise<{ currency: Currency; today: number; change: number; points: number[] }> {
  const s = await getSettings();
  const currency = s.displayCurrency;
  const today = (await getAccountBalances()).reduce((sum, account) =>
    sum + convertMinor(account.byCurrency.KHR, 'KHR', currency, s.rateKhrPerUsd) + convertMinor(account.byCurrency.USD, 'USD', currency, s.rateKhrPerUsd), 0);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  // Day i closes at the end of (days - 1 - i) days ago; its figure is today's less everything that came after it.
  const dayEnds = Array.from({ length: days }, (_, i) => startOfToday.getTime() + (i - days + 2) * DAY);
  const windowStart = startOfToday.getTime() - (days - 1) * DAY;
  const after = new Array<number>(days).fill(0);
  let change = 0;
  for (const t of allLive()) {
    if (t.payMethod === 'later' || t.direction === 'move' || t.occurredAt < windowStart) continue;
    const v = convertMinor(t.amount, t.currency, currency, t.exchangeRate) * (t.direction === 'in' ? 1 : -1);
    change += v;
    dayEnds.forEach((end, i) => {
      if (t.occurredAt >= end) after[i] += v;
    });
  }
  return { currency, today, change, points: after.map((later) => today - later) };
}

export async function setBudgetTarget(targetMinor: number, currency: Currency): Promise<void> {
  const existing = db.select().from(schema.budgets).where(isNull(schema.budgets.deletedAt)).get();
  if (existing) {
    db.update(schema.budgets).set({ targetAmount: targetMinor, currency, updatedAt: Date.now(), syncStatus: 'pending' }).where(eq(schema.budgets.id, existing.id)).run();
  } else {
    db.insert(schema.budgets).values({ ...newRowMeta(), name: 'Expense budget', period: 'all', targetAmount: targetMinor, currency }).run();
  }
  emitChange();
}

export type RollingPeriod = 'daily' | 'weekly' | 'monthly';

/** Money in / money out over today, the last 7 days or the last 30 days, in the display currency. */
export async function getPeriodTotals(period: RollingPeriod): Promise<{ moneyIn: number; moneyOut: number; currency: Currency }> {
  const s = await getSettings();
  const now = Date.now();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const from = period === 'daily' ? startOfToday.getTime() : now - (period === 'weekly' ? 7 : 30) * DAY;
  let moneyIn = 0;
  let moneyOut = 0;
  const rows = allLive();
  const rel = relations(rows);
  for (const t of rows) {
    if (t.occurredAt < from || t.direction === 'move') continue;
    if (!countsAsIncomeOrSpend(t, rel)) continue; // the original entry was already counted
    const v = convertMinor(t.amount, t.currency, s.displayCurrency, t.exchangeRate);
    if (t.direction === 'in') moneyIn += v;
    else moneyOut += v;
  }
  return { moneyIn, moneyOut, currency: s.displayCurrency };
}

// ---------------------------------------------------------------- bookkeeping overview (grouped list for a month)

export interface OverviewGroup {
  groupId: GroupId;
  total: number; // signed, display currency
  entries: TransactionView[];
}

export async function getMonthOverview(year: number, month: number): Promise<{ currency: Currency; groups: OverviewGroup[] }> {
  return getMonthsOverview([year * 12 + month]);
}

/** The overview for one or several months (keys are year * 12 + month; they need not be next to each other). Totals add up across all of them. */
export async function getMonthsOverview(monthKeys: number[]): Promise<{ currency: Currency; groups: OverviewGroup[] }> {
  const s = await getSettings();
  const keys = new Set(monthKeys);
  const first = Math.min(...monthKeys);
  const last = Math.max(...monthKeys);
  const start = new Date(Math.floor(first / 12), first % 12, 1).getTime();
  const end = new Date(Math.floor(last / 12), (last % 12) + 1, 1).getTime() - 1;
  const { cats, banks, rel } = lookups();
  const rows = db
    .select()
    .from(schema.transactions)
    .where(and(live(), gte(schema.transactions.occurredAt, start), lte(schema.transactions.occurredAt, end)))
    .orderBy(desc(schema.transactions.occurredAt))
    .all();
  const groups = new Map<GroupId, OverviewGroup>();
  for (const r of rows) {
    const when = new Date(r.occurredAt);
    if (!keys.has(when.getFullYear() * 12 + when.getMonth())) continue; // a month between the chosen ones that was not chosen
    if (r.direction === 'move') continue; // transfers are not counted
    if (!countsAsIncomeOrSpend(r, rel)) continue; // payments, reversals and reversed entries
    const gid = (getEntryType(r.typeId)?.groupId ?? (r.direction === 'in' ? 'sales' : 'monthly')) as GroupId;
    const g = groups.get(gid) ?? { groupId: gid, total: 0, entries: [] };
    const v = toView(r, cats, banks, rel);
    g.entries.push(v);
    g.total += convertMinor(v.signed, v.currency, s.displayCurrency, r.exchangeRate);
    groups.set(gid, g);
  }
  return { currency: s.displayCurrency, groups: [...groups.values()] };
}

// ---------------------------------------------------------------- one entry: detail, mark as paid, reverse

export interface EntryDetail {
  entry: TransactionView;
  /** payments and write-offs recorded against this pay-later entry, oldest first */
  payments: TransactionView[];
  /** the entry that cancelled this one, if any */
  reversal: TransactionView | null;
  /** for a payment or reversal: the entry it belongs to */
  linked: TransactionView | null;
  /** i18n key explaining why Reverse is unavailable, or null when it is allowed */
  reverseBlocked: string | null;
  /** i18n key explaining why Edit is unavailable, or null when it is allowed */
  editBlocked: string | null;
  /** i18n key explaining why Delete is unavailable, or null when it is allowed */
  deleteBlocked: string | null;
  meta: Record<string, unknown>;
}

export async function getEntryDetail(id: string): Promise<EntryDetail | null> {
  const { cats, banks, rel } = lookups();
  const rows = allLive();
  const row = rows.find((r) => r.id === id);
  if (!row) return null;
  const view = (r: Transaction) => toView(r, cats, banks, rel);
  const meta = metaOf(row);
  const payments = rows.filter((r) => isSettlement(r) && metaOf(r).settlesId === id).sort((a, b) => a.occurredAt - b.occurredAt).map(view);
  const reversal = rows.find((r) => r.typeId === REVERSAL_TYPE && metaOf(r).reversesId === id);
  const linkedId = String(meta.settlesId ?? meta.reversesId ?? '');
  const linked = linkedId ? rows.find((r) => r.id === linkedId) : undefined;
  const reverseBlocked = row.typeId === REVERSAL_TYPE
    ? 'entry.reverseBlockedReversal'
    : rel.reversed.has(id)
      ? 'entry.reverseBlockedDone'
      : payments.some((p) => p.status !== 'reversed')
        ? 'entry.reverseBlockedPayments'
        : null;
  // Edit: not for payments, write-offs and reversals (delete them instead), loans (their schedule is built from the entry),
  // or an entry that already has payments against it (its amount could no longer cover them).
  const editBlocked = row.typeId === REVERSAL_TYPE || isSettlement(row) ? 'entry.editBlockedLinked'
    : row.typeId === 'loan_received' ? 'entry.editBlockedLoan'
    : rel.reversed.has(id) ? 'entry.reverseBlockedDone'
    : payments.length > 0 ? 'entry.editBlockedPayments'
    : null;
  // Delete: a loan that already has repayments recorded would leave those repayments with nothing to repay.
  const loanName = String(meta.lender ?? row.counterparty ?? '').trim().toLowerCase();
  const deleteBlocked = row.typeId === 'loan_received' && loanName
    && rows.some((r) => r.typeId === 'loan_repayment' && String(metaOf(r).loanName ?? '').trim().toLowerCase() === loanName)
    ? 'entry.deleteBlockedLoan' : null;
  return { entry: view(row), payments, reversal: reversal ? view(reversal) : null, linked: linked ? view(linked) : null, reverseBlocked, editBlocked, deleteBlocked, meta };
}

/** The stored entry and its details, to fill the form when editing. */
export async function getEntryForEdit(id: string): Promise<{ entry: Transaction; meta: Record<string, unknown> } | null> {
  const row = allLive().find((r) => r.id === id);
  return row ? { entry: row, meta: metaOf(row) } : null;
}

/**
 * Delete an entry completely, as if it had never been recorded. Payments and write-offs recorded against it, and any
 * reversal of it, go with it. Sync carries the deletion to the account.
 */
export async function deleteEntry(id: string): Promise<{ ok: true; removed: number } | { ok: false; error: string }> {
  const detail = await getEntryDetail(id);
  if (!detail) return { ok: false, error: 'entry.notFound' };
  if (detail.deleteBlocked) return { ok: false, error: detail.deleteBlocked };
  const rows = allLive();
  const doomed = new Set<string>([id]);
  // Everything that points at a doomed entry (its payments, write-offs, reversals) goes too, and so on.
  for (let grew = true; grew;) {
    grew = false;
    for (const r of rows) {
      if (doomed.has(r.id)) continue;
      const m = metaOf(r);
      if (doomed.has(String(m.settlesId ?? '')) || doomed.has(String(m.reversesId ?? ''))) {
        doomed.add(r.id);
        grew = true;
      }
    }
  }
  const now = Date.now();
  for (const rowId of doomed) {
    db.update(schema.transactions).set({ deletedAt: now, updatedAt: now, syncStatus: 'pending' }).where(eq(schema.transactions.id, rowId)).run();
    // Its receipt photos are stored only on this device: they go with it.
    for (const photo of await listEvidence(rowId)) await removeEvidence(photo.id);
  }
  emitChange();
  return { ok: true, removed: doomed.size };
}

/** Change an entry in place (same checks as a new one). The account's books are rebuilt from the changed entry when it syncs. */
export async function updateEntry(id: string, input: AddTransactionInput): Promise<AddResult> {
  const errors = validateTransaction(input);
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const detail = await getEntryDetail(id);
  if (!detail || detail.editBlocked) return { ok: false, errors: { amount: detail?.editBlocked ?? 'entry.notFound' } };
  const type = getEntryType(input.typeId)!;
  db.update(schema.transactions).set({
    title: input.title?.trim() || defaultTitle(input.typeId),
    typeId: input.typeId,
    direction: type.direction,
    groupId: type.groupId,
    amount: Math.round(input.amount),
    currency: input.currency,
    payMethod: input.payMethod,
    bankId: input.payMethod === 'later' ? null : (input.bankId ?? null),
    toBankId: type.direction === 'move' ? (input.toBankId ?? null) : null,
    categoryId: input.categoryId ?? null,
    counterparty: input.counterparty?.trim() || null,
    note: input.note?.trim() || null,
    occurredAt: input.occurredAt ?? detail.entry.occurredAt,
    reviewFlag: type.reviewFlag ?? false,
    meta: input.meta ? JSON.stringify(input.meta) : null,
    updatedAt: Date.now(),
    syncStatus: 'pending',
  }).where(eq(schema.transactions.id, id)).run();
  emitChange();
  return { ok: true, id };
}

export interface PaymentInput {
  entryId: string;
  amount: number; // minor units, in the original entry's currency
  payMethod: 'cash' | 'bank';
  bankId: string | null;
  title: string;
  occurredAt?: number;
}

/** Mark as paid (spec: Actions) — full or partial; never more than is still owed. */
export async function recordPayment(input: PaymentInput): Promise<AddResult> {
  const rows = allLive();
  const rel = relations(rows);
  const original = rows.find((r) => r.id === input.entryId);
  if (!original || original.payMethod !== 'later' || rel.reversed.has(original.id) || original.typeId === REVERSAL_TYPE) {
    return { ok: false, errors: { amount: 'error.cannotPay' } };
  }
  const stillOwed = original.amount - (rel.paid.get(original.id) ?? 0);
  const errors: ValidationErrors = {};
  if (!(input.amount > 0)) errors.amount = 'error.amountPositive';
  else if (input.amount > stillOwed) errors.amount = 'error.payMoreThanOwed';
  if (!input.bankId) errors.bank = 'error.required';
  if (input.occurredAt && input.occurredAt > Date.now() + DAY) errors.date = 'error.futureDate';
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const row = {
    ...newRowMeta(),
    title: input.title,
    typeId: original.direction === 'in' ? 'customer_payment' : 'supplier_payment',
    direction: original.direction,
    groupId: null,
    amount: Math.round(input.amount),
    currency: original.currency,
    exchangeRate: original.exchangeRate,
    payMethod: input.payMethod,
    bankId: input.bankId,
    toBankId: null,
    categoryId: null,
    counterparty: original.counterparty,
    note: null,
    occurredAt: input.occurredAt ?? Date.now(),
    reviewFlag: false,
    meta: JSON.stringify({ settlesId: original.id }),
  };
  db.insert(schema.transactions).values(row).run();
  emitChange();
  return { ok: true, id: row.id };
}

export interface WriteOffInput {
  entryId: string;
  amount: number; // minor units, in the original entry's currency
  note: string;
  title: string;
}

/** Write off unpaid amount (spec: Actions) — a customer will not pay. Posts a bad-debt cost; note required. */
export async function recordWriteOff(input: WriteOffInput): Promise<AddResult> {
  const rows = allLive();
  const rel = relations(rows);
  const original = rows.find((r) => r.id === input.entryId);
  if (!original || original.payMethod !== 'later' || original.direction !== 'in' || rel.reversed.has(original.id) || isSettlement(original) || original.typeId === REVERSAL_TYPE) {
    return { ok: false, errors: { amount: 'error.cannotWriteOff' } };
  }
  const stillOwed = original.amount - (rel.paid.get(original.id) ?? 0);
  const errors: ValidationErrors = {};
  if (!(input.amount > 0)) errors.amount = 'error.amountPositive';
  else if (input.amount > stillOwed) errors.amount = 'error.payMoreThanOwed';
  if (!input.note.trim()) errors.note = 'error.required';
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const row = {
    ...newRowMeta(),
    title: input.title,
    typeId: WRITE_OFF_TYPE,
    direction: 'out' as Direction,
    groupId: null,
    amount: Math.round(input.amount),
    currency: original.currency,
    exchangeRate: original.exchangeRate,
    payMethod: 'later' as const, // no money moves: it clears part of what the customer owed
    bankId: null,
    toBankId: null,
    categoryId: null,
    counterparty: original.counterparty,
    note: input.note.trim(),
    occurredAt: Date.now(),
    reviewFlag: true,
    meta: JSON.stringify({ settlesId: original.id }),
  };
  db.insert(schema.transactions).values(row).run();
  emitChange();
  return { ok: true, id: row.id };
}

/** Reverse (spec: Actions) — a new entry that swaps every debit and credit; the original is never edited. */
export async function reverseEntry(id: string, title: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const detail = await getEntryDetail(id);
  if (!detail) return { ok: false, error: 'error.cannotReverse' };
  if (detail.reverseBlocked) return { ok: false, error: detail.reverseBlocked };
  const original = allLive().find((r) => r.id === id)!;
  const isMove = original.direction === 'move';
  const row = {
    ...newRowMeta(),
    title,
    typeId: REVERSAL_TYPE,
    direction: (original.direction === 'in' ? 'out' : original.direction === 'out' ? 'in' : 'move') as Direction,
    groupId: original.groupId,
    amount: original.amount,
    currency: original.currency,
    exchangeRate: original.exchangeRate,
    payMethod: original.payMethod,
    // Money goes back where it came from: a reversed transfer moves from the old destination to the old source.
    bankId: isMove ? original.toBankId : original.bankId,
    toBankId: isMove ? original.bankId : null,
    categoryId: original.categoryId,
    counterparty: original.counterparty,
    note: null,
    occurredAt: Date.now(),
    reviewFlag: false,
    meta: JSON.stringify({
      reversesId: original.id,
      // A copy of the original, so the server can post the reversal on its own.
      reverses: {
        typeId: original.typeId, direction: original.direction, amount: original.amount, currency: original.currency,
        payMethod: original.payMethod, bankId: original.bankId, toBankId: original.toBankId,
        counterparty: original.counterparty, note: original.note, meta: original.meta ? metaOf(original) : null,
      },
    }),
  };
  db.insert(schema.transactions).values(row).run();
  emitChange();
  return { ok: true, id: row.id };
}

// ---------------------------------------------------------------- transactions (writes)

export interface AddTransactionInput {
  typeId: string;
  amount: number; // positive minor units
  currency: Currency;
  payMethod: 'cash' | 'bank' | 'later';
  bankId?: string | null; // account used (cash / bank); source account for moves
  toBankId?: string | null;
  categoryId?: string | null;
  title?: string;
  counterparty?: string;
  note?: string;
  occurredAt?: number;
  meta?: {
    /** filled from the average of recorded days for a day the owner did not record (services/missedDays) */
    estimated?: boolean;
    basedOnDays?: number;
    cost?: number;
    lender?: string;
    lenderType?: 'bank_mfi' | 'informal';
    termMonths?: number;
    assetName?: string;
    usefulLifeYears?: number;
    loanName?: string;
    interest?: number;
    installmentAmount?: number;
    repaymentFrequency?: 'weekly' | 'monthly';
    annualInterestRate?: number;
    rateType?: 'flat' | 'declining';
    firstDueDate?: number;
    /** pay-later entries: days until payment is due */
    termsDays?: number;
  };
}

export type ValidationErrors = Partial<Record<'amount' | 'bank' | 'toBank' | 'counterparty' | 'note' | 'payMethod' | 'assetName' | 'usefulLife' | 'lender' | 'loanName' | 'interest' | 'date' | 'term' | 'rate' | 'rateType' | 'firstDue', string>>;

export type AddResult = { ok: true; id: string } | { ok: false; errors: ValidationErrors };

/** Validation rules from FINEXT_APP_MODULES_AND_FLOWS §3.8. Returns i18n keys under `error.`. */
export function validateTransaction(input: AddTransactionInput): ValidationErrors {
  const e: ValidationErrors = {};
  const type = getEntryType(input.typeId);
  if (!type) return { amount: 'error.unknownType' };
  if (!(input.amount > 0)) e.amount = 'error.amountPositive';
  if (input.payMethod === 'later' && !type.allowsPayLater) e.payMethod = 'error.payLaterNotAllowed';
  if (input.payMethod === 'later' && !input.counterparty?.trim()) e.counterparty = 'error.partyRequired';
  if (type.extraFields.includes('noteRequired') && !input.note?.trim()) e.note = 'error.noteRequired';
  if (type.extraFields.includes('assetName') && !input.meta?.assetName?.trim()) e.assetName = 'error.required';
  if (type.extraFields.includes('usefulLife') && !(input.meta?.usefulLifeYears && input.meta.usefulLifeYears > 0)) e.usefulLife = 'error.required';
  if (type.extraFields.includes('lender') && !input.meta?.lender?.trim()) e.lender = 'error.required';
  if (type.extraFields.includes('loanName') && !input.meta?.loanName?.trim()) e.loanName = 'error.required';
  if (input.typeId === 'loan_repayment' && (input.meta?.interest ?? 0) > input.amount) e.interest = 'error.interestTooHigh';
  if (type.extraFields.includes('term')) {
    const term = input.meta?.termMonths ?? 0;
    if (!(Number.isInteger(term) && term >= 1 && term <= 360)) e.term = 'error.termMonths';
  }
  if (type.extraFields.includes('repaymentSchedule')) {
    // AI pipeline spec: rate, rate type and first due date are required so repayments can be scheduled.
    const rate = input.meta?.annualInterestRate;
    if (rate === undefined || !(rate >= 0 && rate <= 100)) e.rate = 'error.interestRate';
    if (!input.meta?.rateType) e.rateType = 'error.required';
    const firstDue = input.meta?.firstDueDate;
    if (!firstDue) e.firstDue = 'error.required';
    else if (firstDue < (input.occurredAt ?? Date.now()) - DAY) e.firstDue = 'error.firstDueBeforeLoan';
  }
  if (type.direction === 'move') {
    if (!input.bankId) e.bank = 'error.required';
    if (!input.toBankId) e.toBank = 'error.required';
    if (input.bankId && input.bankId === input.toBankId) e.toBank = 'error.sameAccount';
  } else if (input.payMethod !== 'later' && !input.bankId) {
    e.bank = 'error.required';
  }
  if (input.occurredAt && input.occurredAt > Date.now() + DAY) e.date = 'error.futureDate';
  return e;
}

export async function addTransaction(input: AddTransactionInput): Promise<AddResult> {
  const errors = validateTransaction(input);
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const type = getEntryType(input.typeId)!;
  const settings = await getSettings();
  const row = {
    ...newRowMeta(),
    title: input.title?.trim() || defaultTitle(input.typeId),
    typeId: input.typeId,
    direction: type.direction,
    groupId: type.groupId,
    amount: Math.round(input.amount),
    currency: input.currency,
    exchangeRate: settings.rateKhrPerUsd,
    payMethod: input.payMethod,
    bankId: input.payMethod === 'later' ? null : (input.bankId ?? null),
    toBankId: type.direction === 'move' ? (input.toBankId ?? null) : null,
    categoryId: input.categoryId ?? null,
    counterparty: input.counterparty?.trim() || null,
    note: input.note?.trim() || null,
    occurredAt: input.occurredAt ?? Date.now(),
    reviewFlag: type.reviewFlag ?? false,
    meta: input.meta ? JSON.stringify(input.meta) : null,
  };
  db.insert(schema.transactions).values(row).run();
  emitChange();
  return { ok: true, id: row.id };
}

/** Fallback row title: the type id in Title Case. The entry form passes a localised title instead. */
function defaultTitle(typeId: string): string {
  const s = typeId.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Erase everything on this device (entries, accounts, photos, settings) and set up a fresh, empty ledger.
 * Used when a different account takes over a device that still holds another account's data.
 */
export async function resetLocalData(): Promise<void> {
  db.delete(schema.entryAttachments).run();
  db.delete(schema.transactions).run();
  db.delete(schema.businessAssets).run();
  db.delete(schema.budgets).run();
  db.delete(schema.onboardingFinancialEntries).run();
  db.delete(schema.categories).run();
  db.delete(schema.banks).run();
  db.delete(schema.settings).run();
  seedInitialData(Date.now());
  emitChange();
}

/** The business currency can be switched only while nothing is recorded in it: no entries, opening balances, budgets or figures. */
export async function canChangeCurrency(): Promise<boolean> {
  const t = schema;
  return (
    db.select({ id: t.transactions.id }).from(t.transactions).where(isNull(t.transactions.deletedAt)).limit(1).all().length === 0 &&
    db.select({ id: t.businessAssets.id }).from(t.businessAssets).where(isNull(t.businessAssets.deletedAt)).limit(1).all().length === 0 &&
    db.select({ id: t.budgets.id }).from(t.budgets).where(isNull(t.budgets.deletedAt)).limit(1).all().length === 0 &&
    db.select({ id: t.onboardingFinancialEntries.id }).from(t.onboardingFinancialEntries).where(isNull(t.onboardingFinancialEntries.deletedAt)).limit(1).all().length === 0
  );
}

// ---------------------------------------------------------------- dev helpers
/**
 * Whether this device holds changes the server has not received. The starting rows every device creates (never edited,
 * updatedAt 0) do not count: they are placeholders, not the owner's work.
 */
export async function hasUnsyncedWork(): Promise<boolean> {
  const tables = [schema.banks, schema.categories, schema.transactions, schema.businessAssets, schema.budgets, schema.onboardingFinancialEntries, schema.settings];
  return tables.some((table) =>
    db.select({ id: table.id }).from(table).where(and(eq(table.syncStatus, 'pending'), gt(table.updatedAt, STARTING_ROW_UPDATED_AT))).limit(1).all().length > 0);
}

export async function countPendingSync(): Promise<number> {
  return (
    db.select().from(schema.banks).where(eq(schema.banks.syncStatus, 'pending')).all().length +
    db.select().from(schema.categories).where(eq(schema.categories.syncStatus, 'pending')).all().length +
    db.select().from(schema.transactions).where(eq(schema.transactions.syncStatus, 'pending')).all().length +
    db.select().from(schema.businessAssets).where(eq(schema.businessAssets.syncStatus, 'pending')).all().length +
    db.select().from(schema.budgets).where(eq(schema.budgets.syncStatus, 'pending')).all().length +
    db.select().from(schema.onboardingFinancialEntries).where(eq(schema.onboardingFinancialEntries.syncStatus, 'pending')).all().length +
    db.select().from(schema.settings).where(eq(schema.settings.syncStatus, 'pending')).all().length
  );
}
