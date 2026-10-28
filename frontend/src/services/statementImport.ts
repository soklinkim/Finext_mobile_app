/**
 * Bank statement import. The server reads the PDF (ONLINE only, nothing stored); the owner reviews every row here and
 * only the rows they keep become ordinary entries, created offline-first like any other.
 *
 * Each row gets a suggested entry type: the type the owner chose before for the same description, else a keyword
 * guess, else a plain "other". Moves between the bank and Cash (ATM withdrawals, cash deposits) become transfers, not
 * costs or income, and loans are left for the Add entry form, so neither distorts the business's figures.
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
  closingBalance: number | null;
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
  typeId: string;
  /** an entry with the same amount and date is already in FINEXT */
  duplicate: boolean;
  /** a loan: added through Add entry, so its repayment schedule is recorded */
  loan: boolean;
  /** the type was taken from an earlier import of the same description */
  learned: boolean;
  keep: boolean;
}

function noonOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, 12).getTime();
}

export function toMinor(amount: number, currency: Currency): number {
  return Math.round(currency === 'USD' ? amount * 100 : amount);
}

/** Suggested type, duplicate and loan flags for every row, using the owner's existing entries. */
export async function prepareRows(read: StatementRead, fallbackCurrency: Currency): Promise<ReviewRow[]> {
  const dates = read.rows.map((r) => noonOf(r.date));
  const existing = dates.length ? await listEntriesSince(Math.min(...dates) - 2 * DAY) : [];

  // What the owner called the same description last time (the newest import wins).
  const learned = new Map<string, string>();
  for (const entry of [...existing].sort((a, b) => a.occurredAt - b.occurredAt)) {
    if (entry.note?.startsWith(IMPORT_NOTE)) learned.set(normal(entry.note.slice(IMPORT_NOTE.length)), entry.typeId);
  }

  const used = new Set<string>();
  return read.rows.map((row) => {
    const currency = row.currency ?? read.currency ?? fallbackCurrency;
    const minor = toMinor(row.amount, currency);
    const when = noonOf(row.date);
    const text = normal(row.description);
    const match = existing.find((e: Transaction) => !used.has(e.id) && e.currency === currency && e.amount === minor
      && Math.abs(e.occurredAt - when) <= 1.5 * DAY && (e.direction === row.direction || e.direction === 'move'));
    if (match) used.add(match.id);
    const loan = LOAN_WORDS.some((word) => mentions(text, word));
    const remembered = learned.get(text);
    const allowed: readonly string[] = IMPORT_TYPES[row.direction];
    const guess = KEYWORDS.find((k) => (!k.direction || k.direction === row.direction) && k.words.some((word) => mentions(text, word)))?.type;
    const typeId = remembered && allowed.includes(remembered) ? remembered : guess ?? (row.direction === 'in' ? 'product_sale' : 'other_cost');
    return { ...row, currency, typeId, duplicate: Boolean(match), loan, learned: Boolean(remembered), keep: !match && !loan };
  });
}

/** Create one entry per kept row, into `bank` (transfers go between `bank` and `cash`). Returns how many were added. */
export async function importRows(rows: ReviewRow[], bank: Bank, cash: Bank | null): Promise<number> {
  let added = 0;
  for (const row of rows.filter((r) => r.keep)) {
    const currency = row.currency ?? 'USD';
    const transfer = row.typeId === 'transfer';
    if (transfer && !cash) continue;
    const description = row.description.trim();
    const result = await addTransaction({
      typeId: row.typeId,
      amount: toMinor(row.amount, currency),
      currency,
      payMethod: bank.kind === 'cash' ? 'cash' : 'bank',
      // A transfer out of the bank goes to Cash (ATM); one into the bank comes from Cash (a deposit).
      bankId: transfer && row.direction === 'in' ? cash!.id : bank.id,
      toBankId: transfer ? (row.direction === 'in' ? bank.id : cash!.id) : null,
      title: description.slice(0, 60) || undefined,
      note: IMPORT_NOTE + description,
      occurredAt: noonOf(row.date),
    });
    if (result.ok) added += 1;
  }
  return added;
}
