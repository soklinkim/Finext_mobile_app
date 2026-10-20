import { useCallback, useEffect, useRef, useState } from 'react';
import { NoCachedDataError, type CachedResult } from '@/services/analysis';
import { useNetworkStatus } from './useNetworkStatus';

export interface AnalysisQuery<T> {
  data: T | undefined;
  /** 'cache' means the banner "Offline · last updated …" must be shown */
  source: 'network' | 'cache' | undefined;
  fetchedAt: number | undefined;
  loading: boolean;
  /** offline and nothing cached yet */
  noCache: boolean;
  error: Error | null;
  reload: () => void;
}

/**
 * Calls an analysis service function. Re-runs when `deps` change and whenever the
 * connection comes back (so cached data is refreshed automatically).
 */
export function useAnalysisQuery<T>(fn: () => Promise<CachedResult<T>>, deps: unknown[] = []): AnalysisQuery<T> {
  const { isOnline } = useNetworkStatus();
  const [state, setState] = useState<{ result?: CachedResult<T>; loading: boolean; noCache: boolean; error: Error | null }>({
    loading: true,
    noCache: false,
    error: null,
  });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const seq = useRef(0);

  const run = useCallback(() => {
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true }));
    fnRef
      .current()
      .then((result) => id === seq.current && setState({ result, loading: false, noCache: false, error: null }))
      .catch((e: unknown) => {
        if (id !== seq.current) return;
        if (e instanceof NoCachedDataError) setState({ loading: false, noCache: true, error: null });
        else setState({ loading: false, noCache: false, error: e instanceof Error ? e : new Error(String(e)) });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(run, [run, isOnline]);

  return {
    data: state.result?.data,
    source: state.result?.source,
    fetchedAt: state.result?.fetchedAt,
    loading: state.loading,
    noCache: state.noCache,
    error: state.error,
    reload: run,
  };
}
