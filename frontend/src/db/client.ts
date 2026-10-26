import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import { runMigrations } from './migrations';
import * as schema from './schema';

const webSqlite = (globalThis as typeof globalThis & { __FINEXT_WEB_SQLITE__?: SQLiteDatabase })
  .__FINEXT_WEB_SQLITE__;
const sqlite: SQLiteDatabase = process.env.EXPO_OS === 'web'
  ? webSqlite ?? (() => {
      throw new Error('Web SQLite was not initialized before the app loaded. Restart Expo and try again.');
    })()
  : openDatabaseSync('finext.db');

sqlite.execSync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

/** The only database handle. Only services/ may import this (see README). */
export const db = drizzle(sqlite, { schema });
export { schema };

/** UUIDs are generated on the device so rows can be created offline and synced later. */
export const newId = (): string => Crypto.randomUUID();

/** Standard columns for a brand-new row: pending sync, not deleted. */
export function newRowMeta(now = Date.now()) {
  return { id: newId(), createdAt: now, updatedAt: now, deletedAt: null, syncStatus: 'pending' as const };
}

let ready = false;
export function initDatabase(seed: (now: number) => void): void {
  if (ready) return;
  runMigrations(sqlite);
  const empty = sqlite.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM settings');
  if (!empty || empty.n === 0) seed(Date.now());
  ready = true;
}
