// ---------------------------------------------------------------------------
// LLM adapter — bridges ModAiClient → service-layer LlmClient interface
// ---------------------------------------------------------------------------

import type { ModAiClient } from '@nimiplatform/sdk/mod/ai';
import type { LlmClient } from '../types.js';

type ChatRouteSource = 'auto' | 'local-runtime' | 'token-api';
type EffectiveRouteOverride = {
  source: 'local-runtime' | 'token-api';
  connectorId?: string;
  model?: string;
  localModelId?: string;
};
type TokenApiRouteOverride = {
  source: 'token-api';
  connectorId?: string;
  model?: string;
};

/**
 * Wrap a ModAiClient into the service-layer LlmClient abstraction.
 *
 * Mapping:
 *   LlmClient.generateText({ userPrompt }) → ModAiClient.generateText({ prompt })
 *   LlmClient.streamText({ userPrompt })   → ModAiClient.streamText({ prompt })
 *   routeHint defaults to 'chat/default'
 */
export function createLlmClientAdapter(
  aiClient: ModAiClient,
  routeSource: ChatRouteSource = 'auto',
  options?: {
    preferredRouteOverride?: EffectiveRouteOverride;
    resolveTokenApiRouteOverride?: () => Promise<TokenApiRouteOverride | undefined>;
  },
): LlmClient {
  let tokenApiRouteOverrideCache: TokenApiRouteOverride | null = null;

  const resolveRouteOverride = async (): Promise<EffectiveRouteOverride | undefined> => {
    const baseRouteOverride = options?.preferredRouteOverride
      || (routeSource === 'auto' ? undefined : { source: routeSource });
    if (!baseRouteOverride || baseRouteOverride.source !== 'token-api') {
      return baseRouteOverride;
    }
    if (baseRouteOverride.connectorId && baseRouteOverride.model) {
      return baseRouteOverride;
    }
    if (!tokenApiRouteOverrideCache && options?.resolveTokenApiRouteOverride) {
      tokenApiRouteOverrideCache = await options.resolveTokenApiRouteOverride() ?? null;
    }
    if (!tokenApiRouteOverrideCache) {
      return baseRouteOverride;
    }
    return {
      ...baseRouteOverride,
      source: 'token-api',
      connectorId: baseRouteOverride.connectorId || tokenApiRouteOverrideCache.connectorId,
      model: baseRouteOverride.model || tokenApiRouteOverrideCache.model,
    };
  };

  return {
    async generateText(input) {
      const routeOverride = await resolveRouteOverride();
      const result = await aiClient.generateText({
        prompt: input.userPrompt,
        systemPrompt: input.systemPrompt,
        maxTokens: input.maxTokens,
        temperature: input.temperature,
        routeHint: (input.routeHint as 'chat/default') ?? 'chat/default',
        routeOverride,
      });
      return { text: result.text };
    },

    async *streamText(input) {
      const routeOverride = await resolveRouteOverride();
      for await (const event of aiClient.streamText({
        prompt: input.userPrompt,
        systemPrompt: input.systemPrompt,
        maxTokens: input.maxTokens,
        temperature: input.temperature,
        routeHint: (input.routeHint as 'chat/default') ?? 'chat/default',
        routeOverride,
      })) {
        if (event.type === 'text_delta') {
          yield { type: 'text_delta' as const, textDelta: event.textDelta };
        } else if (event.type === 'done') {
          yield { type: 'done' as const };
        }
      }
    },
  };
}
