import type { RuntimeRouteBinding, RuntimeRouteOptionsSnapshot, RuntimeRouteSource } from '@nimiplatform/sdk/mod/runtime-route';
import { pickChatModelForConnector } from '../../services/route/route-override-store.js';

export function buildRouteOverrideForSource(input: {
  source: RuntimeRouteSource;
  previous: RuntimeRouteBinding | null;
  options: RuntimeRouteOptionsSnapshot | null;
}): RuntimeRouteBinding {
  const firstLocalModel = input.options?.localRuntime.models[0] || null;
  const base = input.previous || input.options?.selected || {
    source: 'local-runtime' as const,
    connectorId: '',
    model: '',
  };
  if (input.source === 'local-runtime') {
    return {
      source: 'local-runtime',
      connectorId: '',
      model: firstLocalModel?.model || base.model || '',
      localModelId: firstLocalModel?.localModelId || base.localModelId,
      engine: firstLocalModel?.engine || base.engine,
    };
  }
  const firstConnector = input.options?.connectors[0];
  return {
    source: 'token-api',
    connectorId: firstConnector?.id || base.connectorId || '',
    model: pickChatModelForConnector(firstConnector || null, base.model || ''),
    localModelId: undefined,
    engine: undefined,
  };
}

export function buildRouteOverrideForConnector(input: {
  connectorId: string;
  previous: RuntimeRouteBinding | null;
  options: RuntimeRouteOptionsSnapshot | null;
}): RuntimeRouteBinding {
  const connector = input.options?.connectors.find((item) => item.id === input.connectorId) || null;
  const base = input.previous || input.options?.selected || {
    source: 'token-api' as const,
    connectorId: '',
    model: '',
  };
  return {
    source: 'token-api',
    connectorId: input.connectorId,
    model: pickChatModelForConnector(connector, base.model || ''),
  };
}

export function buildRouteOverrideForModel(input: {
  model: string;
  previous: RuntimeRouteBinding | null;
  options: RuntimeRouteOptionsSnapshot | null;
}): RuntimeRouteBinding {
  const base = input.previous || input.options?.selected || {
    source: 'local-runtime' as const,
    connectorId: '',
    model: '',
  };
  return {
    ...base,
    model: input.model,
  };
}
