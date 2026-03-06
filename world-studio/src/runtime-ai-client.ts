import type { ModRuntimeClient } from '@nimiplatform/sdk/mod/runtime';
import type { RuntimeCanonicalCapability, RuntimeRouteBinding } from '@nimiplatform/sdk/mod/runtime-route';

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
  generateEmbedding: (input: {
    binding?: RuntimeRouteBinding;
    input: string | string[];
    model?: string;
  }) => Promise<{
    embeddings: number[][];
    traceId: string;
  }>;
};

export function createWorldStudioRuntimeAiClient(
  runtimeClient: ModRuntimeClient,
): WorldStudioRuntimeAiClient {
  return {
    generateText: async (input) => {
      const route = await runtimeClient.route.resolve({
        capability: 'text.generate',
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
