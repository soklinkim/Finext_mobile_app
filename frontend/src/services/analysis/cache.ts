import AsyncStorage from '@react-native-async-storage/async-storage';
import { isOnline } from '../network';
import { AccountingDataError, ApiRequestError, NoCachedDataError, OnlineRequiredError, type CachedResult } from './types';

const PREFIX = 'finext.analysis.v2:';
const LEGACY_PREFIX = 'finext.analysis.v1:';
let legacyCleanup: Promise<void> | null = null;

async function removeLegacyCache(): Promise<void> {
  if (!legacyCleanup) {
    legacyCleanup = AsyncStorage.getAllKeys()
      .then((keys) => AsyncStorage.multiRemove(keys.filter((key) => key.startsWith(LEGACY_PREFIX))))
      .then(() => undefined)
      .catch(() => undefined);
  }
  await legacyCleanup;
}

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
  cacheListeners.forEach((fn) => fn(key));
}

const cacheListeners = new Set<(key: string) => void>();

/** Last cached result for a key without any network call (e.g. the bell's unread dot). */
export async function readCachedData<T>(key: string): Promise<T | null> {
  return (await read<T>(key))?.data ?? null;
}

/** Called with the key whenever a fresh result is cached. */
export function subscribeToCache(fn: (key: string) => void): () => void {
  cacheListeners.add(fn);
  return () => {
    cacheListeners.delete(fn);
  };
}

/**
 * Online: run `fetcher`, cache the result, return it.
 * Offline (or the server can't be reached): return the last cached result, flagged source = 'cache'.
 *   Screens then show the "Offline · last updated …" banner; entries recorded since are not included.
 * Offline with nothing cached: throws OnlineRequiredError when `requireOnline` (server-calculated
 * reports), otherwise NoCachedDataError.
 */
export async function withCache<T>(key: string, fetcher: () => Promise<T>, options: { requireOnline?: boolean } = {}): Promise<CachedResult<T>> {
  await removeLegacyCache();
  let failure: unknown;
  if (await isOnline()) {
    try {
      const data = await fetcher();
      const fetchedAt = Date.now();
      await write(key, { data, fetchedAt });
      return { data, source: 'network', fetchedAt };
    } catch (error) {
      // The server answered and refused: show that, not an older copy.
      if (error instanceof AccountingDataError || error instanceof ApiRequestError) throw error;
      // The server couldn't be reached: fall through to cache.
      failure = error;
    }
  }
  const cached = await read<T>(key);
  if (cached) return { data: cached.data, source: 'cache', fetchedAt: cached.fetchedAt };
  if (options.requireOnline) throw new OnlineRequiredError(failure instanceof Error ? failure.message : undefined);
  throw new NoCachedDataError();
}

export async function clearAnalysisCache(): Promise<void> {
  const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX) || k.startsWith(LEGACY_PREFIX));
  if (keys.length) await AsyncStorage.multiRemove(keys);
}
