/**
 * Business registration documents (Patent Tax, Certificate of Incorporation).
 * ONLINE only: files are stored in the server database, not in the offline ledger.
 */
import { Platform } from 'react-native';
import type { DocumentPickerAsset } from 'expo-document-picker';
import { ApiRequestError } from '@/services/analysis/types';
import { authorizedFetch } from '@/services/sync';

export type BusinessDocumentKind = 'patent_tax' | 'certificate_of_incorporation';

export const BUSINESS_DOCUMENT_KINDS: BusinessDocumentKind[] = ['patent_tax', 'certificate_of_incorporation'];
export const DOCUMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

export interface BusinessDocument {
  kind: BusinessDocumentKind;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: number;
}

async function ensureOk(response: Response): Promise<Response> {
  if (response.ok) return response;
  const body = await response.json().catch(() => null) as { detail?: unknown } | null;
  // Upload validation messages (size, type) are written for the user; anything else gets a generic message.
  const detail = typeof body?.detail === 'string' && [400, 413, 415].includes(response.status) ? body.detail : '';
  throw new ApiRequestError(response.status, detail || (response.status === 401
    ? 'Your session may have expired. Please sign in again.'
    : 'Something went wrong with this document. Please try again.'));
}

export async function listDocuments(): Promise<BusinessDocument[]> {
  const response = await ensureOk(await authorizedFetch('/documents'));
  return ((await response.json()) as { documents: BusinessDocument[] }).documents;
}

export async function uploadDocument(kind: BusinessDocumentKind, asset: DocumentPickerAsset): Promise<BusinessDocument> {
  const form = new FormData();
  if (Platform.OS === 'web' && asset.file) {
    form.append('file', asset.file, asset.name);
  } else {
    // React Native's FormData streams the file from its uri.
    form.append('file', { uri: asset.uri, name: asset.name, type: asset.mimeType ?? 'application/octet-stream' } as unknown as Blob);
  }
  const response = await ensureOk(await authorizedFetch(`/documents/${kind}`, { method: 'PUT', body: form }));
  return (await response.json()) as BusinessDocument;
}

export async function deleteDocument(kind: BusinessDocumentKind): Promise<void> {
  await ensureOk(await authorizedFetch(`/documents/${kind}`, { method: 'DELETE' }));
}

/** Web only: open the stored file in a new tab. */
export async function openDocument(kind: BusinessDocumentKind): Promise<void> {
  const response = await ensureOk(await authorizedFetch(`/documents/${kind}/file`));
  const url = URL.createObjectURL(await response.blob());
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
