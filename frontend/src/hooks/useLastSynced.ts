import { useEffect, useState } from 'react';

/** When this device last synced with the account (null = never), kept up to date as syncs finish. */
export function useLastSynced(): number | null {
  const [last, setLast] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    // The sync service is loaded on demand: it pulls in the database and the network code.
    void import('@/services/sync').then((sync) => {
      if (!active) return;
      const load = () => { void sync.getLastSynced().then((value) => { if (active) setLast(value); }); };
      load();
      unsubscribe = sync.subscribeToLastSynced(load);
    });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);
  return last;
}
