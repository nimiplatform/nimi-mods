import type { EmbeddingClient, KBResolvedRoute } from '../types.js';
import { createKBFlowId, emitKBLog } from '../logging.js';
import { type RuntimeCanonicalCapability, type ModRuntimeClient } from "@nimiplatform/sdk/mod";
/**
 * Wrap a ModRuntimeClient into the service-layer EmbeddingClient abstraction.
 */
export function createEmbeddingClientAdapter(runtimeClient: ModRuntimeClient, options?: {
    resolveRoute?: () => KBResolvedRoute | Promise<KBResolvedRoute>;
}): EmbeddingClient {
    let routeProbeLogged = false;
    return {
        async generateEmbedding(input) {
            const flowId = createKBFlowId('embed-adapter');
            const resolvedRoute = options?.resolveRoute ? await options.resolveRoute() : {};
            const binding = resolvedRoute.binding;
            const capability = (input.capability || 'text.embed') as RuntimeCanonicalCapability;
            if (!routeProbeLogged) {
                routeProbeLogged = true;
                emitKBLog({
                    level: 'info',
                    message: 'embedding:adapter:route-override',
                    flowId,
                    source: 'createEmbeddingClientAdapter.generateEmbedding',
                    details: {
                        capability,
                        binding: binding || null,
                    },
                });
            }
            try {
                const result = await runtimeClient.ai.embedding.generate({
                    input: input.texts,
                    binding,
                    model: binding?.model,
                    metadata: {
                        'x-nimi-mod-capability': capability,
                    },
                });
                emitKBLog({
                    level: 'debug',
                    message: 'embedding:adapter:invoke:done',
                    flowId,
                    source: 'createEmbeddingClientAdapter.generateEmbedding',
                    details: {
                        resolvedSource: binding?.source || null,
                        resolvedConnectorId: binding?.connectorId || null,
                        resolvedModel: binding?.model || null,
                        batchSize: input.texts.length,
                        embeddings: result.vectors.length,
                        traceId: result.trace?.traceId || null,
                        modelResolved: result.trace?.modelResolved || null,
                    },
                });
                return {
                    embeddings: result.vectors,
                    model: result.trace?.modelResolved || binding?.model || undefined,
                    trace: result.trace,
                };
            }
            catch (error) {
                emitKBLog({
                    level: 'error',
                    message: 'embedding:adapter:invoke:error',
                    flowId,
                    source: 'createEmbeddingClientAdapter.generateEmbedding',
                    details: {
                        error: error instanceof Error ? error.message : String(error || ''),
                        capability,
                        binding: binding || null,
                    },
                });
                throw error;
            }
        },
    };
}
