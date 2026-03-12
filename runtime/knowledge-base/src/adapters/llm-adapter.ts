import type { LlmClient, KBResolvedRoute } from '../types.js';
import { type RuntimeCanonicalCapability, type ModRuntimeClient } from "@nimiplatform/sdk/mod";
/**
 * Wrap a ModRuntimeClient into the service-layer LlmClient abstraction.
 */
export function createLlmClientAdapter(runtimeClient: ModRuntimeClient, options?: {
    resolveRoute?: () => KBResolvedRoute | Promise<KBResolvedRoute>;
}): LlmClient {
    const resolveBinding = async () => {
        if (!options?.resolveRoute) {
            return undefined;
        }
        const resolved = await options.resolveRoute();
        return resolved.binding;
    };
    return {
        async generateText(input) {
            const binding = await resolveBinding();
            const capability = (input.capability || 'text.generate') as RuntimeCanonicalCapability;
            const result = await runtimeClient.ai.text.generate({
                input: input.userPrompt,
                system: input.systemPrompt,
                maxTokens: input.maxTokens,
                temperature: input.temperature,
                binding,
                model: binding?.model,
                metadata: {
                    'x-nimi-mod-capability': capability,
                },
            });
            return { text: result.text, trace: result.trace };
        },
        async *streamText(input) {
            const binding = await resolveBinding();
            const capability = (input.capability || 'text.generate') as RuntimeCanonicalCapability;
            const result = await runtimeClient.ai.text.stream({
                input: input.userPrompt,
                system: input.systemPrompt,
                maxTokens: input.maxTokens,
                temperature: input.temperature,
                binding,
                model: binding?.model,
                signal: input.signal,
                metadata: {
                    'x-nimi-mod-capability': capability,
                },
            });
            for await (const event of result.stream) {
                if (event.type === 'delta') {
                    yield { type: 'text_delta' as const, textDelta: event.text };
                }
                else if (event.type === 'finish') {
                    yield { type: 'done' as const, trace: event.trace };
                }
            }
        },
    };
}
