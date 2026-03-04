import { filterModelsForScenario, filterModelsForSpeechSynthesis } from '@nimiplatform/sdk/mod/model-options';

type Scenario = 'tts' | 'stt';

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

function matchesScenarioByCapability(capabilities: string[], scenario: Scenario): boolean {
  const normalized = normalizeCapabilities(capabilities);
  if (normalized.length === 0) return false;
  const hasAny = (...tokens: string[]) => tokens.some((token) => normalized.includes(token));
  if (scenario === 'tts') {
    return hasAny(
      'tts',
      'audio.synthesize',
      'speech.synthesize',
      'llm.speech.synthesize',
    );
  }
  return hasAny(
    'stt',
    'audio.transcribe',
    'speech.transcribe',
    'llm.speech.transcribe',
  );
}

function filterModelsByHeuristic(models: string[], scenario: Scenario): string[] {
  if (scenario === 'tts') {
    return filterModelsForSpeechSynthesis(models);
  }
  return filterModelsForScenario(models, 'stt');
}

export function resolveModelsForScenario(input: {
  models: string[];
  modelCapabilities?: Record<string, string[]>;
  scenario: Scenario;
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
  scenario: Scenario;
}): string {
  const candidates = resolveModelsForScenario(input);
  return candidates[0] || '';
}
