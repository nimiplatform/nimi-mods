type CompressImageInput = {
  imageUrl: string;
  maxDimension: number;
  quality: number;
};

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

async function fetchImageBlob(imageUrl: string): Promise<Blob> {
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
    const webpDataUrl = canvas.toDataURL('image/webp', quality);
    if (webpDataUrl.startsWith('data:image/webp')) {
      return webpDataUrl;
    }
    return await blobToDataUrl(blob);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
