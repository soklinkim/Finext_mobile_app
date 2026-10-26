import { useEffect, useState } from 'react';
import { NOTIFICATIONS_CACHE_KEY, readCachedData, subscribeToCache, type AppNotification } from '@/services/analysis';

/** Number of undismissed notifications from the last cached result; no network call. */
export function useNotificationCount(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let active = true;
    const load = () => {
      void readCachedData<AppNotification[]>(NOTIFICATIONS_CACHE_KEY).then((items) => {
        if (active) setCount(items?.length ?? 0);
      });
    };
    load();
    const unsubscribe = subscribeToCache((key) => {
      if (key === NOTIFICATIONS_CACHE_KEY) load();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  return count;
}
