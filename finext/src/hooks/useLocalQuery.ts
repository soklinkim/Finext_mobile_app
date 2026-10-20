import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { subscribeToChanges } from '@/services/bookkeeping';

export interface LocalQuery<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
  reload: () => void;
}

/**
 * Runs a bookkeeping service call and re-runs it whenever local data changes
 * (any write through the bookkeeping service) or the screen regains focus.
 */
export function useLocalQuery<T>(fn: () => Promise<T>, deps: unknown[] = []): LocalQuery<T> {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const alive = useRef(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(() => {
    fnRef
      .current()
      .then((v) => {
        if (!alive.current) return;
        setData(v);
        setError(null);
      })
      .catch((e: unknown) => alive.current && setError(e instanceof Error ? e : new Error(String(e))))
      .finally(() => alive.current && setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    setLoading(true);
    run();
    return subscribeToChanges(run);
  }, [run]);

  useFocusEffect(run);

  return { data, loading, error, reload: run };
}
