import { type HookStorageClient } from '@nimiplatform/sdk/mod';
import { createModStorageClient } from '@nimiplatform/sdk/mod/storage';
import { DAILY_OUTFIT_MOD_ID } from './contracts.js';

type CompressImageInput = {
  imageUrl: string;
  maxDimension: number;
  quality: number;
  bucket?: 'selfies' | 'garments' | 'outfits';
  removeGeneratedBackground?: boolean;
  trimTransparentPadding?: boolean;
  trimMargin?: number;
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

type RgbColor = { r: number; g: number; b: number };

function colorDistanceSquared(left: RgbColor, right: RgbColor): number {
  const dr = left.r - right.r;
  const dg = left.g - right.g;
  const db = left.b - right.b;
  return dr * dr + dg * dg + db * db;
}

function pixelToColor(data: Uint8ClampedArray, width: number, x: number, y: number): RgbColor {
  const offset = (y * width + x) * 4;
  return {
    r: data[offset] ?? 0,
    g: data[offset + 1] ?? 0,
    b: data[offset + 2] ?? 0,
  };
}

function pixelAlpha(data: Uint8ClampedArray, width: number, x: number, y: number): number {
  return data[(y * width + x) * 4 + 3] ?? 0;
}

function averageColor(colors: RgbColor[]): RgbColor {
  if (colors.length === 0) {
    return { r: 245, g: 245, b: 245 };
  }
  const total = colors.reduce((acc, color) => ({
    r: acc.r + color.r,
    g: acc.g + color.g,
    b: acc.b + color.b,
  }), { r: 0, g: 0, b: 0 });
  return {
    r: Math.round(total.r / colors.length),
    g: Math.round(total.g / colors.length),
    b: Math.round(total.b / colors.length),
  };
}

function collectEdgePalette(data: Uint8ClampedArray, width: number, height: number): RgbColor[] {
  const samples: RgbColor[] = [];
  const step = Math.max(2, Math.floor(Math.min(width, height) / 48));
  const pushIfVisible = (x: number, y: number) => {
    if (pixelAlpha(data, width, x, y) < 16) {
      return;
    }
    samples.push(pixelToColor(data, width, x, y));
  };

  for (let x = 0; x < width; x += step) {
    pushIfVisible(x, 0);
    pushIfVisible(x, height - 1);
  }
  for (let y = 0; y < height; y += step) {
    pushIfVisible(0, y);
    pushIfVisible(width - 1, y);
  }

  if (samples.length === 0) {
    return [];
  }

  const clusters: Array<{ colors: RgbColor[]; mean: RgbColor }> = [];
  for (const sample of samples) {
    const cluster = clusters.find((entry) => colorDistanceSquared(entry.mean, sample) <= 28 * 28);
    if (cluster) {
      cluster.colors.push(sample);
      cluster.mean = averageColor(cluster.colors);
      continue;
    }
    clusters.push({ colors: [sample], mean: sample });
  }

  return clusters
    .sort((left, right) => right.colors.length - left.colors.length)
    .slice(0, 3)
    .map((cluster) => cluster.mean);
}

function isBackgroundLike(color: RgbColor, palette: RgbColor[]): boolean {
  if (palette.some((entry) => colorDistanceSquared(entry, color) <= 42 * 42)) {
    return true;
  }
  const luminance = (0.2126 * color.r) + (0.7152 * color.g) + (0.0722 * color.b);
  const spread = Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b);
  return luminance >= 228 && spread <= 30;
}

