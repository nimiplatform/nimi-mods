// ---------------------------------------------------------------------------
// LLM adapter — bridges ModRuntimeClient → service-layer LlmClient interface
// ---------------------------------------------------------------------------

import type { ModRuntimeClient } from '@nimiplatform/sdk/mod/runtime';
import type { RuntimeRouteBinding } from '@nimiplatform/sdk/mod/runtime-route';
import type { LlmClient } from '../types.js';

/**
 * Wrap a ModRuntimeClient into the service-layer LlmClient abstraction.
 */
export function createLlmClientAdapter(
  runtimeClient: ModRuntimeClient,
  defaultBinding?: RuntimeRouteBinding,
): LlmClient {
  return {
    async generateText(input) {
      const result = await runtimeClient.ai.text.generate({
        input: input.userPrompt,
        system: input.systemPrompt,
        maxTokens: input.maxTokens,
        temperature: input.temperature,
        binding: input.binding || defaultBinding,
      });
      return { text: result.text };
    },
  };
}
