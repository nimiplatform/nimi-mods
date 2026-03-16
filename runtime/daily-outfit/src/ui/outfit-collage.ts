import type { GarmentItem, OutfitCombo } from '../types.js';
import { resolveImageUrlForDisplay } from '../image-storage.js';

type OutfitCollageInput = {
  outfit: OutfitCombo;
  garments: GarmentItem[];
};

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type OutfitSlotKey =
  | 'top'
  | 'outerwear'
  | 'bottom'
  | 'shoes'
  | 'accessoryPrimary'
  | 'accessorySecondary';

const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 1400;
const BACKGROUND_COLOR = '#e8d2cb';
const DOT_COLOR = 'rgba(132, 98, 89, 0.08)';
const INK_COLOR = '#43302b';
const SOFT_PANEL = 'rgba(255,255,255,0.3)';

function titleCase(value: string): string {
  return value
    .split(/\s+/u)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}

function deriveOutfitTitle(outfit: OutfitCombo): string {
  const normalized = titleCase(outfit.occasion.trim());
  if (normalized) {
    return normalized;
  }
  if (outfit.occasionTags.length > 0) {
    return titleCase(outfit.occasionTags.join(' '));
  }
  return 'Curated Outfit';
}

function createCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  return canvas;
}

function createPatternBackground(context: CanvasRenderingContext2D): void {
  context.fillStyle = BACKGROUND_COLOR;
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  context.fillStyle = DOT_COLOR;
  for (let y = 180; y < CANVAS_HEIGHT - 120; y += 56) {
    for (let x = 80; x < CANVAS_WIDTH - 80; x += 56) {
      context.beginPath();
      context.arc(x, y, 5, 0, Math.PI * 2);
      context.fill();
    }
  }
}

function drawHeader(context: CanvasRenderingContext2D, outfit: OutfitCombo): void {
  context.fillStyle = INK_COLOR;
  context.font = '500 34px "Helvetica Neue", "PingFang SC", sans-serif';
  context.fillText('Outfits', 72, 92);

  context.fillStyle = SOFT_PANEL;
  context.beginPath();
  context.roundRect(560, 44, 240, 72, 36);
  context.fill();

  context.fillStyle = 'rgba(67, 48, 43, 0.78)';
  context.font = '500 28px "Helvetica Neue", "PingFang SC", sans-serif';
  context.fillText('Try on ready', 602, 89);

  context.fillStyle = INK_COLOR;
  context.font = '700 70px "Helvetica Neue", "PingFang SC", sans-serif';
  wrapText(context, deriveOutfitTitle(outfit), 72, 180, 760, 80);
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): void {
  const words = text.split(/\s+/u).filter(Boolean);
  if (words.length === 0) {
    return;
  }
  let line = '';
  let offsetY = 0;
  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (context.measureText(testLine).width > maxWidth && line) {
      context.fillText(line, x, y + offsetY);
      line = word;
      offsetY += lineHeight;
      continue;
    }
    line = testLine;
  }
  if (line) {
    context.fillText(line, x, y + offsetY);
  }
}

function sourceImageForGarment(garment: GarmentItem): string {
  return String(garment.thumbnailUrl || garment.photoUrls[0] || '').trim();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('DAILY_OUTFIT_COLLAGE_IMAGE_FAILED'));
    image.src = src;
  });
}

function drawImageContain(context: CanvasRenderingContext2D, image: HTMLImageElement, rect: Rect): void {
  const scale = Math.min(rect.width / image.naturalWidth, rect.height / image.naturalHeight);
  const drawWidth = Math.max(1, Math.round(image.naturalWidth * scale));
  const drawHeight = Math.max(1, Math.round(image.naturalHeight * scale));
  const x = rect.x + Math.round((rect.width - drawWidth) / 2);
  const y = rect.y + Math.round((rect.height - drawHeight) / 2);
  context.drawImage(image, x, y, drawWidth, drawHeight);
}

function categoryRects(): Record<OutfitSlotKey, Rect> {
  return {
    top: { x: 58, y: 270, width: 340, height: 380 },
    outerwear: { x: 438, y: 250, width: 360, height: 420 },
    bottom: { x: 118, y: 680, width: 270, height: 360 },
    shoes: { x: 456, y: 1000, width: 310, height: 150 },
    accessoryPrimary: { x: 500, y: 760, width: 120, height: 120 },
    accessorySecondary: { x: 628, y: 760, width: 120, height: 120 },
  };
}

function groupGarments(garments: GarmentItem[]): {
  top?: GarmentItem;
  outerwear?: GarmentItem;
  bottom?: GarmentItem;
  shoes?: GarmentItem;
  accessories: GarmentItem[];
} {
  return {
    top: garments.find((item) => item.category === 'top'),
    outerwear: garments.find((item) => item.category === 'outerwear'),
    bottom: garments.find((item) => item.category === 'bottom'),
    shoes: garments.find((item) => item.category === 'shoes'),
    accessories: garments.filter((item) => item.category === 'accessory').slice(0, 2),
  };
}

function drawFooter(context: CanvasRenderingContext2D, outfit: OutfitCombo): void {
  context.font = '500 18px "Helvetica Neue", "PingFang SC", sans-serif';
  context.fillStyle = 'rgba(67, 48, 43, 0.72)';
  const tagLine = outfit.occasionTags.length > 0 ? titleCase(outfit.occasionTags.join(' · ')) : 'Daily Outfit';
  context.fillText(tagLine, 74, 1318);
}

export async function generateOutfitCollageImage(input: OutfitCollageInput): Promise<string> {
  const canvas = createCanvas();
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('DAILY_OUTFIT_COLLAGE_CONTEXT_UNAVAILABLE');
  }

  createPatternBackground(context);
  drawHeader(context, input.outfit);

  const grouped = groupGarments(input.garments);
  const rects = categoryRects();
  const slots: Array<{ garment?: GarmentItem; rect: Rect }> = [
    { garment: grouped.top, rect: rects.top },
    { garment: grouped.outerwear, rect: rects.outerwear },
    { garment: grouped.bottom, rect: rects.bottom },
    { garment: grouped.shoes, rect: rects.shoes },
    { garment: grouped.accessories[0], rect: rects.accessoryPrimary },
    { garment: grouped.accessories[1], rect: rects.accessorySecondary },
  ];

  for (const slot of slots) {
    const imageUrl = slot.garment ? sourceImageForGarment(slot.garment) : '';
    if (!imageUrl) {
      continue;
    }
    const resolved = await resolveImageUrlForDisplay(imageUrl);
    try {
      const image = await loadImage(resolved.url);
      drawImageContain(context, image, slot.rect);
    } finally {
      resolved.revoke?.();
    }
  }

  drawFooter(context, input.outfit);
  return canvas.toDataURL('image/webp', 0.92);
}
