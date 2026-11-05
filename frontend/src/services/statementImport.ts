/**
 * Bank statement import. The server reads the PDF (ONLINE only, nothing stored); the owner reviews every row here and
 * only the rows they keep become ordinary entries, created offline-first like any other.
 *
 * No entry type is guessed: a bank's description (a name, a reference number) says little about what the payment was
 * for, and a wrong guess would put it in the wrong place in the owner's statements. Every row starts without a type and
 * the owner chooses one for each before anything is added. Keywords are used only to warn about rows that need a
 * decision (cash deposits and ATM withdrawals, which may be moves between the bank and Cash, and loans, which are left
 * for the Add entry form), never to fill in the type.
 */
import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { ApiRequestError } from '@/services/analysis/types';
import { addTransaction, listEntriesSince, type Bank, type Currency, type Transaction } from '@/services/bookkeeping';
import type { UploadAsset } from '@/services/documents';
import { authorizedFetch } from '@/services/sync';

export const STATEMENT_MAX_BYTES = 10 * 1024 * 1024;
/** Notes on imported entries start with this, so a later import can recognise them and learn their types. */
export const IMPORT_NOTE = 'Bank statement: ';
const DAY = 24 * 60 * 60 * 1000;

export interface StatementRow {
  index: number;
  date: string; // YYYY-MM-DD
  description: string;
  direction: 'in' | 'out';
  amount: number; // in the statement's currency, major units
  balance: number | null;
  currency: Currency | null;
}

export interface StatementRead {
  bank: string | null;
  account: string | null; // last four digits only
  period: string | null;
  currency: Currency | null;
  openingBalance: number | null;
  /** the statement's ending balance (its printed one, else the last row's running balance) */
  closingBalance: number | null;
  /** the statement's own printed totals, else what its rows add up to */
  totalIn: number | null;
  totalOut: number | null;
  pages: number;
  rows: StatementRow[];
  checks: { name: string; passed: boolean; detail: string }[];
  notes: string[];
}

/** Why a statement could not be read; the screen says it in the owner's language. */
export class StatementImportError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

/** Open the file picker for a statement PDF; null if cancelled. Call it straight from a tap: browsers block pickers otherwise. */
export async function pickStatementFile(): Promise<UploadAsset | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf'], copyToCacheDirectory: true, multiple: false });
  return result.canceled || !result.assets[0] ? null : result.assets[0];
}

// The file chosen on the Bookkeeping tab, waiting for the import screen to pick it up (a File cannot go in a route).
let pending: UploadAsset | null = null;

export function handOffStatement(asset: UploadAsset): void {
  pending = asset;
}

export function hasPendingStatement(): boolean {
  return pending !== null;
}

export function takePendingStatement(): UploadAsset | null {
  const asset = pending;
  pending = null;
  return asset;
}

/**
 * The three figures an import is about, in minor units of `currency`: money in, money out and the ending balance
 * (falling back to what the rows add up to when the statement does not print them).
 */
export function statementTotals(read: StatementRead, currency: Currency): { moneyIn: number; moneyOut: number; opening: number | null; ending: number | null } {
  const sum = (direction: 'in' | 'out') => read.rows.filter((r) => r.direction === direction).reduce((total, r) => total + r.amount, 0);
  // Some banks print the debit total as a negative number ("-801.26"): money out is a size here, so its sign is dropped.
  const moneyIn = Math.abs(read.totalIn ?? sum('in'));
  const moneyOut = Math.abs(read.totalOut ?? sum('out'));
  const lastBalance = [...read.rows].reverse().find((r) => r.balance !== null)?.balance ?? null;
  const ending = read.closingBalance ?? lastBalance ?? (read.openingBalance !== null ? read.openingBalance + moneyIn - moneyOut : null);
  const minor = (value: number | null) => (value === null ? null : toMinor(value, currency));
  return { moneyIn: toMinor(moneyIn, currency), moneyOut: toMinor(moneyOut, currency), opening: minor(read.openingBalance), ending: minor(ending) };
}

export async function readStatement(asset: UploadAsset, password?: string): Promise<StatementRead> {
  const form = new FormData();
  if (Platform.OS === 'web' && asset.file) form.append('file', asset.file, asset.name);
  else form.append('file', { uri: asset.uri, name: asset.name, type: 'application/pdf' } as unknown as Blob);
  if (password) form.append('password', password);
  const response = await authorizedFetch('/import/statement', { method: 'POST', body: form });
  if (response.ok) return (await response.json()) as StatementRead;
  const body = (await response.json().catch(() => null)) as { detail?: { code?: string; message?: string } } | null;
  if (body?.detail?.code) throw new StatementImportError(body.detail.code, body.detail.message ?? '');
  throw new ApiRequestError(response.status, 'Something went wrong reading this statement. Please try again.');
}

