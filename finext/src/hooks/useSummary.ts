import { getSummary, type Summary } from '@/services/bookkeeping';
import { useLocalQuery } from './useLocalQuery';

/** Local totals for the hero: balance, expense, budget progress. Updates after every bookkeeping write. */
export function useSummary() {
  return useLocalQuery<Summary>(getSummary, []);
}
