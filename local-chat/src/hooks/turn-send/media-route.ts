import type {
  ResolvedRuntimeRouteBinding,
  RuntimeRouteOverride,
} from '@nimiplatform/sdk/mod/types';
import type { RuntimeRouteOptionsSnapshot } from '@nimiplatform/sdk/mod/runtime-route';
import type { LocalChatDefaultSettings } from '../../state/index.js';
import type { LocalChatResolvedMediaRoute } from '../../types.js';
import type { LocalChatTurnAiClient } from './types.js';

export type MediaKind = 'image' | 'video';

type MediaRouteSource = LocalChatDefaultSettings['imageRouteSource'];

function normalizeRouteSource(value: string): MediaRouteSource {
  if (value === 'local-runtime' || value === 'token-api') {
    return value;
  }
  return 'auto';
}

function asTrimmedString(value: unknown): string {
  return String(value ?? '').trim();
}

export function buildMediaSettingsRevision(input: {
  kind: MediaKind;
  settings: LocalChatDefaultSettings;
}): string {
  const routeSource = normalizeRouteSource(
    input.kind === 'image'
      ? input.settings.imageRouteSource
      : input.settings.videoRouteSource,
  );
  const connectorId = asTrimmedString(
    input.kind === 'image'
      ? input.settings.imageConnectorId
      : input.settings.videoConnectorId,
  );
  const model = asTrimmedString(
    input.kind === 'image'
      ? input.settings.imageModel
      : input.settings.videoModel,
  );
  return [input.kind, routeSource, connectorId, model].join('|');
}

export function resolveMediaRouteConfig(input: {
  kind: MediaKind;
  settings: LocalChatDefaultSettings;
  fallbackSource?: 'local-runtime' | 'token-api';
}): {
  routeSource: MediaRouteSource;
  routeOverride?: RuntimeRouteOverride;
  model?: string;
} {
  const routeSource = normalizeRouteSource(
    input.kind === 'image'
      ? input.settings.imageRouteSource
      : input.settings.videoRouteSource,
  );
  const connectorId = asTrimmedString(
    input.kind === 'image'
      ? input.settings.imageConnectorId
      : input.settings.videoConnectorId,
  );
  const model = asTrimmedString(
    input.kind === 'image'
      ? input.settings.imageModel
      : input.settings.videoModel,
  );
  const fallbackSource = input.fallbackSource || 'local-runtime';

  if (routeSource === 'local-runtime') {
    const override: RuntimeRouteOverride = {
      source: 'local-runtime',
      ...(model ? { model, localModelId: model } : {}),
    };
    return {
      routeSource,
      routeOverride: override,
      model: model || undefined,
    };
  }

  if (routeSource === 'token-api') {
    const override: RuntimeRouteOverride = {
      source: 'token-api',
      ...(connectorId ? { connectorId } : {}),
      ...(model ? { model } : {}),
    };
    return {
      routeSource,
      routeOverride: override,
      model: model || undefined,
    };
  }

  if (connectorId || model) {
    const inferredSource = connectorId ? 'token-api' : fallbackSource;
    const override: RuntimeRouteOverride = {
      source: inferredSource,
      ...(connectorId ? { connectorId } : {}),
      ...(model ? { model } : {}),
      ...(model && inferredSource === 'local-runtime' ? { localModelId: model } : {}),
    };
    return {
      routeSource,
      routeOverride: override,
      model: model || undefined,
    };
  }

  return {
    routeSource,
    model: undefined,
  };
}

function toResolvedMediaRoute(input: {
  binding: Pick<ResolvedRuntimeRouteBinding, 'source' | 'connectorId' | 'model'> & {
    provider?: string;
  };
  resolvedBy: LocalChatResolvedMediaRoute['resolvedBy'];
  settingsRevision: string;
  routeOptionsRevision: number;
}): LocalChatResolvedMediaRoute {
  return {
    source: input.binding.source === 'token-api' ? 'token-api' : 'local-runtime',
    ...(asTrimmedString(input.binding.connectorId) ? { connectorId: asTrimmedString(input.binding.connectorId) } : {}),
    model: asTrimmedString(input.binding.model),
    provider: asTrimmedString(input.binding.provider) || undefined,
    resolvedBy: input.resolvedBy,
    resolvedAt: new Date().toISOString(),
    settingsRevision: input.settingsRevision,
    routeOptionsRevision: input.routeOptionsRevision,
  };
}

