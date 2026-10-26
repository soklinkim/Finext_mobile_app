/**
 * Bookkeeping entry service — offline-first. Entries are collected and queued locally;
 * authoritative accounting totals and reports are calculated by the backend. UI code
 * must go through this module and never import `@/db` directly.
 */
import { and, desc, eq, gte, isNull, lte, like, or } from 'drizzle-orm';
import { db, initDatabase, newRowMeta, schema } from '@/db/client';
import { seedInitialData } from '@/db/seed';
import { formatInputDate } from '@/lib/format';
import type { Bank, BusinessAsset, Category, Settings, Transaction } from '@/db/schema';
import { emitChange } from './events';
import { getEntryType, type Direction, type GroupId } from './entryTypes';
import { convertMinor, type Currency } from './money';

export * from './entryTypes';
export * from './money';
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
  await updateSettings({ ...input.profile, startOperationDate, startOption: input.startOption, onboardingStatus: 'completed' });
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
  /** 'reversed' = cancelled by a reversal; 'reversal' / 'payment' / 'writeOff' = follow-up rows linked to another entry */
  status: 'reversed' | 'reversal' | 'payment' | 'writeOff' | null;
  /** pay-later entries only: amount still owed (0 once fully paid or written off) */
  openBalance: number | null;
  /** pay-later entries only: amount written off because the customer will not pay */
  writtenOff: number | null;
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
  return { reversed, paid, writtenOff };
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
  };
}

function lookups() {
  const cats = new Map(db.select().from(schema.categories).all().map((c) => [c.id, c]));
  const banks = new Map(db.select().from(schema.banks).all().map((b) => [b.id, b]));
  const rel = relations(db.select().from(schema.transactions).where(isNull(schema.transactions.deletedAt)).all());
  return { cats, banks, rel };
}

const live = () => isNull(schema.transactions.deletedAt);

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

/** Food & groceries spend over the last 7 days (Quick Analysis "Food Last Week"), display currency, positive. */
export async function getFoodSpendLastWeek(): Promise<{ amount: number; currency: Currency }> {
  const s = await getSettings();
  const from = Date.now() - 7 * DAY;
  const cats = new Map(db.select().from(schema.categories).all().map((c) => [c.id, c]));
  let amount = 0;
  const rows = allLive();
  const rel = relations(rows);
  for (const t of rows) {
    if (t.direction !== 'out' || t.occurredAt < from || !t.categoryId || !countsAsIncomeOrSpend(t, rel)) continue;
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
  const { cats, banks, rel } = lookups();
  const rows = db
    .select()
    .from(schema.transactions)
    .where(and(live(), gte(schema.transactions.occurredAt, start), lte(schema.transactions.occurredAt, end)))
    .orderBy(desc(schema.transactions.occurredAt))
    .all();
  const groups = new Map<GroupId, OverviewGroup>();
  for (const r of rows) {
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
  return { entry: view(row), payments, reversal: reversal ? view(reversal) : null, linked: linked ? view(linked) : null, reverseBlocked, meta };
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
