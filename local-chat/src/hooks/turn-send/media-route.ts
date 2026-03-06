import type { RuntimeRouteBinding } from '@nimiplatform/sdk/mod/runtime-route';
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
  routeBinding?: RuntimeRouteBinding;
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
    const override: RuntimeRouteBinding = {
      source: 'local-runtime',
      connectorId: '',
      model: model || '',
      ...(model ? { model, localModelId: model } : {}),
    };
    return {
      routeSource,
      routeBinding: override,
      model: model || undefined,
    };
  }

  if (routeSource === 'token-api') {
    const override: RuntimeRouteBinding = {
      source: 'token-api',
      connectorId,
      model: model || '',
      ...(connectorId ? { connectorId } : {}),
      ...(model ? { model } : {}),
    };
    return {
      routeSource,
      routeBinding: override,
      model: model || undefined,
    };
  }

  if (connectorId || model) {
    const inferredSource = connectorId ? 'token-api' : fallbackSource;
    const override: RuntimeRouteBinding = {
      source: inferredSource,
      connectorId,
      model: model || '',
      ...(connectorId ? { connectorId } : {}),
      ...(model ? { model } : {}),
      ...(model && inferredSource === 'local-runtime' ? { localModelId: model } : {}),
    };
    return {
      routeSource,
      routeBinding: override,
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

export function toPinnedRouteBinding(route: {
  source: string;
  connectorId?: string;
  model?: string;
  localModelId?: string;
}): RuntimeRouteBinding {
  if (route.source === 'token-api') {
    const connectorId = asTrimmedString(route.connectorId);
    const model = asTrimmedString(route.model);
    return {
      source: 'token-api',
      connectorId,
      model,
    };
  }
  const model = asTrimmedString(route.model);
  const localModelId = asTrimmedString(route.localModelId) || model;
  return {
    source: 'local-runtime',
    connectorId: '',
    model,
    ...(localModelId ? { localModelId } : {}),
  };
}
