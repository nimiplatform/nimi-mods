import { buildLocalImageWorkflowExtensions } from '@nimiplatform/sdk/mod/runtime';
import type {
  LocalImageWorkflowComponentSelection,
  ModRuntimeLocalArtifactKind,
  ModRuntimeLocalArtifactRecord,
} from '@nimiplatform/sdk/mod/runtime';
import type { RuntimeRouteBinding } from '@nimiplatform/sdk/mod/runtime-route';
import {
  IMAGE_WORKFLOW_PRESET_SELECTIONS,
  LOCALAI_IMAGE_COMPONENTS_REQUIRED_ERROR,
  type CompanionArtifactSelectionsInput,
  type ImageResponseFormatMode,
  type ImageWorkflowComponentDraft,
  type ImageWorkflowProfileOverridesInput,
} from './types.js';
import { asString } from './utils.js';
import { resolveImageResponseFormat } from './route.js';

export function inferArtifactKindForSlot(slot: string): ModRuntimeLocalArtifactKind | undefined {
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

export function isSelectableLocalArtifact(artifact: ModRuntimeLocalArtifactRecord): boolean {
  return artifact.status === 'installed' || artifact.status === 'active';
}

export function artifactDisplayLabel(artifact: ModRuntimeLocalArtifactRecord): string {
  return `${artifact.artifactId} [${artifact.kind}]`;
}

export function artifactsForPresetKind(
  artifacts: ModRuntimeLocalArtifactRecord[],
  kind: ModRuntimeLocalArtifactKind,
): ModRuntimeLocalArtifactRecord[] {
  return artifacts
    .filter(isSelectableLocalArtifact)
    .filter((artifact) => artifact.kind === kind)
    .sort((left, right) => `${left.kind}:${left.artifactId}`.localeCompare(`${right.kind}:${right.artifactId}`));
}

export function artifactsForWorkflowSlot(
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

export function buildImageWorkflowComponents(
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
