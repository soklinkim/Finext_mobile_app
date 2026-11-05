/**
 * Loan readiness and consent-based sharing with partner banks.
 * Readiness is a server report (viewable offline from cache); sharing needs a connection.
 */
import { withCache } from '@/services/analysis/cache';
import { ApiRequestError, type CachedResult, type LoanReadiness, type ReadinessLevel } from '@/services/analysis/types';
import { authorizedFetch, syncService } from '@/services/sync';

export type ShareScope = 'readiness' | 'statements' | 'health' | 'trend' | 'documents';
export type ShareDecision = 'new' | 'reviewing' | 'approved' | 'declined';

export const SHARE_SCOPES: ShareScope[] = ['readiness', 'statements', 'health', 'trend', 'documents'];
export const SHARE_DAYS = [30, 90, 180] as const;

export interface Lender {
  id: string;
  name: string;
}

/** What a bank offers when it approves: the business accepts or declines exactly this. */
export interface LoanOffer {
  amount: number; // major units of `currency`
  currency: 'USD' | 'KHR';
  annualRate: number; // %
  termMonths: number;
}

export type OfferResponse = 'accepted' | 'declined';

/** Equal monthly repayment for the offer (principal and interest), in major units. */
export function monthlyRepayment(offer: LoanOffer): number {
  const r = offer.annualRate / 100 / 12;
  return r === 0 ? offer.amount / offer.termMonths : (offer.amount * r) / (1 - (1 + r) ** -offer.termMonths);
}

export interface LoanShare {
  id: string;
  lenderId: string;
  lenderName: string;
  scopes: ShareScope[];
  createdAt: number;
  expiresAt: number;
  revokedAt: number | null;
  active: boolean;
  decision: ShareDecision;
  decisionNote: string | null;
  decidedAt: number | null;
  readinessScore: number | null;
  readinessLevel: ReadinessLevel | null;
  /** when the bank first marked it "reviewing" (or first decided) */
  reviewingAt: number | null;
  /** set with decision = 'approved' */
  offer: LoanOffer | null;
  /** the business's answer to the offer; the bank's decision is final once it is set */
  smeResponse: OfferResponse | null;
  smeResponseNote: string | null;
  smeRespondedAt: number | null;
  viewCount?: number;
  firstViewedAt?: number | null;
  lastViewedAt?: number | null;
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authorizedFetch(path, init);
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: unknown } | null;
    const detail = typeof body?.detail === 'string' && response.status < 500 ? body.detail : '';
    throw new ApiRequestError(response.status, detail || 'Something went wrong. Please try again.');
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export function getLoanReadiness(): Promise<CachedResult<LoanReadiness>> {
  return withCache('loan:readiness', () => syncService.getLoanReadiness(), { requireOnline: true });
}

export async function listLenders(): Promise<Lender[]> {
  return (await json<{ lenders: Lender[] }>('/loan/lenders')).lenders;
}

export async function listShares(): Promise<LoanShare[]> {
  return (await json<{ shares: LoanShare[] }>('/loan/shares')).shares;
}

/** The partner banks and this business's shares, saved for offline reading: a bank's decision stays visible without signal. */
export function getSharing(): Promise<CachedResult<{ lenders: Lender[]; shares: LoanShare[] }>> {
  return withCache('loan:sharing', async () => {
    const [lenders, shares] = await Promise.all([listLenders(), listShares()]);
    return { lenders, shares };
  });
}

export function shareWithLender(input: { lenderId: string; scopes: ShareScope[]; days: (typeof SHARE_DAYS)[number] }): Promise<LoanShare> {
  return json('/loan/shares', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, consent: true }),
  });
}

/** Accept or decline a bank's offer (once). Needs a connection. */
/** `offerDecidedAt`: when the offer on screen was made, so the server refuses if the bank has changed it since. */
export function respondToOffer(id: string, response: OfferResponse, offerDecidedAt: number | null, note?: string): Promise<{ smeResponse: OfferResponse }> {
  return json(`/loan/shares/${encodeURIComponent(id)}/response`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ response, offerDecidedAt, note: note ?? null }),
  });
}

export function revokeShare(id: string): Promise<void> {
  return json(`/loan/shares/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
