import type { HookStorageClient } from '@nimiplatform/sdk/mod';
import type { AgentCaptureDraftSnapshot } from '../types.js';
import { encodeBytesToDataUrl } from './base64.js';

const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1440;
const DEFAULT_HERO_PALETTE = {
  fillStart: '#F8F2E5',
  fillEnd: '#F2EEE2',
  stroke: '#E6E1D6',
};

type CardRgb = {
  r: number;
  g: number;
  b: number;
};

type AgentDraftCardHeroPalette = {
  fillStart: string;
  fillEnd: string;
  stroke: string;
};

function escapeXml(value: string): string {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function sanitizeFileName(value: string): string {
  const normalized = String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || 'agent-draft';
}

function formatExportDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function measureDisplayUnits(value: string): number {
  let units = 0;
  for (const char of value) {
    const code = char.codePointAt(0) || 0;
    units += code > 255 ? 2 : 1;
  }
  return units;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function computeLightness(rgb: CardRgb): number {
  const max = Math.max(rgb.r, rgb.g, rgb.b) / 255;
  const min = Math.min(rgb.r, rgb.g, rgb.b) / 255;
  return (max + min) / 2;
}

function computeSaturation(rgb: CardRgb): number {
  const max = Math.max(rgb.r, rgb.g, rgb.b) / 255;
  const min = Math.min(rgb.r, rgb.g, rgb.b) / 255;
  const delta = max - min;
  if (delta === 0) {
    return 0;
  }
  const lightness = (max + min) / 2;
  return delta / (1 - Math.abs(2 * lightness - 1));
}

function mixRgb(a: CardRgb, b: CardRgb, ratio: number): CardRgb {
  return {
    r: clampByte(a.r * (1 - ratio) + b.r * ratio),
    g: clampByte(a.g * (1 - ratio) + b.g * ratio),
    b: clampByte(a.b * (1 - ratio) + b.b * ratio),
  };
}

function rgbToHex(rgb: CardRgb): string {
  return `#${[rgb.r, rgb.g, rgb.b].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

export function buildAgentDraftCardHeroPaletteFromRgb(rgb: CardRgb): AgentDraftCardHeroPalette {
  const white = { r: 255, g: 255, b: 255 };
  const fillStart = mixRgb(rgb, white, 0.22);
  const fillEnd = mixRgb(rgb, white, 0.34);
  const stroke = mixRgb(rgb, white, 0.1);
  return {
    fillStart: rgbToHex(fillStart),
    fillEnd: rgbToHex(fillEnd),
    stroke: rgbToHex(stroke),
  };
}

function wrapTextByDisplayWidth(value: string, lineUnits: number[], maxLines = lineUnits.length): string[] {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return Array.from({ length: maxLines }, () => '');
  }
  const lines: string[] = [];
  let current = '';
  let currentUnits = 0;
  let targetUnits = lineUnits[0] || lineUnits[lineUnits.length - 1] || 24;

  for (const char of text) {
    const charUnits = measureDisplayUnits(char);
    if (current && currentUnits + charUnits > targetUnits) {
      lines.push(current.trim());
      if (lines.length >= maxLines) {
        return lines;
      }
      current = char;
      currentUnits = charUnits;
      targetUnits = lineUnits[lines.length] || lineUnits[lineUnits.length - 1] || targetUnits;
      continue;
    }
    current += char;
    currentUnits += charUnits;
  }

  if (current && lines.length < maxLines) {
    lines.push(current.trim());
  }
  while (lines.length < maxLines) {
    lines.push('');
  }
  return lines;
}

export function buildAgentDraftCardFilename(draft: AgentCaptureDraftSnapshot): string {
  return `${sanitizeFileName(draft.name || 'agent-draft')}-${formatExportDate()}.png`;
}

export function buildAgentDraftCardSummary(draft: AgentCaptureDraftSnapshot, preferredLanguage?: string): string {
  const parts: string[] = [];
  if (draft.visualSpec?.roleCore) {
    parts.push(draft.visualSpec.roleCore);
  }
  if (draft.visualSpec?.artStyle) {
    parts.push(draft.visualSpec.artStyle);
  }
  const palette = [
    draft.visualSpec?.palette.primary,
    draft.visualSpec?.palette.secondary,
  ].filter(Boolean).join(' / ');
  if (palette) {
    parts.push(palette);
  }
  if (parts.length === 0) {
    return preferredLanguage?.startsWith('zh') ? '当前角色草稿成果卡' : 'Current role draft card';
  }
  return parts.join(' · ');
}

async function readImageDataUrl(input: {
  image: NonNullable<AgentCaptureDraftSnapshot['generatedImage']>;
  storage: HookStorageClient;
}): Promise<string> {
  if (input.image.path) {
    const bytes = await input.storage.files.readBytes(input.image.path);
    return encodeBytesToDataUrl({
      bytes,
      mimeType: input.image.mimeType || 'image/png',
    });
  }
  if (input.image.url.startsWith('data:')) {
    return input.image.url;
  }
  const response = await fetch(input.image.url);
  if (!response.ok) {
    throw new Error(`AGENT_CAPTURE_EXPORT_IMAGE_FETCH_FAILED:${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  return encodeBytesToDataUrl({
    bytes,
    mimeType: response.headers.get('content-type') || input.image.mimeType || 'image/png',
  });
}

export async function resolveAgentDraftCardImageDataUrl(input: {
  draft: AgentCaptureDraftSnapshot;
  storage: HookStorageClient;
}): Promise<string> {
  if (!input.draft.generatedImage) {
    throw new Error('AGENT_CAPTURE_EXPORT_IMAGE_REQUIRED');
  }
  return readImageDataUrl({
    image: input.draft.generatedImage,
    storage: input.storage,
  });
}

export function buildAgentDraftCardSvg(input: {
  draft: AgentCaptureDraftSnapshot;
  imageDataUrl: string;
  preferredLanguage?: string;
  heroPalette?: AgentDraftCardHeroPalette;
}): string {
  const isZh = String(input.preferredLanguage || '').startsWith('zh');
  const titleLines = wrapTextByDisplayWidth(
    input.draft.name || (isZh ? '未命名角色' : 'Untitled role'),
    [22, 22],
    2,
  ).map((line) => escapeXml(line));
  const readoutLines = wrapTextByDisplayWidth(
    input.draft.characterReadout || (isZh ? '当前结果尚未形成角色解读。' : 'No character readout yet.'),
    [46, 46, 46],
    3,
  ).map((line) => escapeXml(line));
  const summaryLines = wrapTextByDisplayWidth(
    buildAgentDraftCardSummary(input.draft, input.preferredLanguage),
    [62, 62],
    2,
  ).map((line) => escapeXml(line));
  const exportDate = escapeXml(formatExportDate());
  const heroPalette = input.heroPalette || DEFAULT_HERO_PALETTE;
  const titleY = titleLines[1] ? 166 : 188;
  const subtitleY = titleLines[1] ? 258 : 226;
  const heroY = titleLines[1] ? 304 : 272;
  const heroImageY = titleLines[1] ? 340 : 308;

  return `
<svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="cardFill" x1="120" y1="72" x2="960" y2="1368" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FFFDFC"/>
      <stop offset="1" stop-color="#F7FBF9"/>
    </linearGradient>
    <linearGradient id="heroFill" x1="0" y1="0" x2="0" y2="1">
      <stop stop-color="${heroPalette.fillStart}"/>
      <stop offset="1" stop-color="${heroPalette.fillEnd}"/>
    </linearGradient>
  </defs>
  <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="52" fill="url(#cardFill)"/>
  <rect x="18" y="18" width="${CARD_WIDTH - 36}" height="${CARD_HEIGHT - 36}" rx="42" stroke="#DCECE6" stroke-width="2"/>

  <text x="92" y="108" fill="#7A948D" font-size="24" font-family="Inter, -apple-system, BlinkMacSystemFont, sans-serif" font-weight="700" letter-spacing="4">AGENTDRAFT CARD</text>
  <text x="92" y="${titleY}" fill="#18352D" font-size="58" font-family="Georgia, Times New Roman, serif" font-weight="700">
    <tspan x="92" dy="0">${titleLines[0] || ''}</tspan>
    ${titleLines[1] ? `<tspan x="92" dy="62">${titleLines[1]}</tspan>` : ''}
  </text>
  <text x="92" y="${subtitleY}" fill="#5E776F" font-size="28" font-family="Inter, -apple-system, BlinkMacSystemFont, sans-serif">${isZh ? '角色成果卡 / 适合保存与分享' : 'Role result card / ready to save and share'}</text>

  <rect x="92" y="${heroY}" width="896" height="760" rx="42" fill="url(#heroFill)" stroke="${heroPalette.stroke}" stroke-width="2"/>
  <image x="136" y="${heroImageY}" width="808" height="688" preserveAspectRatio="xMidYMid meet" href="${input.imageDataUrl}"/>

  <rect x="92" y="1098" width="896" height="160" rx="30" fill="#FFFFFF"/>
  <text x="128" y="1148" fill="#7A948D" font-size="22" font-family="Inter, -apple-system, BlinkMacSystemFont, sans-serif" font-weight="700" letter-spacing="3">${isZh ? 'CHARACTER READOUT' : 'CHARACTER READOUT'}</text>
  <text x="128" y="1192" fill="#35524B" font-size="28" font-family="Inter, -apple-system, BlinkMacSystemFont, sans-serif">
    <tspan x="128" dy="0">${readoutLines[0] || ''}</tspan>
    <tspan x="128" dy="38">${readoutLines[1] || ''}</tspan>
    <tspan x="128" dy="38">${readoutLines[2] || ''}</tspan>
  </text>

  <rect x="92" y="1282" width="896" height="102" rx="30" fill="#F5FAF8"/>
  <text x="128" y="1330" fill="#7A948D" font-size="18" font-family="Inter, -apple-system, BlinkMacSystemFont, sans-serif" font-weight="700" letter-spacing="3">${isZh ? 'SUMMARY' : 'SUMMARY'}</text>
  <text x="128" y="1362" fill="#567069" font-size="22" font-family="Inter, -apple-system, BlinkMacSystemFont, sans-serif">
    <tspan x="128" dy="0">${summaryLines[0] || ''}</tspan>
    ${summaryLines[1] ? `<tspan x="128" dy="28">${summaryLines[1]}</tspan>` : ''}
  </text>
  <text x="988" y="1362" text-anchor="end" fill="#91AAA3" font-size="18" font-family="Inter, -apple-system, BlinkMacSystemFont, sans-serif">${exportDate}</text>
</svg>`.trim();
}

export function buildAgentDraftCardSvgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function renderSvgToPngBlob(svg: string): Promise<Blob> {
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const objectUrl = URL.createObjectURL(svgBlob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error('AGENT_CAPTURE_EXPORT_CARD_IMAGE_LOAD_FAILED'));
      nextImage.src = objectUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = CARD_WIDTH;
    canvas.height = CARD_HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('AGENT_CAPTURE_EXPORT_CARD_CANVAS_UNAVAILABLE');
    }
    context.drawImage(image, 0, 0, CARD_WIDTH, CARD_HEIGHT);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((nextBlob) => resolve(nextBlob), 'image/png');
    });
    if (!blob) {
      throw new Error('AGENT_CAPTURE_EXPORT_CARD_PNG_FAILED');
    }
    return blob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function extractAverageImageColor(input: {
  imageDataUrl: string;
}): Promise<CardRgb | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return null;
  }
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const nextImage = new Image();
    nextImage.onload = () => resolve(nextImage);
    nextImage.onerror = () => reject(new Error('AGENT_CAPTURE_EXPORT_CARD_COLOR_READ_FAILED'));
    nextImage.src = input.imageDataUrl;
  });
  const sampleWidth = 40;
  const sampleHeight = Math.max(40, Math.round((image.naturalHeight || image.height || sampleWidth) / Math.max(1, (image.naturalWidth || image.width || sampleWidth)) * sampleWidth));
  const canvas = document.createElement('canvas');
  canvas.width = sampleWidth;
  canvas.height = Math.min(sampleHeight, 80);
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let totalWeight = 0;
  let accentR = 0;
  let accentG = 0;
  let accentB = 0;
  let accentWeight = 0;
  const minX = Math.floor(canvas.width * 0.32);
  const maxX = Math.ceil(canvas.width * 0.68);
  const minY = Math.floor(canvas.height * 0.18);
  const maxY = Math.ceil(canvas.height * 0.86);
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  for (let index = 0; index < data.length; index += 4) {
    const pixelIndex = index / 4;
    const x = pixelIndex % canvas.width;
    const y = Math.floor(pixelIndex / canvas.width);
    if (x < minX || x > maxX || y < minY || y > maxY) {
      continue;
    }
    const alpha = data[index + 3] || 0;
    if (alpha < 24) {
      continue;
    }
    const rgb = {
      r: data[index] || 0,
      g: data[index + 1] || 0,
      b: data[index + 2] || 0,
    };
    const lightness = computeLightness(rgb);
    const saturation = computeSaturation(rgb);
    if (lightness > 0.9 && saturation < 0.08) {
      continue;
    }
    if (lightness < 0.1) {
      continue;
    }
    const centerDistance = Math.hypot((x - centerX) / canvas.width, (y - centerY) / canvas.height);
    const centerBias = Math.max(0, 1 - centerDistance * 2.2);
    const weight = 1 + saturation * 7.5 + Math.max(0, 0.78 - lightness) * 1.9 + centerBias * 2.2;
    totalR += rgb.r * weight;
    totalG += rgb.g * weight;
    totalB += rgb.b * weight;
    totalWeight += weight;

    if (saturation >= 0.12 && lightness >= 0.18 && lightness <= 0.82) {
      const accentPixelWeight = 1 + saturation * 12 + centerBias * 2.6;
      accentR += rgb.r * accentPixelWeight;
      accentG += rgb.g * accentPixelWeight;
      accentB += rgb.b * accentPixelWeight;
      accentWeight += accentPixelWeight;
    }
  }
  if (accentWeight > 0) {
    return {
      r: clampByte(accentR / accentWeight),
      g: clampByte(accentG / accentWeight),
      b: clampByte(accentB / accentWeight),
    };
  }
  if (totalWeight === 0) {
    return null;
  }
  return {
    r: clampByte(totalR / totalWeight),
    g: clampByte(totalG / totalWeight),
    b: clampByte(totalB / totalWeight),
  };
}

export async function prepareAgentDraftCardPreview(input: {
  draft: AgentCaptureDraftSnapshot;
  storage: HookStorageClient;
  preferredLanguage?: string;
}): Promise<{ svg: string; svgDataUrl: string }> {
  const imageDataUrl = await resolveAgentDraftCardImageDataUrl(input);
  const averageColor = await extractAverageImageColor({ imageDataUrl }).catch(() => null);
  const svg = buildAgentDraftCardSvg({
    draft: input.draft,
    imageDataUrl,
    preferredLanguage: input.preferredLanguage,
    heroPalette: averageColor ? buildAgentDraftCardHeroPaletteFromRgb(averageColor) : DEFAULT_HERO_PALETTE,
  });
  return {
    svg,
    svgDataUrl: buildAgentDraftCardSvgDataUrl(svg),
  };
}

export async function exportAgentDraftCardPng(input: {
  draft: AgentCaptureDraftSnapshot;
  storage: HookStorageClient;
  preferredLanguage?: string;
}): Promise<void> {
  const prepared = await prepareAgentDraftCardPreview(input);
  const blob = await renderSvgToPngBlob(prepared.svg);
  downloadBlob(blob, buildAgentDraftCardFilename(input.draft));
}
