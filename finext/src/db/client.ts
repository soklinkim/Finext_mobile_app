import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import { runMigrations } from './migrations';
import * as schema from './schema';

const sqlite = openDatabaseSync('finext.db');
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
