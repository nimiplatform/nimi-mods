import type {
  RuntimeRouteBinding,
  RuntimeRouteOptionsSnapshot,
  RuntimeRouteSource,
} from '@nimiplatform/sdk/mod';

function normalizeText(value: unknown): string {
  return String(value || '').trim();
}

function firstLocalBinding(options: RuntimeRouteOptionsSnapshot): RuntimeRouteBinding | null {
  const local = options.local.models[0] || null;
  if (!local) {
    return null;
  }
  return {
    source: 'local',
    connectorId: '',
    model: normalizeText(local.modelId || local.model),
    ...(normalizeText(local.modelId || local.model)
      ? { modelId: normalizeText(local.modelId || local.model) }
      : {}),
    ...(normalizeText(local.localModelId)
      ? { localModelId: normalizeText(local.localModelId) }
      : {}),
    ...(normalizeText(local.engine) ? { engine: normalizeText(local.engine) } : {}),
    ...(normalizeText(local.provider || local.engine)
      ? { provider: normalizeText(local.provider || local.engine) }
      : {}),
    ...(normalizeText(local.endpoint) ? { endpoint: normalizeText(local.endpoint) } : {}),
  };
}

function firstCloudBinding(options: RuntimeRouteOptionsSnapshot): RuntimeRouteBinding | null {
  const connector = options.connectors[0] || null;
  const model = normalizeText(connector?.models[0]);
  if (!connector || !model) {
    return null;
  }
  return {
    source: 'cloud',
    connectorId: connector.id,
    model,
    ...(normalizeText(connector.provider) ? { provider: normalizeText(connector.provider) } : {}),
  };
}

function matchLocalBinding(
  binding: RuntimeRouteBinding,
  options: RuntimeRouteOptionsSnapshot,
): RuntimeRouteBinding | null {
  const targetLocalModelId = normalizeText(binding.localModelId);
  const targetModel = normalizeText(binding.modelId || binding.model);
  const targetEngine = normalizeText(binding.engine || binding.provider).toLowerCase();
  const local = options.local.models.find((item) => {
    const itemLocalModelId = normalizeText(item.localModelId);
    const itemModel = normalizeText(item.modelId || item.model);
    const itemEngine = normalizeText(item.engine || item.provider).toLowerCase();
    if (targetLocalModelId && itemLocalModelId === targetLocalModelId) {
      return true;
    }
    if (!targetModel || itemModel !== targetModel) {
      return false;
    }
    if (!targetEngine) {
      return true;
    }
    return itemEngine === targetEngine;
  }) || null;
  if (!local) {
    return null;
  }
  return {
    source: 'local',
    connectorId: '',
    model: normalizeText(local.modelId || local.model),
    ...(normalizeText(local.modelId || local.model)
      ? { modelId: normalizeText(local.modelId || local.model) }
      : {}),
    ...(normalizeText(local.localModelId)
      ? { localModelId: normalizeText(local.localModelId) }
      : {}),
    ...(normalizeText(local.engine) ? { engine: normalizeText(local.engine) } : {}),
    ...(normalizeText(local.provider || local.engine)
      ? { provider: normalizeText(local.provider || local.engine) }
      : {}),
    ...(normalizeText(local.endpoint) ? { endpoint: normalizeText(local.endpoint) } : {}),
  };
}

function matchCloudBinding(
  binding: RuntimeRouteBinding,
  options: RuntimeRouteOptionsSnapshot,
): RuntimeRouteBinding | null {
  const connectorId = normalizeText(binding.connectorId);
  const connector = options.connectors.find((item) => item.id === connectorId) || null;
  if (!connector) {
    return null;
  }
  const model = normalizeText(binding.model);
  const matchedModel = connector.models.find((item) => normalizeText(item) === model) || '';
  if (!matchedModel) {
    const fallbackModel = normalizeText(connector.models[0]);
    if (!fallbackModel) {
      return null;
    }
    return {
      source: 'cloud',
      connectorId: connector.id,
      model: fallbackModel,
      ...(normalizeText(connector.provider) ? { provider: normalizeText(connector.provider) } : {}),
    };
  }
  return {
    source: 'cloud',
    connectorId: connector.id,
    model: matchedModel,
    ...(normalizeText(binding.provider || connector.provider)
      ? { provider: normalizeText(binding.provider || connector.provider) }
      : {}),
  };
}

export function pickRouteBinding(snapshot: RuntimeRouteOptionsSnapshot | null): RuntimeRouteBinding | null {
  if (!snapshot) return null;
  const candidate = snapshot.resolvedDefault || snapshot.selected || null;
  if (!candidate || !normalizeText(candidate.model)) {
    return null;
  }
  return candidate;
}

export function ensureRouteSnapshot(snapshot: RuntimeRouteOptionsSnapshot | null): RuntimeRouteOptionsSnapshot | null {
  if (!snapshot) return null;
  return {
    ...snapshot,
    local: {
      models: snapshot.local?.models || [],
      defaultEndpoint: snapshot.local?.defaultEndpoint,
    },
    connectors: Array.isArray(snapshot.connectors) ? snapshot.connectors : [],
  };
}

export function reconcileRouteBinding(
  binding: RuntimeRouteBinding | null,
  options: RuntimeRouteOptionsSnapshot | null,
): RuntimeRouteBinding | null {
  if (!options) {
    return binding;
  }
  if (!binding) {
    return pickRouteBinding(options);
  }
  if (binding.source === 'cloud') {
    return matchCloudBinding(binding, options)
      || firstCloudBinding(options)
      || firstLocalBinding(options)
      || pickRouteBinding(options);
  }
  return matchLocalBinding(binding, options)
    || firstLocalBinding(options)
    || firstCloudBinding(options)
    || pickRouteBinding(options);
}

export function chooseBindingBySource(
  source: RuntimeRouteSource,
  options: RuntimeRouteOptionsSnapshot | null,
  previous: RuntimeRouteBinding | null,
): RuntimeRouteBinding | null {
  if (!options) return previous;
  if (source === 'local') {
    return firstLocalBinding(options) || previous;
  }
  return firstCloudBinding(options) || previous;
}

export function chooseBindingByConnector(
  connectorId: string,
  options: RuntimeRouteOptionsSnapshot | null,
  previous: RuntimeRouteBinding | null,
): RuntimeRouteBinding | null {
  if (!options) return previous;
  return matchCloudBinding({
    source: 'cloud',
    connectorId: normalizeText(connectorId),
    model: '',
  }, options) || previous;
}

export function chooseBindingByModel(
  model: string,
  previous: RuntimeRouteBinding | null,
): RuntimeRouteBinding | null {
  const normalized = normalizeText(model);
  if (!normalized) return previous;
  return {
    source: previous?.source || 'local',
    connectorId: previous?.connectorId || '',
    model: normalized,
    ...(previous?.localModelId ? { localModelId: previous.localModelId } : {}),
    ...(previous?.engine ? { engine: previous.engine } : {}),
    ...(previous?.modelId ? { modelId: previous.modelId } : {}),
    ...(previous?.provider ? { provider: previous.provider } : {}),
    ...(previous?.endpoint ? { endpoint: previous.endpoint } : {}),
  };
}
