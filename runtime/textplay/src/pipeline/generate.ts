import { TEXTPLAY_REASON } from '../contracts.js';
import { TextplayPipelineError } from './error.js';
import type { TextplayGenerateResult } from './types.js';

export async function generateTextplayOutput(input: {
  aiClient: {
    generateText: (input: {
      capability: 'text.generate';
      binding?: Record<string, unknown>;
      prompt: string;
      mode: 'SCENE_TURN';
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
  worldId: string;
  prompt: string;
  binding?: Record<string, unknown>;
  abortSignal?: AbortSignal;
}): Promise<TextplayGenerateResult> {
  const response = await input.aiClient.generateText({
    capability: 'text.generate',
    binding: input.binding,
    prompt: input.prompt,
    mode: 'SCENE_TURN',
    worldId: input.worldId,
    abortSignal: input.abortSignal,
  }).catch((error) => {
    throw new TextplayPipelineError({
      reasonCode: TEXTPLAY_REASON.RENDER_EMPTY_RESPONSE,
      actionHint: 'Tighten output floor or change model route.',
      message: error instanceof Error ? error.message : String(error || ''),
      stage: 'generate',
      retryClass: 'retryable',
    });
  });

  const text = String(response.text || '').trim();
  if (!text) {
    throw new TextplayPipelineError({
      reasonCode: TEXTPLAY_REASON.RENDER_EMPTY_RESPONSE,
      actionHint: 'Tighten output floor or change model route.',
      message: 'TEXTPLAY_GENERATE_EMPTY_TEXT',
      stage: 'generate',
      retryClass: 'retryable',
    });
  }

  const route = {
    source: String(response.route.source || ''),
    connectorId: String(response.route.connectorId || ''),
    model: String(response.route.model || ''),
    provider: String(response.route.provider || ''),
    endpoint: String(
      response.route.endpoint
      || response.route.localProviderEndpoint
      || response.route.localOpenAiEndpoint
      || '',
    ),
  };

  return {
    text,
    promptTraceId: String(response.promptTraceId || ''),
    route,
  };
}
