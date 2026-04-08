import {
  createCanonicalModAIScopeRef,
  createAISnapshotRecord,
  type AIConfig,
  type AIRuntimeEvidence,
  type AISchedulingEvaluationTarget,
  type AISnapshot,
  type ModKvStore,
  type ModRuntimeClient,
  type RuntimeRouteBinding,
  type RuntimeRouteOptionsSnapshot,
  createModKvStore,
  createModStorageClient,
} from '@nimiplatform/sdk/mod';
import { AUDIO_BOOK_MOD_ID } from '../contracts.js';

export type AudioBookRouteCapability = 'text.generate' | 'audio.synthesize';

export type RouteSelection = {
  connectorId: string;
  routeSource: 'auto' | 'local' | 'cloud';
  model?: string;
};

const EXECUTION_BINDING_ERROR_CODES: Record<AudioBookRouteCapability, {
  missing: string;
  connector: string;
  model: string;
}> = {
  'text.generate': {
    missing: 'AUDIO_BOOK_TEXT_GENERATE_BINDING_REQUIRED',
    connector: 'AUDIO_BOOK_TEXT_GENERATE_CONNECTOR_REQUIRED',
    model: 'AUDIO_BOOK_TEXT_GENERATE_MODEL_REQUIRED',
  },
  'audio.synthesize': {
    missing: 'AUDIO_BOOK_AUDIO_SYNTHESIZE_BINDING_REQUIRED',
    connector: 'AUDIO_BOOK_AUDIO_SYNTHESIZE_CONNECTOR_REQUIRED',
    model: 'AUDIO_BOOK_AUDIO_SYNTHESIZE_MODEL_REQUIRED',
  },
};

export const AUDIO_BOOK_AI_SCOPE_REF = createCanonicalModAIScopeRef(AUDIO_BOOK_MOD_ID);

const LEGACY_ROUTE_NAMESPACE = 'audio-book.route';
const LEGACY_CHAT_ROUTE_KEY = 'audio-book:chat-connector';
const LEGACY_TTS_ROUTE_KEY = 'audio-book:tts-connector';

const EMPTY_SELECTION: RouteSelection = { connectorId: '', routeSource: 'auto' };

function asString(value: unknown): string {
  return String(value || '').trim();
}