export function resolveMediaRouteFromOptions(input: {
  kind: MediaKind;
  settings: LocalChatDefaultSettings;
  routeOptions: RuntimeRouteOptionsSnapshot | null;
  routeOptionsRevision: number;
}): LocalChatResolvedMediaRoute | null {
  const routeConfig = resolveMediaRouteConfig({
    kind: input.kind,
    settings: input.settings,
  });
  if (routeConfig.routeSource !== 'auto') {
    return null;
  }
  if (!input.routeOptions) {
    return null;
  }
  const settingsRevision = buildMediaSettingsRevision({
    kind: input.kind,
    settings: input.settings,
  });
  const resolvedDefault = input.routeOptions.resolvedDefault || null;
  if (resolvedDefault) {
    return toResolvedMediaRoute({
      binding: resolvedDefault,
      resolvedBy: 'resolved-default',
      settingsRevision,
      routeOptionsRevision: input.routeOptionsRevision,
    });
  }
  const selected = input.routeOptions.selected || null;
  if (selected && (selected.source === 'local-runtime' || selected.source === 'token-api')) {
    return toResolvedMediaRoute({
      binding: selected,
      resolvedBy: 'selected',
      settingsRevision,
      routeOptionsRevision: input.routeOptionsRevision,
    });
  }
  return null;
}

export async function preflightResolveMediaRoute(input: {
  aiClient: Pick<LocalChatTurnAiClient, 'resolveRoute'>;
  kind: MediaKind;
  settings: LocalChatDefaultSettings;
  fallbackSource?: 'local-runtime' | 'token-api';
  routeOptionsRevision: number;
}): Promise<LocalChatResolvedMediaRoute | null> {
  const settingsRevision = buildMediaSettingsRevision({
    kind: input.kind,
    settings: input.settings,
  });
  try {
    const routeConfig = resolveMediaRouteConfig({
      kind: input.kind,
      settings: input.settings,
      fallbackSource: input.fallbackSource,
    });
    const resolved = await input.aiClient.resolveRoute({
      routeHint: input.kind === 'image' ? 'image/default' : 'video/default',
      routeOverride: routeConfig.routeOverride,
    });
    return toResolvedMediaRoute({
      binding: resolved,
      resolvedBy: 'preflight',
      settingsRevision,
      routeOptionsRevision: input.routeOptionsRevision,
    });
  } catch {
    return null;
  }
}

export function isResolvedMediaRouteFresh(input: {
  route: LocalChatResolvedMediaRoute | null | undefined;
  settingsRevision: string;
  routeOptionsRevision: number;
  now?: number;
}): boolean {
  if (!input.route) return false;
  if (input.route.settingsRevision !== input.settingsRevision) {
    return false;
  }
  if (input.route.routeOptionsRevision !== input.routeOptionsRevision) {
    return false;
  }
  const resolvedAtMs = new Date(input.route.resolvedAt).getTime();
  if (!Number.isFinite(resolvedAtMs)) {
    return false;
  }
  const now = Number.isFinite(input.now) ? Number(input.now) : Date.now();
  return now - resolvedAtMs <= 30_000;
}

export function isMediaRouteReady(input: {
  kind: MediaKind;
  settings: LocalChatDefaultSettings;
  routeOptions?: RuntimeRouteOptionsSnapshot | null;
  routeOptionsRevision?: number;
  resolvedRoute?: LocalChatResolvedMediaRoute | null;
  now?: number;
}): boolean {
  const routeConfig = resolveMediaRouteConfig({
    kind: input.kind,
    settings: input.settings,
  });
  if (routeConfig.routeSource === 'local-runtime') {
    return true;
  }
  if (routeConfig.routeSource === 'token-api') {
    return Boolean(String(routeConfig.routeOverride?.connectorId || '').trim());
  }

  const settingsRevision = buildMediaSettingsRevision({
    kind: input.kind,
    settings: input.settings,
  });
  const routeOptionsRevision = Number.isFinite(input.routeOptionsRevision)
    ? Math.max(0, Math.floor(Number(input.routeOptionsRevision)))
    : 0;
  if (isResolvedMediaRouteFresh({
    route: input.resolvedRoute,
    settingsRevision,
    routeOptionsRevision,
    now: input.now,
  })) {
    return true;
  }
  if (!input.routeOptions) {
    return false;
  }
  return Boolean(resolveMediaRouteFromOptions({
    kind: input.kind,
    settings: input.settings,
    routeOptions: input.routeOptions,
    routeOptionsRevision,
  }));
}

export function toPinnedRouteOverride(route: ResolvedRuntimeRouteBinding | LocalChatResolvedMediaRoute): RuntimeRouteOverride {
  if (route.source === 'token-api') {
    const connectorId = asTrimmedString(route.connectorId);
    const model = asTrimmedString(route.model);
    return {
      source: 'token-api',
      ...(connectorId ? { connectorId } : {}),
      ...(model ? { model } : {}),
    };
  }
  const model = asTrimmedString(route.model);
  const localModelId = asTrimmedString('localModelId' in route ? route.localModelId : '') || model;
  return {
    source: 'local-runtime',
    ...(model ? { model } : {}),
    ...(localModelId ? { localModelId } : {}),
  };
}
