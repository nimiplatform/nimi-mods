import { filterModelsForScenario, filterModelsForSpeechSynthesis } from '@nimiplatform/sdk/mod/model-options';

type Scenario = 'chat' | 'tts' | 'stt';
type ExtendedScenario = Scenario | 'image' | 'video';
type LocalRuntimeModelLike = {
  localModelId?: string;
  model: string;
  capabilities?: string[];
};

function dedupeModelIds(models: string[]): string[] {
  return Array.from(new Set(models.map((model) => String(model || '').trim()).filter(Boolean)));
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
  const normalized = normalizeCapabilities(capabilities);
  if (normalized.length === 0) return false;
  const hasAny = (...tokens: string[]) => tokens.some((token) => normalized.includes(token));
  if (scenario === 'chat') {
    return hasAny(
      'chat',
      'text',
      'completion',
      'llm.text.generate',
      'llm.text.stream',
    );
  }
  if (scenario === 'tts') {
    return hasAny(
      'tts',
      'audio.synthesize',
      'speech.synthesize',
      'llm.speech.synthesize',
    );
  }
  if (scenario === 'stt') {
    return hasAny(
      'stt',
      'audio.transcribe',
      'speech.transcribe',
      'llm.speech.transcribe',
    );
  }
  if (scenario === 'image') {
    return hasAny(
      'image',
      't2i',
      'i2i',
      'llm.image.generate',
    );
  }
  return hasAny(
    'video',
    't2v',
    'llm.video.generate',
    'video.generate',
    'text.video',
  );
}

function filterModelsByHeuristic(models: string[], scenario: ExtendedScenario): string[] {
  if (scenario === 'chat') {
    return filterModelsForScenario(models, 'chat');
  }
  if (scenario === 'tts') {
    return filterModelsForSpeechSynthesis(models);
  }
  if (scenario === 'stt') {
    return filterModelsForScenario(models, 'stt');
  }
  if (scenario === 'image') {
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

export function resolveLocalRuntimeModelsForScenario<T extends LocalRuntimeModelLike>(input: {
  models: T[];
  scenario: ExtendedScenario;
}): T[] {
  const allModels = dedupeLocalRuntimeModels(input.models);
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
