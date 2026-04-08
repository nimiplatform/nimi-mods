import {
  createCanonicalModAIScopeRef,
  createAISnapshotRecord,
  type AIConfig,
  type AIRuntimeEvidence,
  type AISchedulingEvaluationTarget,
  type AISnapshot,
  type ModRuntimeClient,
  type RuntimeRouteBinding,
  type RuntimeRouteOptionsSnapshot,
} from '@nimiplatform/sdk/mod';
import { KB_MOD_ID } from '../contracts.js';
import type { KBResolvedRoute, KBRouteSelection } from '../types.js';

export type KBRouteCapability = 'text.generate' | 'text.embed';

export const KB_AI_SCOPE_REF = createCanonicalModAIScopeRef(KB_MOD_ID);

function asString(value: unknown): string {
  return String(value || '').trim();
}

export function getKnowledgeBaseAIConfig(runtimeClient: ModRuntimeClient): AIConfig {
  return runtimeClient.aiConfig.get(KB_AI_SCOPE_REF);
}

export function subscribeKnowledgeBaseAIConfig(
  runtimeClient: ModRuntimeClient,
  callback: (config: AIConfig) => void,
): () => void {
  return runtimeClient.aiConfig.subscribe(KB_AI_SCOPE_REF, callback);
}

export function getKnowledgeBaseCapabilityBinding(
  config: AIConfig,
  capability: KBRouteCapability,
): RuntimeRouteBinding | undefined {
  return config.capabilities.selectedBindings[capability] ?? undefined;
}

function updateKnowledgeBaseAIConfig(
  runtimeClient: ModRuntimeClient,
  mutate: (config: AIConfig) => AIConfig,
): AIConfig {
  const current = getKnowledgeBaseAIConfig(runtimeClient);
  const next = mutate(current);
  runtimeClient.aiConfig.update(KB_AI_SCOPE_REF, next);
  return next;
}

export function updateKnowledgeBaseCapabilityBinding(
  runtimeClient: ModRuntimeClient,
  capability: KBRouteCapability,
  binding: RuntimeRouteBinding,
): AIConfig {
  return updateKnowledgeBaseAIConfig(runtimeClient, (config) => ({
    ...config,
    capabilities: {
      ...config.capabilities,
      selectedBindings: {
        ...config.capabilities.selectedBindings,
        [capability]: binding,
      },
    },
  }));
}

function resolveCloudBindingFromOptions(
  options: RuntimeRouteOptionsSnapshot | null,
  connectorId: string,
  model: string,
): RuntimeRouteBinding | null {
  if (!options) {
    return null;
  }
  const preferredConnectorId = asString(connectorId);
  const selectedConnectorId = options.selected?.source === 'cloud'
    ? asString(options.selected.connectorId)
    : '';
  const connector = (
    (preferredConnectorId ? options.connectors.find((item) => item.id === preferredConnectorId) : null)
    || (selectedConnectorId ? options.connectors.find((item) => item.id === selectedConnectorId) : null)
    || options.connectors[0]
    || null
  );
  const resolvedConnectorId = asString(connector?.id || preferredConnectorId || selectedConnectorId);
  const preferredModel = asString(model);
  const selectedModel = options.selected?.source === 'cloud'
    ? asString(options.selected.model)
    : '';
  const connectorModels = connector?.models || [];
  const resolvedModel = (
    (preferredModel && (connectorModels.length === 0 || connectorModels.includes(preferredModel)) ? preferredModel : '')
    || (selectedModel && (connectorModels.length === 0 || connectorModels.includes(selectedModel)) ? selectedModel : '')
    || asString(connectorModels[0])
    || preferredModel
    || selectedModel
  );
  if (!resolvedConnectorId || !resolvedModel) {
    return null;
  }
  return {
    source: 'cloud',
    connectorId: resolvedConnectorId,
    model: resolvedModel,
  };
}

function resolveLocalBindingFromOptions(
  options: RuntimeRouteOptionsSnapshot | null,
  model: string,
): RuntimeRouteBinding | null {
  if (!options) {
    return null;
  }
  const preferredModel = asString(model);
  const selectedModel = options.selected?.source === 'local'
    ? asString(options.selected.model)
    : '';
  const localModels = options.local?.models || [];
  const matchedModel = localModels.find((item) => {
    const candidateModel = asString(item.model);
    const localModelId = asString(item.localModelId);
    return (preferredModel && (candidateModel === preferredModel || localModelId === preferredModel))
      || (selectedModel && (candidateModel === selectedModel || localModelId === selectedModel));
  }) || null;
  const fallbackModel = matchedModel || localModels[0] || null;
  const resolvedModel = asString(
    matchedModel?.model || preferredModel || selectedModel || fallbackModel?.model,
  );
  const localModelId = asString(matchedModel?.localModelId || fallbackModel?.localModelId);
  if (!resolvedModel) {
    return null;
  }
  return {
    source: 'local',
    connectorId: '',
    model: resolvedModel,
    ...(localModelId ? { localModelId } : {}),
    ...(asString(fallbackModel?.engine) ? { engine: asString(fallbackModel?.engine) } : {}),
  };
}

