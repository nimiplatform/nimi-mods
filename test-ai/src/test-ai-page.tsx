import React from 'react';
import {
  buildLocalImageWorkflowExtensions,
} from '@nimiplatform/sdk/mod/runtime';
import type {
  LocalImageWorkflowComponentSelection,
  ModRuntimeClient,
  ModRuntimeLocalArtifactKind,
  ModRuntimeLocalArtifactRecord,
  ModRuntimeResolvedBinding,
} from '@nimiplatform/sdk/mod/runtime';
import {
  parseRuntimeRouteOptions,
} from '@nimiplatform/sdk/mod/runtime-route';
import type {
  RuntimeCanonicalCapability,
  RuntimeRouteBinding,
  RuntimeRouteOptionsSnapshot,
  RuntimeRouteSource,
} from '@nimiplatform/sdk/mod/runtime-route';
import { getTestAiRuntimeClient } from './runtime-mod.js';

// ── Types ────────────────────────────────────────────────────────────────────

type CapabilityId =
  | 'text.generate'
  | 'text.embed'
  | 'image.generate'
  | 'image.create-job'
  | 'video.generate'
  | 'audio.synthesize'
  | 'audio.transcribe'
  | 'voice.clone'
  | 'voice.design';

type CapabilityMeta = {
  id: CapabilityId;
  label: string;
  description: string;
  hasRoute: boolean;
  routeCapability?: RuntimeCanonicalCapability;
};

const CAPABILITIES: CapabilityMeta[] = [
  { id: 'text.generate',    label: 'Text Generate',    description: 'Text generation (chat)',                hasRoute: true, routeCapability: 'text.generate' },
  { id: 'text.embed',       label: 'Text Embed',       description: 'Text embedding (vector)',               hasRoute: true, routeCapability: 'text.embed' },
  { id: 'image.generate',   label: 'Image Generate',   description: 'Image generation (wait for completion)', hasRoute: true, routeCapability: 'image.generate' },
  { id: 'image.create-job', label: 'Image Create Job', description: 'Submit image job and monitor progress', hasRoute: true, routeCapability: 'image.generate' },
  { id: 'video.generate',   label: 'Video Generate',   description: 'Video generation',                     hasRoute: true, routeCapability: 'video.generate' },
  { id: 'audio.synthesize', label: 'Audio Synthesize', description: 'Text-to-speech synthesis',             hasRoute: true, routeCapability: 'audio.synthesize' },
  { id: 'audio.transcribe', label: 'Audio Transcribe', description: 'Speech-to-text transcription',         hasRoute: true, routeCapability: 'audio.transcribe' },
  { id: 'voice.clone',      label: 'Voice Clone',      description: 'Voice asset cloning',                  hasRoute: false },
  { id: 'voice.design',     label: 'Voice Design',     description: 'Voice asset design',                   hasRoute: false },
];

type VoiceOption = {
  voiceId: string;
  name: string;
  lang: string;
};

type RouteState = {
  snapshot: RuntimeRouteOptionsSnapshot | null;
  binding: RuntimeRouteBinding | null;
  routeLoading: boolean;
  routeError: string;
};

type DiagnosticsInfo = {
  requestParams: Record<string, unknown> | null;
  resolvedRoute: ModRuntimeResolvedBinding | null;
  responseMetadata: {
    finishReason?: string;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    traceId?: string;
    modelResolved?: string;
    jobId?: string;
    artifactCount?: number;
    elapsed?: number;
  } | null;
};

type TestState = {
  result: 'idle' | 'passed' | 'failed';
  output: unknown;
  rawResponse: string;
  busy: boolean;
  busyLabel?: string;
  error: string;
  diagnostics: DiagnosticsInfo;
};

type CapabilityState = RouteState & TestState;

type CapabilityStates = Record<CapabilityId, CapabilityState>;

export type ImageResponseFormatMode = 'auto' | 'base64' | 'url';

type ImageWorkflowComponentDraft = {
  id: string;
  slot: string;
  localArtifactId: string;
};

type ImageWorkflowProfileOverridesInput = {
  step?: string;
  cfgScale?: string;
  sampler?: string;
  scheduler?: string;
  optionsText?: string;
  rawJsonText?: string;
};

type ImageWorkflowDraftState = {
  prompt: string;
  negativePrompt: string;
  size: string;
  n: string;
  seed: string;
  responseFormatMode: ImageResponseFormatMode;
  timeoutMs: string;
  step: string;
  cfgScale: string;
  sampler: string;
  scheduler: string;
  optionsText: string;
  rawProfileOverridesText: string;
  vaeModel: string;
  llmModel: string;
  clipLModel: string;
  clipGModel: string;
  controlnetModel: string;
  loraModel: string;
  auxiliaryModel: string;
  componentDrafts: ImageWorkflowComponentDraft[];
};

const COMMON_IMAGE_WORKFLOW_SLOTS = [
  'vae_path',
  'llm_path',
  'clip_l_path',
  'clip_g_path',
  'controlnet_path',
  'lora_path',
  'aux_path',
] as const;

type ImageWorkflowPresetSelectionKey =
  | 'vaeModel'
  | 'llmModel'
  | 'clipLModel'
  | 'clipGModel'
  | 'controlnetModel'
  | 'loraModel'
  | 'auxiliaryModel';

type ImageWorkflowCompanionTier = 'core' | 'extended';

type ImageWorkflowPresetSelection = {
  key: ImageWorkflowPresetSelectionKey;
  slot: typeof COMMON_IMAGE_WORKFLOW_SLOTS[number];
  label: string;
  kind: ModRuntimeLocalArtifactKind;
  tier: ImageWorkflowCompanionTier;
};

const IMAGE_WORKFLOW_PRESET_SELECTIONS: ImageWorkflowPresetSelection[] = [
  { key: 'vaeModel', slot: 'vae_path', label: 'VAE model', kind: 'vae', tier: 'core' },
  { key: 'llmModel', slot: 'llm_path', label: 'LLM model', kind: 'llm', tier: 'core' },
  { key: 'clipLModel', slot: 'clip_l_path', label: 'CLIP-L model', kind: 'clip', tier: 'extended' },
  { key: 'clipGModel', slot: 'clip_g_path', label: 'CLIP-G model', kind: 'clip', tier: 'extended' },
  { key: 'controlnetModel', slot: 'controlnet_path', label: 'ControlNet model', kind: 'controlnet', tier: 'extended' },
  { key: 'loraModel', slot: 'lora_path', label: 'LoRA model', kind: 'lora', tier: 'extended' },
  { key: 'auxiliaryModel', slot: 'aux_path', label: 'Auxiliary model', kind: 'auxiliary', tier: 'extended' },
];

type CompanionArtifactSelectionsInput = Record<ImageWorkflowPresetSelectionKey, string> & {
  components: Array<Pick<ImageWorkflowComponentDraft, 'slot' | 'localArtifactId'>>;
};

export const LOCALAI_IMAGE_COMPONENTS_REQUIRED_ERROR =
  'LocalAI image workflow requires explicit companion artifacts. Select one or more layered companion presets, or add workflow components first. If you are not sure what to pick, install or verify the companion artifacts in desktop first.';

function routeCapabilityFor(capabilityId: CapabilityId): RuntimeCanonicalCapability | null {
  const capability = CAPABILITIES.find((item) => item.id === capabilityId)?.routeCapability || null;
  return capability;
}

function linkedRouteCapabilityIds(capabilityId: CapabilityId): CapabilityId[] {
  const routeCapability = routeCapabilityFor(capabilityId);
  if (!routeCapability) {
    return [capabilityId];
  }
  return CAPABILITIES
    .filter((item) => item.routeCapability === routeCapability)
    .map((item) => item.id);
}

function createInitialImageWorkflowDraftState(): ImageWorkflowDraftState {
  return {
    prompt: '一只穿宇航服的橘猫，电影感，细节丰富',
    negativePrompt: 'low quality, blurry',
    size: '1024x1024',
    n: '1',
    seed: '',
    responseFormatMode: 'auto',
    timeoutMs: '600000',
    step: '25',
    cfgScale: '',
    sampler: '',
    scheduler: '',
    optionsText: '',
    rawProfileOverridesText: '',
    vaeModel: '',
    llmModel: '',
    clipLModel: '',
    clipGModel: '',
    controlnetModel: '',
    loraModel: '',
    auxiliaryModel: '',
    componentDrafts: [],
  };
}

// ── Utility ──────────────────────────────────────────────────────────────────

function asString(value: unknown): string {
  return String(value || '').trim();
}

function toPrettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return String(error || 'JSON stringify failed');
  }
}

/** Strip binary artifact data from a media response before logging to avoid huge strings. */
function stripArtifacts(response: unknown): unknown {
  if (response == null || typeof response !== 'object') return response;
  const r = response as Record<string, unknown>;
  if (!Array.isArray(r['artifacts'])) return r;
  return {
    ...r,
    artifacts: (r['artifacts'] as unknown[]).map((a) => {
      if (a == null || typeof a !== 'object') return a;
      const { data: _d, bytes: _b, ...rest } = a as Record<string, unknown>;
      return { ...rest, _dataTruncated: true };
    }),
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }
  const bufferCtor = (globalThis as typeof globalThis & {
    Buffer?: {
      from(input: string, encoding: string): {
        toString(encoding: string): string;
      };
    };
  }).Buffer;
  const base64Encoder = typeof globalThis.btoa === 'function'
    ? globalThis.btoa.bind(globalThis)
    : ((value: string) => bufferCtor?.from(value, 'binary').toString('base64') || '');
  return base64Encoder(binary);
}

export function toArtifactPreviewUri(input: {
  uri?: string;
  bytes?: Uint8Array;
  mimeType?: string;
  defaultMimeType?: string;
}): string {
  // Prefer bytes → data: URI because file:// URIs are blocked in Tauri webview.
  if (input.bytes && input.bytes.length > 0) {
    const mimeType = asString(input.mimeType) || asString(input.defaultMimeType) || 'application/octet-stream';
    return `data:${mimeType};base64,${bytesToBase64(input.bytes)}`;
  }
  const uri = asString(input.uri);
  if (uri) return uri;
  return '';
}

function isTerminalScenarioJobStatus(value: unknown): boolean {
  const numeric = Number(value);
  if (numeric === 4 || numeric === 5 || numeric === 6 || numeric === 7) {
    return true;
  }
  const normalized = String(value || '').trim().toLowerCase();
  return normalized.includes('completed')
    || normalized.includes('failed')
    || normalized.includes('canceled')
    || normalized.includes('timeout');
}

const SCENARIO_JOB_STATUS_LABELS: Record<number, string> = {
  0: 'unspecified',
  1: 'submitted',
  2: 'queued',
  3: 'running',
  4: 'completed',
  5: 'failed',
  6: 'canceled',
  7: 'timeout',
};

export function scenarioJobStatusLabel(value: unknown): string {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && SCENARIO_JOB_STATUS_LABELS[numeric]) {
    return SCENARIO_JOB_STATUS_LABELS[numeric];
  }
  const normalized = String(value || '').trim();
  if (!normalized) return 'unknown';
  return normalized
    .replace(/^scenario_job_status_/i, '')
    .toLowerCase()
    .replace(/_/g, ' ');
}

export function buildAsyncImageJobOutcome(input: {
  status: unknown;
  reasonDetail?: unknown;
  artifactFetchError?: unknown;
}): {
  result: 'passed' | 'failed';
  error: string;
  terminalStatus: string;
} {
  const terminalStatus = scenarioJobStatusLabel(input.status);
  const terminalError = terminalStatus !== 'completed'
    ? asString(input.reasonDetail || terminalStatus || 'Image job did not complete successfully.')
    : '';
  const artifactFetchError = asString(input.artifactFetchError);
  const error = [terminalError, artifactFetchError].filter(Boolean).join(' | ');
  return {
    result: error ? 'failed' : 'passed',
    error,
    terminalStatus,
  };
}

const SCENARIO_JOB_EVENT_LABELS: Record<number, string> = {
  0: 'event',
  1: 'submitted',
  2: 'queued',
  3: 'running',
  4: 'completed',
  5: 'failed',
  6: 'canceled',
  7: 'timeout',
};

export function scenarioJobEventLabel(value: unknown): string {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && SCENARIO_JOB_EVENT_LABELS[numeric]) {
    return SCENARIO_JOB_EVENT_LABELS[numeric];
  }
  const normalized = String(value || '').trim();
  if (!normalized) return 'event';
  return normalized
    .replace(/^scenario_job_event_/i, '')
    .toLowerCase()
    .replace(/_/g, ' ');
}

function hydrateTokenApiBinding(
  snapshot: RuntimeRouteOptionsSnapshot | null,
  binding: RuntimeRouteBinding | null,
): RuntimeRouteBinding | null {
  if (!snapshot || !binding || binding.source !== 'cloud') {
    return binding;
  }
  const connector = snapshot.connectors.find((item) => item.id === binding.connectorId) || null;
  if (!connector) {
    return binding;
  }
  return {
    ...binding,
    provider: asString(binding.provider || connector.provider) || undefined,
  };
}

function ensureRouteOptionsSnapshotShape(
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

function normalizeLocalRuntimeModelRoot(value: unknown): string {
  const trimmed = asString(value);
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('localai/')) return trimmed.slice('localai/'.length).trim();
  if (lower.startsWith('nexa/')) return trimmed.slice('nexa/'.length).trim();
  if (lower.startsWith('local/')) return trimmed.slice('local/'.length).trim();
  return trimmed;
}

function localBindingFromOption(
  option: RuntimeRouteOptionsSnapshot['local']['models'][number],
): RuntimeRouteBinding {
  const modelId = asString(option.modelId || option.model);
  return {
    source: 'local',
    connectorId: '',
    model: modelId,
    modelId: modelId || undefined,
    provider: asString(option.provider || option.engine) || undefined,
    localModelId: asString(option.localModelId) || undefined,
    engine: asString(option.engine) || undefined,
    adapter: asString(option.adapter) || undefined,
    endpoint: asString(option.endpoint) || undefined,
    goRuntimeLocalModelId: asString(option.goRuntimeLocalModelId) || undefined,
    goRuntimeStatus: asString(option.goRuntimeStatus) || undefined,
    ...(option.providerHints ? { providerHints: option.providerHints } : {}),
  };
}

function hydrateLocalRuntimeBinding(
  snapshot: RuntimeRouteOptionsSnapshot | null,
  binding: RuntimeRouteBinding | null,
): RuntimeRouteBinding | null {
  if (!snapshot || !binding || binding.source !== 'local') {
    return binding;
  }
  const normalizedLocalModelId = asString(binding.localModelId);
  const normalizedModelId = normalizeLocalRuntimeModelRoot(binding.modelId || binding.model);
  const normalizedEngine = asString(binding.engine || binding.provider).toLowerCase();
  const localModel = (snapshot.local?.models || []).find((item) => (
    (normalizedLocalModelId && asString(item.localModelId) === normalizedLocalModelId)
    || (
      normalizeLocalRuntimeModelRoot(item.modelId || item.model) === normalizedModelId
      && (!normalizedEngine || asString(item.engine || item.provider).toLowerCase() === normalizedEngine)
    )
  )) || null;
  if (!localModel) {
    return {
      ...binding,
      model: normalizedModelId || asString(binding.model),
      modelId: normalizedModelId || undefined,
    };
  }
  return {
    ...localBindingFromOption(localModel),
    model: normalizedModelId || asString(localModel.modelId || localModel.model),
    modelId: normalizedModelId || asString(localModel.modelId || localModel.model) || undefined,
    localModelId: asString(binding.localModelId || localModel.localModelId) || undefined,
  };
}

function resolveEffectiveBinding(
  snapshot: RuntimeRouteOptionsSnapshot | null,
  binding: RuntimeRouteBinding | null,
): RuntimeRouteBinding | null {
  if (binding?.source === 'cloud') return hydrateTokenApiBinding(snapshot, binding);
  if (binding?.source === 'local') return hydrateLocalRuntimeBinding(snapshot, binding);
  if (!snapshot) return null;
  const fallback = snapshot.selected || snapshot.resolvedDefault || null;
  if (fallback?.source === 'local') {
    return hydrateLocalRuntimeBinding(snapshot, fallback);
  }
  return hydrateTokenApiBinding(snapshot, fallback);
}

function cloudBindingForConnector(
  connector: RuntimeRouteOptionsSnapshot['connectors'][number],
  model: string,
): RuntimeRouteBinding {
  return {
    source: 'cloud',
    connectorId: connector.id,
    provider: asString(connector.provider) || undefined,
    model,
  };
}

function bindingForSource(
  snapshot: RuntimeRouteOptionsSnapshot | null,
  source: RuntimeRouteSource,
): RuntimeRouteBinding | null {
  if (source === 'cloud') {
    const connector = snapshot?.connectors[0] || null;
    if (!connector) return null;
    return cloudBindingForConnector(connector, connector.models[0] || '');
  }
  const local = snapshot?.local?.models[0] || null;
  if (!local) return null;
  return localBindingFromOption(local);
}

