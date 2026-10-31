import { pickPhoto } from '@/services/documents';
import type { NewEvidence } from '@/services/bookkeeping';

export type EvidenceSource = 'camera' | 'library';

function toDataUri(uri: string): Promise<{ dataUri: string; size: number }> {
  return fetch(uri)
    .then((response) => response.blob())
    .then(
      (blob) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve({ dataUri: String(reader.result), size: blob.size });
          reader.onerror = () => reject(reader.error ?? new Error('Could not read the photo.'));
          reader.readAsDataURL(blob);
        }),
    );
}

/**
 * Take a photo or choose one from the gallery (on the web, from files). The photo is shrunk to a readable JPEG so it stays
 * small on the phone. Returns null if cancelled; throws 'permission' if access was refused.
 */
export async function pickEvidence(source: EvidenceSource): Promise<NewEvidence | null> {
  const asset = await pickPhoto(source);
  if (!asset) return null;
  const { dataUri, size } = await toDataUri(asset.uri);
  return { fileName: asset.name, mimeType: asset.mimeType ?? 'image/jpeg', sizeBytes: size, dataUri };
}
