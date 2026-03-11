// ---------------------------------------------------------------------------
// Chat actions — send message, create/delete conversation
// ---------------------------------------------------------------------------

import { useCallback } from 'react';
import type { KBConversation, KBTurn, LlmClient, EmbeddingClient } from '../types.js';
import { useKnowledgeBaseStore } from '../state/knowledge-base-store.js';
import { runRagPipeline } from '../services/rag-pipeline.js';
import type { KBUiState } from './use-kb-ui-state.js';

function generateId(): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `kb_${t}${r}`;
}

export function useChatActions(input: {
  llmClient: LlmClient;
  embeddingClient: EmbeddingClient;
  ui: KBUiState;
}) {
  const { llmClient, embeddingClient, ui } = input;
  const store = useKnowledgeBaseStore();

  const createConversation = useCallback(async (title?: string) => {
    const now = new Date().toISOString();
    const conv: KBConversation = {
      id: generateId(),
      title: title || 'New conversation',
      turns: [],
      createdAt: now,
      updatedAt: now,
    };
    await store.createConversation(conv);
    return conv;
  }, [store]);

  const deleteConversation = useCallback(async (convId: string) => {
    await store.removeConversation(convId);
  }, [store]);

  const sendMessage = useCallback(async (query: string) => {
    if (!query.trim()) return;
    if (ui.isSending) return;

    ui.setIsSending(true);
    ui.clearError();
    ui.clearStreamingText();

    try {
      // Ensure we have an active conversation
      let conv = store.activeConversation;
      if (!conv) {
        const newConv = await createConversation(query.slice(0, 50));
        conv = newConv;
      }

      const convId = conv.id;

      // Add user turn
      const userTurn: KBTurn = {
        id: generateId(),
        role: 'user',
        content: query,
        citations: [],
        retrievedChunkIds: [],
        timestamp: new Date().toISOString(),
      };
      await store.addTurnToConversation(convId, userTurn);

      // Add placeholder assistant turn
      const assistantTurn: KBTurn = {
        id: generateId(),
        role: 'assistant',
        content: '',
        citations: [],
        retrievedChunkIds: [],
        timestamp: new Date().toISOString(),
      };
      await store.addTurnToConversation(convId, assistantTurn);

      // Build document lookup maps
      const documents = new Map(store.documents.map((d) => [d.id, d]));

      // Get recent turns for context (read latest state, not stale closure)
      const freshConv = useKnowledgeBaseStore.getState().activeConversation;
      const recentTurns = freshConv?.turns.slice(0, -1) ?? []; // Exclude the empty assistant turn

      // Run RAG pipeline
      for await (const event of runRagPipeline({
        query,
        recentTurns,
        settings: store.settings,
        llmClient,
        embeddingClient,
        vectorStore: store.vectorStore,
        chunks: store.chunkMap,
        documents,
        scopeDocumentIds: conv.scopeDocumentIds,
      })) {
        if (event.type === 'text_delta') {
          ui.appendStreamingText(event.textDelta);
        } else if (event.type === 'done') {
          store.updateLastAssistantTurn(convId, {
            content: event.fullText,
            citations: event.citations,
            retrievedChunkIds: event.retrievedChunkIds,
          });
          ui.clearStreamingText();
        } else if (event.type === 'search_complete' && event.rewrittenQuery) {
          store.updateLastAssistantTurn(convId, {
            rewrittenQuery: event.rewrittenQuery,
          });
        }
      }

      // Update conversation title from first query if it was auto-generated
      if (conv.turns.length === 0) {
        const latestConv = useKnowledgeBaseStore.getState().activeConversation;
        if (latestConv && latestConv.id === convId) {
          store.updateConversation({
            ...latestConv,
            title: query.slice(0, 50),
            updatedAt: new Date().toISOString(),
          });
        }
      }
    } catch (err) {
      ui.setError(err instanceof Error ? err.message : 'Failed to generate response');
    } finally {
      ui.setIsSending(false);
    }
  }, [llmClient, embeddingClient, store, ui, createConversation]);

  return {
    createConversation,
    deleteConversation,
    sendMessage,
  };
}