function bindingForConnector(
  snapshot: RuntimeRouteOptionsSnapshot | null,
  connectorId: string,
  current: RuntimeRouteBinding | null,
): RuntimeRouteBinding | null {
  const connector = snapshot?.connectors.find((item) => item.id === connectorId) || null;
  if (!connector) return null;
  const currentModel = current?.source === 'cloud' ? current.model : '';
  const model = connector.models.includes(currentModel) ? currentModel : (connector.models[0] || '');
  return cloudBindingForConnector(connector, model);
}

export function bindingForModel(
  snapshot: RuntimeRouteOptionsSnapshot | null,
  model: string,
  current: RuntimeRouteBinding | null,
): RuntimeRouteBinding | null {
  const normalizedModel = asString(model);
  if (!normalizedModel) return current;
  const effective = resolveEffectiveBinding(snapshot, current);
  if (!effective) return null;
  if (effective.source === 'cloud') {
    return {
      source: 'cloud',
      connectorId: effective.connectorId,
      provider: asString(effective.provider) || undefined,
      model: normalizedModel,
    };
  }
  const normalizedLocalModel = normalizeLocalRuntimeModelRoot(normalizedModel);
  const localModel = snapshot?.local?.models.find((item) => (
    normalizeLocalRuntimeModelRoot(item.modelId || item.model) === normalizedLocalModel
  )) || null;
  if (localModel) {
    return localBindingFromOption(localModel);
  }
  return {
    source: 'local',
    connectorId: '',
    model: normalizedLocalModel,
    modelId: normalizedLocalModel || undefined,
    provider: asString(effective.provider) || undefined,
    localModelId: asString(effective.localModelId) || undefined,
    engine: asString(effective.engine) || undefined,
    adapter: asString(effective.adapter) || undefined,
    endpoint: asString(effective.endpoint) || undefined,
    goRuntimeLocalModelId: asString(effective.goRuntimeLocalModelId) || undefined,
    goRuntimeStatus: asString(effective.goRuntimeStatus) || undefined,
    ...(effective.providerHints ? { providerHints: effective.providerHints } : {}),
  };
}

export function resolveImageResponseFormat(mode: ImageResponseFormatMode): 'base64' | 'url' | undefined {
  return mode === 'base64' || mode === 'url' ? mode : undefined;
}

function inferArtifactKindForSlot(slot: string): ModRuntimeLocalArtifactKind | undefined {
  const normalized = asString(slot).toLowerCase();
  if (!normalized) return undefined;
  if (normalized.includes('vae')) return 'vae';
  if (normalized.includes('llm')) return 'llm';
  if (normalized.includes('clip')) return 'clip';
  if (normalized.includes('controlnet')) return 'controlnet';
  if (normalized.includes('lora')) return 'lora';
  if (normalized.includes('aux')) return 'auxiliary';
  return undefined;
}

function isSelectableLocalArtifact(artifact: ModRuntimeLocalArtifactRecord): boolean {
  return artifact.status === 'installed' || artifact.status === 'active';
}

function artifactDisplayLabel(artifact: ModRuntimeLocalArtifactRecord): string {
  return `${artifact.artifactId} [${artifact.kind}]`;
}

function artifactsForPresetKind(
  artifacts: ModRuntimeLocalArtifactRecord[],
  kind: ModRuntimeLocalArtifactKind,
): ModRuntimeLocalArtifactRecord[] {
  return artifacts
    .filter(isSelectableLocalArtifact)
    .filter((artifact) => artifact.kind === kind)
    .sort((left, right) => `${left.kind}:${left.artifactId}`.localeCompare(`${right.kind}:${right.artifactId}`));
}

function artifactsForWorkflowSlot(
  artifacts: ModRuntimeLocalArtifactRecord[],
  slot: string,
): ModRuntimeLocalArtifactRecord[] {
  const selectableArtifacts = artifacts.filter(isSelectableLocalArtifact);
  const preferredKind = inferArtifactKindForSlot(slot);
  const sorted = [...selectableArtifacts].sort((left, right) => (
    `${left.kind}:${left.artifactId}`.localeCompare(`${right.kind}:${right.artifactId}`)
  ));
  if (!preferredKind) {
    return sorted;
  }
  const matches = sorted.filter((artifact) => artifact.kind === preferredKind);
  return matches.length > 0 ? matches : sorted;
}

function buildImageWorkflowComponents(
  components: Array<Pick<ImageWorkflowComponentDraft, 'slot' | 'localArtifactId'>>,
): LocalImageWorkflowComponentSelection[] {
  return components
    .map((component) => ({
      slot: asString(component.slot),
      localArtifactId: asString(component.localArtifactId),
    }))
    .filter((component) => component.slot && component.localArtifactId);
}

export function buildImageWorkflowComponentSelections(
  input: CompanionArtifactSelectionsInput,
): LocalImageWorkflowComponentSelection[] {
  const selections = new Map<string, string>();
  for (const preset of IMAGE_WORKFLOW_PRESET_SELECTIONS) {
    const localArtifactId = asString(input[preset.key]);
    if (localArtifactId) {
      selections.set(preset.slot, localArtifactId);
    }
  }
  for (const component of buildImageWorkflowComponents(input.components)) {
    if (!selections.has(component.slot)) {
      selections.set(component.slot, component.localArtifactId);
    }
  }
  return Array.from(selections.entries()).map(([slot, localArtifactId]) => ({
    slot,
    localArtifactId,
  }));
}

export function buildLocalAIImageWorkflowExtensionsForRequest(input: CompanionArtifactSelectionsInput & {
  profileOverrides: Record<string, unknown>;
}): {
  extensions?: Record<string, unknown>;
  error: string | null;
} {
  const components = buildImageWorkflowComponentSelections(input);
  if (components.length === 0) {
    return {
      extensions: undefined,
      error: LOCALAI_IMAGE_COMPONENTS_REQUIRED_ERROR,
    };
  }
  return {
    extensions: buildLocalImageWorkflowExtensions({
      components,
      profileOverrides: input.profileOverrides,
    }),
    error: null,
  };
}

export function buildImageWorkflowProfileOverrides(input: ImageWorkflowProfileOverridesInput): {
  overrides: Record<string, unknown>;
  error: string | null;
} {
  const rawJsonText = asString(input.rawJsonText);
  let overrides: Record<string, unknown> = {};
  if (rawJsonText) {
    try {
      const parsed = JSON.parse(rawJsonText) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {
          overrides: {},
          error: 'Raw profile_overrides JSON must be an object.',
        };
      }
      overrides = parsed as Record<string, unknown>;
    } catch (error) {
      return {
        overrides: {},
        error: error instanceof Error
          ? `Invalid profile_overrides JSON: ${error.message}`
          : 'Invalid profile_overrides JSON.',
      };
    }
  }

  const applyNumericField = (
    key: 'step' | 'cfg_scale',
    rawValue: string | undefined,
    label: string,
  ): string | null => {
    const normalized = asString(rawValue);
    if (!normalized) return null;
    const value = Number(normalized);
    if (!Number.isFinite(value)) {
      return `${label} must be a valid number.`;
    }
    overrides[key] = value;
    return null;
  };

  const stepError = applyNumericField('step', input.step, 'Step');
  if (stepError) {
    return { overrides: {}, error: stepError };
  }
  const cfgScaleError = applyNumericField('cfg_scale', input.cfgScale, 'CFG scale');
  if (cfgScaleError) {
    return { overrides: {}, error: cfgScaleError };
  }

  const sampler = asString(input.sampler);
  if (sampler) {
    overrides['sampler'] = sampler;
  }
  const scheduler = asString(input.scheduler);
  if (scheduler) {
    overrides['scheduler'] = scheduler;
  }
  const options = String(input.optionsText || '')
    .split(/\r?\n/g)
    .map((line) => asString(line))
    .filter(Boolean);
  if (options.length > 0) {
    overrides['options'] = options;
  }

  return {
    overrides,
    error: null,
  };
}

export function buildImageGenerateRequestParams(input: {
  prompt: string;
  negativePrompt?: string;
  n: number;
  size: string;
  seed?: string;
  timeoutMs?: string;
  responseFormatMode: ImageResponseFormatMode;
  extensions?: Record<string, unknown>;
  binding?: RuntimeRouteBinding;
}): {
  prompt: string;
  negativePrompt?: string;
  n: number;
  size: string;
  seed?: number;
  timeoutMs?: number;
  responseFormat?: 'base64' | 'url';
  extensions?: Record<string, unknown>;
  binding?: RuntimeRouteBinding;
} {
  const responseFormat = resolveImageResponseFormat(input.responseFormatMode);
  const seedText = asString(input.seed);
  const seed = seedText ? Number(seedText) : undefined;
  const timeoutText = asString(input.timeoutMs);
  const timeoutMs = timeoutText ? Number(timeoutText) : undefined;
  const extensions = input.extensions && Object.keys(input.extensions).length > 0
    ? input.extensions
    : undefined;
  return {
    prompt: input.prompt,
    ...(asString(input.negativePrompt) ? { negativePrompt: asString(input.negativePrompt) } : {}),
    n: Math.max(1, Number(input.n) || 1),
    size: input.size,
    ...(Number.isFinite(seed) ? { seed } : {}),
    ...(Number.isFinite(timeoutMs) && Number(timeoutMs) > 0 ? { timeoutMs: Number(timeoutMs) } : {}),
    ...(responseFormat ? { responseFormat } : {}),
    ...(extensions ? { extensions } : {}),
    ...(input.binding ? { binding: input.binding } : {}),
  };
}

export function resolveRouteModelPickerState(
  snapshot: RuntimeRouteOptionsSnapshot | null,
  binding: RuntimeRouteBinding | null,
): {
  effectiveBinding: RuntimeRouteBinding | null;
  activeSource: RuntimeRouteSource;
  activeConnectorId: string;
  activeModel: string;
  modelOptions: string[];
  cloudCatalogMissing: boolean;
  activeModelInOptions: boolean;
} {
  const effectiveBinding = resolveEffectiveBinding(snapshot, binding);
  const activeSource = effectiveBinding?.source || snapshot?.selected?.source || 'local';
  const activeConnectorId = effectiveBinding?.connectorId || snapshot?.selected?.connectorId || '';
  const activeConnector = snapshot?.connectors.find((item) => item.id === activeConnectorId) || null;
  const activeModel = activeSource === 'local'
    ? normalizeLocalRuntimeModelRoot(effectiveBinding?.modelId || effectiveBinding?.model || snapshot?.selected?.modelId || snapshot?.selected?.model || '')
    : (effectiveBinding?.model || snapshot?.selected?.model || '');
  const localModels = snapshot?.local?.models || [];
  const modelOptions = activeSource === 'local'
    ? localModels.map((item) => normalizeLocalRuntimeModelRoot(item.modelId || item.model))
    : (activeConnector?.models || []);
  return {
    effectiveBinding,
    activeSource,
    activeConnectorId,
    activeModel,
    modelOptions,
    cloudCatalogMissing: activeSource === 'cloud' && activeConnectorId.length > 0 && modelOptions.length === 0,
    activeModelInOptions: modelOptions.includes(activeModel),
  };
}

function makeEmptyDiagnostics(): DiagnosticsInfo {
  return { requestParams: null, resolvedRoute: null, responseMetadata: null };
}

function makeInitialCapabilityState(): CapabilityState {
  return {
    snapshot: null,
    binding: null,
    routeLoading: false,
    routeError: '',
    result: 'idle',
    output: null,
    rawResponse: '',
    busy: false,
    busyLabel: '',
    error: '',
    diagnostics: makeEmptyDiagnostics(),
  };
}

function makeInitialCapabilityStates(): CapabilityStates {
  return Object.fromEntries(
    CAPABILITIES.map((cap) => [cap.id, makeInitialCapabilityState()]),
  ) as CapabilityStates;
}

// ── Route loading ─────────────────────────────────────────────────────────────

async function loadRouteSnapshot(input: {
  runtimeClient: ModRuntimeClient;
  capabilityId: CapabilityId;
  setStates: React.Dispatch<React.SetStateAction<CapabilityStates>>;
}): Promise<void> {
  const { runtimeClient, capabilityId, setStates } = input;
  const targetCapability = routeCapabilityFor(capabilityId);
  if (!targetCapability) {
    return;
  }
  const linkedIds = linkedRouteCapabilityIds(capabilityId);
  setStates((prev) => ({
    ...prev,
    ...Object.fromEntries(linkedIds.map((id) => [
      id,
      { ...prev[id], routeLoading: true, routeError: '' },
    ])),
  }));
  try {
    const snapshot = ensureRouteOptionsSnapshotShape(
      parseRuntimeRouteOptions(await runtimeClient.route.listOptions({
        capability: targetCapability,
      }), {
        includeResolvedDefault: true,
      }),
    );
    if (!snapshot) {
      throw new Error('TEST_AI_ROUTE_OPTIONS_INVALID');
    }
    setStates((prev) => ({
      ...prev,
      ...Object.fromEntries(linkedIds.map((id) => [
        id,
        { ...prev[id], snapshot, routeLoading: false, routeError: '' },
      ])),
    }));
  } catch (error) {
    setStates((prev) => ({
      ...prev,
      ...Object.fromEntries(linkedIds.map((id) => [
        id,
        {
          ...prev[id],
          routeLoading: false,
          routeError: error instanceof Error ? error.message : String(error || 'Failed to load route options.'),
        },
      ])),
    }));
  }
}

// ── RouteBindingEditor ────────────────────────────────────────────────────────

type RouteBindingEditorProps = {
  capabilityId: CapabilityId;
  snapshot: RuntimeRouteOptionsSnapshot | null;
  binding: RuntimeRouteBinding | null;
  loading: boolean;
  error: string;
  onReload: () => void;
  onBindingChange: (binding: RuntimeRouteBinding | null) => void;
};

