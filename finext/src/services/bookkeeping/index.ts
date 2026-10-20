/**
 * Bookkeeping service — OFFLINE. Every read and write goes to the local SQLite DB.
 * Balances and expense totals are computed here on the device; nothing in this file
 * touches the network. UI code (screens, hooks, components) must go through this module
 * and never import `@/db` directly.
 */
import { and, desc, eq, gte, isNull, lte, like, or } from 'drizzle-orm';
import { db, initDatabase, newRowMeta, schema } from '@/db/client';
import { resetDemoData as resetDb, seedDemoData } from '@/db/seed';
import type { Bank, BusinessAsset, Category, Settings, Transaction } from '@/db/schema';
import { emitChange } from './events';
import { getEntryType, type Direction, type GroupId, type ImpactKind } from './entryTypes';
import { convertMinor, type Currency } from './money';

export * from './entryTypes';
export * from './money';
export { subscribeToChanges } from './events';
export type { Bank, BusinessAsset, Category, Settings, Transaction };

const DAY = 24 * 60 * 60 * 1000;
const ESTIMATED_COGS_RATIO = 0.67; // FINEXT_FINANCE_RULES Q4: 33% benchmark gross margin until there is history

/** Open the local DB, apply migrations and seed the demo data on first launch. Call once at startup. */
export function initBookkeeping(): void {
  initDatabase(seedDemoData);
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

export interface OnboardingInput {
  startOption: 'new' | 'existing';
  profile: Partial<Pick<Settings, 'businessName' | 'businessIndustry' | 'registrationStatus' | 'registrationNumber' | 'startOperationDate' | 'ownerName' | 'location' | 'contact' | 'mainProducts'>>;
  /** opening balances entered on "1. Enter Business Assets" */
  assets?: OnboardingAsset[];
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
  await updateSettings({ ...input.profile, startOption: input.startOption, onboardingStatus: 'completed' });
}

// ---------------------------------------------------------------- reference data

export async function listBanks(): Promise<Bank[]> {
  return db.select().from(schema.banks).where(isNull(schema.banks.deletedAt)).all();
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
  const row = { ...newRowMeta(), name: name.trim(), icon, kind, builtIn: false };
  db.insert(schema.categories).values(row).run();
  emitChange();
  return row;
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
  categoryName: string | null;
  categoryIcon: string | null;
  payMethod: Transaction['payMethod'];
  counterparty: string | null;
  note: string | null;
  bankName: string | null;
  syncStatus: Transaction['syncStatus'];
}

function toView(
  t: Transaction,
  cats: Map<string, Category>,
  banks: Map<string, Bank>,
): TransactionView {
  const cat = t.categoryId ? cats.get(t.categoryId) : undefined;
  return {
    id: t.id,
    title: t.title,
    typeId: t.typeId,
    direction: t.direction,
    amount: t.amount,
    currency: t.currency,
    signed: t.direction === 'out' ? -t.amount : t.amount,
    occurredAt: t.occurredAt,
    categoryName: cat?.name ?? null,
    categoryIcon: cat?.icon ?? null,
    payMethod: t.payMethod,
    counterparty: t.counterparty,
    note: t.note,
    bankName: t.bankId ? (banks.get(t.bankId)?.name ?? null) : null,
    syncStatus: t.syncStatus,
  };
}

function lookups() {
  const cats = new Map(db.select().from(schema.categories).all().map((c) => [c.id, c]));
  const banks = new Map(db.select().from(schema.banks).all().map((b) => [b.id, b]));
  return { cats, banks };
}

const live = () => isNull(schema.transactions.deletedAt);

export async function listTransactions(opts: { limit?: number; offset?: number } = {}): Promise<TransactionView[]> {
  const { cats, banks } = lookups();
  const q = db.select().from(schema.transactions).where(live()).orderBy(desc(schema.transactions.occurredAt));
  const rows = opts.limit ? q.limit(opts.limit).offset(opts.offset ?? 0).all() : q.all();
  return rows.map((r) => toView(r, cats, banks));
}

export async function listTransactionsOnDate(date: Date): Promise<TransactionView[]> {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = start.getTime() + DAY - 1;
  const { cats, banks } = lookups();
  return db
    .select()
    .from(schema.transactions)
    .where(and(live(), gte(schema.transactions.occurredAt, start.getTime()), lte(schema.transactions.occurredAt, end)))
    .orderBy(desc(schema.transactions.occurredAt))
    .all()
    .map((r) => toView(r, cats, banks));
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
  /** inclusive day */
  date?: Date | null;
  direction?: 'in' | 'out';
}

export async function searchTransactions(q: SearchQuery): Promise<TransactionView[]> {
  const conds = [live()];
  if (q.direction) conds.push(eq(schema.transactions.direction, q.direction));
  if (q.categoryId) conds.push(eq(schema.transactions.categoryId, q.categoryId));
  if (q.text?.trim()) {
    const like$ = `%${q.text.trim()}%`;
    conds.push(or(like(schema.transactions.title, like$), like(schema.transactions.note, like$), like(schema.transactions.counterparty, like$))!);
  }
  if (q.date) {
    const start = new Date(q.date);
    start.setHours(0, 0, 0, 0);
    conds.push(gte(schema.transactions.occurredAt, start.getTime()), lte(schema.transactions.occurredAt, start.getTime() + DAY - 1));
  }
  const { cats, banks } = lookups();
  return db
    .select()
    .from(schema.transactions)
    .where(and(...conds))
    .orderBy(desc(schema.transactions.occurredAt))
    .all()
    .map((r) => toView(r, cats, banks));
}

// ---------------------------------------------------------------- computed numbers (local)

function metaOf(t: Transaction): Record<string, unknown> {
  try {
    return t.meta ? (JSON.parse(t.meta) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Amount of this transaction that counts as an expense for profit (minor units, in the tx currency). §8.5 */
function expenseAmount(t: Transaction): number {
  const type = getEntryType(t.typeId);
  if (!type) return 0;
  if (t.typeId === 'loan_repayment') return Number(metaOf(t).interest ?? 0); // only the interest part
  if (t.typeId === 'product_sale') return Number(metaOf(t).cost ?? Math.round(t.amount * ESTIMATED_COGS_RATIO)); // COGS posts with every sale
  return type.countsAsExpense ? t.amount : 0;
}

function incomeAmount(t: Transaction): number {
  return getEntryType(t.typeId)?.countsAsIncome ? t.amount : 0;
}

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

export type BudgetStatus = 'ok' | 'warning' | 'danger';

export interface Summary {
  displayCurrency: Currency;
  totalBalance: number;
  totalExpense: number; // positive minor units; UI prefixes "-"
  totalIncome: number;
  budgetTarget: number;
  budgetPercent: number; // 0..100+, rounded
  budgetStatus: BudgetStatus; // warning ≥70%, danger ≥100% (§6.3)
}

export async function getSummary(): Promise<Summary> {
  const s = await getSettings();
  const cur = s.displayCurrency;
  const conv = (n: number, from: Currency, rate = s.rateKhrPerUsd) => convertMinor(n, from, cur, rate);

  let totalBalance = 0;
  for (const acc of await getAccountBalances()) {
    totalBalance += conv(acc.byCurrency.USD, 'USD') + conv(acc.byCurrency.KHR, 'KHR');
  }
  let totalExpense = 0;
  let totalIncome = 0;
  for (const t of allLive()) {
    totalExpense += conv(expenseAmount(t), t.currency, t.exchangeRate);
    totalIncome += conv(incomeAmount(t), t.currency, t.exchangeRate);
  }
  const budget = db.select().from(schema.budgets).where(isNull(schema.budgets.deletedAt)).get();
  const budgetTarget = budget ? conv(budget.targetAmount, budget.currency) : 0;
  const budgetPercent = budgetTarget > 0 ? Math.round((totalExpense / budgetTarget) * 100) : 0;
  const budgetStatus: BudgetStatus = budgetPercent >= 100 ? 'danger' : budgetPercent >= 70 ? 'warning' : 'ok';
  return { displayCurrency: cur, totalBalance, totalExpense, totalIncome, budgetTarget, budgetPercent, budgetStatus };
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
  for (const t of allLive()) {
    if (t.occurredAt < from || t.direction === 'move') continue;
    const v = convertMinor(t.amount, t.currency, s.displayCurrency, t.exchangeRate);
    if (t.direction === 'in') moneyIn += v;
    else moneyOut += v;
  }
  return { moneyIn, moneyOut, currency: s.displayCurrency };
}

/** Food & groceries spend over the last 7 days (Quick Analysis "Food Last Week"), display currency, positive. */
export async function getFoodSpendLastWeek(): Promise<{ amount: number; currency: Currency }> {
  const s = await getSettings();
  const from = Date.now() - 7 * DAY;
  const cats = new Map(db.select().from(schema.categories).all().map((c) => [c.id, c]));
  let amount = 0;
  for (const t of allLive()) {
    if (t.direction !== 'out' || t.occurredAt < from || !t.categoryId) continue;
    const name = cats.get(t.categoryId)?.name;
    if (name === 'Food' || name === 'Groceries') amount += convertMinor(t.amount, t.currency, s.displayCurrency, t.exchangeRate);
  }
  return { amount, currency: s.displayCurrency };
}

// ---------------------------------------------------------------- bookkeeping overview (grouped list for a month)

export interface OverviewGroup {
  groupId: GroupId;
  total: number; // signed, display currency
  entries: TransactionView[];
}

export async function getMonthOverview(year: number, month: number): Promise<{ currency: Currency; groups: OverviewGroup[] }> {
  const s = await getSettings();
  const start = new Date(year, month, 1).getTime();
  const end = new Date(year, month + 1, 1).getTime() - 1;
  const { cats, banks } = lookups();
  const rows = db
    .select()
    .from(schema.transactions)
    .where(and(live(), gte(schema.transactions.occurredAt, start), lte(schema.transactions.occurredAt, end)))
    .orderBy(desc(schema.transactions.occurredAt))
    .all();
  const groups = new Map<GroupId, OverviewGroup>();
  for (const r of rows) {
    if (r.direction === 'move') continue; // transfers are not counted
    const gid = (getEntryType(r.typeId)?.groupId ?? (r.direction === 'in' ? 'sales' : 'monthly')) as GroupId;
    const g = groups.get(gid) ?? { groupId: gid, total: 0, entries: [] };
    const v = toView(r, cats, banks);
    g.entries.push(v);
    g.total += convertMinor(v.signed, v.currency, s.displayCurrency, r.exchangeRate);
    groups.set(gid, g);
  }
  return { currency: s.displayCurrency, groups: [...groups.values()] };
}

// ---------------------------------------------------------------- impact preview (entry footer strip, §6.24)

export interface Impact {
  kind: ImpactKind;
  /** signed minor units shown at the right of the strip; 0 for "no profit effect" */
  value: number;
  currency: Currency;
  tone: 'success' | 'alert' | 'neutral';
}

export function previewImpact(typeId: string, amount: number, currency: Currency, interest = 0): Impact {
  const type = getEntryType(typeId);
  const kind = type?.impact ?? 'cost';
  switch (kind) {
    case 'sales':
    case 'other_income':
      return { kind, value: amount, currency, tone: 'success' };
    case 'cost':
      return { kind, value: -amount, currency, tone: 'alert' };
    case 'loan_out':
      return { kind, value: -interest, currency, tone: 'alert' };
    case 'loan_in':
    case 'deposit':
    case 'capital':
    case 'move':
      return { kind, value: amount, currency, tone: 'neutral' };
    default:
      return { kind, value: 0, currency, tone: 'neutral' }; // stock, equipment, owner: profit $0
  }
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
    cost?: number;
    lender?: string;
    lenderType?: 'bank_mfi' | 'informal';
    termMonths?: number;
    assetName?: string;
    usefulLifeYears?: number;
    loanName?: string;
    interest?: number;
  };
}

export type ValidationErrors = Partial<Record<'amount' | 'bank' | 'toBank' | 'counterparty' | 'note' | 'payMethod' | 'assetName' | 'usefulLife' | 'lender' | 'interest' | 'date', string>>;

export type AddResult = { ok: true; id: string } | { ok: false; errors: ValidationErrors };

/** Validation rules from FINEXT_APP_MODULES_AND_FLOWS §3.8. Returns i18n keys under `error.`. */
export function validateTransaction(input: AddTransactionInput): ValidationErrors {
  const e: ValidationErrors = {};
  const type = getEntryType(input.typeId);
  if (!type) return { amount: 'error.unknownType' };
  if (!(input.amount > 0)) e.amount = 'error.amountPositive';
  if (input.payMethod === 'later' && !type.allowsPayLater) e.payMethod = 'error.payLaterNotAllowed';
  if (input.payMethod === 'later' && !input.counterparty?.trim()) e.counterparty = 'error.partyRequired';
  if (type.extraFields.includes('customerRequired') && !input.counterparty?.trim()) e.counterparty = 'error.partyRequired';
  if (type.extraFields.includes('noteRequired') && !input.note?.trim()) e.note = 'error.noteRequired';
  if (type.extraFields.includes('assetName') && !input.meta?.assetName?.trim()) e.assetName = 'error.required';
  if (type.extraFields.includes('usefulLife') && !(input.meta?.usefulLifeYears && input.meta.usefulLifeYears > 0)) e.usefulLife = 'error.required';
  if (type.extraFields.includes('lender') && !input.meta?.lender?.trim()) e.lender = 'error.required';
  if (input.typeId === 'loan_repayment' && (input.meta?.interest ?? 0) > input.amount) e.interest = 'error.interestTooHigh';
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

// ---------------------------------------------------------------- dev helpers

export async function resetDemoData(): Promise<void> {
  resetDb();
  emitChange();
}

export async function countPendingSync(): Promise<number> {
  return allLive().filter((t) => t.syncStatus === 'pending').length;
}
