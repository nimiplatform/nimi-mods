// ---------------------------------------------------------------------------
// Top-level page controller — orchestrates clients, store, UI state
// ---------------------------------------------------------------------------

import { useEffect } from 'react';
import { useHookClient, useRuntimeClient, useKBClients } from './use-kb-clients.js';
import { useKBUiState } from './use-kb-ui-state.js';
import { useDocumentActions } from './use-document-actions.js';
import { useChatActions } from './use-chat-actions.js';
import { useKnowledgeBaseStore } from '../state/knowledge-base-store.js';

export function useKBPageController() {
  const hookClient = useHookClient();
  const runtimeClient = useRuntimeClient();
  const store = useKnowledgeBaseStore();
  const {
    aiConfig,
    chatBinding,
    embeddingBinding,
    chatRouteSelection,
    embeddingRouteSelection,
    setChatRouteSelection,
    setEmbeddingRouteSelection,
    llmClient,
    embeddingClient,
    chatRouteOptions,
    embeddingRouteOptions,
    refreshRouteOptions,
  } = useKBClients(runtimeClient);
  const ui = useKBUiState();

  // Initialize store on mount
  useEffect(() => {
    store.init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const documentActions = useDocumentActions({
    embeddingClient,
    chatBinding,
    embeddingBinding,
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
    runtimeClient,
    aiConfig,
    chatBinding,
    embeddingBinding,
    chatRouteSelection,
    embeddingRouteSelection,
    setChatRouteSelection,
    setEmbeddingRouteSelection,
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
