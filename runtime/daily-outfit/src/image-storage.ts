import { type HookStorageClient } from '@nimiplatform/sdk/mod';
import { createModStorageClient } from '@nimiplatform/sdk/mod/storage';
import { DAILY_OUTFIT_MOD_ID } from './contracts.js';

type CompressImageInput = {
  imageUrl: string;
  maxDimension: number;
  quality: number;
  bucket?: 'selfies' | 'garments' | 'outfits';
};

type ResolvedImageUrl = {
  url: string;
  revoke?: () => void;
};

const STORAGE_ROOT = 'images';
let imageFileStorage: HookStorageClient['files'] | null = null;

function getImageFileStorage(): HookStorageClient['files'] {
  if (!imageFileStorage) {
    imageFileStorage = createModStorageClient(DAILY_OUTFIT_MOD_ID).files;
  }
  return imageFileStorage;
}

function clampPositiveInt(value: number, fallback: number): number {
  const normalized = Math.round(value);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : fallback;
}

function clampQuality(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(1, Math.max(0.1, value));
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('DAILY_OUTFIT_BLOB_READ_FAILED'));
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsDataURL(blob);
  });
}

function isDirectImageUrl(value: string): boolean {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized.startsWith('data:')
    || normalized.startsWith('blob:')
    || normalized.startsWith('http://')
    || normalized.startsWith('https://');
}

function isStoredImagePath(value: string): boolean {
  const normalized = String(value || '').trim();
  return Boolean(normalized) && !isDirectImageUrl(normalized);
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
  if (lower === 'image/png') return 'png';
  if (lower === 'image/jpeg') return 'jpg';
  if (lower === 'image/gif') return 'gif';
  if (lower === 'image/svg+xml') return 'svg';
  return 'webp';
}

async function readStoredImageBlob(path: string): Promise<Blob> {
  const bytes = await getImageFileStorage().readBytes(path);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type: mimeTypeFromPath(path) });
}

async function fetchImageBlob(imageUrl: string): Promise<Blob> {
  if (isStoredImagePath(imageUrl)) {
    return await readStoredImageBlob(imageUrl);
  }
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`DAILY_OUTFIT_IMAGE_FETCH_FAILED:${response.status}`);
  }
  return await response.blob();
}

function loadImageElement(objectUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('DAILY_OUTFIT_IMAGE_DECODE_FAILED'));
    image.src = objectUrl;
  });
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function scaleDimensions(width: number, height: number, maxDimension: number): { width: number; height: number } {
  const safeWidth = clampPositiveInt(width, maxDimension);
  const safeHeight = clampPositiveInt(height, maxDimension);
  const limit = clampPositiveInt(maxDimension, 1024);
  const scale = Math.min(1, limit / Math.max(safeWidth, safeHeight));
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/webp', quality);
  });
}

function createStoragePath(bucket: NonNullable<CompressImageInput['bucket']>, mimeType: string): string {
  const extension = extensionFromMimeType(mimeType);
  const nonce = Math.random().toString(36).slice(2, 10);
  return `${STORAGE_ROOT}/${bucket}/${Date.now().toString(36)}-${nonce}.${extension}`;
}

export async function compressImageForStorage(input: CompressImageInput): Promise<string> {
  const imageUrl = String(input.imageUrl || '').trim();
  if (!imageUrl) {
    return '';
  }
  const blob = await fetchImageBlob(imageUrl);
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await loadImageElement(objectUrl);
    const dimensions = scaleDimensions(image.naturalWidth, image.naturalHeight, input.maxDimension);
    const canvas = createCanvas(dimensions.width, dimensions.height);
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('DAILY_OUTFIT_CANVAS_CONTEXT_UNAVAILABLE');
    }
    context.clearRect(0, 0, dimensions.width, dimensions.height);
    context.drawImage(image, 0, 0, dimensions.width, dimensions.height);
    const quality = clampQuality(input.quality, 0.86);
    const encodedBlob = await canvasToBlob(canvas, quality) || blob;
    const bytes = new Uint8Array(await encodedBlob.arrayBuffer());
    const path = createStoragePath(input.bucket || 'garments', encodedBlob.type || 'image/webp');
    await getImageFileStorage().writeBytes(path, bytes);
    return path;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function resolveImageUrlForDisplay(imageUrl: string): Promise<ResolvedImageUrl> {
  const normalized = String(imageUrl || '').trim();
  if (!normalized) {
    return { url: '' };
  }
  if (!isStoredImagePath(normalized)) {
    return { url: normalized };
  }
  const blob = await readStoredImageBlob(normalized);
  const objectUrl = URL.createObjectURL(blob);
  return {
    url: objectUrl,
    revoke: () => URL.revokeObjectURL(objectUrl),
  };
}

export async function resolveImageUrlForRuntime(imageUrl: string): Promise<string> {
  const normalized = String(imageUrl || '').trim();
  if (!normalized || !isStoredImagePath(normalized)) {
    return normalized;
  }
  return await blobToDataUrl(await readStoredImageBlob(normalized));
}
