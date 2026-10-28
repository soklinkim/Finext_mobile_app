import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Display preferences kept on this device only (not synced): how the app words things, not the business's data.
 * Plain language is on by default, for owners without accounting training.
 */
const PLAIN_KEY = 'finext:pref:plainLanguage';

let plain = true;
const listeners = new Set<(value: boolean) => void>();

const loaded = AsyncStorage.getItem(PLAIN_KEY)
  .then((raw) => {
    if (raw !== null) plain = raw === '1';
  })
  .catch(() => undefined);

export async function getPlainLanguage(): Promise<boolean> {
  await loaded;
  return plain;
}

export async function setPlainLanguage(value: boolean): Promise<void> {
  plain = value;
  listeners.forEach((listener) => listener(value));
  await AsyncStorage.setItem(PLAIN_KEY, value ? '1' : '0').catch(() => undefined);
}

export function subscribeToPlainLanguage(listener: (value: boolean) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Unusual-entry flags the owner marked "Looks right" (entry id and reason), so they are not shown again. */
const DISMISSED_KEY = 'finext:pref:unusualDismissed';

export async function getDismissedUnusual(): Promise<Set<string>> {
  try {
    return new Set(JSON.parse((await AsyncStorage.getItem(DISMISSED_KEY)) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

export async function dismissUnusual(key: string): Promise<void> {
  const keys = await getDismissedUnusual();
  keys.add(key);
  await AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify([...keys])).catch(() => undefined);
}