function removeGeneratedBackgroundFromCanvas(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
): HTMLCanvasElement {
  const width = canvas.width;
  const height = canvas.height;
  const imageData = context.getImageData(0, 0, width, height);
  const { data } = imageData;
  const palette = collectEdgePalette(data, width, height);
  if (palette.length === 0) {
    return canvas;
  }

  const queue: number[] = [];
  const visited = new Uint8Array(width * height);
  const enqueueIfBackground = (x: number, y: number) => {
    const index = y * width + x;
    if (visited[index]) {
      return;
    }
    visited[index] = 1;
    if (pixelAlpha(data, width, x, y) < 16) {
      queue.push(index);
      return;
    }
    if (isBackgroundLike(pixelToColor(data, width, x, y), palette)) {
      queue.push(index);
    }
  };

  for (let x = 0; x < width; x += 1) {
    enqueueIfBackground(x, 0);
    enqueueIfBackground(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    enqueueIfBackground(0, y);
    enqueueIfBackground(width - 1, y);
  }

  while (queue.length > 0) {
    const index = queue.shift();
    if (index === undefined) {
      break;
    }
    const x = index % width;
    const y = Math.floor(index / width);
    const offset = index * 4;
    data[offset + 3] = 0;

    const neighbors: Array<{ x: number; y: number }> = [
      { x: x - 1, y },
      { x: x + 1, y },
      { x, y: y - 1 },
      { x, y: y + 1 },
    ];

    for (const neighbor of neighbors) {
      const nextX = neighbor.x;
      const nextY = neighbor.y;
      if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) {
        continue;
      }
      const nextIndex = nextY * width + nextX;
      if (visited[nextIndex]) {
        continue;
      }
      visited[nextIndex] = 1;
      if (pixelAlpha(data, width, nextX, nextY) < 16) {
        queue.push(nextIndex);
        continue;
      }
      if (isBackgroundLike(pixelToColor(data, width, nextX, nextY), palette)) {
        queue.push(nextIndex);
      }
    }
  }

  context.putImageData(imageData, 0, 0);
  return canvas;
}

function findOpaqueBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  alphaThreshold = 8,
): { left: number; top: number; right: number; bottom: number } | null {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3] ?? 0;
      if (alpha <= alphaThreshold) {
        continue;
      }
      if (x < left) left = x;
      if (y < top) top = y;
      if (x > right) right = x;
      if (y > bottom) bottom = y;
    }
  }

  if (right < left || bottom < top) {
    return null;
  }

  return { left, top, right, bottom };
}

function trimCanvasTransparentPadding(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  margin: number,
): HTMLCanvasElement {
  const safeMargin = Math.max(0, Math.round(margin));
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const bounds = findOpaqueBounds(imageData.data, canvas.width, canvas.height);
  if (!bounds) {
    return canvas;
  }

  const cropLeft = Math.max(0, bounds.left - safeMargin);
  const cropTop = Math.max(0, bounds.top - safeMargin);
  const cropRight = Math.min(canvas.width - 1, bounds.right + safeMargin);
  const cropBottom = Math.min(canvas.height - 1, bounds.bottom + safeMargin);
  const cropWidth = Math.max(1, cropRight - cropLeft + 1);
  const cropHeight = Math.max(1, cropBottom - cropTop + 1);

  if (cropWidth === canvas.width && cropHeight === canvas.height) {
    return canvas;
  }

  const trimmedCanvas = createCanvas(cropWidth, cropHeight);
  const trimmedContext = trimmedCanvas.getContext('2d');
  if (!trimmedContext) {
    return canvas;
  }
  trimmedContext.clearRect(0, 0, cropWidth, cropHeight);
  trimmedContext.drawImage(canvas, cropLeft, cropTop, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  return trimmedCanvas;
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
    const backgroundProcessedCanvas = input.removeGeneratedBackground
      ? removeGeneratedBackgroundFromCanvas(canvas, context)
      : canvas;
    const processedContext = backgroundProcessedCanvas.getContext('2d');
    if (!processedContext) {
      throw new Error('DAILY_OUTFIT_CANVAS_CONTEXT_UNAVAILABLE');
    }
    const outputCanvas = input.trimTransparentPadding
      ? trimCanvasTransparentPadding(backgroundProcessedCanvas, processedContext, input.trimMargin ?? 18)
      : backgroundProcessedCanvas;
    const quality = clampQuality(input.quality, 0.86);
    const encodedBlob = await canvasToBlob(outputCanvas, quality) || blob;
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
