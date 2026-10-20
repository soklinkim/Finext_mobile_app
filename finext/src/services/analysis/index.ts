/**
 * Analysis service — ONLINE with a local cache.
 *
 * Every function is async, resolves with { data, source, fetchedAt } and:
 *   - online  → calls the server (currently a mock), caches the response, source = 'network'
 *   - offline → returns the last cached response, source = 'cache'  (screens show the
 *               "Offline · last updated …" banner)
 *   - offline and never fetched → rejects with NoCachedDataError
 *
 * Bookkeeping numbers (balances, expense totals) are NOT here: they are computed locally
 * by services/bookkeeping.
 */
import { withCache } from './cache';
import {
  mockAnalysis,
  mockCategoryBreakdown,
  mockNotifications,
  mockStatements,
  mockTargets,
} from './mock';
import type {
  AnalysisPeriod,
  AnalysisResult,
  AppNotification,
  CachedResult,
  CategorySlice,
  Statements,
  Target,
} from './types';

export * from './types';
export { clearAnalysisCache } from './cache';

export function getAnalysis(period: AnalysisPeriod): Promise<CachedResult<AnalysisResult>> {
  // TODO: replace with server API — GET /analysis?period=daily|weekly|monthly|yearly
  return withCache(`analysis:${period}`, () => mockAnalysis(period));
}

export function getTargets(): Promise<CachedResult<Target[]>> {
  // TODO: replace with server API — GET /targets
  return withCache('targets', () => mockTargets());
}

export function getCategoryBreakdown(): Promise<CachedResult<CategorySlice[]>> {
  // TODO: replace with server API — GET /analysis/categories?from=&to=
  return withCache('categories', () => mockCategoryBreakdown());
}

export function getStatements(): Promise<CachedResult<Statements>> {
  // TODO: replace with server API — GET /statements?period=
  return withCache('statements', () => mockStatements());
}

export function getNotifications(): Promise<CachedResult<AppNotification[]>> {
  // TODO: replace with server API — GET /notifications
  return withCache('notifications', () => mockNotifications());
}
