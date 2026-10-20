/**
 * Sync service — STUB for the backend developer. Nothing in the app calls it yet.
 *
 * Contract (see README "Sync contract" for the full write-up):
 *
 *  pushPending()
 *    Select every row where sync_status = 'pending' in each table of SYNCED_TABLES
 *    (INCLUDING rows with deleted_at set, so deletions propagate), send them to the server in
 *    batches, and on success set sync_status = 'synced' for exactly the ids the server accepted.
 *    Must be idempotent: the server upserts by `id` (UUID created on the device), so a retried
 *    batch never duplicates rows. Must never run while another push is in flight.
 *
 *  pullChanges(since)
 *    Ask the server for rows changed after the `since` cursor, upsert them locally by `id`
 *    (last-writer-wins on `updatedAt`, a pending local row newer than the server row is kept and
 *    re-pushed), write them with sync_status = 'synced', then persist the returned cursor.
 *
 * Call order for a full sync: pushPending() then pullChanges(). Trigger it when the device goes
 * online (hooks/useNetworkStatus), after a bookkeeping write while online, and on app foreground.
 */
import type { SyncedTable } from '@/db/schema';

export type SyncRow = Record<string, unknown> & {
  id: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
};

export interface PushBatch {
  table: SyncedTable;
  rows: SyncRow[];
}

export interface PushResult {
  /** ids the server accepted, per table; only these become 'synced' */
  accepted: Partial<Record<SyncedTable, string[]>>;
  /** ids the server rejected (validation / conflict) with a reason; they stay 'pending' */
  rejected: { table: SyncedTable; id: string; reason: string }[];
}

export interface PullResult {
  changes: PushBatch[];
  /** opaque cursor to send as `since` on the next pull */
  cursor: string;
}

export interface SyncService {
  /** Upload all rows with sync_status = 'pending'. */
  pushPending(): Promise<PushResult>;
  /** Download server changes made after `since` (omit for a first full pull). */
  pullChanges(since?: string): Promise<PullResult>;
}

const NOT_IMPLEMENTED = 'Sync is not implemented yet: backend developer, see src/services/sync/index.ts and the README.';

export const syncService: SyncService = {
  async pushPending() {
    // TODO: backend developer — POST pending rows, mark accepted ids as synced
    throw new Error(NOT_IMPLEMENTED);
  },
  async pullChanges(_since?: string) {
    // TODO: backend developer — GET /sync/changes?since=…, upsert locally, store cursor
    throw new Error(NOT_IMPLEMENTED);
  },
};
