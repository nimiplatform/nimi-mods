// ---------------------------------------------------------------------------
// LLM adapter — bridges ModAiClient → service-layer LlmClient interface
// ---------------------------------------------------------------------------

import type { ModAiClient } from '@nimiplatform/sdk/mod/ai';
import type { LlmClient } from '../types.js';

/**
 * Wrap a ModAiClient into the service-layer LlmClient abstraction.
 *
 * Mapping:
 *   LlmClient.generateText({ userPrompt }) → ModAiClient.generateText({ prompt })
 *   routeHint defaults to 'chat/default'
 */
export function createLlmClientAdapter(aiClient: ModAiClient): LlmClient {
  return {
    async generateText(input) {
      const result = await aiClient.generateText({
        prompt: input.userPrompt,
        systemPrompt: input.systemPrompt,
        maxTokens: input.maxTokens,
        temperature: input.temperature,
        routeHint: (input.routeHint as 'chat/default') ?? 'chat/default',
      });
      return { text: result.text };
    },
  };
}
