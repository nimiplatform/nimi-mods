// ---------------------------------------------------------------------------
// Knowledge Base domain types (SSOT §2)
// ---------------------------------------------------------------------------

/** Document processing state machine: pending → parsing → chunking → embedding → ready | error */
export type KBDocumentStatus = 'pending' | 'parsing' | 'chunking' | 'embedding' | 'ready' | 'error';

/** Source kind for document import */
export type KBSourceKind = 'file' | 'paste' | 'url';

/** SSOT §2.1 */
export type KBDocument = {
  id: string;
  title: string;
  sourceUri: string;
  sourceKind: KBSourceKind;
  mimeType: string;
  fileSize: number;
  status: KBDocumentStatus;
  chunkCount: number;
  tags: string[];
  errorReason?: string;
  createdAt: string;
  updatedAt: string;
};

/** SSOT §2.2 */
export type KBChunk = {
  id: string;
  documentId: string;
  text: string;
  chunkIndex: number;
  tokenCount: number;
  metadata: {
    heading?: string;
    pageNumber?: number;
    rowRange?: [number, number];
  };
};

/** SSOT §2.3 */
export type KBVector = {
  id: string;
  chunkId: string;
  documentId: string;
  embedding: Float32Array;
  model: string;
  dimensions: number;
};

/** SSOT §2.4 */
export type KBConversation = {
  id: string;
  title: string;
  turns: KBTurn[];
  scopeDocumentIds?: string[];
  createdAt: string;
  updatedAt: string;
};

/** SSOT §2.5 */
export type KBTurn = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: KBCitation[];
  rewrittenQuery?: string;
  retrievedChunkIds: string[];
  timestamp: string;
};

/** SSOT §2.6 */
export type KBCitation = {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  snippet: string;
  score: number;
  refIndex: number;
};

/** SSOT §2.7 */
export type KBSettings = {
  chunkSize: number;
  chunkOverlap: number;
  topK: number;
  similarityThreshold: number;
  chatRouteSource: 'auto' | 'local-runtime' | 'token-api';
  chatConnectorId: string;
  chatModel: string;
  embeddingRouteSource: 'auto' | 'local-runtime' | 'token-api';
  embeddingConnectorId: string;
  embeddingModel: string;
  maxContextChunks: number;
  queryRewritingEnabled: boolean;
};

export const DEFAULT_KB_SETTINGS: KBSettings = {
  chunkSize: 512,
  chunkOverlap: 64,
  topK: 5,
  similarityThreshold: 0.3,
  chatRouteSource: 'auto',
  chatConnectorId: '',
  chatModel: '',
  embeddingRouteSource: 'auto',
  embeddingConnectorId: '',
  embeddingModel: '',
  maxContextChunks: 8,
  queryRewritingEnabled: true,
};

// ---------------------------------------------------------------------------
// Service abstractions (injected via adapter pattern, not imported from SDK)
// ---------------------------------------------------------------------------

/** LLM text generation client */
export type LlmClient = {
  generateText(input: {
    routeHint?: string;
    systemPrompt: string;
    userPrompt: string;
    maxTokens?: number;
    temperature?: number;
  }): Promise<{ text: string }>;

  streamText(input: {
    routeHint?: string;
    systemPrompt: string;
    userPrompt: string;
    maxTokens?: number;
    temperature?: number;
  }): AsyncIterable<{ type: 'text_delta'; textDelta: string } | { type: 'done' }>;
};

/** Embedding generation client */
export type EmbeddingClient = {
  generateEmbedding(input: {
    texts: string[];
    routeHint?: string;
  }): Promise<{ embeddings: number[][] }>;
};

// ---------------------------------------------------------------------------
// Search result (used by data-api + internal)
// ---------------------------------------------------------------------------

export type KBSearchResult = {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  text: string;
  score: number;
  chunkIndex: number;
};

// ---------------------------------------------------------------------------
// View tab for Knowledge Base page routing
// ---------------------------------------------------------------------------

export type KBViewTab = 'documents' | 'chat' | 'settings';
