// ---------------------------------------------------------------------------
// Zustand store for Knowledge Base state
// ---------------------------------------------------------------------------

import { create } from 'zustand';
import type {
  KBDocument,
  KBDocumentStatus,
  KBChunk,
  KBVector,
  KBConversation,
  KBTurn,
  KBSettings,
  KBViewTab,
} from '../types.js';
import { DEFAULT_KB_SETTINGS } from '../types.js';
import {
  dbListDocuments,
  dbPutDocument,
  dbDeleteDocument,
  dbGetAllChunks,
  dbGetAllVectors,
  dbPutChunks,
  dbPutVectors,
  dbListConversations,
  dbGetConversation,
  dbPutConversation,
  dbDeleteConversation,
  dbGetSettings,
  dbPutSettings,
} from './indexed-db.js';
import { VectorStore } from '../services/vector-store.js';
import { createKBFlowId, emitKBLog } from '../logging.js';

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

type KnowledgeBaseStore = {
  // Initialization
  initialized: boolean;
  init: () => Promise<void>;

  // Documents
  documents: KBDocument[];
  loadDocuments: () => Promise<void>;
  addDocument: (doc: KBDocument) => void;
  updateDocumentStatus: (docId: string, status: KBDocumentStatus, errorReason?: string) => void;
  updateDocument: (docId: string, patch: Partial<KBDocument>) => void;
  removeDocument: (docId: string) => Promise<void>;
  persistDocument: (doc: KBDocument) => Promise<void>;

  // Chunks (in-memory map for fast lookup)
  chunkMap: Map<string, KBChunk>;
  addChunks: (chunks: KBChunk[]) => Promise<void>;

  // Vectors (managed by VectorStore singleton)
  vectorStore: VectorStore;
  addVectors: (vectors: KBVector[]) => Promise<void>;
  vectorCount: number;

  // Conversations
  conversations: KBConversation[];
  activeConversationId: string | null;
  activeConversation: KBConversation | null;
  loadConversations: () => Promise<void>;
  openConversation: (id: string) => Promise<void>;
  createConversation: (conv: KBConversation) => Promise<void>;
  updateConversation: (conv: KBConversation) => Promise<void>;
  removeConversation: (id: string) => Promise<void>;
  addTurnToConversation: (convId: string, turn: KBTurn) => Promise<void>;
  updateLastAssistantTurn: (convId: string, patch: Partial<KBTurn>) => void;

  // Settings
  settings: KBSettings;
  updateSettings: (patch: Partial<KBSettings>) => Promise<void>;

  // View routing
  activeTab: KBViewTab;
  setActiveTab: (tab: KBViewTab) => void;
};

function normalizeSettings(settings: Partial<KBSettings> | null | undefined): KBSettings {
  const merged: KBSettings = {
    ...DEFAULT_KB_SETTINGS,
    ...(settings ?? {}),
  };
  if (
    merged.chatRouteSource !== 'auto'
    && merged.chatRouteSource !== 'cloud'
    && merged.chatRouteSource !== 'local'
  ) {
    merged.chatRouteSource = DEFAULT_KB_SETTINGS.chatRouteSource;
  }
  if (
    merged.embeddingRouteSource !== 'auto'
    && merged.embeddingRouteSource !== 'cloud'
    && merged.embeddingRouteSource !== 'local'
  ) {
    merged.embeddingRouteSource = DEFAULT_KB_SETTINGS.embeddingRouteSource;
  }
  return merged;
}

