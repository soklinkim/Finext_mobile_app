import AsyncStorage from '@react-native-async-storage/async-storage';
import { isOnline } from '../network';
import { NoCachedDataError, type CachedResult } from './types';

const PREFIX = 'finext.analysis.v1:';

interface Stored<T> {
  data: T;
  fetchedAt: number;
}

async function read<T>(key: string): Promise<Stored<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as Stored<T>) : null;
  } catch {
    return null;
  }
}

async function write<T>(key: string, value: Stored<T>): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // a full or unavailable cache must never break the screen
  }
}

/**
 * Online: run `fetcher`, cache the result, return it.
 * Offline (or fetcher fails): return the last cached result, flagged source = 'cache'.
 * Offline with nothing cached: throws NoCachedDataError (screens show an empty state).
 */
export async function withCache<T>(key: string, fetcher: () => Promise<T>): Promise<CachedResult<T>> {
  if (await isOnline()) {
    try {
      const data = await fetcher();
      const fetchedAt = Date.now();
      await write(key, { data, fetchedAt });
      return { data, source: 'network', fetchedAt };
    } catch {
      // network is up but the call failed: fall through to cache
    }
  }
  const cached = await read<T>(key);
  if (cached) return { data: cached.data, source: 'cache', fetchedAt: cached.fetchedAt };
  throw new NoCachedDataError();
}

export async function clearAnalysisCache(): Promise<void> {
  const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX));
  if (keys.length) await AsyncStorage.multiRemove(keys);
}
