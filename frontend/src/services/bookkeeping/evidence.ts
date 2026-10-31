import { and, asc, eq, isNull } from 'drizzle-orm';
import { db, newRowMeta, schema } from '@/db/client';
import { emitChange } from './events';

/** Evidence photos kept with an entry, so a record can be traced back to its receipt. Stored on this device. */
export const MAX_EVIDENCE_PER_ENTRY = 5;

export interface EvidenceItem {
  id: string;
  transactionId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: number;
}

export interface NewEvidence {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** the image as a base64 data URI ("data:image/jpeg;base64,...") */
  dataUri: string;
}

const t = schema.entryAttachments;

/** Add photos to an entry (up to the limit; the rest are ignored). */
export async function addEvidence(transactionId: string, files: NewEvidence[]): Promise<void> {
  const room = MAX_EVIDENCE_PER_ENTRY - db.select({ id: t.id }).from(t).where(and(eq(t.transactionId, transactionId), isNull(t.deletedAt))).all().length;
  for (const file of files.slice(0, Math.max(0, room))) {
    db.insert(t).values({ ...newRowMeta(), transactionId, fileName: file.fileName, mimeType: file.mimeType, sizeBytes: file.sizeBytes, data: file.dataUri }).run();
  }
  emitChange();
}

/** The photos of one entry, oldest first. Does not read the image data. */
export async function listEvidence(transactionId: string): Promise<EvidenceItem[]> {
  return db
    .select({ id: t.id, transactionId: t.transactionId, fileName: t.fileName, mimeType: t.mimeType, sizeBytes: t.sizeBytes, createdAt: t.createdAt })
    .from(t)
    .where(and(eq(t.transactionId, transactionId), isNull(t.deletedAt)))
    .orderBy(asc(t.createdAt))
    .all();
}

/** The image itself, as a data URI. */
export async function getEvidenceData(id: string): Promise<string | null> {
  return db.select({ data: t.data }).from(t).where(and(eq(t.id, id), isNull(t.deletedAt))).get()?.data ?? null;
}

export async function removeEvidence(id: string): Promise<void> {
  const now = Date.now();
  db.update(t).set({ deletedAt: now, updatedAt: now }).where(eq(t.id, id)).run();
  emitChange();
}

/** How many photos each entry has (entry id -> count), for the paperclip on lists. */
export function evidenceCounts(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of db.select({ transactionId: t.transactionId }).from(t).where(isNull(t.deletedAt)).all()) {
    counts.set(row.transactionId, (counts.get(row.transactionId) ?? 0) + 1);
  }
  return counts;
}
