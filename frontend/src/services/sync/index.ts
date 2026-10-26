import AsyncStorage from '@react-native-async-storage/async-storage';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { API_BASE_URL } from '@/services/apiBase';
import { SYNCED_TABLES, type SyncedTable } from '@/db/schema';
import { emitChange } from '@/services/bookkeeping/events';
import { getSession, refreshSession } from '@/services/auth';
import { AccountingDataError, ApiRequestError, type AnalysisPeriod, type AnalysisResult, type AppNotification, type CategorySlice, type IncomeExpenseForecast, type LoanReadiness, type RatioSnapshot, type StatementPeriod, type Statements, type Summary } from '@/services/analysis/types';

export type SyncRow = Record<string, unknown> & {
  id: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
};

export interface PushBatch {
  table: SyncedTable;
  rows: SyncRow[];
}

export interface PushResult {
  /** ids the server accepted, per table; only these become 'synced' */
  accepted: Partial<Record<SyncedTable, string[]>>;
  /** ids the server rejected (validation / conflict) with a reason; they stay 'pending' */
  rejected: { table: SyncedTable; id: string; reason: string }[];
  /** Newer server copy returned when the local row had an older updatedAt. */
  conflicts: { table: SyncedTable; row: SyncRow }[];
  /** Server-generated, balanced journal lines for accepted transaction rows. */
  postings?: Record<string, JournalLine[]>;
}

export interface JournalLine {
  lineNo: number;
  side: 'debit' | 'credit';
  accountCode: string;
  amount: number;
  currency: 'KHR' | 'USD';
}

export interface JournalEntry {
  id: string;
  transactionId: string;
  date: number;
  source: 'user' | 'system';
  currency: 'KHR' | 'USD';
  lines: JournalLine[];
}

export interface AccountingImpact {
  kind: 'sales' | 'other_income' | 'cost' | 'stock' | 'equipment' | 'deposit' | 'loan_in' | 'capital' | 'loan_out' | 'owner' | 'move';
  value: number;
  currency: 'KHR' | 'USD';
  tone: 'success' | 'alert' | 'neutral';
}

export interface AccountingPreviewInput {
  typeId: string;
  amount: number;
  currency: 'KHR' | 'USD';
  payMethod: 'cash' | 'bank' | 'later';
  bankId?: string | null;
  toBankId?: string | null;
  counterparty?: string;
  note?: string;
  meta?: Record<string, unknown>;
}

export interface PullResult {
  changes: PushBatch[];
  /** opaque cursor to send as `since` on the next pull */
  cursor: string;
  /** more changes are waiting after `cursor` */
  hasMore?: boolean;
  /** the server lost data this device had synced; everything local must be uploaded again */
  reset?: boolean;
}

export interface SyncResult {
  push: PushResult;
  pull: PullResult;
}

export interface SyncService {
  /** Upload all rows with sync_status = 'pending'. */
  pushPending(): Promise<PushResult>;
  /** Download server changes after the saved cursor and merge them locally. */
  pullChanges(since?: string): Promise<PullResult>;
  /** Push first, then pull; concurrent calls share one in-flight sync. */
  sync(): Promise<SyncResult>;
  /** Read the server-derived journal for the signed-in user's synced transactions. */
  getJournal(): Promise<{ entries: JournalEntry[] }>;
  /** Ask the server posting engine for the prospective profit impact of an entry. */
  previewImpact(input: AccountingPreviewInput): Promise<AccountingImpact>;
  /** Sync pending rows then retrieve the backend-generated financial statements. */
  getStatements(period?: StatementPeriod): Promise<Statements>;
  /** Sync pending rows then retrieve the backend-calculated bookkeeping summary. */
  getSummary(): Promise<Summary>;
  /** Sync pending rows then retrieve the server's experimental trend forecast. */
  getForecast(): Promise<IncomeExpenseForecast>;
  /** Sync pending rows then retrieve the server's loan-readiness assessment. */
  getLoanReadiness(): Promise<LoanReadiness>;
  /** Retrieve ratio snapshots and health alerts calculated by the backend. */
  getFinancialHealth(syncFirst?: boolean): Promise<{ period: string; ratios: RatioSnapshot[]; alerts: AppNotification[] }>;
  getAnalysis(period: AnalysisPeriod): Promise<AnalysisResult>;
  getCategories(): Promise<CategorySlice[]>;
  dismissAlert(id: string): Promise<void>;
}

const CURSOR_KEY = '@finext.sync.cursor.v1';
/** Safety bound on one sync's catch-up (500 rows per page). */
const MAX_PULL_PAGES = 50;

/** Shared structural view of the local tables; the API table names match these keys. */
const tables: Record<SyncedTable, any> = {
  banks: schema.banks,
  categories: schema.categories,
  transactions: schema.transactions,
  business_assets: schema.businessAssets,
  budgets: schema.budgets,
  settings: schema.settings,
  onboarding_financial_entries: schema.onboardingFinancialEntries,
};

