import type { ModAiClient } from '@nimiplatform/mod-sdk/ai';
import type {
  DistillRouteOverrideMap,
  RouteCapabilityLlmInvoker,
  WorldStudioRouteOverride,
} from '../engine/types.js';

export function withRouteOverride(
  ai: ModAiClient,
  defaultRouteHint: string,
  routeOverride?: WorldStudioRouteOverride | null,
): RouteCapabilityLlmInvoker {
  return {
    generateText: (input) => ai.generateText({
      prompt: input.prompt,
      mode: input.mode,
      worldId: input.worldId,
      agentId: input.agentId,
      abortSignal: input.abortSignal,
      routeHint: input.routeHint || defaultRouteHint,
      routeOverride: input.routeOverride || routeOverride || undefined,
    }),
  };
}

export function toNormalizedRouteOverrides(
  input?: DistillRouteOverrideMap,
): DistillRouteOverrideMap {
  return {
    coarse: input?.coarse || null,
    fine: input?.fine || null,
  };
}
