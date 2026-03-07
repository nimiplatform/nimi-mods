import type { RuntimeCanonicalCapability } from '@nimiplatform/sdk/mod/runtime-route';
import { filterModelsForScenario, filterModelsForSpeechSynthesis } from '@nimiplatform/sdk/mod/model-options';

type ExtendedScenario = RuntimeCanonicalCapability;

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
  if (scenario === 'audio.synthesize') {
    return hasAny(
      'tts',
      'audio.synthesize',
      'speech.synthesize',
    );
  }
  if (scenario === 'audio.transcribe') {
    return hasAny(
      'stt',
      'audio.transcribe',
      'speech.transcribe',
    );
  }
  if (scenario === 'image.generate') {
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
  if (scenario === 'audio.synthesize') {
    return filterModelsForSpeechSynthesis(models);
  }
  if (scenario === 'audio.transcribe') {
    return filterModelsForScenario(models, 'stt');
  }
  if (scenario === 'image.generate') {
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
  const candidates = resolveModelsForScenario({
    models: input.models,
    modelCapabilities: input.modelCapabilities,
    scenario: input.scenario,
  });
  const normalizedConfiguredModel = String(input.configuredModel || '').trim();
  if (normalizedConfiguredModel && candidates.includes(normalizedConfiguredModel)) {
    return normalizedConfiguredModel;
  }
  const normalizedRouteSelectedModel = String(input.routeSelectedModel || '').trim();
  if (normalizedRouteSelectedModel && candidates.includes(normalizedRouteSelectedModel)) {
    return normalizedRouteSelectedModel;
  }
  return candidates[0] || normalizedConfiguredModel || normalizedRouteSelectedModel;
}