function normalizeSelection(value: unknown): RouteSelection {
  if (!value || typeof value !== 'object') {
    return { ...EMPTY_SELECTION };
  }
  const record = value as Record<string, unknown>;
  const routeSource = record.routeSource === 'cloud'
    ? 'cloud'
    : record.routeSource === 'local'
      ? 'local'
      : 'auto';
  const model = asString(record.model);
  return {
    connectorId: asString(record.connectorId),
    routeSource,
    ...(model ? { model } : {}),
  };
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

function updateAudioBookAIConfig(
  runtimeClient: ModRuntimeClient,
  mutate: (config: AIConfig) => AIConfig,
): AIConfig {
  const current = getAudioBookAIConfig(runtimeClient);
  const next = mutate(current);
  runtimeClient.aiConfig.update(AUDIO_BOOK_AI_SCOPE_REF, next);
  return next;
}

export function createAudioBookLegacyRouteStore(): ModKvStore {
  return createModKvStore({
    storage: createModStorageClient(AUDIO_BOOK_MOD_ID),
    namespace: LEGACY_ROUTE_NAMESPACE,
  });
}

export async function readLegacyAudioBookRouteSelections(
  store: Pick<ModKvStore, 'getJson'> = createAudioBookLegacyRouteStore(),
): Promise<{
  chatSelection: RouteSelection;
  ttsSelection: RouteSelection;
}> {
  const [chatSelection, ttsSelection] = await Promise.all([
    store.getJson<Record<string, unknown>>(LEGACY_CHAT_ROUTE_KEY),
    store.getJson<Record<string, unknown>>(LEGACY_TTS_ROUTE_KEY),
  ]);
  return {
    chatSelection: normalizeSelection(chatSelection),
    ttsSelection: normalizeSelection(ttsSelection),
  };
}

export async function clearLegacyAudioBookRouteSelections(
  store: Pick<ModKvStore, 'delete'> = createAudioBookLegacyRouteStore(),
): Promise<void> {
  await Promise.all([
    store.delete(LEGACY_CHAT_ROUTE_KEY),
    store.delete(LEGACY_TTS_ROUTE_KEY),
  ]);
}

export function getAudioBookAIConfig(runtimeClient: ModRuntimeClient): AIConfig {
  return runtimeClient.aiConfig.get(AUDIO_BOOK_AI_SCOPE_REF);
}

export function subscribeAudioBookAIConfig(
  runtimeClient: ModRuntimeClient,
  callback: (config: AIConfig) => void,
): () => void {
  return runtimeClient.aiConfig.subscribe(AUDIO_BOOK_AI_SCOPE_REF, callback);
}

export function getAudioBookCapabilityBinding(
  config: AIConfig,
  capability: AudioBookRouteCapability,
): RuntimeRouteBinding | undefined {
  return config.capabilities.selectedBindings[capability] ?? undefined;
}

export function requireAudioBookExecutionBinding(
  config: AIConfig,
  capability: AudioBookRouteCapability,
): RuntimeRouteBinding {
  const binding = getAudioBookCapabilityBinding(config, capability);
  const errorCodes = EXECUTION_BINDING_ERROR_CODES[capability];
  if (!binding) {
    throw new Error(errorCodes.missing);
  }
  const connectorId = asString(binding.connectorId);
  const model = asString(binding.model);
  if (binding.source === 'cloud' && !connectorId) {
    throw new Error(errorCodes.connector);
  }
  if (!model) {
    throw new Error(errorCodes.model);
  }
  return {
    ...binding,
    connectorId,
    model,
  };
}

export function readRequiredAudioBookExecutionBinding(
  runtimeClient: ModRuntimeClient,
  capability: AudioBookRouteCapability,
): RuntimeRouteBinding {
  return requireAudioBookExecutionBinding(
    getAudioBookAIConfig(runtimeClient),
    capability,
  );
}

export function resolveAudioBookSchedulingTarget(
  config: AIConfig,
  capability: AudioBookRouteCapability,
): AISchedulingEvaluationTarget | null {
  const binding = getAudioBookCapabilityBinding(config, capability);
  if (!binding || binding.source !== 'local') {
    return null;
  }
  const localProfileRef = config.capabilities.localProfileRefs?.[capability];
  if (!localProfileRef?.profileId) {
    return null;
  }
  return {
    capability,
    modId: localProfileRef.modId || null,
    profileId: localProfileRef.profileId,
    resourceHint: null,
  };
}

export async function buildAudioBookRuntimeEvidence(
  runtimeClient: ModRuntimeClient,
  config: AIConfig,
  capability: AudioBookRouteCapability,
): Promise<AIRuntimeEvidence | null> {
  const target = resolveAudioBookSchedulingTarget(config, capability);
  if (!target) {
    return null;
  }
  const schedulingJudgement = await runtimeClient.aiConfig.probeSchedulingTarget(
    AUDIO_BOOK_AI_SCOPE_REF,
    target,
  );
  return {
    schedulingJudgement,
  };
}

export async function recordAudioBookExecutionSnapshot(
  runtimeClient: ModRuntimeClient,
  input: {
    config: AIConfig;
    capability: AudioBookRouteCapability;
    metadata?: unknown;
  },
): Promise<AISnapshot> {
  const selectedBinding = getAudioBookCapabilityBinding(input.config, input.capability) || null;
  const runtimeEvidence = await buildAudioBookRuntimeEvidence(
    runtimeClient,
    input.config,
    input.capability,
  );
  const snapshot = createAISnapshotRecord({
    scopeRef: AUDIO_BOOK_AI_SCOPE_REF,
    config: input.config,
    capability: input.capability,
    selectedBinding,
    resolvedBinding: null,
    health: null,
    metadata: input.metadata ?? null,
    agentResolution: null,
    runtimeEvidence,
  });
  runtimeClient.aiSnapshot.record(AUDIO_BOOK_AI_SCOPE_REF, snapshot);
  return snapshot;
}

export async function runWithAudioBookExecutionBinding<T>(
  runtimeClient: ModRuntimeClient,
  input: {
    capability: AudioBookRouteCapability;
    metadata?: unknown;
    run: (context: {
      config: AIConfig;
      binding: RuntimeRouteBinding;
      snapshot: AISnapshot;
    }) => Promise<T> | T;
  },
): Promise<T> {
  const config = getAudioBookAIConfig(runtimeClient);
  const binding = requireAudioBookExecutionBinding(config, input.capability);
  const snapshot = await recordAudioBookExecutionSnapshot(runtimeClient, {
    config,
    capability: input.capability,
    metadata: input.metadata,
  });
  return await input.run({
    config,
    binding,
    snapshot,
  });
}

export function updateAudioBookCapabilityBinding(
  runtimeClient: ModRuntimeClient,
  capability: AudioBookRouteCapability,
  binding: RuntimeRouteBinding,
): AIConfig {
  return updateAudioBookAIConfig(runtimeClient, (config) => ({
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

export function deriveAudioBookRouteSelection(
  binding: RuntimeRouteBinding | null | undefined,
  routeOptions?: RuntimeRouteOptionsSnapshot | null,
): RouteSelection {
  if (binding?.source === 'cloud') {
    return {
      routeSource: 'cloud',
      connectorId: asString(binding.connectorId),
      model: asString(binding.model),
    };
  }
  if (binding?.source === 'local') {
    return {
      routeSource: 'local',
      connectorId: '',
      model: asString(binding.model || binding.localModelId),
    };
  }
  const fallbackBinding = routeOptions?.resolvedDefault || routeOptions?.selected || null;
  if (fallbackBinding?.source === 'local') {
    return {
      routeSource: 'local',
      connectorId: '',
      model: asString(fallbackBinding.model || fallbackBinding.localModelId),
    };
  }
  return {
    routeSource: fallbackBinding?.source === 'cloud' ? 'cloud' : 'auto',
    connectorId: asString(fallbackBinding?.source === 'cloud' ? fallbackBinding.connectorId : ''),
    model: asString(fallbackBinding?.model),
  };
}

export function materializeAudioBookBinding(
  selection: RouteSelection,
  routeOptions: RuntimeRouteOptionsSnapshot | null,
): RuntimeRouteBinding | null {
  if (selection.routeSource === 'local') {
    return resolveLocalBindingFromOptions(routeOptions, selection.model || '');
  }
  return resolveCloudBindingFromOptions(
    routeOptions,
    selection.connectorId,
    selection.model || '',
  );
}

export function hydrateAudioBookCapabilityBinding(
  runtimeClient: ModRuntimeClient,
  capability: AudioBookRouteCapability,
  routeOptions: RuntimeRouteOptionsSnapshot | null,
  selection?: RouteSelection | null,
): RuntimeRouteBinding | null {
  const current = getAudioBookAIConfig(runtimeClient);
  const existing = getAudioBookCapabilityBinding(current, capability);
  if (existing) {
    return existing;
  }
  const nextSelection = selection || deriveAudioBookRouteSelection(undefined, routeOptions);
  const binding = materializeAudioBookBinding(nextSelection, routeOptions);
  if (!binding) {
    return null;
  }
  updateAudioBookCapabilityBinding(runtimeClient, capability, binding);
  return binding;
}
