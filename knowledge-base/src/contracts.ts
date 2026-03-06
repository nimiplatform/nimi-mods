export const KB_CONTRACT_VERSION = '2026-03-03';

export const KB_MOD_ID = 'world.nimi.knowledge-base';
export const KB_TAB_ID = 'mod:knowledge-base';

export const KB_NAV_SLOT = 'ui-extension.app.sidebar.mods';
export const KB_ROUTE_SLOT = 'ui-extension.app.content.routes';

// ---------------------------------------------------------------------------
// Data-API capability keys
// ---------------------------------------------------------------------------

export const KB_DATA_API_DOCUMENTS_LIST = 'data-api.knowledge-base.documents.list';
export const KB_DATA_API_DOCUMENTS_IMPORT = 'data-api.knowledge-base.documents.import';
export const KB_DATA_API_DOCUMENTS_DELETE = 'data-api.knowledge-base.documents.delete';
export const KB_DATA_API_SEARCH = 'data-api.knowledge-base.search';
export const KB_DATA_API_CONVERSATIONS_LIST = 'data-api.knowledge-base.conversations.list';
export const KB_DATA_API_CONVERSATIONS_GET = 'data-api.knowledge-base.conversations.get';
export const KB_DATA_API_CONVERSATIONS_UPSERT = 'data-api.knowledge-base.conversations.upsert';
export const KB_DATA_API_CONVERSATIONS_DELETE = 'data-api.knowledge-base.conversations.delete';
// ---------------------------------------------------------------------------
// Full capability list (22 keys, per SSOT §5.2)
// ---------------------------------------------------------------------------

export const KB_CAPABILITIES = [
  // AI
  'runtime.ai.text.generate',
  'runtime.ai.text.stream',
  'runtime.ai.embedding.generate',
  'runtime.route.list.options',
  // Data register + query pairs
  `data.register.${KB_DATA_API_DOCUMENTS_LIST}`,
  `data.query.${KB_DATA_API_DOCUMENTS_LIST}`,
  `data.register.${KB_DATA_API_DOCUMENTS_IMPORT}`,
  `data.query.${KB_DATA_API_DOCUMENTS_IMPORT}`,
  `data.register.${KB_DATA_API_DOCUMENTS_DELETE}`,
  `data.query.${KB_DATA_API_DOCUMENTS_DELETE}`,
  `data.register.${KB_DATA_API_SEARCH}`,
  `data.query.${KB_DATA_API_SEARCH}`,
  `data.register.${KB_DATA_API_CONVERSATIONS_LIST}`,
  `data.query.${KB_DATA_API_CONVERSATIONS_LIST}`,
  `data.register.${KB_DATA_API_CONVERSATIONS_GET}`,
  `data.query.${KB_DATA_API_CONVERSATIONS_GET}`,
  `data.register.${KB_DATA_API_CONVERSATIONS_UPSERT}`,
  `data.query.${KB_DATA_API_CONVERSATIONS_UPSERT}`,
  `data.register.${KB_DATA_API_CONVERSATIONS_DELETE}`,
  `data.query.${KB_DATA_API_CONVERSATIONS_DELETE}`,
  // UI
  `ui.register.${KB_NAV_SLOT}`,
  `ui.register.${KB_ROUTE_SLOT}`,
] as const;

export const KB_PERMISSIONS = [...KB_CAPABILITIES] as const;

// ---------------------------------------------------------------------------
// Error / reason codes (SSOT §11.2)
// ---------------------------------------------------------------------------

export const KB_ERROR_CODES = {
  FORMAT_UNSUPPORTED: 'KB_FORMAT_UNSUPPORTED',
  PARSING_FAILED: 'KB_PARSING_FAILED',
  CHUNKING_FAILED: 'KB_CHUNKING_FAILED',
  EMBEDDING_FAILED: 'KB_EMBEDDING_FAILED',
  EMBEDDING_ROUTE_UNAVAILABLE: 'KB_EMBEDDING_ROUTE_UNAVAILABLE',
  SEARCH_EMPTY: 'KB_SEARCH_EMPTY',
  SEARCH_FAILED: 'KB_SEARCH_FAILED',
  AI_GENERATE_FAILED: 'KB_AI_GENERATE_FAILED',
  QUERY_REWRITE_FAILED: 'KB_QUERY_REWRITE_FAILED',
  STORAGE_QUOTA_EXCEEDED: 'KB_STORAGE_QUOTA_EXCEEDED',
  DOCUMENT_NOT_FOUND: 'KB_DOCUMENT_NOT_FOUND',
  CONVERSATION_NOT_FOUND: 'KB_CONVERSATION_NOT_FOUND',
} as const;

export type KBErrorCode = typeof KB_ERROR_CODES[keyof typeof KB_ERROR_CODES];
