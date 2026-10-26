/**
 * Analysis service — ONLINE with a local cache.
 *
 * Every function is async, resolves with { data, source, fetchedAt } and:
 *   - online  → returns the analysis response and caches it, source = 'network'
 *   - offline → returns the last cached response, source = 'cache'  (screens show the
 *               "Offline · last updated …" banner)
 *   - offline and never fetched → rejects with NoCachedDataError
 *
 * Accounting reports, chart data, categories, and financial-health results come from the API.
 */
import { withCache } from './cache';
import { syncService } from '@/services/sync';
import type { AccountingImpact, AccountingPreviewInput, JournalEntry } from '@/services/sync';
import {
  emptyTargets,
} from './empty-data';
import type {
  AnalysisPeriod,
  AnalysisResult,
  AppNotification,
  CachedResult,
  CategorySlice,
  FutureRisk,
  IncomeExpenseForecast,
  ProposedLoan,
  Statements,
  StatementPeriod,
  Target,
  RatioSnapshot,
  Summary,
} from './types';

export * from './types';
export { clearAnalysisCache, readCachedData, subscribeToCache } from './cache';

export function getAnalysis(period: AnalysisPeriod): Promise<CachedResult<AnalysisResult>> {
  return withCache(`accounting:analysis:${period}`, () => syncService.getAnalysis(period), { requireOnline: true });
}

export function getTargets(): Promise<CachedResult<Target[]>> {
  // TODO: replace with server API — GET /targets
  return withCache('targets', emptyTargets);
}

export function getCategoryBreakdown(): Promise<CachedResult<CategorySlice[]>> {
  return withCache('accounting:categories', () => syncService.getCategories(), { requireOnline: true });
}

export function getStatements(period: StatementPeriod = 'monthly'): Promise<CachedResult<Statements | null>> {
  return withCache(`accounting:statements:${period}`, async () => syncService.getStatements(period), { requireOnline: true });
}

export function getIncomeExpenseForecast(): Promise<CachedResult<IncomeExpenseForecast>> {
  return withCache('accounting:forecast:linear-trend:v1', () => syncService.getForecast(), { requireOnline: true });
}

export function getFutureRisk(): Promise<CachedResult<FutureRisk>> {
  return withCache('accounting:risk:v1', () => syncService.getFutureRisk(), { requireOnline: true });
}

/** What-if for a loan not yet taken: online only, never cached. */
export function checkLoan(loan: ProposedLoan): Promise<FutureRisk> {
  return syncService.checkLoan(loan);
}

export function getSummary(): Promise<CachedResult<Summary>> {
  return withCache('accounting:summary', async () => syncService.getSummary(), { requireOnline: true });
}

export function getJournal(): Promise<CachedResult<JournalEntry[]>> {
  return withCache('accounting:journal', async () => (await syncService.getJournal()).entries, { requireOnline: true });
}

export function previewAccountingImpact(input: AccountingPreviewInput): Promise<AccountingImpact> {
  return syncService.previewImpact(input);
}

export function getRatios(): Promise<CachedResult<RatioSnapshot[]>> {
  return withCache('accounting:ratios', async () => (await syncService.getFinancialHealth()).ratios, { requireOnline: true });
}

export const NOTIFICATIONS_CACHE_KEY = 'accounting:notifications';

export function getNotifications(): Promise<CachedResult<AppNotification[]>> {
  return withCache(NOTIFICATIONS_CACHE_KEY, async () => (await syncService.getFinancialHealth()).alerts, { requireOnline: true });
}

/** After a background sync: re-run the health triggers and refresh the cached notifications (bell dot). */
export function refreshNotificationsAfterSync(): Promise<CachedResult<AppNotification[]>> {
  return withCache(NOTIFICATIONS_CACHE_KEY, async () => (await syncService.getFinancialHealth(false)).alerts, { requireOnline: true });
}

export function dismissNotification(id: string): Promise<void> {
  return syncService.dismissAlert(id);
}
