import { useEffect } from 'react';
import { getSummary } from '@/services/analysis';
import { subscribeToChanges } from '@/services/bookkeeping';
import { useAnalysisQuery } from './useAnalysisQuery';

/** Server-calculated bookkeeping totals, refreshed after local entries sync or change. */
export function useSummary() {
  const query = useAnalysisQuery(getSummary);
  const { reload } = query;
  useEffect(() => subscribeToChanges(() => reload()), [reload]);
  return query;
}
