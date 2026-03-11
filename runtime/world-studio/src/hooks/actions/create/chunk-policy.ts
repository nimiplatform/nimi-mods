import type {
  RuntimeRouteBinding,
  RuntimeRouteModelProfile,
  RuntimeRouteOptionsSnapshot,
} from '@nimiplatform/sdk/mod/runtime-route';
import type { WorldStudioParseJobState } from '../../../contracts.js';

type ChunkPolicyContextSource = NonNullable<WorldStudioParseJobState['chunkPolicy']>['contextSource'];

export type AdaptiveChunkPolicy = NonNullable<WorldStudioParseJobState['chunkPolicy']>;

const DEFAULT_CONTEXT_TOKENS = 8192;
const MIN_CHUNK_SIZE = 1200;
const MAX_CHUNK_SIZE = 14_000;
const MIN_OVERLAP = 120;
const MAX_OVERLAP = 1400;

function clampInt(value: number, min: number, max: number): number {
  const rounded = Math.round(value);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

function toPositiveInt(value: unknown): number | undefined {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  const rounded = Math.floor(numeric);
  return rounded > 0 ? rounded : undefined;
}

function inferTemplateContextTokens(model: string): number | undefined {
  const normalized = String(model || '').trim().toLowerCase();
  if (!normalized) return undefined;
  const tail = normalized.split('/').filter(Boolean).pop() || normalized;
  if (normalized.startsWith('claude-') || tail.startsWith('claude-')) return 200_000;
  if (normalized.startsWith('gpt-4') || tail.startsWith('gpt-4')) return 128_000;
  if (normalized.startsWith('o3') || tail.startsWith('o3')) return 128_000;
  if (normalized.startsWith('llama') || tail.startsWith('llama')) return 8_192;
  if (normalized.startsWith('qwen') || tail.startsWith('qwen')) return 32_768;
  if (normalized.startsWith('deepseek') || tail.startsWith('deepseek')) return 64_000;
  return undefined;
}

function normalizeContextSource(value: unknown): ChunkPolicyContextSource {
  const source = String(value || '').trim();
  if (source === 'provider-api' || source === 'template' || source === 'default') {
    return source;
  }
  return 'unknown';
}

function resolveBindingModelProfiles(
  binding: RuntimeRouteBinding | null,
  routeOptions: RuntimeRouteOptionsSnapshot | null,
): RuntimeRouteModelProfile[] {
  if (!binding || !routeOptions) return [];
  if (binding.source === 'local') {
    return [];
  }

  const preferredConnector = routeOptions.connectors.find((item) => item.id === binding.connectorId);
  const connectorCandidates = preferredConnector
    ? [preferredConnector, ...routeOptions.connectors.filter((item) => item.id !== preferredConnector.id)]
    : routeOptions.connectors;
  for (const connector of connectorCandidates) {
    if (connector.modelProfiles && connector.modelProfiles.length > 0) {
      return connector.modelProfiles;
    }
  }
  return [];
}

function resolveBindingContext(input: {
  binding: RuntimeRouteBinding | null;
  routeOptions: RuntimeRouteOptionsSnapshot | null;
}): { model: string; maxContextTokens?: number; contextSource: ChunkPolicyContextSource } {
  const model = String(input.binding?.model || '').trim();
  if (!model) {
    return {
      model: '',
      contextSource: 'unknown',
    };
  }

  const candidates = resolveBindingModelProfiles(input.binding, input.routeOptions);
  const matched = candidates.find((profile) => String(profile.model || '').trim().toLowerCase() === model.toLowerCase());
  const matchedContext = toPositiveInt(matched?.maxContextTokens);
  if (typeof matchedContext === 'number') {
    return {
      model,
      maxContextTokens: matchedContext,
      contextSource: normalizeContextSource(matched?.contextSource),
    };
  }

  const inferred = inferTemplateContextTokens(model);
  if (typeof inferred === 'number') {
    return {
      model,
      maxContextTokens: inferred,
      contextSource: 'template',
    };
  }

  return {
    model,
    contextSource: 'unknown',
  };
}

function resolveBaseChunkSizeByContext(contextTokens: number): number {
  if (contextTokens <= 8192) return 3000;
  if (contextTokens <= 16_384) return 4200;
  if (contextTokens <= 32_768) return 6000;
  if (contextTokens <= 65_536) return 9000;
  return 12_000;
}

function estimateCjkRatio(sample: string): number {
  const text = String(sample || '');
  if (!text) return 0;
  const normalizedLength = Math.max(1, text.length);
  const cjkCount = (text.match(/[\u3400-\u9fff]/g) || []).length;
  return cjkCount / normalizedLength;
}

function toChunkMultiplierByText(sample: string): number {
  const ratio = estimateCjkRatio(sample);
  if (ratio >= 0.6) return 0.8;
  if (ratio >= 0.25) return 0.9;
  return 1;
}

export function resolveAdaptiveChunkPolicy(input: {
  coarseRouteBinding: RuntimeRouteBinding | null;
  fineRouteBinding: RuntimeRouteBinding | null;
  routeOptions: RuntimeRouteOptionsSnapshot | null;
  sourceSample: string;
}): AdaptiveChunkPolicy {
  const coarse = resolveBindingContext({
    binding: input.coarseRouteBinding,
    routeOptions: input.routeOptions,
  });
  const fine = resolveBindingContext({
    binding: input.fineRouteBinding,
    routeOptions: input.routeOptions,
  });

  const coarseContext = toPositiveInt(coarse.maxContextTokens);
  const fineContext = toPositiveInt(fine.maxContextTokens);
  const effectiveContextTokens = (() => {
    if (typeof coarseContext === 'number' && typeof fineContext === 'number') {
      return Math.min(coarseContext, fineContext);
    }
    if (typeof coarseContext === 'number') return coarseContext;
    if (typeof fineContext === 'number') return fineContext;
    return DEFAULT_CONTEXT_TOKENS;
  })();
  const contextSource = (() => {
    if (typeof coarseContext === 'number' && typeof fineContext === 'number') {
      return coarseContext <= fineContext ? coarse.contextSource : fine.contextSource;
    }
    if (typeof coarseContext === 'number') return coarse.contextSource;
    if (typeof fineContext === 'number') return fine.contextSource;
    return 'default' as const;
  })();

  const baseChunkSize = resolveBaseChunkSizeByContext(effectiveContextTokens);
  const chunkMultiplier = toChunkMultiplierByText(input.sourceSample);
  const chunkSize = clampInt(baseChunkSize * chunkMultiplier, MIN_CHUNK_SIZE, MAX_CHUNK_SIZE);
  const overlap = clampInt(chunkSize * 0.1, MIN_OVERLAP, MAX_OVERLAP);

  return {
    chunkSize,
    overlap,
    effectiveContextTokens,
    coarseModel: coarse.model || String(input.coarseRouteBinding?.model || ''),
    fineModel: fine.model || String(input.fineRouteBinding?.model || ''),
    contextSource,
  };
}

export function shrinkAdaptiveChunkPolicy(input: AdaptiveChunkPolicy, factor = 0.7): AdaptiveChunkPolicy {
  const normalizedFactor = Number.isFinite(factor) ? factor : 0.7;
  const chunkSize = clampInt(input.chunkSize * normalizedFactor, MIN_CHUNK_SIZE, MAX_CHUNK_SIZE);
  const overlap = clampInt(chunkSize * 0.1, MIN_OVERLAP, MAX_OVERLAP);
  return {
    ...input,
    chunkSize,
    overlap,
  };
}
