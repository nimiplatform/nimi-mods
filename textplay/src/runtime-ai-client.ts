import type { ModRuntimeClient } from '@nimiplatform/sdk/mod/runtime';
import type { RuntimeCanonicalCapability, RuntimeRouteBinding } from '@nimiplatform/sdk/mod/runtime-route';

function asRouteBinding(value: Record<string, unknown> | undefined): RuntimeRouteBinding | undefined {
  if (!value) {
    return undefined;
  }
  return {
    source: String(value.source || '').trim() === 'token-api' ? 'token-api' : 'local-runtime',
    connectorId: String(value.connectorId || '').trim(),
    model: String(value.model || '').trim(),
    localModelId: String(value.localModelId || '').trim() || undefined,
    engine: String(value.engine || '').trim() || undefined,
  };
}

export type TextplayRuntimeAiClient = {
  generateText: (input: {
    capability?: RuntimeCanonicalCapability;
    binding?: Record<string, unknown>;
    prompt: string;
    systemPrompt?: string;
    mode?: 'SCENE_TURN' | 'STORY';
    worldId?: string;
    abortSignal?: AbortSignal;
  }) => Promise<{
    text: string;
    promptTraceId: string;
    route: {
      source: string;
      connectorId: string;
      model: string;
      provider: string;
      endpoint: string;
      localProviderEndpoint?: string;
      localOpenAiEndpoint?: string;
    };
  }>;
};

export function createTextplayRuntimeAiClient(runtimeClient: ModRuntimeClient): TextplayRuntimeAiClient {
  return {
    generateText: async (input) => {
      const binding = asRouteBinding(input.binding);
      const route = await runtimeClient.route.resolve({
        capability: input.capability || 'text.generate',
        binding,
      });
      const result = await runtimeClient.ai.text.generate({
        input: input.prompt,
        system: input.systemPrompt,
        binding,
        model: route.model || undefined,
      });
      const traceId = String(result.trace?.traceId || '').trim();
      return {
        text: String(result.text || ''),
        promptTraceId: traceId,
        route: {
          source: route.source,
          connectorId: route.connectorId,
          model: route.model,
          provider: route.provider,
          endpoint: String(route.endpoint || route.localProviderEndpoint || route.localOpenAiEndpoint || '').trim(),
          localProviderEndpoint: route.localProviderEndpoint,
          localOpenAiEndpoint: route.localOpenAiEndpoint,
        },
      };
    },
  };
}
