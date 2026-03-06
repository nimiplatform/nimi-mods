import type {
  DistillRouteBindingMap,
  RouteCapabilityLlmInvoker,
  WorldStudioRouteBinding,
} from '../engine/types.js';
import type { RuntimeCanonicalCapability } from '@nimiplatform/sdk/mod/runtime-route';
import type { WorldStudioRuntimeAiClient } from '../runtime-ai-client.js';

export function withRouteBinding(
  ai: WorldStudioRuntimeAiClient,
  defaultCapability: RuntimeCanonicalCapability,
  binding?: WorldStudioRouteBinding | null,
): RouteCapabilityLlmInvoker {
  return {
    generateText: (input) => ai.generateText({
      prompt: input.prompt,
      maxTokens: input.maxTokens,
      temperature: input.temperature,
      mode: input.mode,
      worldId: input.worldId,
      agentId: input.agentId,
      abortSignal: input.abortSignal,
      capability: input.capability || defaultCapability,
      binding: input.binding || binding || undefined,
    }),
  };
}

export function toNormalizedRouteBindings(
  input?: DistillRouteBindingMap,
): DistillRouteBindingMap {
  return {
    coarse: input?.coarse || null,
    fine: input?.fine || null,
  };
}
