// ---------------------------------------------------------------------------
// Client factory hook — creates and memoizes SDK clients + adapters
// ---------------------------------------------------------------------------

import { useMemo } from 'react';
import { createAiClient, type ModAiClient } from '@nimiplatform/sdk/mod/ai';
import { createHookClient } from '@nimiplatform/sdk/mod/hook';
import { AUDIO_BOOK_MOD_ID } from '../contracts.js';
import { createLlmClientAdapter, type LlmRouteOverride } from '../adapters/llm-adapter.js';
import { createTtsClientAdapter } from '../adapters/tts-adapter.js';
import type { RouteSelection } from './use-tts-route.js';

/** Stable singleton hook client — call this once at the top of the component tree. */
export function useHookClient() {
  return useMemo(() => createHookClient(AUDIO_BOOK_MOD_ID), []);
}

/** Stable singleton AI client — call once, pass to useTtsRoute + useAudioBookClients. */
export function useAiClient() {
  return useMemo(() => createAiClient(AUDIO_BOOK_MOD_ID), []);
}

/**
 * AI clients — rebuilds llmClient when chatSelection changes.
 * hookClient + aiClient must be passed in (created via hooks above).
 */
export function useAudioBookClients(
  hookClient: ReturnType<typeof createHookClient>,
  aiClient: ModAiClient,
  chatSelection?: RouteSelection,
) {
  // Build routeOverride from chat connector selection
  const chatRouteOverride: LlmRouteOverride | undefined = chatSelection?.connectorId
    ? {
      source: chatSelection.routeSource as 'token-api',
      connectorId: chatSelection.connectorId,
      ...(String(chatSelection.model || '').trim() ? { model: String(chatSelection.model || '').trim() } : {}),
    }
    : undefined;

  // Rebuild llmClient when chat connector changes
  const llmClient = useMemo(
    () => createLlmClientAdapter(aiClient, chatRouteOverride),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [aiClient, chatSelection?.connectorId, chatSelection?.routeSource, chatSelection?.model],
  );

  const ttsClient = useMemo(() => createTtsClientAdapter(hookClient.llm.speech), [hookClient]);

  return { hookClient, aiClient, llmClient, ttsClient };
}
