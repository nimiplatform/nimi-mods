import { createModStorageClient, type HookStorageClient } from '@nimiplatform/sdk/mod';
import { PRODUCT_STUDIO_MOD_ID } from './contracts.js';

type ResolvedImageUrl = {
  url: string;
  revoke?: () => void;
};

type PersistBucket = 'references' | 'scenes' | 'generated' | 'ephemeral' | 'seed';
type ProductStudioArtifact = {
  bytes: Uint8Array;
  uri: string;
  mimeType: string;
};

let fileStorage: HookStorageClient['files'] | null = null;

function getFileStorage(): HookStorageClient['files'] {
  if (!fileStorage) {
    fileStorage = createModStorageClient(PRODUCT_STUDIO_MOD_ID).files;
  }
  return fileStorage;
}

function isDirectImageUrl(value: string): boolean {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized.startsWith('data:')
    || normalized.startsWith('blob:')
    || normalized.startsWith('http://')
    || normalized.startsWith('https://');
}

function mimeTypeFromPath(path: string): string {
  const lower = String(path || '').trim().toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  return 'image/webp';
}

function extensionFromMimeType(mimeType: string): string {
  const lower = String(mimeType || '').trim().toLowerCase();
  if (lower.startsWith('image/png')) return 'png';
  if (lower.startsWith('image/jpeg')) return 'jpg';
  if (lower.startsWith('image/gif')) return 'gif';
  if (lower.startsWith('image/svg+xml')) return 'svg';
  return 'webp';
}

function normalizeSubfolder(value?: string): string {
  return String(value || '')
    .trim()
    .replace(/^[./\\\s]+|[./\\\s]+$/g, '')
    .replace(/[^a-zA-Z0-9/_-]+/g, '-')
    .replace(/\/+/g, '/');
}

function createStoragePath(bucket: PersistBucket, mimeType: string, subfolder?: string): string {
  const extension = extensionFromMimeType(mimeType);
  const nonce = Math.random().toString(36).slice(2, 10);
  const normalizedSubfolder = bucket === 'generated' ? normalizeSubfolder(subfolder) : '';
  const prefix = normalizedSubfolder ? `images/${bucket}/${normalizedSubfolder}` : `images/${bucket}`;
  return `${prefix}/${Date.now().toString(36)}-${nonce}.${extension}`;
}

async function readStoredBlob(path: string): Promise<Blob> {
  const bytes = await getFileStorage().readBytes(path);
  const sniff = new TextDecoder().decode(bytes.slice(0, Math.min(bytes.length, 256))).trim().toLowerCase();
  const mimeType = sniff.startsWith('<svg') || sniff.startsWith('<?xml')
    ? 'image/svg+xml'
    : mimeTypeFromPath(path);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type: mimeType });
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('PRODUCT_STUDIO_BLOB_READ_FAILED'));
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsDataURL(blob);
  });
}

export async function persistDataUrlImage(input: {
  dataUrl: string;
  bucket: PersistBucket;
}): Promise<string> {
  const response = await fetch(input.dataUrl);
  if (!response.ok) {
    throw new Error('PRODUCT_STUDIO_DATA_URL_INVALID');
  }
  const blob = await response.blob();
  const mimeType = String(blob.type || '').trim() || 'image/png';
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const path = createStoragePath(input.bucket, mimeType);
  await getFileStorage().writeBytes(path, bytes);
  return path;
}

export async function persistBrowserFileImage(input: {
  file: File;
  bucket: PersistBucket;
}): Promise<string> {
  const mimeType = String(input.file.type || '').trim() || 'image/png';
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const path = createStoragePath(input.bucket, mimeType);
  await getFileStorage().writeBytes(path, bytes);
  return path;
}

export async function persistArtifactImage(input: {
  artifact: ProductStudioArtifact;
  bucket: PersistBucket;
  subfolder?: string;
}): Promise<string> {
  const mimeType = String(input.artifact.mimeType || '').trim() || 'image/png';
  const path = createStoragePath(input.bucket, mimeType, input.subfolder);
  if (input.artifact.bytes && input.artifact.bytes.length > 0) {
    await getFileStorage().writeBytes(path, input.artifact.bytes);
    return path;
  }
  const uri = String(input.artifact.uri || '').trim();
  if (!uri) {
    throw new Error('PRODUCT_STUDIO_ARTIFACT_EMPTY');
  }
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(`PRODUCT_STUDIO_ARTIFACT_FETCH_FAILED:${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  await getFileStorage().writeBytes(path, bytes);
  return path;
}

export async function resolveImageUrlForDisplay(imageUrl: string): Promise<ResolvedImageUrl> {
  const normalized = String(imageUrl || '').trim();
  if (!normalized) {
    return { url: '' };
  }
  if (isDirectImageUrl(normalized)) {
    return { url: normalized };
  }
  const blob = await readStoredBlob(normalized);
  const objectUrl = URL.createObjectURL(blob);
  return {
    url: objectUrl,
    revoke: () => URL.revokeObjectURL(objectUrl),
  };
}

export async function resolveImageUrlForRuntime(imageUrl: string): Promise<string> {
  const normalized = String(imageUrl || '').trim();
  if (!normalized || isDirectImageUrl(normalized)) {
    return normalized;
  }
  return await blobToDataUrl(await readStoredBlob(normalized));
}

export async function deleteStoredImage(imageUrl: string): Promise<void> {
  const normalized = String(imageUrl || '').trim();
  if (!normalized || isDirectImageUrl(normalized)) {
    return;
  }
  await getFileStorage().delete(normalized);
}