/** Authenticated request to the FINEXT API; refreshes an expired token once and retries. */
export async function authorizedFetch(path: string, init?: RequestInit): Promise<Response> {
  const session = await getSession();
  if (!session) throw new ApiRequestError(401, 'Please sign in to view your financial reports.');
  const send = async (accessToken: string): Promise<Response> => {
    try {
      return await fetch(`${API_BASE_URL}${path}`, {
        ...init,
        headers: {
          Authorization: 'Bearer ' + accessToken,
          ...init?.headers,
        },
      });
    } catch (error) {
      const detail = error instanceof Error ? `: ${error.message}` : '';
      throw new Error(`Could not reach FINEXT API at ${API_BASE_URL}${detail}`);
    }
  };

  const response = await send(session.access_token);
  if (response.status !== 401) return response;
  // The stored token can expire while the app is idle (e.g. a sleeping browser tab); refresh once and retry.
  const refreshed = await refreshSession();
  return refreshed ? send(refreshed.access_token) : response;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authorizedFetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: unknown } | null;
    const detail = typeof body?.detail === 'string' ? body.detail : '';
    if (response.status === 422 && detail.includes('Bookkeeping validation failed')) {
      throw new AccountingDataError(`Cannot generate the report: ${detail}`);
    }
    if (__DEV__) console.error(`[api] ${path} returned ${response.status}`, detail);
    const message = response.status === 401
      ? 'Your session may have expired. Please sign in again.'
      : response.status === 403
        ? 'You do not have permission to view this report.'
        : response.status >= 500
          ? 'We could not load this report right now. Please try again shortly.'
          : 'We could not load this report. Please try again.';
    throw new ApiRequestError(response.status, message);
  }
    const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    if (__DEV__) console.error(`[api] Invalid JSON from ${response.url}`, text.slice(0, 200));
    throw new ApiRequestError(502, 'We could not read the report response. Please try again.');
  }
}

function pendingRows(tableName: SyncedTable): SyncRow[] {
  const table = tables[tableName];
  return db
    .select()
    .from(table)
    .where(eq(table.syncStatus, 'pending'))
    .all() as SyncRow[];
}

function markAcceptedRowsSynced(tableName: SyncedTable, rows: SyncRow[]): boolean {
  const table = tables[tableName];
  let changed = false;

  for (const row of rows) {
    // Don't clear pending if the user edited this row again while the request was in flight.
    const current = db
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.id, row.id), eq(table.updatedAt, row.updatedAt), eq(table.syncStatus, 'pending')))
      .get();
    if (!current) continue;

    db.update(table)
      .set({ syncStatus: 'synced' })
      .where(and(eq(table.id, row.id), eq(table.updatedAt, row.updatedAt)))
      .run();
    changed = true;
  }

  return changed;
}

function markAllRowsPending(): void {
  for (const tableName of SYNCED_TABLES) {
    const table = tables[tableName];
    db.update(table).set({ syncStatus: 'pending' }).where(eq(table.syncStatus, 'synced')).run();
  }
}

function mergeServerRows(tableName: SyncedTable, rows: SyncRow[]): boolean {
  const table = tables[tableName];
  let changed = false;

  for (const remote of rows) {
    const local = db.select().from(table).where(eq(table.id, remote.id)).get() as
      | (SyncRow & { syncStatus: 'pending' | 'synced' })
      | undefined;

    // Never roll back a newer local version when consuming an older change-feed event.
    if (local && local.updatedAt > remote.updatedAt) continue;

    const values = { ...remote, syncStatus: 'synced' };
    db.insert(table)
      .values(values)
      .onConflictDoUpdate({ target: table.id, set: values })
      .run();
    changed = true;
  }

  return changed;
}

async function pushPending(): Promise<PushResult> {
  const batches = SYNCED_TABLES
    .map((table) => ({ table, rows: pendingRows(table) }))
    .filter((batch) => batch.rows.length > 0);

  const result = await requestJson<PushResult>('/sync/push', {
    method: 'POST',
    body: JSON.stringify({ batches }),
  });

  let localChanged = false;
  for (const table of SYNCED_TABLES) {
    const acceptedIds = new Set(result.accepted[table] ?? []);
    if (!acceptedIds.size) continue;
    const sentRows = batches.find((batch) => batch.table === table)?.rows ?? [];
    localChanged = markAcceptedRowsSynced(table, sentRows.filter((row) => acceptedIds.has(row.id))) || localChanged;
  }

  for (const conflict of result.conflicts ?? []) {
    localChanged = mergeServerRows(conflict.table, [conflict.row]) || localChanged;
  }

  if (localChanged) emitChange('sync');
  return result;
}

