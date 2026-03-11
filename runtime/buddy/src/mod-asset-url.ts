import { MOD_ID } from './contracts.js';

const MOD_SLUG = 'buddy';
const DIST_MARKER = `/dist/mods/${MOD_SLUG}/`;

function normalizeRelativeAssetPath(relativePath: string): string {
  return String(relativePath || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .replace(/^assets\//, '');
}

function normalizeFsPath(fsPath: string): string {
  return String(fsPath || '').trim().replace(/\\/g, '/');
}

function resolveSourceDirFromInjectedStyles(): string | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const styleNodes = Array.from(
    document.querySelectorAll<HTMLStyleElement>(`style[data-runtime-mod-id="${MOD_ID}"][data-runtime-mod-path]`),
  );
  for (const node of styleNodes) {
    const stylePath = normalizeFsPath(node.dataset.runtimeModPath || '');
    if (!stylePath) continue;
    const markerIndex = stylePath.lastIndexOf(DIST_MARKER);
    if (markerIndex >= 0) {
      return stylePath.slice(0, markerIndex);
    }
  }
  return null;
}

function toFsAssetUrl(absolutePath: string): string {
  const normalized = normalizeFsPath(absolutePath);
  if (typeof window !== 'undefined' && /^https?:\/\//.test(window.location.origin)) {
    const fsPath = normalized.startsWith('/') ? normalized : `/${normalized}`;
    return `${window.location.origin}/@fs${encodeURI(fsPath)}`;
  }
  if (/^[a-zA-Z]:\//.test(normalized)) {
    return encodeURI(`file:///${normalized}`);
  }
  return encodeURI(`file://${normalized}`);
}

export function resolveBuddyAssetUrl(relativePath: string): string {
  const assetPath = normalizeRelativeAssetPath(relativePath);
  const sourceDir = resolveSourceDirFromInjectedStyles();
  if (!sourceDir) {
    throw new Error(
      'Buddy local asset root is unavailable. Ensure buddy styles are injected before loading Live2D assets.',
    );
  }
  return toFsAssetUrl(`${sourceDir}/assets/${assetPath}`);
}
