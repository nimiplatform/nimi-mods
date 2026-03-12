import { type ModRuntimeClient, type RuntimeCanonicalCapability, type RuntimeRouteBinding } from "@nimiplatform/sdk/mod";
export type WorldStudioImageArtifact = {
    uri?: string;
    mimeType?: string;
    bytes?: Uint8Array;
};
export type WorldStudioRuntimeAiClient = {
    generateText: (input: {
        capability?: RuntimeCanonicalCapability;
        binding?: RuntimeRouteBinding;
        prompt: string;
        systemPrompt?: string;
        maxTokens?: number;
        temperature?: number;
        mode?: 'SCENE_TURN' | 'STORY';
        worldId?: string;
        agentId?: string;
        abortSignal?: AbortSignal;
    }) => Promise<{
        text: string;
        traceId: string;
        promptTraceId: string;
    }>;
    generateImage: (input: {
        capability?: RuntimeCanonicalCapability;
        binding?: RuntimeRouteBinding;
        prompt: string;
        negativePrompt?: string;
        size?: string;
        aspectRatio?: string;
        quality?: string;
        style?: string;
        seed?: number;
        responseFormat?: 'url' | 'base64';
        abortSignal?: AbortSignal;
    }) => Promise<{
        artifacts: WorldStudioImageArtifact[];
        traceId: string;
    }>;
    generateEmbedding: (input: {
        binding?: RuntimeRouteBinding;
        input: string | string[];
        model?: string;
    }) => Promise<{
        embeddings: number[][];
        traceId: string;
    }>;
};
export function createWorldStudioRuntimeAiClient(runtimeClient: ModRuntimeClient): WorldStudioRuntimeAiClient {
    return {
        generateText: async (input) => {
            const route = await runtimeClient.route.resolve({
                capability: input.capability || 'text.generate',
                binding: input.binding,
            });
            const result = await runtimeClient.ai.text.generate({
                input: input.prompt,
                system: input.systemPrompt,
                maxTokens: input.maxTokens,
                temperature: input.temperature,
                model: route.model || undefined,
                binding: input.binding,
            });
            const traceId = String(result.trace?.traceId || '').trim();
            return {
                text: String(result.text || ''),
                traceId,
                promptTraceId: traceId,
            };
        },
        generateImage: async (input) => {
            const route = await runtimeClient.route.resolve({
                capability: input.capability || 'image.generate',
                binding: input.binding,
            });
            const result = await runtimeClient.media.image.generate({
                prompt: input.prompt,
                negativePrompt: input.negativePrompt,
                size: input.size,
                aspectRatio: input.aspectRatio,
                quality: input.quality,
                style: input.style,
                seed: input.seed,
                responseFormat: input.responseFormat,
                signal: input.abortSignal,
                model: route.model || undefined,
                binding: input.binding,
            });
            return {
                artifacts: Array.isArray(result.artifacts)
                    ? result.artifacts.map((artifact) => ({
                        uri: String(artifact.uri || '').trim() || undefined,
                        mimeType: String(artifact.mimeType || '').trim() || undefined,
                        bytes: artifact.bytes && artifact.bytes.length > 0 ? artifact.bytes : undefined,
                    }))
                    : [],
                traceId: String(result.trace?.traceId || '').trim(),
            };
        },
        generateEmbedding: async (input) => {
            const route = await runtimeClient.route.resolve({
                capability: 'text.embed',
                binding: input.binding,
            });
            const result = await runtimeClient.ai.embedding.generate({
                input: input.input,
                model: input.model || route.model || undefined,
                binding: input.binding,
            });
            return {
                embeddings: Array.isArray(result.vectors) ? result.vectors : [],
                traceId: String(result.trace?.traceId || '').trim(),
            };
        },
    };
}