export const useKnowledgeBaseStore = create<KnowledgeBaseStore>((set, get) => ({
  initialized: false,
  documents: [],
  chunkMap: new Map(),
  vectorStore: new VectorStore(),
  vectorCount: 0,
  conversations: [],
  activeConversationId: null,
  activeConversation: null,
  settings: DEFAULT_KB_SETTINGS,
  activeTab: 'documents',

  async init() {
    if (get().initialized) return;

    // Load documents
    const documents = await dbListDocuments();
    documents.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    // Load all chunks into memory
    const allChunks = await dbGetAllChunks();
    const chunkMap = new Map<string, KBChunk>();
    for (const c of allChunks) {
      chunkMap.set(c.id, c);
    }

    // Load all vectors into memory
    const allVectors = await dbGetAllVectors();
    const vectorStore = new VectorStore();
    vectorStore.loadAll(allVectors);

    // Load conversations (without turns for list view)
    const conversations = await dbListConversations();
    conversations.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    // Load settings
    const savedSettings = await dbGetSettings();
    const settings = normalizeSettings(savedSettings);

    set({
      initialized: true,
      documents,
      chunkMap,
      vectorStore,
      vectorCount: vectorStore.size,
      conversations,
      settings,
    });
  },

  async loadDocuments() {
    const documents = await dbListDocuments();
    documents.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    set({ documents });
  },

  addDocument(doc) {
    set((s) => ({ documents: [doc, ...s.documents] }));
  },

  updateDocumentStatus(docId, status, errorReason) {
    set((s) => ({
      documents: s.documents.map((d) =>
        d.id === docId
          ? { ...d, status, errorReason, updatedAt: new Date().toISOString() }
          : d,
      ),
    }));
    // Persist to host sqlite-backed mod storage
    const doc = get().documents.find((d) => d.id === docId);
    if (doc) dbPutDocument(doc);
  },

  updateDocument(docId, patch) {
    set((s) => ({
      documents: s.documents.map((d) =>
        d.id === docId
          ? { ...d, ...patch, updatedAt: new Date().toISOString() }
          : d,
      ),
    }));
    const doc = get().documents.find((d) => d.id === docId);
    if (doc) dbPutDocument(doc);
  },

  async removeDocument(docId) {
    await dbDeleteDocument(docId);
    const vs = get().vectorStore;
    vs.removeByDocumentId(docId);
    set((s) => {
      const newChunkMap = new Map(s.chunkMap);
      for (const [id, chunk] of newChunkMap) {
        if (chunk.documentId === docId) newChunkMap.delete(id);
      }
      return {
        documents: s.documents.filter((d) => d.id !== docId),
        chunkMap: newChunkMap,
        vectorCount: vs.size,
      };
    });
  },

  async persistDocument(doc) {
    await dbPutDocument(doc);
  },

  async addChunks(chunks) {
    await dbPutChunks(chunks);
    set((s) => {
      const newMap = new Map(s.chunkMap);
      for (const c of chunks) {
        newMap.set(c.id, c);
      }
      return { chunkMap: newMap };
    });
  },

  async addVectors(vectors) {
    await dbPutVectors(vectors);
    const vs = get().vectorStore;
    vs.addBatch(vectors);
    set({ vectorCount: vs.size });
  },

  async loadConversations() {
    const conversations = await dbListConversations();
    conversations.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    set({ conversations });
  },

  async openConversation(id) {
    const conv = await dbGetConversation(id);
    if (!conv) return;
    set({ activeConversationId: id, activeConversation: conv });
  },

  async createConversation(conv) {
    await dbPutConversation(conv);
    set((s) => ({
      conversations: [conv, ...s.conversations],
      activeConversationId: conv.id,
      activeConversation: conv,
    }));
  },

  async updateConversation(conv) {
    await dbPutConversation(conv);
    set((s) => ({
      conversations: s.conversations.map((c) => (c.id === conv.id ? conv : c)),
      activeConversation: s.activeConversationId === conv.id ? conv : s.activeConversation,
    }));
  },

  async removeConversation(id) {
    await dbDeleteConversation(id);
    set((s) => ({
      conversations: s.conversations.filter((c) => c.id !== id),
      activeConversationId: s.activeConversationId === id ? null : s.activeConversationId,
      activeConversation: s.activeConversationId === id ? null : s.activeConversation,
    }));
  },

  async addTurnToConversation(convId, turn) {
    const conv = get().activeConversation;
    if (!conv || conv.id !== convId) return;
    const updated: KBConversation = {
      ...conv,
      turns: [...conv.turns, turn],
      updatedAt: new Date().toISOString(),
    };
    await dbPutConversation(updated);
    set((s) => ({
      activeConversation: updated,
      conversations: s.conversations.map((c) => (c.id === convId ? { ...c, updatedAt: updated.updatedAt } : c)),
    }));
  },

  updateLastAssistantTurn(convId, patch) {
    const conv = get().activeConversation;
    if (!conv || conv.id !== convId) return;
    const turns = [...conv.turns];
    const lastIdx = turns.length - 1;
    if (lastIdx >= 0 && turns[lastIdx]!.role === 'assistant') {
      turns[lastIdx] = { ...turns[lastIdx]!, ...patch };
    }
    const updated: KBConversation = { ...conv, turns, updatedAt: new Date().toISOString() };
    set((s) => ({
      activeConversation: updated,
      conversations: s.conversations.map((c) => (c.id === convId ? { ...c, updatedAt: updated.updatedAt } : c)),
    }));
    // Persist async
    dbPutConversation(updated);
  },

  async updateSettings(patch) {
    const current = get().settings;
    const updated = normalizeSettings({ ...current, ...patch });
    const flowId = createKBFlowId('settings-update');
    set({ settings: updated });
    emitKBLog({
      level: 'info',
      message: 'settings:update:applied',
      flowId,
      source: 'useKnowledgeBaseStore.updateSettings',
      details: {
        patch,
        updatedChatRouteSource: updated.chatRouteSource,
        updatedChatConnectorId: updated.chatConnectorId || null,
        updatedChatModel: updated.chatModel || null,
        updatedEmbeddingRouteSource: updated.embeddingRouteSource,
        updatedEmbeddingConnectorId: updated.embeddingConnectorId || null,
        updatedEmbeddingModel: updated.embeddingModel || null,
      },
    });
    try {
      await dbPutSettings(updated);
    } catch (error) {
      emitKBLog({
        level: 'error',
        message: 'settings:update:persist-failed',
        flowId,
        source: 'useKnowledgeBaseStore.updateSettings',
        details: {
          error: error instanceof Error ? error.message : String(error || ''),
        },
      });
    }
  },

  setActiveTab(tab) {
    set({ activeTab: tab });
  },
}));
