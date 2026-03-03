// ---------------------------------------------------------------------------
// LLM adapter — bridges ModAiClient → service-layer LlmClient interface
// ---------------------------------------------------------------------------

import type { ModAiClient } from '@nimiplatform/sdk/mod/ai';
import type { LlmClient } from '../types.js';

export type LlmRouteOverride = {
  source?: 'local-runtime' | 'token-api';
  connectorId?: string;
  model?: string;
};

/**
 * Wrap a ModAiClient into the service-layer LlmClient abstraction.
 *
 * Mapping:
 *   LlmClient.generateText({ userPrompt }) → ModAiClient.generateText({ prompt })
 *   routeHint defaults to 'chat/default'
 *
 * If `defaultRouteOverride` is provided, it is merged into every call
 * so that the correct connector is always used.
 */
export function createLlmClientAdapter(
  aiClient: ModAiClient,
  defaultRouteOverride?: LlmRouteOverride,
): LlmClient {
  return {
    async generateText(input) {
      // Per-call routeOverride takes priority, then adapter-level default
      const routeOverride = input.routeOverride ?? defaultRouteOverride;

      const result = await aiClient.generateText({
        prompt: input.userPrompt,
        systemPrompt: input.systemPrompt,
        maxTokens: input.maxTokens,
        temperature: input.temperature,
        routeHint: (input.routeHint as 'chat/default') ?? 'chat/default',
        routeOverride: routeOverride as any,
      });
      return { text: result.text };
    },
  };
}
