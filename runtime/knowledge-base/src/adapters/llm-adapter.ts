import type { LlmClient, KBResolvedRoute } from '../types.js';
import { type AIConfig, type ModRuntimeClient } from "@nimiplatform/sdk/mod";
import { recordKnowledgeBaseExecutionSnapshot } from '../controllers/kb-ai-config.js';
import type { KBRouteCapability } from '../controllers/kb-ai-config.js';
/**
 * Wrap a ModRuntimeClient into the service-layer LlmClient abstraction.
 */
export function createLlmClientAdapter(runtimeClient: ModRuntimeClient, options?: {
    resolveConfig?: () => AIConfig | Promise<AIConfig>;
    resolveRoute?: () => KBResolvedRoute | Promise<KBResolvedRoute>;
}): LlmClient {
    const resolveBinding = async () => {
        if (!options?.resolveRoute) {
            return undefined;
        }
        const resolved = await options.resolveRoute();
        return resolved.binding;
    };
    const resolveConfig = async () => {
        if (!options?.resolveConfig) {
            return null;
        }
        return await options.resolveConfig();
    };
    const requireBinding = async (capability: KBRouteCapability) => {
        const binding = await resolveBinding();
        if (!binding) {
            throw new Error(`KB_AI_CONFIG_BINDING_REQUIRED:${capability}`);
        }
        return binding;
    };
    return {
        async generateText(input) {
            const capability = (input.capability || 'text.generate') as KBRouteCapability;
            const binding = await requireBinding(capability);
            const config = await resolveConfig();
            if (config) {
                await recordKnowledgeBaseExecutionSnapshot(runtimeClient, {
                    config,
                    capability,
                    metadata: {
                        source: 'knowledge-base',
                        operation: 'text.generate',
                    },
                });
            }
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
            const capability = (input.capability || 'text.generate') as KBRouteCapability;
            const binding = await requireBinding(capability);
            const config = await resolveConfig();
            if (config) {
                await recordKnowledgeBaseExecutionSnapshot(runtimeClient, {
                    config,
                    capability,
                    metadata: {
                        source: 'knowledge-base',
                        operation: 'text.stream',
                    },
                });
            }
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