async function pullChanges(since?: string): Promise<PullResult> {
  const session = await getSession();
  if (!session) throw new Error('Sign in to sync your bookkeeping data.');
  const cursorKey = CURSOR_KEY + ':' + session.user.id;
  let cursor = since ?? (await AsyncStorage.getItem(cursorKey)) ?? undefined;
  const changes: PushBatch[] = [];
  let localChanged = false;

  // The server pages its change feed; keep pulling so a new device or a long offline
  // period catches up in one sync instead of waiting for the next trigger.
  for (let page = 0; page < MAX_PULL_PAGES; page++) {
    const query = cursor ? `?since=${encodeURIComponent(cursor)}` : '';
    const result = await requestJson<PullResult>(`/sync/changes${query}`);
    if (result.reset) {
      // The server has less than this device already synced (its database was reset or
      // restored). Queue every local row for upload again and pull from the beginning.
      markAllRowsPending();
      await AsyncStorage.removeItem(cursorKey);
      return { changes, cursor: '', reset: true };
    }
    for (const batch of result.changes) {
      if (!SYNCED_TABLES.includes(batch.table)) continue;
      localChanged = mergeServerRows(batch.table, batch.rows) || localChanged;
      changes.push(batch);
    }
    // Persist the cursor only after every returned batch was applied successfully.
    await AsyncStorage.setItem(cursorKey, result.cursor);
    cursor = result.cursor;
    if (!result.hasMore) break;
  }

  if (localChanged) emitChange('sync');
  return { changes, cursor: cursor ?? '' };
}

let inFlightSync: Promise<SyncResult> | null = null;
/** Server rejection reasons that mean a referenced row (e.g. a cash or bank account) is missing there. */
const MISSING_REFERENCE = /does not exist/i;
let repairedMissingRows = false;

function sync(): Promise<SyncResult> {
  if (!inFlightSync) {
    inFlightSync = (async () => {
      let push = await pushPending();
      if (!repairedMissingRows && push.rejected.some((row) => MISSING_REFERENCE.test(row.reason))) {
        // The server is missing rows this device already marked as synced (its data was reset
        // or lost), so entries that point at them are rejected. Upload everything again, once.
        repairedMissingRows = true;
        markAllRowsPending();
        push = await pushPending();
      }
      const pull = await pullChanges();
      if (!pull.reset) return { push, pull };
      // Recovery after a server reset: upload everything again, then catch up from zero.
      const repush = await pushPending();
      return { push: repush, pull: await pullChanges() };
    })().finally(() => {
      inFlightSync = null;
    });
  }
  return inFlightSync;
}

async function getJournal(): Promise<{ entries: JournalEntry[] }> {
  await syncForAccountingReports();
  return requestJson('/accounting/journal');
}

function previewImpact(input: AccountingPreviewInput): Promise<AccountingImpact> {
  return requestJson('/accounting/preview', { method: 'POST', body: JSON.stringify(input) });
}

async function getStatements(period: StatementPeriod = 'monthly'): Promise<Statements> {
  await syncForAccountingReports();
  return requestJson(`/accounting/statements?period=${encodeURIComponent(period)}`);
}

async function getSummary(): Promise<Summary> {
  await syncForAccountingReports();
  return requestJson('/accounting/summary');
}

async function getForecast(): Promise<IncomeExpenseForecast> {
  await syncForAccountingReports();
  return requestJson('/accounting/forecast');
}

async function getLoanReadiness(): Promise<LoanReadiness> {
  await syncForAccountingReports();
  return requestJson('/loan/readiness');
}

async function syncForAccountingReports(): Promise<void> {
  // Reports only need local edits on the server; pulling is the background sync's job.
  // Skipping the push/pull round trips when nothing is pending makes report screens much faster.
  if (!inFlightSync && SYNCED_TABLES.every((table) => pendingRows(table).length === 0)) return;
  const result = await sync();
  const rejected = result.push.rejected.filter((row) => row.table === 'transactions');
  if (rejected.length) {
    const detail = rejected.slice(0, 5).map((row) => `${row.id}: ${row.reason}`).join('; ');
    const extra = rejected.length > 5 ? ` (and ${rejected.length - 5} more)` : '';
    throw new AccountingDataError(`Cannot generate reports until these bookkeeping entries are fixed: ${detail}${extra}`);
  }
}

async function getFinancialHealth(syncFirst = true): Promise<{ period: string; ratios: RatioSnapshot[]; alerts: AppNotification[] }> {
  if (syncFirst) await syncForAccountingReports();
  return requestJson('/accounting/health');
}

async function getAnalysis(period: AnalysisPeriod): Promise<AnalysisResult> {
  await syncForAccountingReports();
  return requestJson(`/accounting/analysis?period=${encodeURIComponent(period)}`);
}

async function getCategories(): Promise<CategorySlice[]> {
  await syncForAccountingReports();
  return requestJson('/accounting/categories');
}

async function dismissAlert(id: string): Promise<void> {
  await requestJson(`/accounting/health/${encodeURIComponent(id)}/dismiss`, { method: 'POST' });
}

export const syncService: SyncService = { pushPending, pullChanges, sync, getJournal, previewImpact, getStatements, getSummary, getForecast, getLoanReadiness, getFinancialHealth, getAnalysis, getCategories, dismissAlert };
