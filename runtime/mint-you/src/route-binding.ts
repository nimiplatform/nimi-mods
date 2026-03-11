import type {
  RuntimeRouteBinding,
  RuntimeRouteLocalOption,
  RuntimeRouteOptionsSnapshot,
} from '@nimiplatform/sdk/mod/runtime-route';

function trimToken(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function toLocalBinding(option: RuntimeRouteLocalOption): RuntimeRouteBinding {
  return {
    source: 'local',
    connectorId: '',
    model: option.model,
    localModelId: option.localModelId,
    engine: option.engine,
  };
}

export function ensureMintYouRouteOptionsSnapshotShape(
  snapshot: RuntimeRouteOptionsSnapshot | null,
): RuntimeRouteOptionsSnapshot | null {
  if (!snapshot) {
    return null;
  }
  return {
    ...snapshot,
    local: {
      models: snapshot.local?.models || [],
      defaultEndpoint: snapshot.local?.defaultEndpoint,
    },
    connectors: Array.isArray(snapshot.connectors) ? snapshot.connectors : [],
  };
}

export function areMintYouRouteBindingsEqual(
  left: RuntimeRouteBinding | null | undefined,
  right: RuntimeRouteBinding | null | undefined,
): boolean {
  if (!left && !right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.source === right.source
    && trimToken(left.connectorId) === trimToken(right.connectorId)
    && trimToken(left.model) === trimToken(right.model)
    && trimToken(left.localModelId) === trimToken(right.localModelId)
    && trimToken(left.engine) === trimToken(right.engine)
  );
}

export function sanitizeMintYouRouteBinding(
  binding: RuntimeRouteBinding | null | undefined,
  routeOptions: RuntimeRouteOptionsSnapshot | null,
): RuntimeRouteBinding | null {
  if (!binding) {
    return null;
  }

  const normalizedModel = trimToken(binding.model);
  if (!normalizedModel) {
    return null;
  }

  const snapshot = ensureMintYouRouteOptionsSnapshotShape(routeOptions);
  if (!snapshot) {
    return {
      ...binding,
      source: binding.source === 'cloud' ? 'cloud' : 'local',
      connectorId: binding.source === 'cloud' ? trimToken(binding.connectorId) : '',
      model: normalizedModel,
      localModelId: trimToken(binding.localModelId) || undefined,
      engine: trimToken(binding.engine) || undefined,
    };
  }

  if (binding.source !== 'cloud') {
    const matchedLocalModel = snapshot.local.models.find((item) => item.model === normalizedModel) || null;
    if (matchedLocalModel) {
      return toLocalBinding(matchedLocalModel);
    }
    const fallbackLocalModel = snapshot.local.models[0] || null;
    return fallbackLocalModel ? toLocalBinding(fallbackLocalModel) : null;
  }

  const connectors = snapshot.connectors;
  const matchedConnector = connectors.find((item) => item.id === trimToken(binding.connectorId)) || null;
  const fallbackConnector = matchedConnector || connectors[0] || null;
  if (!fallbackConnector) {
    return null;
  }

  const nextModel = fallbackConnector.models.includes(normalizedModel)
    ? normalizedModel
    : trimToken(fallbackConnector.models[0]);
  if (!nextModel) {
    return null;
  }

  return {
    source: 'cloud',
    connectorId: fallbackConnector.id,
    model: nextModel,
  };
}