// ---------------------------------------------------------------- suggestions

/** Entry types an imported row can become (types needing extra details, like loans and equipment, are added by hand). */
export const IMPORT_TYPES = {
  in: ['product_sale', 'service_income', 'owner_capital', 'other_income', 'transfer'],
  out: ['stock_materials', 'rent', 'wages', 'utilities', 'transport', 'marketing', 'repairs', 'fees_licences', 'other_cost',
    'income_tax', 'owner_drawings', 'transfer'],
} as const;

const KEYWORDS: { type: string; direction?: 'in' | 'out'; words: string[] }[] = [
  { type: 'transfer', words: ['atm', 'cash withdrawal', 'cash deposit', 'withdraw cash', 'deposit cash', 'ដកប្រាក់', 'ដាក់ប្រាក់'] },
  { type: 'wages', direction: 'out', words: ['salary', 'payroll', 'wage', 'ប្រាក់ខែ'] },
  { type: 'rent', direction: 'out', words: ['rent', 'rental', 'ជួល'] },
  { type: 'utilities', direction: 'out', words: ['edc', 'electric', 'water', 'ppwsa', 'internet', 'wifi', 'metfone', 'smart axiata', 'cellcard', 'ភ្លើង', 'ទឹក'] },
  { type: 'transport', direction: 'out', words: ['fuel', 'petrol', 'caltex', 'tela', 'ptt', 'grab', 'taxi', 'delivery', 'ដឹក'] },
  { type: 'marketing', direction: 'out', words: ['facebook', 'meta ads', 'advert', 'marketing', 'boost'] },
  { type: 'repairs', direction: 'out', words: ['repair', 'maintenance', 'ជួសជុល'] },
  { type: 'fees_licences', direction: 'out', words: ['patent', 'licence', 'license', 'service charge', 'bank fee', 'annual fee', 'commission'] },
  { type: 'income_tax', direction: 'out', words: ['tax', 'gdt', 'ពន្ធ'] },
  { type: 'stock_materials', direction: 'out', words: ['supplier', 'stock', 'wholesale', 'material', 'ingredient', 'purchase'] },
  { type: 'other_income', direction: 'in', words: ['interest credit', 'interest paid', 'refund', 'cashback'] },
  { type: 'product_sale', direction: 'in', words: ['sale', 'payment from', 'received from', 'khqr', 'qr'] },
];
const LOAN_WORDS = ['loan', 'disburse', 'instalment', 'installment', 'repayment', 'ប្រាក់កម្ចី'];

const normal = (text: string) => text.toLowerCase().replace(/[0-9#*/:.,-]+/g, ' ').replace(/\s+/g, ' ').trim();
/** English keywords must start a word ("atm" is not in "treatment"); Khmer is written without spaces, so it can be anywhere. */
const mentions = (text: string, word: string) => (/[a-z]/.test(word) ? ` ${text}`.includes(` ${word}`) : text.includes(word));

export interface ReviewRow extends StatementRow {
  /** the entry type the owner chose; empty until they do */
  typeId: string;
  /** an entry with the same amount and date is already in FINEXT */
  duplicate: boolean;
  /** a loan: added through Add entry, so its repayment schedule is recorded */
  loan: boolean;
  /** the type was taken from an earlier import of the same description */
  learned: boolean;
  /** nothing in the description suggested a type: the owner should choose one */
  unsure: boolean;
  /** cash put into or taken out of the bank (deposit, ATM): the owner decides whether it is new money or a move */
  cashMove: boolean;
  keep: boolean;
}

function noonOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, 12).getTime();
}

export function toMinor(amount: number, currency: Currency): number {
  return Math.round(currency === 'USD' ? amount * 100 : amount);
}

/**
 * A riel statement imported into a dollar app is changed to dollars at one fixed, average rate (not the day's rate),
 * after the owner has checked the rows in riel. Converted entries are marked with CONVERTED_MARK.
 */
export const IMPORT_KHR_PER_USD = 4000;
export const CONVERTED_MARK = '*';

/** Whole riel to US cents at IMPORT_KHR_PER_USD (10,000 riel → 250 cents). A non-zero amount never becomes 0. */
export function rielToCents(riel: number): number {
  const cents = Math.round((riel / IMPORT_KHR_PER_USD) * 100);
  return riel > 0 ? Math.max(1, cents) : cents;
}

/** Whether rows in `from` are changed to `to` when they are added (only riel into a dollar app). */
export const convertsOnImport = (from: Currency | null, to: Currency) => from === 'KHR' && to === 'USD';

/** The first line of an imported entry's note: the statement's description, which later imports learn from. */
const importedDescription = (note: string) => note.slice(IMPORT_NOTE.length).split('\n')[0];

