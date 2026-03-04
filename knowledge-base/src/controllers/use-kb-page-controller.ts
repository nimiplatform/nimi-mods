// ---------------------------------------------------------------------------
// Top-level page controller — orchestrates clients, store, UI state
// ---------------------------------------------------------------------------

import { useEffect } from 'react';
import { useHookClient, useAiClient, useKBClients } from './use-kb-clients.js';
import { useKBUiState } from './use-kb-ui-state.js';
import { useDocumentActions } from './use-document-actions.js';
import { useChatActions } from './use-chat-actions.js';
import { useKnowledgeBaseStore } from '../state/knowledge-base-store.js';

export function useKBPageController() {
  const hookClient = useHookClient();
  const aiClient = useAiClient();
  const store = useKnowledgeBaseStore();
  const {
    llmClient,
    embeddingClient,
    chatRouteOptions,
    embeddingRouteOptions,
    refreshRouteOptions,
  } = useKBClients(aiClient, hookClient, store.settings);
  const ui = useKBUiState();

  // Initialize store on mount
  useEffect(() => {
    store.init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const documentActions = useDocumentActions({
    embeddingClient,
    ui,
  });

  const chatActions = useChatActions({
    llmClient,
    embeddingClient,
    ui,
  });

  return {
    store,
    ui,
    hookClient,
    aiClient,
    llmClient,
    embeddingClient,
    chatRouteOptions,
    embeddingRouteOptions,
    refreshRouteOptions,
    documentActions,
    chatActions,
  };
}

export type KBPageController = ReturnType<typeof useKBPageController>;
