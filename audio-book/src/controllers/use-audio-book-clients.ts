// ---------------------------------------------------------------------------
// Client factory hook — creates and memoizes SDK clients + adapters
// ---------------------------------------------------------------------------

import { useMemo } from 'react';
import { createHookClient } from '@nimiplatform/sdk/mod/hook';
import { createModRuntimeClient, type ModRuntimeClient } from '@nimiplatform/sdk/mod/runtime';
import type { RuntimeRouteBinding } from '@nimiplatform/sdk/mod/runtime-route';
import { AUDIO_BOOK_MOD_ID } from '../contracts.js';
import { createLlmClientAdapter } from '../adapters/llm-adapter.js';
import { createTtsClientAdapter } from '../adapters/tts-adapter.js';
import type { RouteSelection } from './use-tts-route.js';

/** Stable singleton hook client — call this once at the top of the component tree. */
export function useHookClient() {
  return useMemo(() => createHookClient(AUDIO_BOOK_MOD_ID), []);
}

/** Stable singleton runtime client — call once, pass to route + service hooks. */
export function useRuntimeClient() {
  return useMemo(() => createModRuntimeClient(AUDIO_BOOK_MOD_ID), []);
}

function toBinding(selection?: RouteSelection): RuntimeRouteBinding | undefined {
  if (!selection) return undefined;
  const source = selection.routeSource === 'token-api' || selection.routeSource === 'local-runtime'
    ? selection.routeSource
    : undefined;
  const connectorId = String(selection.connectorId || '').trim();
  const model = String(selection.model || '').trim();
  if (!source && !connectorId && !model) {
    return undefined;
  }
  return {
    source: source || 'token-api',
    connectorId,
    model,
  };
}

/**
 * AI clients — rebuilds llmClient when chatSelection changes.
 * hookClient + aiClient must be passed in (created via hooks above).
 */
export function useAudioBookClients(
  hookClient: ReturnType<typeof createHookClient>,
  runtimeClient: ModRuntimeClient,
  chatSelection?: RouteSelection,
  ttsSelection?: RouteSelection,
) {
  const chatBinding = toBinding(chatSelection);
  const ttsBinding = toBinding(ttsSelection);

  const llmClient = useMemo(
    () => createLlmClientAdapter(runtimeClient, chatBinding),
    [runtimeClient, chatBinding?.connectorId, chatBinding?.model, chatBinding?.source],
  );
  const ttsClient = useMemo(
    () => createTtsClientAdapter(runtimeClient, ttsBinding),
    [runtimeClient, ttsBinding?.connectorId, ttsBinding?.model, ttsBinding?.source],
  );

  return { hookClient, runtimeClient, llmClient, ttsClient };
}