/** Suggested type, duplicate and loan flags for every row, using the owner's existing entries. */
export async function prepareRows(read: StatementRead, fallbackCurrency: Currency): Promise<ReviewRow[]> {
  const dates = read.rows.map((r) => noonOf(r.date));
  const existing = dates.length ? await listEntriesSince(Math.min(...dates) - 2 * DAY) : [];

  // What the owner called the same description last time (the newest import wins).
  const learned = new Map<string, string>();
  for (const entry of [...existing].sort((a, b) => a.occurredAt - b.occurredAt)) {
    if (entry.note?.startsWith(IMPORT_NOTE)) learned.set(normal(importedDescription(entry.note)), entry.typeId);
  }

  const used = new Set<string>();
  return read.rows.map((row) => {
    const currency = row.currency ?? read.currency ?? fallbackCurrency;
    const minor = toMinor(row.amount, currency);
    // A riel row imported before into a dollar app was saved in dollars: look for that amount too.
    const converted = convertsOnImport(currency, fallbackCurrency) ? rielToCents(minor) : null;
    const when = noonOf(row.date);
    const text = normal(row.description);
    const sameAmount = (e: Transaction) => (e.currency === currency && e.amount === minor) || (converted !== null && e.currency === 'USD' && e.amount === converted);
    const match = existing.find((e: Transaction) => !used.has(e.id) && sameAmount(e)
      && Math.abs(e.occurredAt - when) <= 1.5 * DAY && (e.direction === row.direction || e.direction === 'move'));
    if (match) used.add(match.id);
    const loan = LOAN_WORDS.some((word) => mentions(text, word));
    // Only a warning: this looks like cash going into or out of the bank, which may be a move rather than income or a cost.
    const cashMove = KEYWORDS.find((k) => k.type === 'transfer')!.words.some((word) => mentions(text, word));
    return { ...row, currency, typeId: '', duplicate: Boolean(match), loan, learned: false, unsure: true, cashMove, keep: !match && !loan };
  });
}

/** Rows the owner should look at before saving: possible duplicates, loans and types that are only a guess. */
export const needsCheck = (row: ReviewRow) => row.duplicate || row.loan || row.unsure || row.cashMove;

/**
 * Create one entry per kept row, into `bank` (transfers go between `bank` and `cash`). Returns how many were added and
 * the rows that could not be, so none disappears without the owner being told. Riel rows going into a dollar app
 * (`appCurrency` USD) are saved in dollars at IMPORT_KHR_PER_USD, marked with CONVERTED_MARK, and the note keeps the
 * riel amount.
 */
export async function importRows(rows: ReviewRow[], bank: Bank, cash: Bank | null, appCurrency: Currency): Promise<{ added: number; failed: ReviewRow[]; converted: number }> {
  let added = 0;
  let converted = 0;
  const failed: ReviewRow[] = [];
  for (const row of rows.filter((r) => r.keep)) {
    const original = row.currency ?? 'USD';
    const convert = convertsOnImport(original, appCurrency);
    const currency: Currency = convert ? 'USD' : original;
    const amount = convert ? rielToCents(toMinor(row.amount, original)) : toMinor(row.amount, original);
    // Nothing is added without a type the owner chose.
    if (!row.typeId) {
      failed.push(row);
      continue;
    }
    const transfer = row.typeId === 'transfer';
    // A transfer needs a Cash account other than the one the statement goes into.
    if (transfer && (!cash || cash.id === bank.id)) {
      failed.push(row);
      continue;
    }
    const description = row.description.trim();
    const title = description.slice(0, convert ? 58 : 60);
    const conversion = convert
      ? `\n${CONVERTED_MARK} Changed from ${Math.round(row.amount).toLocaleString('en-US')} riel at ${IMPORT_KHR_PER_USD.toLocaleString('en-US')} riel = 1 USD.`
      : '';
    const result = await addTransaction({
      typeId: row.typeId,
      amount,
      currency,
      payMethod: bank.kind === 'cash' ? 'cash' : 'bank',
      // A transfer out of the bank goes to Cash (ATM); one into the bank comes from Cash (a deposit).
      bankId: transfer && row.direction === 'in' ? cash!.id : bank.id,
      toBankId: transfer ? (row.direction === 'in' ? bank.id : cash!.id) : null,
      title: title ? (convert ? `${title} ${CONVERTED_MARK}` : title) : undefined,
      note: IMPORT_NOTE + description + conversion,
      occurredAt: noonOf(row.date),
    });
    if (result.ok) {
      added += 1;
      if (convert) converted += 1;
    } else {
      failed.push(row);
    }
  }
  return { added, failed, converted };
}
