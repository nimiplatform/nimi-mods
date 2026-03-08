import type { RuntimeRouteBinding, RuntimeRouteOptionsSnapshot, RuntimeRouteSource } from '@nimiplatform/sdk/mod/runtime-route';
import { pickChatModelForConnector } from '../../services/route/route-override-store.js';
import { resolveLocalRuntimeModelsForScenario } from '../../services/route/connector-model-capabilities.js';

export function buildRouteBindingForSource(input: {
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

export function buildRouteBindingForConnector(input: {
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

export function buildRouteBindingForModel(input: {
  model: string;
  previous: RuntimeRouteBinding | null;
  options: RuntimeRouteOptionsSnapshot | null;
}): RuntimeRouteBinding {
  const base = input.previous || input.options?.selected || {
    source: 'local-runtime' as const,
    connectorId: '',
    model: '',
  };
  if (base.source === 'local-runtime') {
    const matchedLocalModel = resolveLocalRuntimeModelsForScenario({
      models: input.options?.localRuntime.models || [],
      scenario: 'chat',
    }).find((candidate) => (
      String(candidate.model || '').trim() === String(input.model || '').trim()
      || String(candidate.localModelId || '').trim() === String(input.model || '').trim()
    )) || null;
    return {
      source: 'local-runtime',
      connectorId: '',
      model: input.model,
      ...(matchedLocalModel?.localModelId ? { localModelId: matchedLocalModel.localModelId } : {}),
      ...(matchedLocalModel?.engine ? { engine: matchedLocalModel.engine } : {}),
    };
  }
  return {
    source: 'token-api',
    connectorId: base.connectorId,
    model: input.model,
    localModelId: undefined,
    engine: undefined,
  };
}
