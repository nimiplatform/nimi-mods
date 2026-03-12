import { KB_DATA_API_DOCUMENTS_LIST, KB_DATA_API_DOCUMENTS_IMPORT, KB_DATA_API_DOCUMENTS_DELETE, KB_DATA_API_SEARCH, KB_DATA_API_CONVERSATIONS_LIST, KB_DATA_API_CONVERSATIONS_GET, KB_DATA_API_CONVERSATIONS_UPSERT, KB_DATA_API_CONVERSATIONS_DELETE, } from '../contracts.js';
import { createKBFlowId, emitKBLog } from '../logging.js';
import { useKnowledgeBaseStore } from '../state/knowledge-base-store.js';
import { type HookClient } from "@nimiplatform/sdk/mod";
/**
 * Register all 8 data-api capabilities for cross-mod consumption.
 * The search capability is the primary integration point for local-chat.
 */
export async function registerKBDataCapabilities(input: {
    hookClient: HookClient;
}): Promise<void> {
    const { hookClient } = input;
    const flowId = createKBFlowId('data-registrar');
    emitKBLog({
        level: 'debug',
        message: 'action:data-registrar:init',
        flowId,
        source: 'registerKBDataCapabilities',
    });
    // §6.1 documents.list
    await hookClient.data.register({
        capability: KB_DATA_API_DOCUMENTS_LIST,
        handler: async () => {
            const store = useKnowledgeBaseStore.getState();
            return store.documents;
        },
    });
    // §6.2 documents.import — handled by controller, stub here for capability registration
    await hookClient.data.register({
        capability: KB_DATA_API_DOCUMENTS_IMPORT,
        handler: async () => {
            return { error: 'Import must be triggered via UI' };
        },
    });
    // §6.3 documents.delete
    await hookClient.data.register({
        capability: KB_DATA_API_DOCUMENTS_DELETE,
        handler: async (query) => {
            const { documentId } = (query as {
                documentId?: string;
            }) ?? {};
            if (!documentId)
                return { error: 'documentId required' };
            const store = useKnowledgeBaseStore.getState();
            await store.removeDocument(documentId);
            return { ok: true };
        },
    });
    // §6.4 search — primary cross-mod integration point
    await hookClient.data.register({
        capability: KB_DATA_API_SEARCH,
        handler: async (query) => {
            const params = (query ?? {}) as {
                query?: string;
                topK?: number;
                documentIds?: string[];
                threshold?: number;
            };
            if (!params.query)
                return { chunks: [] };
            const store = useKnowledgeBaseStore.getState();
            // This is a simplified search path for cross-mod consumers
            // The full RAG pipeline is used internally by the chat controller
            const results = store.vectorStore.search([], // Cross-mod consumers need to provide embedding externally
            params.topK ?? store.settings.topK, params.threshold ?? store.settings.similarityThreshold, params.documentIds);
            const chunks = results.map((r) => {
                const chunk = store.chunkMap.get(r.chunkId);
                const doc = store.documents.find((d) => d.id === r.documentId);
                return {
                    ...chunk,
                    score: r.score,
                    documentTitle: doc?.title ?? '',
                };
            }).filter((c) => c.id);
            return { chunks };
        },
    });
    // §6.5 conversations.list
    await hookClient.data.register({
        capability: KB_DATA_API_CONVERSATIONS_LIST,
        handler: async () => {
            const store = useKnowledgeBaseStore.getState();
            return store.conversations.map((c) => ({
                id: c.id,
                title: c.title,
                createdAt: c.createdAt,
                updatedAt: c.updatedAt,
            }));
        },
    });
    // §6.6 conversations.get
    await hookClient.data.register({
        capability: KB_DATA_API_CONVERSATIONS_GET,
        handler: async (query) => {
            const { conversationId } = (query ?? {}) as {
                conversationId?: string;
            };
            if (!conversationId)
                return { error: 'conversationId required' };
            const store = useKnowledgeBaseStore.getState();
            const conv = store.conversations.find((c) => c.id === conversationId);
            return conv ?? { error: 'not found' };
        },
    });
    // §6.7 conversations.upsert
    await hookClient.data.register({
        capability: KB_DATA_API_CONVERSATIONS_UPSERT,
        handler: async (query) => {
            const { conversation } = (query ?? {}) as {
                conversation?: Record<string, unknown>;
            };
            if (!conversation)
                return { error: 'conversation required' };
            const store = useKnowledgeBaseStore.getState();
            await store.updateConversation(conversation as any);
            return { ok: true };
        },
    });
    // §6.8 conversations.delete
    await hookClient.data.register({
        capability: KB_DATA_API_CONVERSATIONS_DELETE,
        handler: async (query) => {
            const { conversationId } = (query ?? {}) as {
                conversationId?: string;
            };
            if (!conversationId)
                return { error: 'conversationId required' };
            const store = useKnowledgeBaseStore.getState();
            await store.removeConversation(conversationId);
            return { ok: true };
        },
    });
    emitKBLog({
        level: 'info',
        message: 'action:data-registrar:done',
        flowId,
        source: 'registerKBDataCapabilities',
    });
}