export function materializeKnowledgeBaseBinding(
  selection: KBRouteSelection,
  options: RuntimeRouteOptionsSnapshot | null,
): RuntimeRouteBinding | null {
  return selection.source === 'cloud'
    ? resolveCloudBindingFromOptions(options, selection.connectorId, selection.model)
    : resolveLocalBindingFromOptions(options, selection.model);
}

export function deriveKnowledgeBaseRouteSelection(
  binding: RuntimeRouteBinding | null | undefined,
  routeOptions?: RuntimeRouteOptionsSnapshot | null,
): KBRouteSelection {
  if (binding?.source === 'cloud') {
    return {
      source: 'cloud',
      connectorId: asString(binding.connectorId),
      model: asString(binding.model),
    };
  }
  if (binding?.source === 'local') {
    return {
      source: 'local',
      connectorId: '',
      model: asString(binding.model || binding.localModelId),
    };
  }
  const fallbackBinding = routeOptions?.resolvedDefault || routeOptions?.selected || null;
  if (fallbackBinding?.source === 'local') {
    return {
      source: 'local',
      connectorId: '',
      model: asString(fallbackBinding.model || fallbackBinding.localModelId),
    };
  }
  return {
    source: 'cloud',
    connectorId: asString(fallbackBinding?.source === 'cloud' ? fallbackBinding.connectorId : ''),
    model: asString(fallbackBinding?.model),
  };
}

export function hydrateKnowledgeBaseCapabilityBinding(
  runtimeClient: ModRuntimeClient,
  capability: KBRouteCapability,
  options: RuntimeRouteOptionsSnapshot | null,
): RuntimeRouteBinding | null {
  const current = getKnowledgeBaseAIConfig(runtimeClient);
  const existing = getKnowledgeBaseCapabilityBinding(current, capability);
  if (existing) {
    return existing;
  }
  const selection = deriveKnowledgeBaseRouteSelection(undefined, options);
  const hydratedBinding = materializeKnowledgeBaseBinding(selection, options);
  if (!hydratedBinding) {
    return null;
  }
  updateKnowledgeBaseCapabilityBinding(runtimeClient, capability, hydratedBinding);
  return hydratedBinding;
}

export function resolveKnowledgeBaseRoute(
  config: AIConfig,
  capability: KBRouteCapability,
): KBResolvedRoute {
  return {
    binding: getKnowledgeBaseCapabilityBinding(config, capability),
  };
}

export function resolveKnowledgeBaseSchedulingTarget(
  config: AIConfig,
  capability: KBRouteCapability,
): AISchedulingEvaluationTarget | null {
  const binding = getKnowledgeBaseCapabilityBinding(config, capability);
  if (!binding || binding.source !== 'local') {
    return null;
  }
  const localProfileRef = config.capabilities.localProfileRefs?.[capability];
  return {
    capability,
    modId: localProfileRef?.modId || null,
    profileId: localProfileRef?.profileId || null,
    resourceHint: null,
  };
}

export async function buildKnowledgeBaseRuntimeEvidence(
  runtimeClient: ModRuntimeClient,
  config: AIConfig,
  capability: KBRouteCapability,
): Promise<AIRuntimeEvidence | null> {
  const target = resolveKnowledgeBaseSchedulingTarget(config, capability);
  if (!target) {
    return null;
  }
  const schedulingJudgement = await runtimeClient.aiConfig.probeSchedulingTarget(
    KB_AI_SCOPE_REF,
    target,
  );
  return {
    schedulingJudgement,
  };
}

export async function recordKnowledgeBaseExecutionSnapshot(
  runtimeClient: ModRuntimeClient,
  input: {
    config: AIConfig;
    capability: KBRouteCapability;
    metadata?: unknown;
  },
): Promise<AISnapshot> {
  const selectedBinding = getKnowledgeBaseCapabilityBinding(input.config, input.capability) || null;
  const runtimeEvidence = await buildKnowledgeBaseRuntimeEvidence(
    runtimeClient,
    input.config,
    input.capability,
  );
  const snapshot = createAISnapshotRecord({
    scopeRef: KB_AI_SCOPE_REF,
    config: input.config,
    capability: input.capability,
    selectedBinding,
    resolvedBinding: null,
    health: null,
    metadata: input.metadata ?? null,
    agentResolution: null,
    runtimeEvidence,
  });
  runtimeClient.aiSnapshot.record(KB_AI_SCOPE_REF, snapshot);
  return snapshot;
}
