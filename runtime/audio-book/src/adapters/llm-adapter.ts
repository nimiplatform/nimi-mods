import type { LlmClient } from '../types.js';
import { type ModRuntimeClient, type RuntimeRouteBinding } from "@nimiplatform/sdk/mod";
/**
 * Wrap a ModRuntimeClient into the service-layer LlmClient abstraction.
 */
export function createLlmClientAdapter(runtimeClient: ModRuntimeClient, defaultBinding?: RuntimeRouteBinding): LlmClient {
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
