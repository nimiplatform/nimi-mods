import type { ResolvedRuntimeRouteBinding, RuntimeRouteOverride } from '@nimiplatform/sdk/mod/types';
import type { LocalChatDefaultSettings } from '../../state/index.js';

type MediaKind = 'image' | 'video';
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

export function isMediaRouteReady(input: {
  kind: MediaKind;
  settings: LocalChatDefaultSettings;
}): boolean {
  const routeSource = normalizeRouteSource(
    input.kind === 'image'
      ? input.settings.imageRouteSource
      : input.settings.videoRouteSource,
  );
  if (routeSource === 'auto') {
    return false;
  }
  if (routeSource === 'local-runtime') {
    return true;
  }
  const connectorId = asTrimmedString(
    input.kind === 'image'
      ? input.settings.imageConnectorId
      : input.settings.videoConnectorId,
  );
  return Boolean(connectorId);
}

export function toPinnedRouteOverride(route: ResolvedRuntimeRouteBinding): RuntimeRouteOverride {
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
  const localModelId = asTrimmedString(route.localModelId) || model;
  return {
    source: 'local-runtime',
    ...(model ? { model } : {}),
    ...(localModelId ? { localModelId } : {}),
  };
}
