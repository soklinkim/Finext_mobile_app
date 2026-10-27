/**
 * Business registration documents (Patent Tax, Certificate of Incorporation).
 * ONLINE only: files are stored in the server database, not in the offline ledger.
 */
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
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

/** A file to upload, from the file picker or a photo (on the web, `file` holds the browser File). */
export interface UploadAsset {
  uri: string;
  name: string;
  mimeType?: string | null;
  size?: number | null;
  file?: File;
}

const PHOTO_MAX_WIDTH = 2000; // readable for certificates, and well under the 5 MB limit as JPEG

/**
 * Phone: take a photo or choose one from Photos, then save it as JPEG (iPhone photos are often HEIC, which the server
 * does not accept, and full size can pass 5 MB). Returns null if cancelled; throws 'permission' if access was refused.
 */
export async function pickPhoto(source: 'camera' | 'library'): Promise<UploadAsset | null> {
  const permission = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error('permission');
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsMultipleSelection: false };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets[0]) return null;
  const photo = result.assets[0];
  const context = ImageManipulator.manipulate(photo.uri);
  if (photo.width > PHOTO_MAX_WIDTH) context.resize({ width: PHOTO_MAX_WIDTH });
  const rendered = await context.renderAsync();
  let saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  let size = (await fetch(saved.uri).then((r) => r.blob())).size;
  if (size > MAX_DOCUMENT_BYTES) {
    saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.5 });
    size = (await fetch(saved.uri).then((r) => r.blob())).size;
  }
  const base = (photo.fileName ?? 'photo').replace(/\.[^.]+$/, '');
  return { uri: saved.uri, name: `${base}.jpg`, mimeType: 'image/jpeg', size };
}

export async function uploadDocument(kind: BusinessDocumentKind, asset: UploadAsset): Promise<BusinessDocument> {
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