function RouteBindingEditor(props: RouteBindingEditorProps) {
  const {
    effectiveBinding,
    activeSource,
    activeConnectorId,
    activeModel,
    modelOptions,
    cloudCatalogMissing,
    activeModelInOptions,
  } = resolveRouteModelPickerState(props.snapshot, props.binding);
  const activeConnector = props.snapshot?.connectors.find((item) => item.id === activeConnectorId) || null;
  const tokenConnectors = props.snapshot?.connectors || [];
  const [modelDraft, setModelDraft] = React.useState(activeModel);
  const [showManualModelOverride, setShowManualModelOverride] = React.useState(false);

  React.useEffect(() => {
    setModelDraft(activeModel);
  }, [activeModel]);

  React.useEffect(() => {
    if (cloudCatalogMissing || (asString(activeModel) && !activeModelInOptions)) {
      setShowManualModelOverride(true);
    }
  }, [cloudCatalogMissing, activeModel, activeModelInOptions]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-700">Route Binding</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs"
            disabled={props.loading}
            onClick={props.onReload}
          >
            {props.loading ? 'Refreshing...' : 'Refresh'}
          </button>
          <button
            type="button"
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs"
            onClick={() => props.onBindingChange(null)}
          >
            Use default
          </button>
        </div>
      </div>
      {props.error ? (
        <div className="mb-2 rounded-md bg-amber-50 p-2 text-xs text-amber-700">{props.error}</div>
      ) : null}
      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-gray-500">Source</span>
          <select
            className="rounded-md border border-gray-300 bg-white px-2 py-1"
            value={activeSource}
            onChange={(event) => {
              props.onBindingChange(bindingForSource(props.snapshot, event.target.value as RuntimeRouteSource));
            }}
            disabled={!props.snapshot}
          >
            <option value="local">local</option>
            <option value="cloud">cloud</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-gray-500">Connector</span>
          <select
            className="rounded-md border border-gray-300 bg-white px-2 py-1"
            value={activeSource === 'cloud' ? activeConnectorId : ''}
            onChange={(event) => {
              props.onBindingChange(bindingForConnector(props.snapshot, event.target.value, effectiveBinding));
            }}
            disabled={!props.snapshot || activeSource !== 'cloud'}
          >
            <option value="">--</option>
            {tokenConnectors.map((connector) => (
              <option key={connector.id} value={connector.id}>
                {connector.label || connector.id}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-gray-500">Model</span>
          <select
            className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs"
            value={activeModelInOptions ? activeModel : ''}
            onChange={(event) => {
              if (!asString(event.target.value)) return;
              props.onBindingChange(bindingForModel(props.snapshot, event.target.value, effectiveBinding));
            }}
            disabled={!props.snapshot || modelOptions.length === 0}
          >
            <option value="">
              {modelOptions.length === 0
                ? (activeSource === 'cloud' ? 'Connector catalog missing models' : 'No local models')
                : 'Select model'}
            </option>
            {modelOptions.map((model) => (
              <option key={model} value={model}>{model}</option>
            ))}
          </select>
        </label>
      </div>
      {cloudCatalogMissing ? (
        <div className="mt-2 rounded-md bg-amber-50 p-2 text-xs text-amber-700">
          Connector catalog data is missing models for this capability. Refresh the connector or use a manual override.
        </div>
      ) : null}
      <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
        <span>
          {activeSource === 'cloud'
            ? `provider: ${activeConnector?.provider || effectiveBinding?.provider || 'unknown'}`
            : 'local runtime model catalog'}
        </span>
        <button
          type="button"
          className="text-blue-600 hover:underline"
          onClick={() => setShowManualModelOverride((prev) => !prev)}
        >
          {showManualModelOverride ? 'Hide manual override' : 'Manual override'}
        </button>
      </div>
      {showManualModelOverride ? (
        <label className="mt-2 flex flex-col gap-1 text-xs">
          <span className="text-gray-500">Manual model override</span>
          <input
            className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs"
            value={modelDraft}
            onChange={(event) => {
              const nextValue = event.target.value;
              setModelDraft(nextValue);
              if (!asString(nextValue)) return;
              props.onBindingChange(bindingForModel(props.snapshot, nextValue, effectiveBinding));
            }}
            disabled={!props.snapshot}
            placeholder="model id"
          />
        </label>
      ) : null}
      <div className="mt-1.5 text-xs text-gray-500">
        {effectiveBinding
          ? `${effectiveBinding.source} · ${effectiveBinding.provider || '—'} · ${effectiveBinding.connectorId || '—'} · ${effectiveBinding.model || '—'}`
          : 'runtime default'}
      </div>
      {effectiveBinding?.source === 'local' ? (
        <div className="mt-1 text-xs text-gray-500">
          {`adapter=${effectiveBinding.adapter || '—'} · go-runtime=${effectiveBinding.goRuntimeStatus || 'unknown'} · localModelId=${effectiveBinding.localModelId || '—'}`}
        </div>
      ) : null}
    </div>
  );
}

// ── DiagnosticsPanel ──────────────────────────────────────────────────────────

function KVRow(props: { label: string; value: string | number | undefined | null; mono?: boolean; highlight?: 'green' | 'red' | 'blue' | 'gray' }) {
  if (props.value === undefined || props.value === null || props.value === '') return null;
  const colorMap = {
    green: 'text-green-700',
    red: 'text-red-700',
    blue: 'text-blue-700',
    gray: 'text-gray-500',
  };
  const valueClass = props.mono
    ? `font-mono ${props.highlight ? colorMap[props.highlight] : 'text-gray-900'}`
    : (props.highlight ? colorMap[props.highlight] : 'text-gray-900');
  return (
    <div className="grid grid-cols-[140px_1fr] gap-x-2 py-0.5">
      <span className="text-gray-400 truncate">{props.label}</span>
      <span className={`truncate ${valueClass}`}>{String(props.value)}</span>
    </div>
  );
}

type DiagnosticsPanelProps = {
  diagnostics: DiagnosticsInfo;
};

function DiagnosticsPanel(props: DiagnosticsPanelProps) {
  const { diagnostics } = props;
  if (!diagnostics.requestParams && !diagnostics.resolvedRoute && !diagnostics.responseMetadata) {
    return null;
  }
  const meta = diagnostics.responseMetadata;
  const route = diagnostics.resolvedRoute;
  const params = diagnostics.requestParams;

  return (
    <div className="flex flex-col gap-2 text-xs">
      {/* Request Params */}
      {params ? (
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="mb-1.5 font-semibold text-gray-600">Request Params</div>
          {Object.entries(params).map(([k, v]) => {
            if (v === undefined || v === null || v === '') return null;
            const displayValue = typeof v === 'object' ? toPrettyJson(v) : String(v);
            if (displayValue.length > 200 || displayValue.includes('\n')) {
              return (
                <div key={k} className="mb-1">
                  <span className="text-gray-400">{k}</span>
                  <pre className="mt-0.5 whitespace-pre-wrap break-all rounded bg-gray-50 px-2 py-1 font-mono text-xs text-gray-900">{displayValue}</pre>
                </div>
              );
            }
            return <KVRow key={k} label={k} value={displayValue} mono />;
          })}
        </div>
      ) : null}

      {/* Route Preview */}
      {route ? (
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="mb-1.5 font-semibold text-gray-600">Route Preview</div>
          <KVRow label="source" value={route.source} mono highlight="blue" />
          <KVRow label="provider" value={route.provider} mono />
          <KVRow label="modelSelector" value={route.model} mono />
          <KVRow label="modelId" value={route.modelId} mono />
          <KVRow label="connectorId" value={route.connectorId} mono />
          <KVRow label="endpoint" value={route.endpoint} mono />
          <KVRow label="adapter" value={route.adapter} mono />
          <KVRow label="engine" value={route.engine} mono />
          <KVRow label="localModelId" value={route.localModelId} mono />
          <KVRow label="goRuntimeLocalModelId" value={route.goRuntimeLocalModelId} mono />
          <KVRow label="goRuntimeStatus" value={route.goRuntimeStatus} mono />
          <KVRow label="localProviderEndpoint" value={route.localProviderEndpoint} mono />
        </div>
      ) : null}

      {/* Response Metadata */}
      {meta ? (
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="mb-1.5 font-semibold text-gray-600">Response Metadata</div>
          {meta.elapsed !== undefined ? (
            <KVRow label="elapsed" value={`${meta.elapsed} ms`} highlight="blue" />
          ) : null}
          {meta.finishReason !== undefined ? (
            <KVRow
              label="finishReason"
              value={meta.finishReason}
              mono
              highlight={meta.finishReason === 'stop' ? 'green' : meta.finishReason === 'error' ? 'red' : undefined}
            />
          ) : null}
          {meta.inputTokens !== undefined ? (
            <KVRow label="inputTokens" value={meta.inputTokens} />
          ) : null}
          {meta.outputTokens !== undefined ? (
            <KVRow label="outputTokens" value={meta.outputTokens} />
          ) : null}
          {meta.totalTokens !== undefined ? (
            <KVRow label="totalTokens" value={meta.totalTokens} />
          ) : null}
          {meta.traceId ? (
            <KVRow label="traceId" value={meta.traceId} mono />
          ) : null}
          {meta.modelResolved ? (
            <KVRow label="modelResolved" value={meta.modelResolved} mono />
          ) : null}
          {meta.jobId ? (
            <KVRow label="jobId" value={meta.jobId} mono />
          ) : null}
          {meta.artifactCount !== undefined ? (
            <KVRow label="artifacts" value={meta.artifactCount} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

type SidebarProps = {
  active: CapabilityId;
  states: CapabilityStates;
  onSelect: (id: CapabilityId) => void;
};

function CapabilitySidebar(props: SidebarProps) {
  return (
    <nav className="flex w-44 shrink-0 flex-col gap-1 overflow-y-auto border-r border-gray-200 bg-white p-2">
      <div className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
        AI Capabilities
      </div>
      {CAPABILITIES.map((cap) => {
        const state = props.states[cap.id];
        const isActive = props.active === cap.id;
        let statusIcon = '○';
        let statusColor = 'text-gray-400';
        if (state.result === 'passed') { statusIcon = '✓'; statusColor = 'text-green-500'; }
        if (state.result === 'failed') { statusIcon = '✗'; statusColor = 'text-red-500'; }
        if (state.busy) { statusIcon = '…'; statusColor = 'text-blue-500'; }

        return (
          <button
            key={cap.id}
            type="button"
            onClick={() => props.onSelect(cap.id)}
            className={[
              'flex items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors',
              isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100',
            ].join(' ')}
          >
            <span className={`shrink-0 text-sm font-mono ${statusColor}`}>{statusIcon}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium">{cap.label}</div>
              <div className="truncate text-xs text-gray-400">{cap.description}</div>
            </div>
          </button>
        );
      })}
    </nav>
  );
}

// ── Shared UI atoms ───────────────────────────────────────────────────────────

function RunButton(props: { busy: boolean; busyLabel?: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="inline-flex self-start items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
      disabled={props.busy}
      onClick={props.onClick}
    >
      {props.busy ? (
        <>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/90 [animation-delay:-0.2s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/90 [animation-delay:-0.1s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/90" />
          </span>
          <span>{(asString(props.busyLabel) || 'Running...').replace(/\.{3}$/, '')}</span>
        </>
      ) : props.label}
    </button>
  );
}

function ErrorBox(props: { message: string }) {
  return (
    <div className="rounded-md bg-red-50 p-2 text-xs text-red-700">{props.message}</div>
  );
}

function InfoBox(props: { message: string }) {
  return (
    <div className="rounded-md bg-blue-50 p-2 text-xs text-blue-700">{props.message}</div>
  );
}

function RawJsonSection(props: { content: string }) {
  const [copied, setCopied] = React.useState(false);
  const handleCopy = React.useCallback(() => {
    void navigator.clipboard.writeText(props.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [props.content]);
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded border border-gray-300 bg-white px-3 py-1 text-xs text-gray-500 hover:bg-gray-100 active:bg-gray-200"
    >
      {copied ? '✓ Copied' : 'Copy Raw JSON'}
    </button>
  );
}

// ── Panel: text.generate ──────────────────────────────────────────────────────

type TextGeneratePanelProps = {
  state: CapabilityState;
  runtimeClient: ModRuntimeClient;
  onStateChange: (updater: (prev: CapabilityState) => CapabilityState) => void;
  onRouteReload: () => void;
};

type RouteSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

function RouteSelect(props: {
  value: string;
  options: RouteSelectOption[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const { value, options, disabled = false, onChange } = props;
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value) || options[0] || null;

  React.useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between rounded-[18px] border border-gray-200 bg-white px-4 py-3 text-left text-gray-900 transition hover:border-gray-300 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
      >
        <span className="truncate">{selected?.label || 'Select'}</span>
        <svg
          className={`ml-3 h-4 w-4 shrink-0 text-gray-700 transition ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-40 overflow-hidden rounded-[20px] border border-gray-200 bg-white shadow-[0_20px_40px_rgba(15,23,42,0.14)]">
          <div className="max-h-64 overflow-y-auto p-1.5">
            {options.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={`${option.value}-${option.label}`}
                  type="button"
                  disabled={option.disabled}
                  onClick={() => {
                    if (option.disabled) return;
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={
                    active
                      ? 'flex w-full items-center justify-between rounded-[14px] bg-[#4ECCA3]/14 px-3 py-2.5 text-left text-sm text-[#2E8D73]'
                      : 'flex w-full items-center justify-between rounded-[14px] px-3 py-2.5 text-left text-sm text-gray-800 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300'
                  }
                >
                  <span className="truncate">{option.label}</span>
                  <span className={active ? 'text-[#2E8D73]' : 'text-transparent'}>✓</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TextGeneratePanel(props: TextGeneratePanelProps) {
  const { state, runtimeClient, onStateChange, onRouteReload } = props;
  const [prompt, setPrompt] = React.useState('你好，请用两句话介绍你自己。');
  const [system, setSystem] = React.useState('');
  const [temperature, setTemperature] = React.useState('1');
  const [maxTokens, setMaxTokens] = React.useState('');
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [showModelMenu, setShowModelMenu] = React.useState(false);
  const [showRouteDialog, setShowRouteDialog] = React.useState(false);
  const [showConversation, setShowConversation] = React.useState(false);
  const [showDeveloperDetails, setShowDeveloperDetails] = React.useState(false);
  const promptRef = React.useRef<HTMLTextAreaElement | null>(null);
  const advancedRef = React.useRef<HTMLDivElement | null>(null);
  const modelMenuRef = React.useRef<HTMLDivElement | null>(null);

  const {
    effectiveBinding,
    activeSource,
    activeConnectorId,
    activeModel,
    modelOptions,
    cloudCatalogMissing,
    activeModelInOptions,
  } = resolveRouteModelPickerState(state.snapshot, state.binding);
  const tokenConnectors = state.snapshot?.connectors || [];
  const activeConnector = tokenConnectors.find((item) => item.id === activeConnectorId) || null;
  const [manualModelDraft, setManualModelDraft] = React.useState(activeModel);
  const temperatureValue = Number.isFinite(Number(temperature))
    ? Math.max(0, Math.min(2, Number(temperature)))
    : 1;
  const quickTokenOptions = ['Auto', '1024', '2048', '4096'] as const;
  const modelMenuOptions = modelOptions.length > 0 ? modelOptions : (activeModel ? [activeModel] : []);
  const modelDisplayName = activeModel || effectiveBinding?.model || effectiveBinding?.modelId || 'Select model';
  const sourceOptions: RouteSelectOption[] = [
    { value: 'local', label: 'local' },
    { value: 'cloud', label: 'cloud' },
  ];
  const connectorOptions: RouteSelectOption[] = [
    { value: '', label: '--' },
    ...tokenConnectors.map((connector) => ({
      value: connector.id,
      label: connector.label || connector.id,
    })),
  ];
  const modelSelectOptions: RouteSelectOption[] = modelOptions.length === 0
    ? [{
        value: '',
        label: activeSource === 'cloud' ? 'Connector catalog missing models' : 'No local models',
        disabled: true,
      }]
    : [
        { value: '', label: 'Select model' },
        ...modelOptions.map((model) => ({ value: model, label: model })),
      ];

  React.useEffect(() => {
    setManualModelDraft(activeModel);
  }, [activeModel]);

  React.useEffect(() => {
    const node = promptRef.current;
    if (!node) return;
    node.style.height = '0px';
    node.style.height = `${Math.min(Math.max(node.scrollHeight, 56), 240)}px`;
  }, [prompt]);

  React.useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (showAdvanced && advancedRef.current && !advancedRef.current.contains(target)) {
        setShowAdvanced(false);
      }
      if (showModelMenu && modelMenuRef.current && !modelMenuRef.current.contains(target)) {
        setShowModelMenu(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [showAdvanced, showModelMenu]);

  React.useEffect(() => {
    if (state.output) {
      setShowConversation(true);
    }
  }, [state.output]);

  React.useEffect(() => {
    if (showDeveloperDetails) {
      setShowConversation(false);
    }
  }, [showDeveloperDetails]);

  const handleRun = React.useCallback(async () => {
    if (!asString(prompt)) {
      onStateChange((prev) => ({ ...prev, error: 'Prompt is empty.' }));
      return;
    }
    setShowAdvanced(false);
    setShowModelMenu(false);
    onStateChange((prev) => ({ ...prev, busy: true, busyLabel: 'Preparing route...', error: '', diagnostics: makeEmptyDiagnostics() }));
    const t0 = Date.now();
    const binding = resolveEffectiveBinding(state.snapshot, state.binding) || undefined;
    const tempNum = temperature ? Number(temperature) : undefined;
    const maxTokNum = maxTokens ? Number(maxTokens) : undefined;
    const requestParams: Record<string, unknown> = {
      input: prompt,
      ...(system ? { system } : {}),
      ...(tempNum !== undefined ? { temperature: tempNum } : {}),
      ...(maxTokNum !== undefined ? { maxTokens: maxTokNum } : {}),
      ...(binding ? { binding } : {}),
    };
    let resolved: ModRuntimeResolvedBinding | undefined;
    try {
      resolved = await runtimeClient.route.resolve({ capability: 'text.generate', binding });
      onStateChange((prev) => ({
        ...prev,
        busy: true,
        busyLabel: resolved?.source === 'local' ? 'Warming local model...' : 'Running...',
      }));
      const result = await runtimeClient.ai.text.generate({
        input: prompt,
        ...(system ? { system } : {}),
        ...(tempNum !== undefined ? { temperature: tempNum } : {}),
        ...(maxTokNum !== undefined ? { maxTokens: maxTokNum } : {}),
        binding,
      });
      const elapsed = Date.now() - t0;

      onStateChange((prev) => ({
        ...prev,
        busy: false,
        busyLabel: '',
        result: 'passed',
        output: asString(result.text) || '(empty output)',
        rawResponse: toPrettyJson({ request: requestParams, resolved, response: result }),
        diagnostics: {
          requestParams,
          resolvedRoute: resolved ?? null,
          responseMetadata: {
            finishReason: result.finishReason,
            inputTokens: result.usage?.inputTokens,
            outputTokens: result.usage?.outputTokens,
            totalTokens: result.usage?.totalTokens,
            traceId: result.trace?.traceId,
            modelResolved: result.trace?.modelResolved,
            elapsed,
          },
        },
      }));
    } catch (error) {
      const elapsed = Date.now() - t0;
      const message = error instanceof Error ? error.message : String(error || 'Text generate failed.');
      onStateChange((prev) => ({
        ...prev,
        busy: false,
        busyLabel: '',
        result: 'failed',
        error: message,
        rawResponse: toPrettyJson({ request: requestParams, resolved, error: message }),
        diagnostics: { requestParams, resolvedRoute: resolved ?? null, responseMetadata: { elapsed } },
      }));
    }
  }, [prompt, system, temperature, maxTokens, state.snapshot, state.binding, runtimeClient, onStateChange]);

  const selectModel = React.useCallback((model: string) => {
    if (!asString(model)) return;
    onStateChange((prev) => ({
      ...prev,
      binding: bindingForModel(prev.snapshot, model, resolveEffectiveBinding(prev.snapshot, prev.binding)),
    }));
    setShowModelMenu(false);
  }, [onStateChange]);

  const applySource = React.useCallback((source: RuntimeRouteSource) => {
    onStateChange((prev) => ({
      ...prev,
      binding: bindingForSource(prev.snapshot, source),
    }));
  }, [onStateChange]);

  const applyConnector = React.useCallback((connectorId: string) => {
    onStateChange((prev) => ({
      ...prev,
      binding: bindingForConnector(prev.snapshot, connectorId, resolveEffectiveBinding(prev.snapshot, prev.binding)),
    }));
  }, [onStateChange]);

  const applyManualModel = React.useCallback((model: string) => {
    setManualModelDraft(model);
    onStateChange((prev) => ({
      ...prev,
      binding: bindingForModel(prev.snapshot, model, resolveEffectiveBinding(prev.snapshot, prev.binding)),
    }));
  }, [onStateChange]);

  const isEmptyState = !state.output && !state.busy && !state.error;
  const titleHero = (
    <div className="mb-5 flex flex-col items-center text-center">
      <h1 className="text-[58px] font-black uppercase tracking-[0.08em] text-[#0f172a] sm:text-[72px]">
        Test AI
      </h1>
    </div>
  );
  const composer = (
    <div className="mx-auto w-full max-w-4xl">
      <div className="relative rounded-[34px] border border-gray-200 bg-white px-5 pb-14 pt-3 shadow-[0_20px_70px_rgba(15,23,42,0.08)] transition-all focus-within:border-[#4ECCA3]/50 focus-within:shadow-[0_20px_70px_rgba(78,204,163,0.16)]">
              <textarea
                ref={promptRef}
                className="min-h-[56px] w-full resize-none overflow-y-auto border-0 bg-transparent pr-2 text-[16px] leading-7 text-gray-900 outline-none placeholder:text-gray-400"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Ask away. Long-form writing, summaries, and structured answers all work well here."
              />

              <div className="absolute bottom-4 left-4 flex items-center gap-2">
                <div className="relative" ref={advancedRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAdvanced((prev) => !prev);
                      setShowModelMenu(false);
                    }}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition hover:border-gray-300 hover:text-gray-800"
                    title="Advanced settings"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 3v4" />
                      <path d="M12 17v4" />
                      <path d="M3 12h4" />
                      <path d="M17 12h4" />
                      <path d="m5.64 5.64 2.83 2.83" />
                      <path d="m15.53 15.53 2.83 2.83" />
                      <path d="m5.64 18.36 2.83-2.83" />
                      <path d="m15.53 8.47 2.83-2.83" />
                      <circle cx="12" cy="12" r="3.5" />
                    </svg>
                  </button>

                  {showAdvanced ? (
                    <div className="absolute bottom-14 left-0 z-20 w-[360px] rounded-[26px] border border-gray-200 bg-white p-4 shadow-[0_22px_55px_rgba(15,23,42,0.16)]">
                      <div className="mb-4 text-sm font-semibold text-gray-900">Advanced Parameters</div>
                      <div className="space-y-4">
                        <label className="block">
                          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">System Prompt</div>
                          <textarea
                            className="h-24 w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm leading-6 text-gray-800 outline-none focus:border-[#4ECCA3] focus:bg-white"
                            value={system}
                            onChange={(event) => setSystem(event.target.value)}
                            placeholder="Optional system instructions..."
                          />
                        </label>
                        <div>
                          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">Temperature</div>
                          <input
                            type="range"
                            min="0"
                            max="2"
                            step="0.1"
                            value={temperatureValue}
                            onChange={(event) => setTemperature(event.target.value)}
                            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-gray-200 accent-[#4ECCA3]"
                          />
                          <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                            <span>Precise</span>
                            <span>{temperatureValue.toFixed(1)}</span>
                            <span>Creative</span>
                          </div>
                        </div>
                        <div>
                          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">Max Tokens</div>
                          <div className="flex flex-wrap gap-2">
                            {quickTokenOptions.map((option) => {
                              const active = option === 'Auto' ? !asString(maxTokens) : maxTokens === option;
                              return (
                                <button
                                  key={option}
                                  type="button"
                                  onClick={() => setMaxTokens(option === 'Auto' ? '' : option)}
                                  className={active
                                    ? 'rounded-full bg-[#111827] px-3 py-1.5 text-xs text-white'
                                    : 'rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 transition hover:border-gray-300 hover:text-gray-900'}
                                >
                                  {option}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="absolute bottom-4 right-4 flex items-center gap-2">
                <div className="relative" ref={modelMenuRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowModelMenu((prev) => !prev);
                      setShowAdvanced(false);
                    }}
                    className="inline-flex h-11 items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-4 text-sm text-gray-700 transition hover:border-gray-300 hover:bg-white"
                  >
                    <span className="max-w-[170px] truncate">{modelDisplayName}</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>

                  {showModelMenu ? (
                    <div className="absolute bottom-14 right-0 z-20 w-[320px] rounded-[26px] border border-gray-200 bg-white p-2 shadow-[0_22px_55px_rgba(15,23,42,0.16)]">
                      <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">Models</div>
                      <div className="max-h-80 overflow-y-auto py-1">
                        {modelMenuOptions.length > 0 ? modelMenuOptions.map((model) => {
                          const active = model === activeModel;
                          return (
                            <button
                              key={model}
                              type="button"
                              onClick={() => selectModel(model)}
                              className="flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm text-gray-700 transition hover:bg-gray-50"
                            >
                              <span className="truncate">{model}</span>
                              <span className={active ? 'text-[#4ECCA3]' : 'text-transparent'}>{active ? '\u2713' : ''}</span>
                            </button>
                          );
                        }) : (
                          <div className="px-3 py-3 text-sm text-gray-400">
                            {cloudCatalogMissing ? 'Connector catalog is missing model data.' : 'No model options available yet.'}
                          </div>
                        )}
                      </div>
                      <div className="my-1 h-px bg-gray-100" />
                      <button
                        type="button"
                        onClick={() => {
                          setShowModelMenu(false);
                          setShowAdvanced(false);
                          setShowRouteDialog(true);
                        }}
                        className="flex w-full items-center rounded-2xl px-3 py-2.5 text-left text-sm text-gray-700 transition hover:bg-gray-50"
                      >
                        Manual Override / Custom Route
                      </button>
                    </div>
                  ) : null}
                </div>

                <button
                  type="button"
                  disabled={state.busy || !asString(prompt)}
                  onClick={() => { void handleRun(); }}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-[#111827] text-white transition hover:bg-[#1f2937] disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
                  title="Send"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 19V5" />
                    <path d="m5 12 7-7 7 7" />
                  </svg>
                </button>
              </div>
            </div>
    </div>
  );

  return (
    <div className="test-ai-scroll-shell relative flex h-full min-h-[720px] flex-col overflow-y-auto overflow-x-hidden bg-[#f8fafc]">
      <style>{`
        .test-ai-scroll-shell,
        .test-ai-scroll-shell * {
          scrollbar-width: thin;
          scrollbar-color: rgba(148, 163, 184, 0.55) transparent;
        }
        .test-ai-scroll-shell *::-webkit-scrollbar {
          width: 10px;
          height: 10px;
        }
        .test-ai-scroll-shell *::-webkit-scrollbar-track {
          background: transparent;
        }
        .test-ai-scroll-shell *::-webkit-scrollbar-thumb {
          background: rgba(148, 163, 184, 0.55);
          border-radius: 9999px;
          border: 2px solid transparent;
          background-clip: content-box;
        }
        .test-ai-scroll-shell *::-webkit-scrollbar-thumb:hover {
          background: rgba(100, 116, 139, 0.7);
          border-radius: 9999px;
          border: 2px solid transparent;
          background-clip: content-box;
        }
        .test-ai-scroll-shell *::-webkit-scrollbar-button {
          display: none;
          width: 0;
          height: 0;
        }
        .test-ai-scroll-shell *::-webkit-scrollbar-corner {
          background: transparent;
        }
      `}</style>
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-1 flex-col px-8 pb-10 pt-6">
        {isEmptyState ? (
          <div className="flex min-h-[calc(100vh-180px)] flex-1 items-center justify-center">
            <div className="flex w-full max-w-4xl flex-col items-center">
              {titleHero}
              {composer}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col">
            <div className="mx-auto mb-4 flex w-full max-w-4xl justify-end">
              {state.output ? (
                <button
                  type="button"
                  onClick={() => setShowConversation((prev) => !prev)}
                  className="inline-flex items-center gap-2 rounded-full border border-[#4ECCA3]/20 bg-[#4ECCA3]/10 px-4 py-2 text-sm text-[#2E8D73] transition hover:bg-[#4ECCA3]/14"
                >
                  <span>{showConversation ? 'Hide conversation' : 'Show conversation'}</span>
                  <svg
                    className={`h-4 w-4 transition-transform ${showConversation ? 'rotate-180' : ''}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
              ) : null}
            </div>

            {showConversation && state.output ? (
              <div className="mx-auto mb-6 flex w-full max-w-4xl flex-col gap-5">
                <div className="self-end rounded-[26px] bg-[#eef8f4] px-5 py-3 text-[15px] leading-7 text-gray-900 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
                  {prompt}
                </div>
                <div className="rounded-[30px] border border-gray-200 bg-white px-6 py-5 shadow-[0_20px_45px_rgba(15,23,42,0.06)]">
                  <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                    <span>Assistant</span>
                    {state.result === 'passed' ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] tracking-normal text-green-700">Ready</span>
                    ) : null}
                  </div>
                  <div className="whitespace-pre-wrap text-[15px] leading-8 text-gray-800">{asString(state.output)}</div>
                </div>
              </div>
            ) : null}

            {state.busy && !state.output ? (
              <div className="mx-auto mb-6 w-full max-w-4xl rounded-[28px] border border-gray-200 bg-white px-6 py-5 text-sm text-gray-600 shadow-[0_20px_45px_rgba(15,23,42,0.06)]">
                <div className="inline-flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-emerald-400 [animation-delay:-0.2s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-emerald-400 [animation-delay:-0.1s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-emerald-400" />
                  </span>
                  <span>{(state.busyLabel || 'Running...').replace(/\.{3}$/, '')}</span>
                </div>
              </div>
            ) : null}

            {state.error ? (
              <div className="mx-auto mb-6 w-full max-w-4xl rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {state.error}
              </div>
            ) : null}

            <div className="mx-auto mt-2 w-full max-w-4xl shrink-0">
              {titleHero}
              {composer}
            </div>

            {state.busy && state.busyLabel === 'Warming local model...' ? (
              <div className="mt-4">
                <InfoBox message="Local runtime is prewarming the selected model before sending your prompt." />
              </div>
            ) : null}

            {(state.rawResponse || state.diagnostics.requestParams || state.diagnostics.resolvedRoute || state.diagnostics.responseMetadata) ? (
              <div className="mt-4 pb-8">
                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                  <button
                    type="button"
                    onClick={() => setShowDeveloperDetails((prev) => !prev)}
                    className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-gray-700"
                  >
                    <svg
                      className={`h-4 w-4 transition-transform ${showDeveloperDetails ? 'rotate-90' : ''}`}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="m9 6 6 6-6 6" />
                    </svg>
                    <span>Developer details</span>
                  </button>
                  {showDeveloperDetails ? (
                    <div className="border-t border-gray-200 p-4">
                    <div className="space-y-4 pb-4">
                      <DiagnosticsPanel diagnostics={state.diagnostics} />
                      {state.rawResponse ? <RawJsonSection content={state.rawResponse} /> : null}
                    </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {showRouteDialog ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/25 px-6">
          <div className="w-full max-w-2xl rounded-[30px] bg-white p-6 shadow-[0_30px_80px_rgba(15,23,42,0.2)]">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold text-gray-950">Manual Override / Custom Route</div>
                <div className="mt-1 text-sm text-gray-500">
                  Use advanced routing controls when you need to pin source, connector, or a custom model.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRouteDialog(false)}
                className="rounded-full border border-gray-200 p-2 text-gray-500 transition hover:border-gray-300 hover:text-gray-700"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            {state.routeError ? (
              <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                {state.routeError}
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-3">
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-gray-500">Source</span>
                <RouteSelect
                  value={activeSource}
                  options={sourceOptions}
                  onChange={(value) => applySource(value as RuntimeRouteSource)}
                  disabled={!state.snapshot}
                />
              </label>
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-gray-500">Connector</span>
                <RouteSelect
                  value={activeSource === 'cloud' ? activeConnectorId : ''}
                  options={connectorOptions}
                  onChange={applyConnector}
                  disabled={!state.snapshot || activeSource !== 'cloud'}
                />
              </label>
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-gray-500">Model</span>
                <RouteSelect
                  value={activeModelInOptions ? activeModel : ''}
                  options={modelSelectOptions}
                  onChange={applyManualModel}
                  disabled={!state.snapshot || modelOptions.length === 0}
                />
              </label>
            </div>

            <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600">
              {activeSource === 'cloud'
                ? `Provider: ${activeConnector?.label || activeConnector?.id || 'unknown'}`
                : 'Using local runtime model catalog'}
            </div>

            <label className="mt-4 flex flex-col gap-2 text-sm">
              <span className="text-gray-500">Manual model override</span>
              <input
                className="rounded-2xl border border-gray-200 bg-white px-3 py-3 outline-none focus:border-[#4ECCA3]"
                value={manualModelDraft}
                onChange={(event) => setManualModelDraft(event.target.value)}
                onBlur={() => applyManualModel(manualModelDraft)}
                placeholder="model id"
              />
            </label>

            <div className="mt-6 flex items-center justify-between">
              <button
                type="button"
                onClick={onRouteReload}
                disabled={state.routeLoading}
                className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 transition hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50"
              >
                {state.routeLoading ? 'Refreshing...' : 'Refresh'}
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onStateChange((prev) => ({ ...prev, binding: null }))}
                  className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
                >
                  Use default
                </button>
                <button
                  type="button"
                  onClick={() => {
                    applyManualModel(manualModelDraft);
                    setShowRouteDialog(false);
                  }}
                  className="rounded-full bg-[#111827] px-4 py-2 text-sm text-white transition hover:bg-[#1f2937]"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Panel: text.embed ─────────────────────────────────────────────────────────

type TextEmbedPanelProps = {
  state: CapabilityState;
  runtimeClient: ModRuntimeClient;
  onStateChange: (updater: (prev: CapabilityState) => CapabilityState) => void;
  onRouteReload: () => void;
};

function TextEmbedPanel(props: TextEmbedPanelProps) {
  const { state, runtimeClient, onStateChange, onRouteReload } = props;
  const [text, setText] = React.useState('Hello, world.');
  const [showModelMenu, setShowModelMenu] = React.useState(false);
  const [showRouteDialog, setShowRouteDialog] = React.useState(false);
  const [manualModelDraft, setManualModelDraft] = React.useState('');
  const [copiedVector, setCopiedVector] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const modelMenuRef = React.useRef<HTMLDivElement | null>(null);

  const {
    effectiveBinding,
    activeSource,
    activeConnectorId,
    activeModel,
    modelOptions,
    cloudCatalogMissing,
    activeModelInOptions,
  } = resolveRouteModelPickerState(state.snapshot, state.binding);
  const tokenConnectors = state.snapshot?.connectors || [];
  const activeConnector = tokenConnectors.find((item) => item.id === activeConnectorId) || null;
  const modelMenuOptions = modelOptions.length > 0 ? modelOptions : (activeModel ? [activeModel] : []);
  const modelDisplayName = activeModel || effectiveBinding?.model || effectiveBinding?.modelId || 'Select model';
  const textLength = text.length;
  const lineCount = Math.max(1, text.split(/\r?\n/g).length);
  const estimatedTokens = Math.max(1, Math.ceil(asString(text).length / 4));
  const sourceSelectOptions: RouteSelectOption[] = [
    { value: 'local', label: 'local' },
    { value: 'cloud', label: 'cloud' },
  ];
  const connectorSelectOptions: RouteSelectOption[] = [
    { value: '', label: '--', disabled: true },
    ...tokenConnectors.map((connector) => ({
      value: connector.id,
      label: connector.label || connector.id,
    })),
  ];
  const modelSelectOptions: RouteSelectOption[] = [
    {
      value: '',
      label: modelOptions.length === 0
        ? (activeSource === 'cloud' ? 'Connector catalog missing models' : 'No local models')
        : 'Select model',
      disabled: true,
    },
    ...modelOptions.map((model) => ({ value: model, label: model })),
  ];

  React.useEffect(() => {
    setManualModelDraft(activeModel);
  }, [activeModel]);

  React.useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = '0px';
    node.style.height = `${Math.min(Math.max(node.scrollHeight, 280), 560)}px`;
  }, [text]);

  React.useEffect(() => {
    if (cloudCatalogMissing || (asString(activeModel) && !activeModelInOptions)) {
      setShowRouteDialog(true);
    }
  }, [cloudCatalogMissing, activeModel, activeModelInOptions]);

  React.useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (showModelMenu && modelMenuRef.current && !modelMenuRef.current.contains(target)) {
        setShowModelMenu(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [showModelMenu]);

  const applySource = React.useCallback((source: RuntimeRouteSource) => {
    onStateChange((prev) => ({
      ...prev,
      binding: bindingForSource(prev.snapshot, source),
    }));
  }, [onStateChange]);

  const applyConnector = React.useCallback((connectorId: string) => {
    onStateChange((prev) => ({
      ...prev,
      binding: bindingForConnector(prev.snapshot, connectorId, resolveEffectiveBinding(prev.snapshot, prev.binding)),
    }));
  }, [onStateChange]);

  const applyManualModel = React.useCallback((model: string) => {
    onStateChange((prev) => ({
      ...prev,
      binding: bindingForModel(prev.snapshot, model, prev.binding),
    }));
  }, [onStateChange]);

  const handleRun = React.useCallback(async () => {
    if (!asString(text)) {
      onStateChange((prev) => ({ ...prev, error: 'Input text is empty.' }));
      return;
    }
    onStateChange((prev) => ({
      ...prev,
      busy: true,
      busyLabel: 'Preparing route...',
      error: '',
      diagnostics: makeEmptyDiagnostics(),
    }));
    const t0 = Date.now();
    const binding = resolveEffectiveBinding(state.snapshot, state.binding) || undefined;
    const requestParams: Record<string, unknown> = { input: text, ...(binding ? { binding } : {}) };
    let resolved: ModRuntimeResolvedBinding | undefined;
    try {
      resolved = await runtimeClient.route.resolve({ capability: 'text.embed' as RuntimeCanonicalCapability, binding });
      onStateChange((prev) => ({
        ...prev,
        busy: true,
        busyLabel: resolved?.source === 'local' ? 'Warming local embedding model...' : 'Generating embedding...',
      }));
      const result = await runtimeClient.ai.embedding.generate({ input: text, binding });
      const elapsed = Date.now() - t0;
      const vec = result.vectors[0] || [];
      const preview = vec.slice(0, 8).map((v: number) => v.toFixed(6)).join(', ');

      onStateChange((prev) => ({
        ...prev,
        busy: false,
        busyLabel: undefined,
        result: 'passed',
        output: {
          dimensions: vec.length,
          vectors: result.vectors.length,
          preview: `[${preview}${vec.length > 8 ? ', …' : ''}]`,
          values: vec,
          vectorText: `[${vec.join(', ')}]`,
        },
        rawResponse: toPrettyJson({ request: requestParams, resolved, response: result }),
        diagnostics: {
          requestParams,
          resolvedRoute: resolved ?? null,
          responseMetadata: {
            inputTokens: result.usage?.inputTokens,
            outputTokens: result.usage?.outputTokens,
            totalTokens: result.usage?.totalTokens,
            traceId: result.trace?.traceId,
            modelResolved: result.trace?.modelResolved,
            elapsed,
          },
        },
      }));
    } catch (error) {
      const elapsed = Date.now() - t0;
      const message = error instanceof Error ? error.message : String(error || 'Text embed failed.');
      onStateChange((prev) => ({
        ...prev,
        busy: false,
        busyLabel: undefined,
        result: 'failed',
        error: message,
        rawResponse: toPrettyJson({ request: requestParams, resolved, error: message }),
        diagnostics: { requestParams, resolvedRoute: resolved ?? null, responseMetadata: { elapsed } },
      }));
    }
  }, [text, state.snapshot, state.binding, runtimeClient, onStateChange]);

  const embedOutput = state.output as {
    dimensions?: number;
    vectors?: number;
    preview?: string;
    values?: number[];
    vectorText?: string;
  } | null;
  const responseMeta = state.diagnostics.responseMetadata;
  const outputText = embedOutput?.vectorText || '';

  const handleCopyVector = React.useCallback(() => {
    if (!outputText) return;
    void navigator.clipboard.writeText(outputText).then(() => {
      setCopiedVector(true);
      setTimeout(() => setCopiedVector(false), 1500);
    });
  }, [outputText]);

  return (
    <div className="relative flex flex-col gap-5">
      <div className="grid gap-4 bg-[#f8fafc] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="flex min-h-[440px] flex-col overflow-hidden rounded-[28px] border border-gray-200 bg-white shadow-[0_18px_44px_rgba(15,23,42,0.06)]">
            {showRouteDialog ? (
              <div className="border-b border-gray-100 bg-[#fbfcfd] px-5 py-5">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <div className="text-lg font-semibold text-gray-950">Advanced Routing Configuration</div>
                    <div className="mt-1 text-sm text-gray-500">
                      Pin source, connector, or model when you need to inspect a specific embedding path.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowRouteDialog(false)}
                    className="rounded-full border border-gray-200 p-2 text-gray-500 transition hover:border-gray-300 hover:text-gray-700"
                    title="Collapse"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="m18 15-6-6-6 6" />
                    </svg>
                  </button>
                </div>

                {state.routeError ? (
                  <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                    {state.routeError}
                  </div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-3">
                  <label className="flex flex-col gap-2 text-sm">
                    <span className="text-gray-500">Source</span>
                    <RouteSelect
                      value={activeSource}
                      options={sourceSelectOptions}
                      onChange={(value) => applySource(value as RuntimeRouteSource)}
                      disabled={!state.snapshot}
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm">
                    <span className="text-gray-500">Connector</span>
                    <RouteSelect
                      value={activeSource === 'cloud' ? activeConnectorId : ''}
                      options={connectorSelectOptions}
                      onChange={applyConnector}
                      disabled={!state.snapshot || activeSource !== 'cloud'}
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm">
                    <span className="text-gray-500">Model Override</span>
                    <RouteSelect
                      value={activeModelInOptions ? activeModel : ''}
                      options={modelSelectOptions}
                      onChange={(value) => {
                        applyManualModel(value);
                        setManualModelDraft(value);
                      }}
                      disabled={!state.snapshot || modelOptions.length === 0}
                    />
                  </label>
                </div>

                <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                  {activeSource === 'cloud'
                    ? `Provider: ${activeConnector?.label || activeConnector?.id || 'unknown'}`
                    : 'Using local runtime model catalog'}
                </div>

                <label className="mt-4 flex flex-col gap-2 text-sm">
                  <span className="text-gray-500">Manual model id</span>
                  <input
                    className="rounded-2xl border border-gray-200 bg-white px-3 py-3 outline-none focus:border-emerald-400"
                    value={manualModelDraft}
                    onChange={(event) => setManualModelDraft(event.target.value)}
                    onBlur={() => applyManualModel(manualModelDraft)}
                    placeholder="model id"
                  />
                </label>

                <div className="mt-6 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => onStateChange((prev) => ({ ...prev, binding: null }))}
                    className="rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-600 transition hover:border-gray-300 hover:text-gray-900"
                  >
                    Use default route
                  </button>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={onRouteReload}
                      className="rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-600 transition hover:border-gray-300 hover:text-gray-900"
                    >
                      {state.routeLoading ? 'Refreshing...' : 'Refresh route'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        applyManualModel(manualModelDraft);
                        setShowRouteDialog(false);
                      }}
                      className="rounded-full bg-[#111827] px-4 py-2 text-sm text-white transition hover:bg-[#1f2937]"
                    >
                      Save configuration
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            <textarea
              ref={textareaRef}
              className="min-h-[220px] flex-1 resize-none border-0 bg-transparent px-5 py-5 text-[17px] leading-8 text-gray-900 outline-none placeholder:text-gray-400"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Enter text to embed..."
            />

            <div className="border-t border-gray-100 bg-[#fbfcfd] px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="relative" ref={modelMenuRef}>
                  <button
                    type="button"
                    onClick={() => setShowModelMenu((prev) => !prev)}
                    className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 transition hover:border-gray-300 hover:text-gray-900"
                  >
                    <span className="max-w-[220px] truncate font-mono text-[11px]">{modelDisplayName}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>

                  {showModelMenu ? (
                    <div className="absolute bottom-[calc(100%+10px)] left-0 z-30 w-72 rounded-[24px] border border-gray-200 bg-white p-2 shadow-[0_20px_50px_rgba(15,23,42,0.16)]">
                      <div className="mb-1 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">
                        Route Model
                      </div>
                      {modelMenuOptions.map((model) => (
                        <button
                          key={model}
                          type="button"
                          onClick={() => {
                            applyManualModel(model);
                            setShowModelMenu(false);
                          }}
                          className="flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm text-gray-700 transition hover:bg-gray-50"
                        >
                          <span className="truncate font-mono text-[12px]">{model}</span>
                          {activeModel === model ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Active</span>
                          ) : null}
                        </button>
                      ))}
                      <div className="my-2 border-t border-gray-100" />
                      <button
                        type="button"
                        onClick={() => {
                          setShowModelMenu(false);
                          setShowRouteDialog(true);
                        }}
                        className="flex w-full items-center rounded-2xl px-3 py-2.5 text-left text-sm text-gray-700 transition hover:bg-gray-50"
                      >
                        Manual Override / Custom Route
                      </button>
                    </div>
                  ) : null}
                </div>

                <button
                  type="button"
                  disabled={state.busy || !asString(text)}
                  onClick={() => { void handleRun(); }}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-[#111827] text-white transition hover:bg-[#1f2937] disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
                  title="Run Text Embed"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                </button>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                <span className="rounded-full bg-gray-100 px-2.5 py-1 font-medium">
                  Source: <span className="font-mono text-gray-700">{activeSource}</span>
                </span>
                <span className="rounded-full bg-gray-100 px-2.5 py-1 font-medium">
                  Chars: <span className="font-mono text-gray-700">{textLength}</span>
                </span>
                <span className="rounded-full bg-gray-100 px-2.5 py-1 font-medium">
                  Lines: <span className="font-mono text-gray-700">{lineCount}</span>
                </span>
                <span className="rounded-full bg-gray-100 px-2.5 py-1 font-medium">
                  Est. tokens: <span className="font-mono text-gray-700">~{estimatedTokens}</span>
                </span>
                {activeSource === 'cloud' && activeConnectorId ? (
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 font-medium">
                    Connector: <span className="font-mono text-gray-700">{activeConnector?.label || activeConnectorId}</span>
                  </span>
                ) : null}
                {responseMeta?.modelResolved ? (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
                    Resolved: <span className="font-mono">{responseMeta.modelResolved}</span>
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex min-h-[440px] flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,_rgba(248,250,252,0.96)_0%,_rgba(241,245,249,0.96)_100%)] shadow-[0_18px_44px_rgba(15,23,42,0.06)]">
            <div className="flex items-center justify-between border-b border-slate-200 bg-white/70 px-4 py-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Vector Output</div>
                <div className="mt-1 text-xs text-slate-500">Structured numeric response for the first vector.</div>
              </div>
              {embedOutput ? (
                <div className="flex items-center gap-2">
                  <div className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                    Dim {embedOutput.dimensions ?? 0}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyVector}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                  >
                    {copiedVector ? 'Copied' : 'Copy'}
                  </button>
                </div>
              ) : null}
            </div>

            <div className="grid gap-3 border-b border-slate-200 px-4 py-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-white/75 px-3 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Vectors</div>
                <div className="mt-1 font-mono text-sm text-slate-800">{embedOutput?.vectors ?? 0}</div>
              </div>
              <div className="rounded-2xl bg-white/75 px-3 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Dimensions</div>
                <div className="mt-1 font-mono text-sm text-slate-800">{embedOutput?.dimensions ?? '—'}</div>
              </div>
              <div className="rounded-2xl bg-white/75 px-3 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Elapsed</div>
                <div className="mt-1 font-mono text-sm text-slate-800">{responseMeta?.elapsed !== undefined ? `${responseMeta.elapsed} ms` : '—'}</div>
              </div>
            </div>

            <div className="grid gap-3 border-b border-slate-200 px-4 py-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-white/75 px-3 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Resolved Model</div>
                <div className="mt-1 truncate font-mono text-sm text-slate-800">{responseMeta?.modelResolved || modelDisplayName}</div>
              </div>
              <div className="rounded-2xl bg-white/75 px-3 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Trace Id</div>
                <div className="mt-1 truncate font-mono text-sm text-slate-800">{responseMeta?.traceId || '—'}</div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 font-mono text-[13px] leading-7 text-slate-700">
              {embedOutput?.vectorText ? (
                <pre className="whitespace-pre-wrap break-all">{embedOutput.vectorText}</pre>
              ) : state.busy ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-slate-400">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full border border-slate-200 bg-white">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 3v4" />
                      <path d="M12 17v4" />
                      <path d="M3 12h4" />
                      <path d="M17 12h4" />
                      <path d="m5.6 5.6 2.8 2.8" />
                      <path d="m15.6 15.6 2.8 2.8" />
                      <path d="m5.6 18.4 2.8-2.8" />
                      <path d="m15.6 8.4 2.8-2.8" />
                    </svg>
                  </div>
                  <div className="text-sm">{state.busyLabel || 'Embedding text...'}</div>
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-slate-400">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full border border-slate-200 bg-white">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 7h16" />
                      <path d="M4 12h16" />
                      <path d="M4 17h10" />
                    </svg>
                  </div>
                  <div className="text-sm italic">Output will appear here...</div>
                </div>
              )}
            </div>
          </div>
      </div>

      {state.error ? <ErrorBox message={state.error} /> : null}
      {embedOutput?.preview ? <InfoBox message={`Preview: ${embedOutput.preview}`} /> : null}
      <DiagnosticsPanel diagnostics={state.diagnostics} />
      {state.rawResponse ? <RawJsonSection content={state.rawResponse} /> : null}
    </div>
  );
}

// ── Panel: image.generate ─────────────────────────────────────────────────────

type ImageGeneratePanelProps = {
  mode: 'generate' | 'job';
  state: CapabilityState;
  runtimeClient: ModRuntimeClient;
  draft: ImageWorkflowDraftState;
  onDraftChange: React.Dispatch<React.SetStateAction<ImageWorkflowDraftState>>;
  onStateChange: (updater: (prev: CapabilityState) => CapabilityState) => void;
  onRouteReload: () => void;
  onBindingChange: (binding: RuntimeRouteBinding | null) => void;
};

function ImageGeneratePanel(props: ImageGeneratePanelProps) {
  const {
    mode,
    state,
    runtimeClient,
    draft,
    onDraftChange,
    onStateChange,
    onRouteReload,
    onBindingChange,
  } = props;
  const [artifacts, setArtifacts] = React.useState<ModRuntimeLocalArtifactRecord[]>([]);
  const [artifactLoading, setArtifactLoading] = React.useState(false);
  const [artifactError, setArtifactError] = React.useState('');
  const [watchJobId, setWatchJobId] = React.useState('');
  const [jobTimeline, setJobTimeline] = React.useState<Array<Record<string, unknown>>>([]);
  const nextComponentIdRef = React.useRef(draft.componentDrafts.length + 1);
  const watchSequenceRef = React.useRef(0);
  const effectiveBinding = React.useMemo(
    () => resolveEffectiveBinding(state.snapshot, state.binding),
    [state.snapshot, state.binding],
  );
  const isLocalRuntimeWorkflow = effectiveBinding?.source === 'local';
  const localEngine = asString(
    isLocalRuntimeWorkflow
      ? (effectiveBinding?.engine || effectiveBinding?.provider)
      : '',
  );
  const isLocalAIImageWorkflow = isLocalRuntimeWorkflow && localEngine.toLowerCase() === 'localai';
  const updateDraft = React.useCallback((
    updater: Partial<ImageWorkflowDraftState> | ((prev: ImageWorkflowDraftState) => ImageWorkflowDraftState),
  ) => {
    onDraftChange((prev) => {
      if (typeof updater === 'function') {
        return updater(prev);
      }
      return { ...prev, ...updater };
    });
  }, [onDraftChange]);

  React.useEffect(() => {
    if (!isLocalAIImageWorkflow) {
      setArtifacts([]);
      setArtifactLoading(false);
      setArtifactError('');
      return;
    }
    let cancelled = false;
    setArtifactLoading(true);
    setArtifactError('');
    void runtimeClient.local.listArtifacts(
      localEngine ? { engine: localEngine } : undefined,
    ).then((rows) => {
      if (cancelled) return;
      setArtifacts(rows);
      setArtifactLoading(false);
    }).catch((error) => {
      if (cancelled) return;
      setArtifacts([]);
      setArtifactLoading(false);
      setArtifactError(error instanceof Error ? error.message : String(error || 'Failed to load local artifacts.'));
    });
    return () => {
      cancelled = true;
    };
  }, [runtimeClient, isLocalAIImageWorkflow, localEngine]);

  React.useEffect(() => {
    if (!isLocalAIImageWorkflow) {
      return;
    }
    const selectableArtifactIds = new Set(
      artifacts
        .filter(isSelectableLocalArtifact)
        .map((artifact) => artifact.localArtifactId),
    );
    const nextPresetSelections = Object.fromEntries(
      IMAGE_WORKFLOW_PRESET_SELECTIONS.map((preset) => {
        const current = draft[preset.key];
        return [
          preset.key,
          current && selectableArtifactIds.has(current) ? current : '',
        ];
      }),
    ) as Record<ImageWorkflowPresetSelectionKey, string>;
    const nextComponentDrafts = draft.componentDrafts.map((component) => (
      component.localArtifactId && !selectableArtifactIds.has(component.localArtifactId)
        ? { ...component, localArtifactId: '' }
        : component
    ));
    const presetSelectionsChanged = IMAGE_WORKFLOW_PRESET_SELECTIONS.some((preset) => (
      nextPresetSelections[preset.key] !== draft[preset.key]
    ));
    const componentDraftsChanged = nextComponentDrafts.some((component, index) => (
      component.localArtifactId !== draft.componentDrafts[index]?.localArtifactId
    ));
    if (presetSelectionsChanged || componentDraftsChanged) {
      updateDraft((prev) => ({
        ...prev,
        ...nextPresetSelections,
        componentDrafts: nextComponentDrafts,
      }));
    }
  }, [artifacts, draft, isLocalAIImageWorkflow, updateDraft]);

  const handleComponentChange = React.useCallback((
    componentId: string,
    key: 'slot' | 'localArtifactId',
    value: string,
  ) => {
    updateDraft((prev) => ({
      ...prev,
      componentDrafts: prev.componentDrafts.map((component) => (
        component.id === componentId
          ? { ...component, [key]: value }
          : component
      )),
    }));
  }, [updateDraft]);

  const handleAddComponent = React.useCallback(() => {
    updateDraft((prev) => ({
      ...prev,
      componentDrafts: [
        ...prev.componentDrafts,
        {
          id: `component-${nextComponentIdRef.current++}`,
          slot: '',
          localArtifactId: '',
        },
      ],
    }));
  }, [updateDraft]);

  const handleRemoveComponent = React.useCallback((componentId: string) => {
    updateDraft((prev) => ({
      ...prev,
      componentDrafts: prev.componentDrafts.filter((component) => component.id !== componentId),
    }));
  }, [updateDraft]);

  const buildRequestContext = React.useCallback(() => {
    if (!asString(draft.prompt)) {
      return { error: 'Prompt is empty.' };
    }
    const profileOverridesResult = buildImageWorkflowProfileOverrides({
      step: draft.step,
      cfgScale: draft.cfgScale,
      sampler: draft.sampler,
      scheduler: draft.scheduler,
      optionsText: draft.optionsText,
      rawJsonText: draft.rawProfileOverridesText,
    });
    if (profileOverridesResult.error) {
      return { error: profileOverridesResult.error };
    }
    const binding = effectiveBinding || undefined;
    const nNum = Math.max(1, Number(draft.n) || 1);
    let extensions: Record<string, unknown> | undefined;
    if (isLocalAIImageWorkflow) {
      const localWorkflow = buildLocalAIImageWorkflowExtensionsForRequest({
        vaeModel: draft.vaeModel,
        llmModel: draft.llmModel,
        clipLModel: draft.clipLModel,
        clipGModel: draft.clipGModel,
        controlnetModel: draft.controlnetModel,
        loraModel: draft.loraModel,
        auxiliaryModel: draft.auxiliaryModel,
        components: draft.componentDrafts,
        profileOverrides: profileOverridesResult.overrides,
      });
      if (localWorkflow.error) {
        return { error: localWorkflow.error };
      }
      extensions = localWorkflow.extensions;
    }
    return {
      error: '',
      binding,
      requestParams: buildImageGenerateRequestParams({
        prompt: draft.prompt,
        negativePrompt: draft.negativePrompt,
        n: nNum,
        size: draft.size,
        seed: draft.seed,
        timeoutMs: draft.timeoutMs,
        responseFormatMode: draft.responseFormatMode,
        extensions,
        binding,
      }),
    };
  }, [draft, effectiveBinding, isLocalAIImageWorkflow]);

  const finalizeAsyncImageJob = React.useCallback(async (input: {
    jobId: string;
    requestParams: Record<string, unknown> | null;
    resolved: ModRuntimeResolvedBinding | null;
    job?: Record<string, unknown> | null;
    elapsed: number;
  }) => {
    let artifactFetchError = '';
    let artifactsResponse: { artifacts: Array<{ uri?: string; bytes?: Uint8Array; mimeType?: string }>; traceId?: string } = {
      artifacts: [],
    };
    try {
      const response = await runtimeClient.media.jobs.getArtifacts(input.jobId);
      artifactsResponse = {
        artifacts: Array.isArray(response.artifacts) ? response.artifacts : [],
        traceId: response.traceId,
      };
    } catch (error) {
      artifactFetchError = error instanceof Error ? error.message : String(error || 'Failed to fetch image job artifacts.');
    }
    const artifactsTraceId = 'traceId' in artifactsResponse
      ? asString(artifactsResponse.traceId)
      : '';
    const uris = (artifactsResponse.artifacts || [])
      .map((artifact) => toArtifactPreviewUri({
        uri: artifact.uri,
        bytes: artifact.bytes,
        mimeType: artifact.mimeType,
        defaultMimeType: 'image/png',
      }))
      .filter(Boolean);
    const jobRecord = input.job || {};
    const outcome = buildAsyncImageJobOutcome({
      status: jobRecord.status,
      reasonDetail: jobRecord.reasonDetail,
      artifactFetchError,
    });
    onStateChange((prev) => ({
      ...prev,
      busy: false,
      busyLabel: '',
      result: outcome.result,
      error: outcome.error,
      output: uris,
      rawResponse: toPrettyJson({
        request: input.requestParams,
        resolved: input.resolved,
        jobId: input.jobId,
        job: input.job,
        events: jobTimeline,
        artifacts: stripArtifacts({ artifacts: artifactsResponse.artifacts }),
        artifactFetchError: artifactFetchError || undefined,
        previewUris: uris,
      }),
      diagnostics: {
        requestParams: input.requestParams,
        resolvedRoute: input.resolved,
        responseMetadata: {
          jobId: input.jobId,
          artifactCount: artifactsResponse.artifacts.length,
          traceId: asString(jobRecord.traceId || artifactsTraceId) || undefined,
          modelResolved: asString(jobRecord.modelResolved) || undefined,
          elapsed: input.elapsed,
        },
      },
    }));
  }, [jobTimeline, onStateChange, runtimeClient.media.jobs]);

  const watchAsyncImageJob = React.useCallback(async (input: {
    jobId: string;
    requestParams: Record<string, unknown> | null;
    resolved: ModRuntimeResolvedBinding | null;
    initialJob?: Record<string, unknown> | null;
  }) => {
    const watchToken = ++watchSequenceRef.current;
    const startedAt = Date.now();
    setWatchJobId(input.jobId);
    setJobTimeline([]);
    const pushJobEvent = (label: string, job: Record<string, unknown> | null | undefined, sequence?: unknown) => {
      const normalizedJob = job || {};
      setJobTimeline((prev) => [
        ...prev,
        {
          sequence: sequence ?? prev.length + 1,
          label,
          status: scenarioJobStatusLabel(normalizedJob.status),
          reasonDetail: asString(normalizedJob.reasonDetail) || undefined,
          traceId: asString(normalizedJob.traceId) || undefined,
          providerJobId: asString(normalizedJob.providerJobId) || undefined,
        },
      ]);
    };

    onStateChange((prev) => ({
      ...prev,
      busy: true,
      busyLabel: 'Watching image job...',
      error: '',
      output: [],
      diagnostics: {
        requestParams: input.requestParams,
        resolvedRoute: input.resolved,
        responseMetadata: {
          jobId: input.jobId,
        },
      },
    }));

    let currentJob = input.initialJob || await runtimeClient.media.jobs.get(input.jobId) as unknown as Record<string, unknown>;
    if (watchToken !== watchSequenceRef.current) {
      return;
    }
    pushJobEvent('submitted', currentJob);
    if (isTerminalScenarioJobStatus(currentJob.status)) {
      await finalizeAsyncImageJob({
        jobId: input.jobId,
        requestParams: input.requestParams,
        resolved: input.resolved,
        job: currentJob,
        elapsed: Date.now() - startedAt,
      });
      return;
    }

    const stream = await runtimeClient.media.jobs.subscribe(input.jobId);
    for await (const event of stream) {
      if (watchToken !== watchSequenceRef.current) {
        return;
      }
      currentJob = (event.job as unknown as Record<string, unknown>) || currentJob;
      pushJobEvent(scenarioJobEventLabel(event.eventType), currentJob, event.sequence);
      if (isTerminalScenarioJobStatus(currentJob.status)) {
        await finalizeAsyncImageJob({
          jobId: input.jobId,
          requestParams: input.requestParams,
          resolved: input.resolved,
          job: currentJob,
          elapsed: Date.now() - startedAt,
        });
        return;
      }
    }

    if (watchToken !== watchSequenceRef.current) {
      return;
    }
    currentJob = await runtimeClient.media.jobs.get(input.jobId) as unknown as Record<string, unknown>;
    await finalizeAsyncImageJob({
      jobId: input.jobId,
      requestParams: input.requestParams,
      resolved: input.resolved,
      job: currentJob,
      elapsed: Date.now() - startedAt,
    });
  }, [finalizeAsyncImageJob, onStateChange, runtimeClient.media.jobs]);

  const handleRun = React.useCallback(async () => {
    const requestContext = buildRequestContext();
    if (requestContext.error) {
      onStateChange((prev) => ({ ...prev, error: requestContext.error }));
      return;
    }
    if (!requestContext.requestParams) {
      onStateChange((prev) => ({ ...prev, error: 'Image request is empty.' }));
      return;
    }
    onStateChange((prev) => ({ ...prev, busy: true, error: '', diagnostics: makeEmptyDiagnostics() }));
    const t0 = Date.now();
    const binding = requestContext.binding;
    const requestParams = requestContext.requestParams;
    let resolved: ModRuntimeResolvedBinding | undefined;
    try {
      resolved = await runtimeClient.route.resolve({ capability: 'image.generate', binding });
      if (mode === 'job') {
        const job = await runtimeClient.media.jobs.submit({
          modal: 'image',
          input: requestParams,
        });
        await watchAsyncImageJob({
          jobId: asString((job as unknown as Record<string, unknown>)?.jobId),
          requestParams,
          resolved: resolved ?? null,
          initialJob: job as unknown as Record<string, unknown>,
        });
        return;
      }
      const result = await runtimeClient.media.image.generate(requestParams);
      const elapsed = Date.now() - t0;
      const uris = result.artifacts
        .map((artifact) => toArtifactPreviewUri({
          uri: artifact.uri,
          bytes: artifact.bytes,
          mimeType: artifact.mimeType,
          defaultMimeType: 'image/png',
        }))
        .filter(Boolean);

      onStateChange((prev) => ({
        ...prev,
        busy: false,
        result: 'passed',
        output: uris,
        rawResponse: toPrettyJson({ request: requestParams, resolved, response: stripArtifacts(result), previewUris: uris }),
        diagnostics: {
          requestParams,
          resolvedRoute: resolved ?? null,
          responseMetadata: {
            jobId: (result.job as unknown as Record<string, unknown>)?.jobId as string | undefined,
            artifactCount: result.artifacts.length,
            traceId: result.trace?.traceId,
            modelResolved: result.trace?.modelResolved,
            elapsed,
          },
        },
      }));
    } catch (error) {
      const elapsed = Date.now() - t0;
      const message = error instanceof Error ? error.message : String(error || (mode === 'job' ? 'Image job submit failed.' : 'Image generate failed.'));
      onStateChange((prev) => ({
        ...prev,
        busy: false,
        result: 'failed',
        error: message,
        output: [],
        rawResponse: toPrettyJson({ request: requestParams, resolved, error: message }),
        diagnostics: { requestParams, resolvedRoute: resolved ?? null, responseMetadata: { elapsed } },
      }));
    }
  }, [
    buildRequestContext,
    mode,
    runtimeClient,
    onStateChange,
    watchAsyncImageJob,
  ]);

  const handleWatchExistingJob = React.useCallback(async () => {
    const targetJobId = asString(watchJobId);
    if (!targetJobId) {
      onStateChange((prev) => ({ ...prev, error: 'Job ID is empty.' }));
      return;
    }
    try {
      await watchAsyncImageJob({
        jobId: targetJobId,
        requestParams: { jobId: targetJobId, mode: 'attach' },
        resolved: null,
      });
    } catch (error) {
      onStateChange((prev) => ({
        ...prev,
        busy: false,
        busyLabel: '',
        result: 'failed',
        error: error instanceof Error ? error.message : String(error || 'Failed to watch job.'),
      }));
    }
  }, [onStateChange, watchAsyncImageJob, watchJobId]);

  const handleCancelJob = React.useCallback(async () => {
    const targetJobId = asString(watchJobId);
    if (!targetJobId) {
      onStateChange((prev) => ({ ...prev, error: 'Job ID is empty.' }));
      return;
    }
    try {
      const canceled = await runtimeClient.media.jobs.cancel({
        jobId: targetJobId,
        reason: 'test-ai user canceled image job',
      });
      setJobTimeline((prev) => [
        ...prev,
        {
          sequence: prev.length + 1,
          label: 'canceled',
          status: scenarioJobStatusLabel((canceled as unknown as Record<string, unknown>)?.status),
          reasonDetail: asString((canceled as unknown as Record<string, unknown>)?.reasonDetail) || undefined,
        },
      ]);
    } catch (error) {
      onStateChange((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : String(error || 'Failed to cancel job.'),
      }));
    }
  }, [onStateChange, runtimeClient.media.jobs, watchJobId]);

  const imageUris = (state.output as string[] | null) || [];
  const companionPresetArtifacts = React.useMemo(() => (
    Object.fromEntries(
      IMAGE_WORKFLOW_PRESET_SELECTIONS.map((preset) => [
        preset.key,
        artifactsForPresetKind(artifacts, preset.kind),
      ]),
    ) as Record<ImageWorkflowPresetSelectionKey, ModRuntimeLocalArtifactRecord[]>
  ), [artifacts]);
  const hasKnownCompanionArtifacts = React.useMemo(
    () => IMAGE_WORKFLOW_PRESET_SELECTIONS.some((preset) => companionPresetArtifacts[preset.key].length > 0),
    [companionPresetArtifacts],
  );
  const coreCompanionPresets = React.useMemo(
    () => IMAGE_WORKFLOW_PRESET_SELECTIONS.filter((preset) => preset.tier === 'core'),
    [],
  );
  const extendedCompanionPresets = React.useMemo(
    () => IMAGE_WORKFLOW_PRESET_SELECTIONS.filter((preset) => preset.tier === 'extended'),
    [],
  );

  return (
    <div className="flex flex-col gap-3">
      <RouteBindingEditor
        capabilityId="image.generate"
        snapshot={state.snapshot}
        binding={state.binding}
        loading={state.routeLoading}
        error={state.routeError}
        onReload={onRouteReload}
        onBindingChange={onBindingChange}
      />
      <textarea
        className="h-20 w-full resize-y rounded-lg border border-gray-300 bg-white p-2 font-mono text-xs"
        value={draft.prompt}
        onChange={(event) => updateDraft({ prompt: event.target.value })}
        placeholder="Prompt"
      />
      <textarea
        className="h-14 w-full resize-y rounded-lg border border-gray-300 bg-white p-2 font-mono text-xs"
        value={draft.negativePrompt}
        onChange={(event) => updateDraft({ negativePrompt: event.target.value })}
        placeholder="Negative prompt (optional)"
      />
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-gray-500">Size</span>
          <input
            className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs"
            value={draft.size}
            onChange={(event) => updateDraft({ size: event.target.value })}
            placeholder="1024x1024"
            list="test-ai-image-size-options"
          />
          <datalist id="test-ai-image-size-options">
            <option value="512x512" /><option value="768x768" /><option value="1024x1024" /><option value="1024x576" /><option value="576x1024" />
          </datalist>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-gray-500">Count (n)</span>
          <input
            type="number" min="1" max="4"
            className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs"
            value={draft.n}
            onChange={(event) => updateDraft({ n: event.target.value })}
          />
        </label>
      </div>
      {isLocalAIImageWorkflow ? (
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="mb-2">
            <div className="text-xs font-semibold text-gray-700">Companion models</div>
            <div className="text-[11px] text-gray-500">
              Test-AI exposes the full LocalAI companion surface in layers. Start with the core presets, then add extended companions when your model family needs them.
            </div>
          </div>
          {artifactLoading ? (
            <div className="rounded-md bg-blue-50 p-2 text-[11px] text-blue-700">
              Loading installed local artifacts...
            </div>
          ) : null}
          {artifactError ? (
            <div className="rounded-md bg-red-50 p-2 text-[11px] text-red-700">{artifactError}</div>
          ) : null}
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <div className="mb-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">Layer 1: Core companions</div>
              <div className="text-[11px] text-gray-500">
                Common LocalAI image workflows often start here.
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {coreCompanionPresets.map((preset) => (
                <label key={preset.key} className="flex flex-col gap-1 text-xs">
                  <span className="text-gray-500">{preset.label}</span>
                  <select
                    className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs"
                    value={draft[preset.key]}
                    onChange={(event) => updateDraft({ [preset.key]: event.target.value } as Partial<ImageWorkflowDraftState>)}
                    disabled={artifactLoading || companionPresetArtifacts[preset.key].length === 0}
                  >
                    <option value="">-- optional --</option>
                    {companionPresetArtifacts[preset.key].map((artifact) => (
                      <option key={artifact.localArtifactId} value={artifact.localArtifactId}>
                        {artifactDisplayLabel(artifact)}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>
          <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
            <div className="mb-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">Layer 2: Extended companions</div>
              <div className="text-[11px] text-gray-500">
                Use these when the selected LocalAI image workflow depends on CLIP, ControlNet, LoRA, or auxiliary assets.
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
              {extendedCompanionPresets.map((preset) => (
                <label key={preset.key} className="flex flex-col gap-1 text-xs">
                  <span className="text-gray-500">{preset.label}</span>
                  <select
                    className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs"
                    value={draft[preset.key]}
                    onChange={(event) => updateDraft({ [preset.key]: event.target.value } as Partial<ImageWorkflowDraftState>)}
                    disabled={artifactLoading || companionPresetArtifacts[preset.key].length === 0}
                  >
                    <option value="">-- optional --</option>
                    {companionPresetArtifacts[preset.key].map((artifact) => (
                      <option key={artifact.localArtifactId} value={artifact.localArtifactId}>
                        {artifactDisplayLabel(artifact)}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>
          {!artifactLoading && !artifactError && !hasKnownCompanionArtifacts ? (
            <div className="mt-2 rounded-md bg-amber-50 p-2 text-[11px] text-amber-700">
              No known LocalAI companion artifacts are installed for this runtime yet. Import VAE, LLM, CLIP, ControlNet, LoRA, or auxiliary assets in desktop model center first.
            </div>
          ) : null}
        </div>
      ) : null}
      <details className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs">
        <summary className="cursor-pointer font-semibold text-gray-600">Advanced options</summary>
        <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
          <label className="flex max-w-xs flex-col gap-1 text-xs">
            <span className="text-gray-500">Response format</span>
            <select
              className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs"
              value={draft.responseFormatMode}
              onChange={(event) => updateDraft({ responseFormatMode: event.target.value as ImageResponseFormatMode })}
            >
              <option value="auto">auto</option>
              <option value="base64">base64</option>
              <option value="url">url</option>
            </select>
            <span className="text-[11px] text-gray-400">
              Auto leaves the response format unset so the runtime/provider can pick the native path.
            </span>
          </label>
          <label className="flex max-w-xs flex-col gap-1 text-xs">
            <span className="text-gray-500">Seed</span>
            <input
              className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs"
              value={draft.seed}
              onChange={(event) => updateDraft({ seed: event.target.value })}
              placeholder="optional"
            />
            <span className="text-[11px] text-gray-400">
              Seed stays on the standard image request. Workflow profile overrides stay in the LocalAI extension payload.
            </span>
          </label>
          <label className="flex max-w-xs flex-col gap-1 text-xs">
            <span className="text-gray-500">Timeout (ms)</span>
            <input
              className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs"
              value={draft.timeoutMs}
              onChange={(event) => updateDraft({ timeoutMs: event.target.value })}
              placeholder="600000"
            />
            <span className="text-[11px] text-gray-400">
              Default is 10 minutes. For heavier local jobs, increase it manually or switch to `Image Create Job`.
            </span>
          </label>
        </div>
        {isLocalAIImageWorkflow ? (
          <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="font-semibold text-gray-700">Local workflow</div>
                <div className="text-[11px] text-gray-500">
                  Layer 3 is the fully open test surface. Use it for non-standard slot names or to exercise workflow shapes beyond the preset companion layers above.
                </div>
              </div>
              <button
                type="button"
                className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs"
                onClick={handleAddComponent}
              >
                Add component
              </button>
            </div>
            <datalist id="test-ai-image-workflow-slots">
              {COMMON_IMAGE_WORKFLOW_SLOTS.map((slot) => (
                <option key={slot} value={slot} />
              ))}
            </datalist>
            {artifactLoading ? (
              <div className="mt-2 rounded-md bg-blue-50 p-2 text-[11px] text-blue-700">
                Loading installed local artifacts...
              </div>
            ) : null}
            {artifactError ? (
              <div className="mt-2 rounded-md bg-red-50 p-2 text-[11px] text-red-700">{artifactError}</div>
            ) : null}
            {!artifactLoading && !artifactError && artifacts.length === 0 ? (
              <div className="mt-2 rounded-md bg-amber-50 p-2 text-[11px] text-amber-700">
                No companion artifacts are installed for the selected local runtime yet. Download/import VAE or LLM assets in desktop first, then select them here.
              </div>
            ) : null}
            <div className="mt-3 flex flex-col gap-2">
              {draft.componentDrafts.length === 0 ? (
                <div className="rounded-md bg-gray-50 p-2 text-[11px] text-gray-500">
                  No extra workflow components configured.
                </div>
              ) : null}
              {draft.componentDrafts.map((component) => {
                const selectedArtifact = artifacts.find((artifact) => artifact.localArtifactId === component.localArtifactId) || null;
                const artifactChoices = (() => {
                  const choices = artifactsForWorkflowSlot(artifacts, component.slot);
                  if (selectedArtifact && !choices.some((artifact) => artifact.localArtifactId === selectedArtifact.localArtifactId)) {
                    return [selectedArtifact, ...choices];
                  }
                  return choices;
                })();
                return (
                  <div key={component.id} className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                    <label className="flex flex-col gap-1 text-xs">
                      <span className="text-gray-500">Slot</span>
                      <input
                        className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs"
                        value={component.slot}
                        onChange={(event) => handleComponentChange(component.id, 'slot', event.target.value)}
                        list="test-ai-image-workflow-slots"
                        placeholder="vae_path / llm_path / ..."
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-xs">
                      <span className="text-gray-500">Artifact</span>
                      <select
                        className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs"
                        value={component.localArtifactId}
                        onChange={(event) => handleComponentChange(component.id, 'localArtifactId', event.target.value)}
                        disabled={artifactLoading || artifactChoices.length === 0}
                      >
                        <option value="">-- optional --</option>
                        {artifactChoices.map((artifact) => (
                          <option key={artifact.localArtifactId} value={artifact.localArtifactId}>
                            {artifactDisplayLabel(artifact)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="flex items-end">
                      <button
                        type="button"
                        className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs"
                        onClick={() => handleRemoveComponent(component.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-gray-500">Steps</span>
                <input
                  className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs"
                  value={draft.step}
                  onChange={(event) => updateDraft({ step: event.target.value })}
                  placeholder="25"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-gray-500">CFG scale</span>
                <input
                  className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs"
                  value={draft.cfgScale}
                  onChange={(event) => updateDraft({ cfgScale: event.target.value })}
                  placeholder="optional"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-gray-500">Sampler</span>
                <input
                  className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs"
                  value={draft.sampler}
                  onChange={(event) => updateDraft({ sampler: event.target.value })}
                  placeholder="euler / dpmpp2m / ..."
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-gray-500">Scheduler</span>
                <input
                  className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs"
                  value={draft.scheduler}
                  onChange={(event) => updateDraft({ scheduler: event.target.value })}
                  placeholder="optional"
                />
              </label>
            </div>
            <label className="mt-3 flex flex-col gap-1 text-xs">
              <span className="text-gray-500">Options (one per line)</span>
              <textarea
                className="h-20 resize-y rounded-md border border-gray-300 bg-white p-2 font-mono text-xs"
                value={draft.optionsText}
                onChange={(event) => updateDraft({ optionsText: event.target.value })}
                placeholder={'diffusion_model\noffload_params_to_cpu:true'}
              />
            </label>
            <label className="mt-3 flex flex-col gap-1 text-xs">
              <span className="text-gray-500">Raw profile_overrides JSON</span>
              <textarea
                className="h-24 resize-y rounded-md border border-gray-300 bg-white p-2 font-mono text-xs"
                value={draft.rawProfileOverridesText}
                onChange={(event) => updateDraft({ rawProfileOverridesText: event.target.value })}
                placeholder={'{"clip_skip": 2}'}
              />
              <span className="text-[11px] text-gray-400">
                Runtime rejects path overrides like `*_path` and `parameters.model`; choose those via the component rows above instead.
              </span>
            </label>
          </div>
        ) : (
          <div className="mt-3 rounded-md bg-blue-50 p-2 text-[11px] text-blue-700">
            Local workflow controls apply only when the route source is `local`. When using `cloud`, the request only sends the standard image fields.
          </div>
        )}
      </details>
      {mode === 'job' ? (
        <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-3">
          <div className="text-xs font-semibold text-gray-700">Async image job</div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto]">
            <input
              className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs"
              value={watchJobId}
              onChange={(event) => setWatchJobId(event.target.value)}
              placeholder="job id"
            />
            <button
              type="button"
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs"
              disabled={state.busy}
              onClick={() => { void handleWatchExistingJob(); }}
            >
              Watch Job
            </button>
            <button
              type="button"
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs"
              disabled={!asString(watchJobId)}
              onClick={() => { void handleCancelJob(); }}
            >
              Cancel Job
            </button>
          </div>
          <RunButton busy={state.busy} busyLabel={state.busyLabel} label="Submit Image Job" onClick={() => { void handleRun(); }} />
          {jobTimeline.length > 0 ? (
            <div className="rounded-md bg-gray-50 p-2 text-xs">
              <div className="mb-1 font-semibold text-gray-600">Job timeline</div>
              <div className="flex flex-col gap-1">
                {jobTimeline.map((event, index) => (
                  <div key={`${String(event.sequence || index)}`} className="grid grid-cols-[80px_1fr] gap-x-2">
                    <span className="font-mono text-gray-400">{String(event.sequence || index + 1)}</span>
                    <span className="text-gray-700">
                      {String(event.label || 'event')} · {String(event.status || 'unknown')}
                      {event.reasonDetail ? ` · ${String(event.reasonDetail)}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <RunButton busy={state.busy} busyLabel={state.busyLabel} label="Run Image Generate" onClick={() => { void handleRun(); }} />
      )}
      {state.error ? <ErrorBox message={state.error} /> : null}
      {imageUris.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {imageUris.map((uri) => (
            <img key={uri} alt="Generated" src={uri} className="rounded-lg border border-gray-200" />
          ))}
        </div>
      ) : null}
      <DiagnosticsPanel diagnostics={state.diagnostics} />
      {state.rawResponse ? <RawJsonSection content={state.rawResponse} /> : null}
    </div>
  );
}

// ── Panel: video.generate ─────────────────────────────────────────────────────

type VideoMode = 't2v' | 'i2v-first-frame' | 'i2v-reference';

type VideoGeneratePanelProps = {
  state: CapabilityState;
  runtimeClient: ModRuntimeClient;
  onStateChange: (updater: (prev: CapabilityState) => CapabilityState) => void;
  onRouteReload: () => void;
};

function VideoGeneratePanel(props: VideoGeneratePanelProps) {
  const { state, runtimeClient, onStateChange, onRouteReload } = props;
  const [mode, setMode] = React.useState<VideoMode>('t2v');
  const [prompt, setPrompt] = React.useState('A cat in an astronaut suit floating in space, cinematic');
  const [refImageUri, setRefImageUri] = React.useState('');

  const isI2v = mode !== 't2v';

  const handleRun = React.useCallback(async () => {
    if (!asString(prompt)) {
      onStateChange((prev) => ({ ...prev, error: 'Prompt is empty.' }));
      return;
    }
    if (isI2v && !asString(refImageUri)) {
      onStateChange((prev) => ({ ...prev, error: 'Reference image URL required for i2v mode.' }));
      return;
    }
    onStateChange((prev) => ({ ...prev, busy: true, error: '', diagnostics: makeEmptyDiagnostics() }));
    const t0 = Date.now();
    const binding = resolveEffectiveBinding(state.snapshot, state.binding) || undefined;
    const contentItems: Array<{ type: 'text'; role: 'prompt'; text: string } | { type: 'image_url'; role: 'reference_image' | 'first_frame'; imageUrl: string }> = [
      { type: 'text', role: 'prompt', text: prompt },
    ];
    if (isI2v && asString(refImageUri)) {
      const role = mode === 'i2v-first-frame' ? 'first_frame' : 'reference_image';
      contentItems.push({ type: 'image_url', role, imageUrl: refImageUri });
    }
    const requestParams: Record<string, unknown> = {
      mode, prompt,
      ...(refImageUri ? { refImageUri } : {}),
      content: contentItems,
      ...(binding ? { binding } : {}),
    };
    let resolved: ModRuntimeResolvedBinding | undefined;
    try {
      resolved = await runtimeClient.route.resolve({ capability: 'video.generate' as RuntimeCanonicalCapability, binding });
      const result = await runtimeClient.media.video.generate({ mode, content: contentItems, prompt, binding });
      const elapsed = Date.now() - t0;

      onStateChange((prev) => ({
        ...prev,
        busy: false,
        result: 'passed',
        output: result,
        rawResponse: toPrettyJson({ request: requestParams, resolved, response: stripArtifacts(result) }),
        diagnostics: {
          requestParams,
          resolvedRoute: resolved ?? null,
          responseMetadata: {
            jobId: (result.job as unknown as Record<string, unknown>)?.jobId as string | undefined,
            artifactCount: result.artifacts?.length,
            traceId: result.trace?.traceId,
            modelResolved: result.trace?.modelResolved,
            elapsed,
          },
        },
      }));
    } catch (error) {
      const elapsed = Date.now() - t0;
      const message = error instanceof Error ? error.message : String(error || 'Video generate failed.');
      onStateChange((prev) => ({
        ...prev,
        busy: false,
        result: 'failed',
        error: message,
        rawResponse: toPrettyJson({ request: requestParams, resolved, error: message }),
        diagnostics: { requestParams, resolvedRoute: resolved ?? null, responseMetadata: { elapsed } },
      }));
    }
  }, [mode, prompt, refImageUri, isI2v, state.snapshot, state.binding, runtimeClient, onStateChange]);

  return (
    <div className="flex flex-col gap-3">
      <RouteBindingEditor
        capabilityId="video.generate"
        snapshot={state.snapshot}
        binding={state.binding}
        loading={state.routeLoading}
        error={state.routeError}
        onReload={onRouteReload}
        onBindingChange={(binding) => onStateChange((prev) => ({ ...prev, binding }))}
      />
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-gray-500">Mode</span>
        <select
          className="rounded-md border border-gray-300 bg-white px-2 py-1"
          value={mode}
          onChange={(event) => setMode(event.target.value as VideoMode)}
        >
          <option value="t2v">Text-to-Video (t2v)</option>
          <option value="i2v-first-frame">Image-to-Video first frame (i2v-first-frame)</option>
          <option value="i2v-reference">Image-to-Video reference (i2v-reference)</option>
        </select>
      </label>
      <textarea
        className="h-20 w-full resize-y rounded-lg border border-gray-300 bg-white p-2 font-mono text-xs"
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder="Prompt"
      />
      {isI2v ? (
        <input
          className="w-full rounded-lg border border-gray-300 bg-white p-2 font-mono text-xs"
          value={refImageUri}
          onChange={(event) => setRefImageUri(event.target.value)}
          placeholder="Reference image URL"
        />
      ) : null}
      <RunButton busy={state.busy} label="Run Video Generate" onClick={() => { void handleRun(); }} />
      {state.error ? <ErrorBox message={state.error} /> : null}
      <DiagnosticsPanel diagnostics={state.diagnostics} />
      {state.rawResponse ? <RawJsonSection content={state.rawResponse} /> : null}
    </div>
  );
}

// ── Panel: audio.synthesize ───────────────────────────────────────────────────

type AudioSynthesizePanelProps = {
  state: CapabilityState;
  runtimeClient: ModRuntimeClient;
  onStateChange: (updater: (prev: CapabilityState) => CapabilityState) => void;
  onRouteReload: () => void;
};

function AudioSynthesizePanel(props: AudioSynthesizePanelProps) {
  const { state, runtimeClient, onStateChange, onRouteReload } = props;
  const [text, setText] = React.useState('这是一个 TTS 链路测试。');
  const [voices, setVoices] = React.useState<VoiceOption[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = React.useState('');
  const [manualVoiceId, setManualVoiceId] = React.useState('');
  const [audioFormat, setAudioFormat] = React.useState('mp3');

  React.useEffect(() => {
    const effectiveBinding = resolveEffectiveBinding(state.snapshot, state.binding);
    if (!effectiveBinding) { setVoices([]); setSelectedVoiceId(''); return; }
    let cancelled = false;
    void (async () => {
      try {
        const result = await runtimeClient.media.tts.listVoices({ binding: effectiveBinding });
        if (cancelled) return;
        setVoices(result.voices);
        setSelectedVoiceId((prev) => {
          if (prev && result.voices.some((v) => v.voiceId === prev)) return prev;
          return result.voices[0]?.voiceId || '';
        });
      } catch {
        if (cancelled) return;
        setVoices([]);
        setSelectedVoiceId('');
      }
    })();
    return () => { cancelled = true; };
  }, [runtimeClient, state.snapshot, state.binding]);

  const handleRun = React.useCallback(async () => {
    if (!asString(text)) {
      onStateChange((prev) => ({ ...prev, error: 'Input text is empty.' }));
      return;
    }
    const voice = asString(manualVoiceId) || asString(selectedVoiceId);
    if (!voice) {
      onStateChange((prev) => ({ ...prev, error: 'No voice selected.' }));
      return;
    }
    onStateChange((prev) => ({ ...prev, busy: true, error: '', diagnostics: makeEmptyDiagnostics() }));
    const t0 = Date.now();
    const binding = resolveEffectiveBinding(state.snapshot, state.binding) || undefined;
    const requestParams: Record<string, unknown> = { text, voice, audioFormat, ...(binding ? { binding } : {}) };
    let resolved: ModRuntimeResolvedBinding | undefined;
    try {
      resolved = await runtimeClient.route.resolve({ capability: 'audio.synthesize', binding });
      const result = await runtimeClient.media.tts.synthesize({ text, voice, audioFormat, binding });
      const elapsed = Date.now() - t0;
      const artifact = result.artifacts[0];
      const audioUri = toArtifactPreviewUri({ uri: artifact?.uri, bytes: artifact?.bytes, mimeType: artifact?.mimeType });

      onStateChange((prev) => ({
        ...prev,
        busy: false,
        result: 'passed',
        output: { audioUri, mimeType: asString(artifact?.mimeType), durationMs: Number(artifact?.durationMs || 0) },
        rawResponse: toPrettyJson({ request: requestParams, resolved, response: stripArtifacts(result) }),
        diagnostics: {
          requestParams,
          resolvedRoute: resolved ?? null,
          responseMetadata: {
            jobId: (result.job as unknown as Record<string, unknown>)?.jobId as string | undefined,
            artifactCount: result.artifacts.length,
            traceId: result.trace?.traceId,
            modelResolved: result.trace?.modelResolved,
            elapsed,
          },
        },
      }));
    } catch (error) {
      const elapsed = Date.now() - t0;
      const message = error instanceof Error ? error.message : String(error || 'TTS synthesize failed.');
      onStateChange((prev) => ({
        ...prev,
        busy: false,
        result: 'failed',
        error: message,
        rawResponse: toPrettyJson({ request: requestParams, resolved, error: message }),
        diagnostics: { requestParams, resolvedRoute: resolved ?? null, responseMetadata: { elapsed } },
      }));
    }
  }, [text, manualVoiceId, selectedVoiceId, audioFormat, state.snapshot, state.binding, runtimeClient, onStateChange]);

  const audioOutput = state.output as { audioUri?: string; mimeType?: string; durationMs?: number } | null;

  return (
    <div className="flex flex-col gap-3">
      <RouteBindingEditor
        capabilityId="audio.synthesize"
        snapshot={state.snapshot}
        binding={state.binding}
        loading={state.routeLoading}
        error={state.routeError}
        onReload={onRouteReload}
        onBindingChange={(binding) => onStateChange((prev) => ({ ...prev, binding }))}
      />
      <textarea
        className="h-20 w-full resize-y rounded-lg border border-gray-300 bg-white p-2 font-mono text-xs"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Text to synthesize"
      />
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-gray-500">Preset Voice</span>
          <select
            className="rounded-md border border-gray-300 bg-white px-2 py-1"
            value={selectedVoiceId}
            onChange={(event) => setSelectedVoiceId(event.target.value)}
          >
            <option value="">--</option>
            {voices.map((voice) => (
              <option key={voice.voiceId} value={voice.voiceId}>
                {voice.name} [{voice.lang}]
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-gray-500">Audio Format</span>
          <select
            className="rounded-md border border-gray-300 bg-white px-2 py-1"
            value={audioFormat}
            onChange={(event) => setAudioFormat(event.target.value)}
          >
            <option value="mp3">mp3</option>
            <option value="wav">wav</option>
            <option value="ogg">ogg</option>
            <option value="pcm">pcm</option>
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-gray-500">Manual Voice Override</span>
        <input
          className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs"
          value={manualVoiceId}
          onChange={(event) => setManualVoiceId(event.target.value)}
          placeholder="voice id (overrides preset)"
        />
      </label>
      <RunButton busy={state.busy} label="Run Audio Synthesize" onClick={() => { void handleRun(); }} />
      {state.error ? <ErrorBox message={state.error} /> : null}
      {audioOutput?.audioUri ? (
        <div>
          <audio controls className="w-full" src={audioOutput.audioUri} />
          <div className="mt-1 text-xs text-gray-500">
            {audioOutput.mimeType || 'audio'} · {audioOutput.durationMs ? `${audioOutput.durationMs}ms` : 'duration unknown'}
          </div>
        </div>
      ) : null}
      <DiagnosticsPanel diagnostics={state.diagnostics} />
      {state.rawResponse ? <RawJsonSection content={state.rawResponse} /> : null}
    </div>
  );
}

// ── Panel: audio.transcribe ───────────────────────────────────────────────────

type AudioTranscribePanelProps = {
  state: CapabilityState;
  runtimeClient: ModRuntimeClient;
  onStateChange: (updater: (prev: CapabilityState) => CapabilityState) => void;
  onRouteReload: () => void;
};

function AudioTranscribePanel(props: AudioTranscribePanelProps) {
  const { state, runtimeClient, onStateChange, onRouteReload } = props;
  const [audioUri, setAudioUri] = React.useState('');
  const [language, setLanguage] = React.useState('');
  const [mimeType, setMimeType] = React.useState('');

  const handleRun = React.useCallback(async () => {
    if (!asString(audioUri)) {
      onStateChange((prev) => ({ ...prev, error: 'Audio URL is empty.' }));
      return;
    }
    onStateChange((prev) => ({ ...prev, busy: true, error: '', diagnostics: makeEmptyDiagnostics() }));
    const t0 = Date.now();
    const binding = resolveEffectiveBinding(state.snapshot, state.binding) || undefined;
    const requestParams: Record<string, unknown> = {
      audio: { kind: 'url', url: audioUri },
      ...(language ? { language } : {}),
      ...(mimeType ? { mimeType } : {}),
      ...(binding ? { binding } : {}),
    };
    let resolved: ModRuntimeResolvedBinding | undefined;
    try {
      resolved = await runtimeClient.route.resolve({ capability: 'audio.transcribe' as RuntimeCanonicalCapability, binding });
      const result = await runtimeClient.media.stt.transcribe({
        audio: { kind: 'url', url: audioUri },
        ...(language ? { language } : {}),
        ...(mimeType ? { mimeType } : {}),
        binding,
      });
      const elapsed = Date.now() - t0;

      onStateChange((prev) => ({
        ...prev,
        busy: false,
        result: 'passed',
        output: result.text || '(no transcription)',
        rawResponse: toPrettyJson({ request: requestParams, resolved, response: result }),
        diagnostics: {
          requestParams,
          resolvedRoute: resolved ?? null,
          responseMetadata: {
            jobId: (result.job as unknown as Record<string, unknown>)?.jobId as string | undefined,
            traceId: result.trace?.traceId,
            modelResolved: result.trace?.modelResolved,
            elapsed,
          },
        },
      }));
    } catch (error) {
      const elapsed = Date.now() - t0;
      const message = error instanceof Error ? error.message : String(error || 'STT transcribe failed.');
      onStateChange((prev) => ({
        ...prev,
        busy: false,
        result: 'failed',
        error: message,
        rawResponse: toPrettyJson({ request: requestParams, resolved, error: message }),
        diagnostics: { requestParams, resolvedRoute: resolved ?? null, responseMetadata: { elapsed } },
      }));
    }
  }, [audioUri, language, mimeType, state.snapshot, state.binding, runtimeClient, onStateChange]);

  return (
    <div className="flex flex-col gap-3">
      <RouteBindingEditor
        capabilityId="audio.transcribe"
        snapshot={state.snapshot}
        binding={state.binding}
        loading={state.routeLoading}
        error={state.routeError}
        onReload={onRouteReload}
        onBindingChange={(binding) => onStateChange((prev) => ({ ...prev, binding }))}
      />
      <input
        className="w-full rounded-lg border border-gray-300 bg-white p-2 font-mono text-xs"
        value={audioUri}
        onChange={(event) => setAudioUri(event.target.value)}
        placeholder="Audio URL (https://... or data:...)"
      />
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-gray-500">Language (optional)</span>
          <input
            className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs"
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            placeholder="zh / en / ja …"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-gray-500">MIME Type (optional)</span>
          <input
            className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs"
            value={mimeType}
            onChange={(event) => setMimeType(event.target.value)}
            placeholder="audio/mp3 …"
          />
        </label>
      </div>
      <RunButton busy={state.busy} label="Run Audio Transcribe" onClick={() => { void handleRun(); }} />
      {state.error ? <ErrorBox message={state.error} /> : null}
      {state.output ? (
        <pre className="max-h-48 overflow-auto rounded-md bg-gray-50 p-2 text-xs">{asString(state.output)}</pre>
      ) : null}
      <DiagnosticsPanel diagnostics={state.diagnostics} />
      {state.rawResponse ? <RawJsonSection content={state.rawResponse} /> : null}
    </div>
  );
}

// ── Panel: voice.clone ────────────────────────────────────────────────────────

type VoiceClonePanelProps = {
  state: CapabilityState;
  onStateChange: (updater: (prev: CapabilityState) => CapabilityState) => void;
};

function VoiceClonePanel(props: VoiceClonePanelProps) {
  const { state, onStateChange } = props;
  const [refAudioUri, setRefAudioUri] = React.useState('');
  const [targetModel, setTargetModel] = React.useState('');

  const handleRun = React.useCallback(() => {
    const requestParams: Record<string, unknown> = { refAudioUri, targetModel };
    onStateChange((prev) => ({
      ...prev,
      result: 'failed',
      error: 'voice.clone is not yet available in the current SDK surface.',
      rawResponse: toPrettyJson({ error: 'SDK method not available', capability: 'runtime.media.voice.clone', requestParams }),
      diagnostics: { requestParams, resolvedRoute: null, responseMetadata: null },
    }));
  }, [refAudioUri, targetModel, onStateChange]);

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
        voice.clone SDK surface is not yet implemented. This panel captures the expected input shape for future integration.
      </div>
      <input
        className="w-full rounded-lg border border-gray-300 bg-white p-2 font-mono text-xs"
        value={refAudioUri}
        onChange={(event) => setRefAudioUri(event.target.value)}
        placeholder="Reference audio URL"
      />
      <input
        className="w-full rounded-lg border border-gray-300 bg-white p-2 font-mono text-xs"
        value={targetModel}
        onChange={(event) => setTargetModel(event.target.value)}
        placeholder="Target model (optional)"
      />
      <RunButton busy={state.busy} label="Run Voice Clone" onClick={() => { void handleRun(); }} />
      {state.error ? <ErrorBox message={state.error} /> : null}
      {state.rawResponse ? <RawJsonSection content={state.rawResponse} /> : null}
    </div>
  );
}

// ── Panel: voice.design ───────────────────────────────────────────────────────

type VoiceDesignPanelProps = {
  state: CapabilityState;
  onStateChange: (updater: (prev: CapabilityState) => CapabilityState) => void;
};

function VoiceDesignPanel(props: VoiceDesignPanelProps) {
  const { state, onStateChange } = props;
  const [instruction, setInstruction] = React.useState('');

  const handleRun = React.useCallback(() => {
    const requestParams: Record<string, unknown> = { instruction };
    onStateChange((prev) => ({
      ...prev,
      result: 'failed',
      error: 'voice.design is not yet available in the current SDK surface.',
      rawResponse: toPrettyJson({ error: 'SDK method not available', capability: 'runtime.media.voice.design', requestParams }),
      diagnostics: { requestParams, resolvedRoute: null, responseMetadata: null },
    }));
  }, [instruction, onStateChange]);

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
        voice.design SDK surface is not yet implemented. This panel captures the expected input shape for future integration.
      </div>
      <textarea
        className="h-20 w-full resize-y rounded-lg border border-gray-300 bg-white p-2 font-mono text-xs"
        value={instruction}
        onChange={(event) => setInstruction(event.target.value)}
        placeholder="Voice design instruction (e.g. 'A calm, deep male voice with a slight British accent')"
      />
      <RunButton busy={state.busy} label="Run Voice Design" onClick={() => { void handleRun(); }} />
      {state.error ? <ErrorBox message={state.error} /> : null}
      {state.rawResponse ? <RawJsonSection content={state.rawResponse} /> : null}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function TestAiPage() {
  const runtimeClient = React.useMemo(() => getTestAiRuntimeClient(), []);
  const [activeCapability, setActiveCapability] = React.useState<CapabilityId>('text.generate');
  const [states, setStates] = React.useState<CapabilityStates>(makeInitialCapabilityStates);
  const [imageDraft, setImageDraft] = React.useState<ImageWorkflowDraftState>(createInitialImageWorkflowDraftState);

  const updateCapabilityState = React.useCallback(
    (capabilityId: CapabilityId, updater: (prev: CapabilityState) => CapabilityState) => {
      setStates((prev) => ({ ...prev, [capabilityId]: updater(prev[capabilityId]) }));
    },
    [],
  );

  const updateSharedImageBinding = React.useCallback((binding: RuntimeRouteBinding | null) => {
    setStates((prev) => ({
      ...prev,
      'image.generate': { ...prev['image.generate'], binding },
      'image.create-job': { ...prev['image.create-job'], binding },
    }));
  }, []);

  const reloadRouteFor = React.useCallback(
    (capabilityId: CapabilityId) => {
      void loadRouteSnapshot({ runtimeClient, capabilityId, setStates });
    },
    [runtimeClient],
  );

  React.useEffect(() => {
    const loadedCapabilities = new Set<RuntimeCanonicalCapability>();
    for (const cap of CAPABILITIES) {
      if (!cap.hasRoute || !cap.routeCapability || loadedCapabilities.has(cap.routeCapability)) {
        continue;
      }
      loadedCapabilities.add(cap.routeCapability);
      void loadRouteSnapshot({ runtimeClient, capabilityId: cap.id, setStates });
    }
  }, [runtimeClient]);

  const activeState = states[activeCapability];
  const activeMeta = CAPABILITIES.find((c) => c.id === activeCapability)!;

  function renderPanel() {
    switch (activeCapability) {
      case 'text.generate':
        return (
          <TextGeneratePanel
            state={activeState}
            runtimeClient={runtimeClient}
            onStateChange={(updater) => updateCapabilityState('text.generate', updater)}
            onRouteReload={() => reloadRouteFor('text.generate')}
          />
        );
      case 'text.embed':
        return (
          <TextEmbedPanel
            state={activeState}
            runtimeClient={runtimeClient}
            onStateChange={(updater) => updateCapabilityState('text.embed', updater)}
            onRouteReload={() => reloadRouteFor('text.embed')}
          />
        );
      case 'image.generate':
        return (
          <ImageGeneratePanel
            mode="generate"
            state={activeState}
            runtimeClient={runtimeClient}
            draft={imageDraft}
            onDraftChange={setImageDraft}
            onStateChange={(updater) => updateCapabilityState('image.generate', updater)}
            onRouteReload={() => reloadRouteFor('image.generate')}
            onBindingChange={updateSharedImageBinding}
          />
        );
      case 'image.create-job':
        return (
          <ImageGeneratePanel
            mode="job"
            state={activeState}
            runtimeClient={runtimeClient}
            draft={imageDraft}
            onDraftChange={setImageDraft}
            onStateChange={(updater) => updateCapabilityState('image.create-job', updater)}
            onRouteReload={() => reloadRouteFor('image.create-job')}
            onBindingChange={updateSharedImageBinding}
          />
        );
      case 'video.generate':
        return (
          <VideoGeneratePanel
            state={activeState}
            runtimeClient={runtimeClient}
            onStateChange={(updater) => updateCapabilityState('video.generate', updater)}
            onRouteReload={() => reloadRouteFor('video.generate')}
          />
        );
      case 'audio.synthesize':
        return (
          <AudioSynthesizePanel
            state={activeState}
            runtimeClient={runtimeClient}
            onStateChange={(updater) => updateCapabilityState('audio.synthesize', updater)}
            onRouteReload={() => reloadRouteFor('audio.synthesize')}
          />
        );
      case 'audio.transcribe':
        return (
          <AudioTranscribePanel
            state={activeState}
            runtimeClient={runtimeClient}
            onStateChange={(updater) => updateCapabilityState('audio.transcribe', updater)}
            onRouteReload={() => reloadRouteFor('audio.transcribe')}
          />
        );
      case 'voice.clone':
        return (
          <VoiceClonePanel
            state={activeState}
            onStateChange={(updater) => updateCapabilityState('voice.clone', updater)}
          />
        );
      case 'voice.design':
        return (
          <VoiceDesignPanel
            state={activeState}
            onStateChange={(updater) => updateCapabilityState('voice.design', updater)}
          />
        );
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-row overflow-hidden bg-gray-50 text-sm text-gray-900">
      <CapabilitySidebar
        active={activeCapability}
        states={states}
        onSelect={setActiveCapability}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto p-4">
        <div className="mb-3 px-1">
          <h2 className="text-sm font-semibold text-gray-900">{activeMeta.label}</h2>
        </div>
        {renderPanel()}
      </div>
    </div>
  );
}
