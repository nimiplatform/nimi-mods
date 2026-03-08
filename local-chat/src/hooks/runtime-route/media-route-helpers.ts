import type { RuntimeCanonicalCapability, RuntimeRouteOptionsSnapshot } from '@nimiplatform/sdk/mod/runtime-route';
import type { LocalChatDefaultSettings } from '../../state/index.js';
import type { LocalChatResolvedMediaRoute } from '../../types.js';
import { resolveMediaRouteFromOptions } from '../turn-send/media-route.js';

export type LocalChatMediaRouteKind = 'image' | 'video';

function normalizeRouteSource(value: unknown): 'local' | 'cloud' | undefined {
  const normalized = String(value || '').trim();
  if (normalized === 'local' || normalized === 'cloud') {
    return normalized;
  }
  return undefined;
}

export function mediaCapabilityForKind(kind: LocalChatMediaRouteKind): RuntimeCanonicalCapability {
  return kind === 'image' ? 'image.generate' : 'video.generate';
}

export function resolveMediaRouteSnapshot(input: {
  kind: LocalChatMediaRouteKind;
  settings: LocalChatDefaultSettings;
  routeOptions?: RuntimeRouteOptionsSnapshot | null;
  routeOptionsRevision?: number;
}): LocalChatResolvedMediaRoute | null {
  return resolveMediaRouteFromOptions({
    kind: input.kind,
    settings: input.settings,
    routeOptions: input.routeOptions || null,
    routeOptionsRevision: input.routeOptionsRevision,
  });
}

export function resolveMediaDependencyRouteSourceHint(input: {
  kind: LocalChatMediaRouteKind;
  settings: LocalChatDefaultSettings;
  routeOptions?: RuntimeRouteOptionsSnapshot | null;
  routeOptionsRevision?: number;
}): 'local' | 'cloud' | undefined {
  const configuredSource = normalizeRouteSource(
    input.kind === 'image'
      ? input.settings.imageRouteSource
      : input.settings.videoRouteSource,
  );
  if (configuredSource) {
    return configuredSource;
  }

  const resolvedRoute = resolveMediaRouteSnapshot(input);
  if (resolvedRoute) {
    return resolvedRoute.source;
  }

  return normalizeRouteSource(input.routeOptions?.resolvedDefault?.source)
    || normalizeRouteSource(input.routeOptions?.selected?.source)
    || undefined;
}
