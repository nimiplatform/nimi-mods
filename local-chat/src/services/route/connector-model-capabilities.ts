import { filterModelsForScenario, filterModelsForSpeechSynthesis } from '@nimiplatform/sdk/mod/model-options';

type LegacyScenario = 'chat' | 'tts' | 'stt';
type LegacyExtendedScenario = LegacyScenario | 'image' | 'video';
type CanonicalScenario =
  | 'text.generate'
  | 'audio.synthesize'
  | 'audio.transcribe'
  | 'image.generate'
  | 'video.generate';
export type ExtendedScenario = LegacyExtendedScenario | CanonicalScenario;
type LocalRuntimeModelLike = {
  localModelId?: string;
  model: string;
  capabilities?: string[];
  status?: string;
  goRuntimeLocalModelId?: string;
  goRuntimeStatus?: string;
};

type LocalRuntimeModelMatchInput = {
  model?: string;
  localModelId?: string;
  goRuntimeLocalModelId?: string;
};

export function dedupeModelIds(models: string[]): string[] {
  return Array.from(new Set(models.map((model) => String(model || '').trim()).filter(Boolean)));
}

function normalizeStatus(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function normalizeLocalRuntimeLookup(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function normalizeScenario(scenario: ExtendedScenario): LegacyExtendedScenario {
  if (scenario === 'text.generate') return 'chat';
  if (scenario === 'audio.synthesize') return 'tts';
  if (scenario === 'audio.transcribe') return 'stt';
  if (scenario === 'image.generate') return 'image';
  if (scenario === 'video.generate') return 'video';
  return scenario;
}

function normalizeCapabilities(capabilities: string[]): string[] {
  return capabilities
    .map((capability) => String(capability || '').trim().toLowerCase())
    .filter(Boolean);
}

function capabilitiesForModel(
  modelCapabilities: Record<string, string[]> | undefined,
  modelId: string,
): string[] {
  if (!modelCapabilities) return [];
  const direct = modelCapabilities[modelId];
  if (Array.isArray(direct) && direct.length > 0) {
    return direct;
  }
  const normalizedModelId = String(modelId || '').trim().toLowerCase();
  if (!normalizedModelId) return [];
  const entry = Object.entries(modelCapabilities).find(
    ([candidate]) => String(candidate || '').trim().toLowerCase() === normalizedModelId,
  );
  if (!entry) return [];
  return Array.isArray(entry[1]) ? entry[1] : [];
}

function matchesScenarioByCapability(capabilities: string[], scenario: ExtendedScenario): boolean {
  const normalizedScenario = normalizeScenario(scenario);
  const normalized = normalizeCapabilities(capabilities);
  if (normalized.length === 0) return false;
  const hasAny = (...tokens: string[]) => tokens.some((token) => normalized.includes(token));
  if (normalizedScenario === 'chat') {
    return hasAny(
      'chat',
      'text',
      'completion',
      'text.generate',
    );
  }
  if (normalizedScenario === 'tts') {
    return hasAny(
      'tts',
      'audio.synthesize',
      'speech.synthesize',
    );
  }
  if (normalizedScenario === 'stt') {
    return hasAny(
      'stt',
      'audio.transcribe',
      'speech.transcribe',
    );
  }
  if (normalizedScenario === 'image') {
    return hasAny(
      'image',
      't2i',
      'i2i',
      'image.generate',
    );
  }
  return hasAny(
    'video',
    't2v',
    'video.generate',
    'text.video',
  );
}

function filterModelsByHeuristic(models: string[], scenario: ExtendedScenario): string[] {
  const normalizedScenario = normalizeScenario(scenario);
  if (normalizedScenario === 'chat') {
    return filterModelsForScenario(models, 'chat');
  }
  if (normalizedScenario === 'tts') {
    return filterModelsForSpeechSynthesis(models);
  }
  if (normalizedScenario === 'stt') {
    return filterModelsForScenario(models, 'stt');
  }
  if (normalizedScenario === 'image') {
    return filterModelsForScenario(models, 'image');
  }
  return filterModelsForScenario(models, 'video');
}

export function resolveModelsForScenario(input: {
  models: string[];
  modelCapabilities?: Record<string, string[]>;
  scenario: ExtendedScenario;
}): string[] {
  const allModels = dedupeModelIds(input.models);
  if (allModels.length === 0) return [];
  const matchedByCapabilities = allModels.filter((modelId) => (
    matchesScenarioByCapability(
      capabilitiesForModel(input.modelCapabilities, modelId),
      input.scenario,
    )
  ));
  if (matchedByCapabilities.length > 0) {
    return matchedByCapabilities;
  }
  const matchedByHeuristic = dedupeModelIds(filterModelsByHeuristic(allModels, input.scenario));
  if (matchedByHeuristic.length > 0) {
    return matchedByHeuristic;
  }
  return allModels;
}

export function resolvePreferredModelForScenario(input: {
  models: string[];
  modelCapabilities?: Record<string, string[]>;
  scenario: ExtendedScenario;
}): string {
  const candidates = resolveModelsForScenario(input);
  return candidates[0] || '';
}

export function resolveEffectiveModelForScenario(input: {
  configuredModel?: string;
  routeSelectedModel?: string;
  models: string[];
  modelCapabilities?: Record<string, string[]>;
  scenario: ExtendedScenario;
}): string {
  const configuredModel = String(input.configuredModel || '').trim();
  const routeSelectedModel = String(input.routeSelectedModel || '').trim();
  const candidates = resolveModelsForScenario(input);
  if (configuredModel && candidates.includes(configuredModel)) {
    return configuredModel;
  }
  if (routeSelectedModel && candidates.includes(routeSelectedModel)) {
    return routeSelectedModel;
  }
  if (candidates[0]) {
    return candidates[0];
  }
  if (configuredModel) {
    return configuredModel;
  }
  return routeSelectedModel;
}

function dedupeLocalRuntimeModels<T extends LocalRuntimeModelLike>(models: T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const model of models) {
    const localModelId = String(model.localModelId || '').trim();
    const modelId = String(model.model || '').trim();
    const dedupeKey = (localModelId || modelId).toLowerCase();
    if (!dedupeKey || seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    deduped.push(model);
  }
  return deduped;
}

function matchesLocalRuntimeModelByHeuristic(
  model: LocalRuntimeModelLike,
  scenario: ExtendedScenario,
): boolean {
  const candidates = filterModelsByHeuristic(
    [String(model.model || '').trim(), String(model.localModelId || '').trim()].filter(Boolean),
    scenario,
  );
  return candidates.length > 0;
}

export function isLocalRuntimeModelReady(
  model: Pick<LocalRuntimeModelLike, 'status' | 'goRuntimeStatus'> | null | undefined,
): boolean {
  if (!model) {
    return false;
  }
  const runtimeStatus = normalizeStatus(model.status);
  const goRuntimeStatus = normalizeStatus(model.goRuntimeStatus);
  if (runtimeStatus && runtimeStatus !== 'active') {
    return false;
  }
  if (goRuntimeStatus && goRuntimeStatus !== 'active') {
    return false;
  }
  return true;
}

export function findLocalRuntimeModelForBinding<T extends LocalRuntimeModelLike>(input: {
  models: T[];
  binding: LocalRuntimeModelMatchInput;
}): T | null {
  const localModelId = normalizeLocalRuntimeLookup(input.binding.localModelId);
  const goRuntimeLocalModelId = normalizeLocalRuntimeLookup(input.binding.goRuntimeLocalModelId);
  const model = normalizeLocalRuntimeLookup(input.binding.model);

  if (localModelId) {
    const byLocalModelId = input.models.find((candidate) => (
      normalizeLocalRuntimeLookup(candidate.localModelId) === localModelId
    ));
    if (byLocalModelId) {
      return byLocalModelId;
    }
  }

  if (goRuntimeLocalModelId) {
    const byGoRuntimeLocalModelId = input.models.find((candidate) => (
      normalizeLocalRuntimeLookup(candidate.goRuntimeLocalModelId) === goRuntimeLocalModelId
    ));
    if (byGoRuntimeLocalModelId) {
      return byGoRuntimeLocalModelId;
    }
  }

  if (!model) {
    return null;
  }

  return input.models.find((candidate) => (
    normalizeLocalRuntimeLookup(candidate.model) === model
    || normalizeLocalRuntimeLookup(candidate.localModelId) === model
  )) || null;
}

export function resolveLocalRuntimeModelsForScenario<T extends LocalRuntimeModelLike>(input: {
  models: T[];
  scenario: ExtendedScenario;
}): T[] {
  const allModels = dedupeLocalRuntimeModels(input.models).filter((model) => isLocalRuntimeModelReady(model));
  if (allModels.length === 0) {
    return [];
  }
  const matchedByCapabilities = allModels.filter((model) => (
    matchesScenarioByCapability(model.capabilities || [], input.scenario)
  ));
  if (matchedByCapabilities.length > 0) {
    return matchedByCapabilities;
  }
  const matchedByHeuristic = allModels.filter((model) => (
    matchesLocalRuntimeModelByHeuristic(model, input.scenario)
  ));
  if (matchedByHeuristic.length > 0) {
    return matchedByHeuristic;
  }
  return allModels;
}

export function resolvePreferredLocalRuntimeModelForScenario<T extends LocalRuntimeModelLike>(input: {
  models: T[];
  scenario: ExtendedScenario;
}): T | null {
  return resolveLocalRuntimeModelsForScenario(input)[0] || null;
}

export function hasReadyLocalRuntimeModelForScenario<T extends LocalRuntimeModelLike>(input: {
  models: T[];
  scenario: ExtendedScenario;
}): boolean {
  return resolveLocalRuntimeModelsForScenario(input).length > 0;
}
