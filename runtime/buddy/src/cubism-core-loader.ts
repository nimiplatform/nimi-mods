import { resolveBuddyAssetUrl } from './mod-asset-url.js';

declare global {
  interface Window {
    Live2DCubismCore?: unknown;
  }
}

let loadPromise: Promise<void> | null = null;
const SCRIPT_MARKER = 'data-nimi-buddy-cubism-core';

/**
 * Ensure the Live2D Cubism 4 Core runtime (`window.Live2DCubismCore`) is loaded.
 *
 * pixi-live2d-display has a module-level guard that throws immediately if the
 * global is missing, so this MUST complete before any cubism4 code is evaluated.
 *
 * The Core runtime is intentionally not committed because of licensing.
 * Each developer must download `live2dcubismcore.min.js` from the official
 * Live2D Cubism SDK for Web page and place it under
 * `assets/live2d-core/live2dcubismcore.min.js`.
 */
export function ensureCubismCore(): Promise<void> {
  if ((window as any).Live2DCubismCore) {
    return Promise.resolve();
  }
  if (loadPromise) return loadPromise;

  loadPromise = tryLoadScript(buildLocalCoreUrl());
  return loadPromise;
}

function buildLocalCoreUrl(): string {
  return resolveBuddyAssetUrl('live2d-core/live2dcubismcore.min.js');
}

function tryLoadScript(src: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.setAttribute(SCRIPT_MARKER, '1');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(
        new Error(
          [
            'Failed to load Live2D Cubism Core from local assets.',
            'Download `live2dcubismcore.min.js` from https://www.live2d.com/sdk/download/web/',
            'and place it at `nimi-mods/runtime/buddy/assets/live2d-core/live2dcubismcore.min.js`.',
            `Tried: ${src}`,
          ].join(' '),
        ),
      );
    document.head.appendChild(script);
  });
}

export function resetCubismCoreLoader(): void {
  loadPromise = null;
  const script = document.querySelector(`script[${SCRIPT_MARKER}]`);
  script?.parentElement?.removeChild(script);
  if (window.Live2DCubismCore) {
    delete window.Live2DCubismCore;
  }
}
