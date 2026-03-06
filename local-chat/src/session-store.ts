import type {
  ChatMessage,
  ChatMessageMeta,
  LocalChatCachedMediaAsset,
  LocalChatMediaArtifactShadow,
  LocalChatMediaGenerationSpec,
} from './types.js';
import type {
  LocalChatContextTrace,
  LocalChatConversationRecord,
  LocalChatDurableMemoryEntry,
  LocalChatPromptTrace,
  LocalChatRunningSummary,
  LocalChatSession,
  LocalChatSessionRecallDoc,
  LocalChatTurn,
  LocalChatTurnAudit,
  LocalChatTurnBundle,
  LocalChatTurnSegment,
} from './state/ledger-types.js';
import { createUlid } from './utils/ulid.js';

export type {
  LocalChatContextLaneId,
  LocalChatContextPacket,
  LocalChatContextTrace,
  LocalChatConversationRecord,
  LocalChatDurableMemoryEntry,
  LocalChatMemoryStatus,
  LocalChatMemoryType,
  LocalChatPlatformWarmStartMemory,
  LocalChatPromptTrace,
  LocalChatRunningSummary,
  LocalChatSession,
  LocalChatSessionRecallDoc,
  LocalChatTurn,
  LocalChatTurnAudit,
  LocalChatTurnBundle,
  LocalChatTurnSegment,
} from './state/ledger-types.js';

const LOCAL_CHAT_LEDGER_DB_NAME = 'nimi.local-chat.ledger.v1';
const LOCAL_CHAT_LEDGER_DB_VERSION = 2;
const LOCAL_CHAT_SESSION_UPDATED_EVENT = 'local-chat:session-updated';
const LEGACY_LOCAL_CHAT_SESSION_STORE_KEY = 'nimi.local-chat.sessions.v2';
const STORE_CONVERSATIONS = 'conversations';
const STORE_BUNDLES = 'bundles';
const STORE_RUNNING_SUMMARIES = 'runningSummaries';
const STORE_DURABLE_MEMORY = 'durableMemory';
const STORE_SESSION_RECALL_DOCS = 'sessionRecallDocs';
const STORE_MEDIA_CACHE = 'mediaCache';
const EXACT_HISTORY_BUNDLE_LIMIT = 8;

type StoreName =
  | typeof STORE_CONVERSATIONS
  | typeof STORE_BUNDLES
  | typeof STORE_RUNNING_SUMMARIES
  | typeof STORE_DURABLE_MEMORY
  | typeof STORE_SESSION_RECALL_DOCS
  | typeof STORE_MEDIA_CACHE;

type LedgerCache = {
  hydrated: boolean;
  conversationsById: Map<string, LocalChatConversationRecord>;
  bundlesById: Map<string, LocalChatTurnBundle>;
  runningSummariesByConversationId: Map<string, LocalChatRunningSummary>;
  durableMemoryById: Map<string, LocalChatDurableMemoryEntry>;
  sessionRecallDocsById: Map<string, LocalChatSessionRecallDoc>;
  mediaCacheByExecutionKey: Map<string, LocalChatCachedMediaAsset>;
};

type LedgerMutation = {
  puts?: Partial<Record<StoreName, unknown[]>>;
  deletes?: Partial<Record<StoreName, IDBValidKey[]>>;
};

export type LocalChatTargetPreview = {
  targetId: string;
  latestLocalMessage: string | null;
  latestLocalMessageAt: string | null;
};

type CreateConversationInput = {
  targetId: string;
  viewerId: string;
  worldId?: string | null;
  title?: string;
};

type UpsertConversationInput = Partial<LocalChatConversationRecord> & {
  id: string;
  targetId: string;
  viewerId: string;
};

type BundleInsertInput = {
  conversationId: string;
  role: 'user' | 'assistant';
  turnTxnId?: string | null;
  bundleId?: string;
  seq?: number;
};

type SegmentInsertInput = {
  conversationId: string;
  bundleId: string;
  role: 'user' | 'assistant';
  kind: LocalChatTurnSegment['kind'];
  content: string;
  contextText: string;
  semanticSummary?: string | null;
  media?: LocalChatTurnSegment['media'];
  timestamp?: string;
  latencyMs?: number;
  meta?: ChatMessageMeta;
  promptTrace?: LocalChatPromptTrace | null;
  audit?: LocalChatTurnAudit | null;
  deliveryStatus?: LocalChatTurnSegment['deliveryStatus'];
  segmentId?: string;
  mediaSpec?: LocalChatMediaGenerationSpec;
  mediaShadow?: LocalChatMediaArtifactShadow;
};

function nowIso(): string {
  return new Date().toISOString();
}

function emptyLedgerCache(): LedgerCache {
  return {
    hydrated: false,
    conversationsById: new Map(),
    bundlesById: new Map(),
    runningSummariesByConversationId: new Map(),
    durableMemoryById: new Map(),
    sessionRecallDocsById: new Map(),
    mediaCacheByExecutionKey: new Map(),
  };
}

let ledgerCache: LedgerCache = emptyLedgerCache();
let openDatabasePromise: Promise<IDBDatabase | null> | null = null;
let hydratePromise: Promise<void> | null = null;

function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('LOCAL_CHAT_LEDGER_IDB_REQUEST_FAILED'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('LOCAL_CHAT_LEDGER_IDB_TX_FAILED'));
    transaction.onabort = () => reject(transaction.error || new Error('LOCAL_CHAT_LEDGER_IDB_TX_ABORTED'));
  });
}

function trimString(value: unknown): string {
  return String(value || '').trim();
}

function matchesViewerId(recordViewerId: string, viewerId?: string): boolean {
  const normalizedViewerId = trimString(viewerId);
  if (!normalizedViewerId) return true;
  return trimString(recordViewerId) === normalizedViewerId;
}

function asIsoString(value: unknown, fallback: string): string {
  const normalized = trimString(value);
  return normalized || fallback;
}

function normalizeSegmentKind(value: unknown): LocalChatTurnSegment['kind'] {
  return value === 'voice' || value === 'image' || value === 'video' ? value : 'text';
}

function normalizeDeliveryStatus(value: unknown): LocalChatTurnSegment['deliveryStatus'] {
  return value === 'blocked' || value === 'failed' ? value : 'ready';
}

function normalizeSegmentMedia(value: unknown): LocalChatTurnSegment['media'] {
  if (!value || typeof value !== 'object') return undefined;
  const media = value as Record<string, unknown>;
  const normalized: LocalChatTurnSegment['media'] = {};
  const uri = trimString(media.uri);
  const mimeType = trimString(media.mimeType);
  const previewUri = trimString(media.previewUri);
  const width = Number(media.width);
  const height = Number(media.height);
  const durationSeconds = Number(media.durationSeconds);
  if (uri) normalized.uri = uri;
  if (mimeType) normalized.mimeType = mimeType;
  if (previewUri) normalized.previewUri = previewUri;
  if (Number.isFinite(width) && width > 0) normalized.width = Math.round(width);
  if (Number.isFinite(height) && height > 0) normalized.height = Math.round(height);
  if (Number.isFinite(durationSeconds) && durationSeconds > 0) normalized.durationSeconds = durationSeconds;
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeContextTrace(value: unknown): LocalChatContextTrace | undefined {
  if (!value || typeof value !== 'object') return undefined;
  return value as LocalChatContextTrace;
}

function normalizeMediaSpec(value: unknown): LocalChatMediaGenerationSpec | undefined {
  if (!value || typeof value !== 'object') return undefined;
  return value as LocalChatMediaGenerationSpec;
}

function normalizeMediaShadow(value: unknown): LocalChatMediaArtifactShadow | undefined {
  if (!value || typeof value !== 'object') return undefined;
  return value as LocalChatMediaArtifactShadow;
}

function normalizeCachedMediaAsset(value: unknown): LocalChatCachedMediaAsset | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const executionCacheKey = trimString(record.executionCacheKey);
  const specHash = trimString(record.specHash);
  const renderUri = trimString(record.renderUri);
  const mimeType = trimString(record.mimeType);
  if (!executionCacheKey || !specHash || !renderUri || !mimeType) {
    return null;
  }
  const createdAt = asIsoString(record.createdAt, nowIso());
  return {
    executionCacheKey,
    specHash,
    kind: record.kind === 'video' ? 'video' : 'image',
    renderUri,
    mimeType,
    routeSource: record.routeSource === 'token-api' ? 'token-api' : 'local-runtime',
    ...(trimString(record.connectorId) ? { connectorId: trimString(record.connectorId) } : {}),
    ...(trimString(record.model) ? { model: trimString(record.model) } : {}),
    createdAt,
    lastHitAt: asIsoString(record.lastHitAt, createdAt),
  };
}

function normalizeTurnAudit(value: unknown): LocalChatTurnAudit | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  return {
    id: trimString(record.id) || `audit_${createUlid()}`,
    targetId: trimString(record.targetId),
    worldId: trimString(record.worldId) || null,
    latencyMs: Number(record.latencyMs) || 0,
    error: trimString(record.error) || null,
    createdAt: asIsoString(record.createdAt, nowIso()),
  };
}

function normalizeConversationRecord(value: unknown): LocalChatConversationRecord | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const id = trimString(record.id);
  const targetId = trimString(record.targetId);
  const viewerId = trimString(record.viewerId);
  if (!id || !targetId || !viewerId) return null;
  const createdAt = asIsoString(record.createdAt, nowIso());
  return {
    id,
    targetId,
    viewerId,
    worldId: trimString(record.worldId) || null,
    title: trimString(record.title) || 'Session',
    createdAt,
    updatedAt: asIsoString(record.updatedAt, createdAt),
    lastBundleSeq: Number(record.lastBundleSeq) > 0 ? Math.floor(Number(record.lastBundleSeq)) : 0,
  };
}

function normalizeBundleRecord(value: unknown): LocalChatTurnBundle | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const id = trimString(record.id);
  const conversationId = trimString(record.conversationId);
  if (!id || !conversationId) return null;
  const role = record.role === 'assistant' ? 'assistant' : 'user';
  const createdAt = asIsoString(record.createdAt, nowIso());
  const segments = Array.isArray(record.segments)
    ? record.segments
      .map((segment) => normalizeSegmentRecord(segment))
      .filter((segment): segment is LocalChatTurnSegment => Boolean(segment))
    : [];
  return {
    id,
    conversationId,
    seq: Number(record.seq) > 0 ? Math.floor(Number(record.seq)) : 0,
    role,
    turnTxnId: trimString(record.turnTxnId) || null,
    createdAt,
    updatedAt: asIsoString(record.updatedAt, createdAt),
    segments,
  };
}

function normalizeSegmentRecord(value: unknown): LocalChatTurnSegment | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const id = trimString(record.id);
  const bundleId = trimString(record.bundleId);
  if (!id || !bundleId) return null;
  const role = record.role === 'assistant' ? 'assistant' : 'user';
  const timestamp = asIsoString(record.timestamp, nowIso());
  return {
    id,
    bundleId,
    role,
    kind: normalizeSegmentKind(record.kind),
    deliveryStatus: normalizeDeliveryStatus(record.deliveryStatus),
    content: String(record.content || ''),
    contextText: String(record.contextText || record.content || ''),
    semanticSummary: trimString(record.semanticSummary) || null,
    mediaSpec: normalizeMediaSpec(record.mediaSpec),
    mediaShadow: normalizeMediaShadow(record.mediaShadow),
    media: normalizeSegmentMedia(record.media),
    timestamp,
    latencyMs: Number.isFinite(Number(record.latencyMs)) ? Number(record.latencyMs) : undefined,
    meta: record.meta && typeof record.meta === 'object' ? record.meta as ChatMessageMeta : undefined,
    promptTrace: normalizeContextTrace(record.promptTrace),
    audit: normalizeTurnAudit(record.audit),
  };
}

function normalizeRunningSummary(value: unknown): LocalChatRunningSummary | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const conversationId = trimString(record.conversationId);
  if (!conversationId) return null;
  return {
    conversationId,
    relationshipState: normalizeTextList(record.relationshipState),
    userFactsEstablished: normalizeTextList(record.userFactsEstablished),
    assistantCommitments: normalizeTextList(record.assistantCommitments),
    openLoops: normalizeTextList(record.openLoops),
    sceneState: normalizeTextList(record.sceneState),
    updatedAt: asIsoString(record.updatedAt, nowIso()),
    lastSummarizedBundleSeq: Number(record.lastSummarizedBundleSeq) > 0
      ? Math.floor(Number(record.lastSummarizedBundleSeq))
      : 0,
  };
}

function normalizeSessionRecallDoc(value: unknown): LocalChatSessionRecallDoc | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const id = trimString(record.id);
  const conversationId = trimString(record.conversationId);
  if (!id || !conversationId) return null;
  const createdAt = asIsoString(record.createdAt, nowIso());
  return {
    id,
    conversationId,
    sourceKind: record.sourceKind === 'running-summary' ? 'running-summary' : 'bundle',
    sourceBundleSeq: Number.isFinite(Number(record.sourceBundleSeq))
      ? Math.floor(Number(record.sourceBundleSeq))
      : null,
    text: String(record.text || ''),
    createdAt,
    updatedAt: asIsoString(record.updatedAt, createdAt),
  };
}

function normalizeTextList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => trimString(item))
    .filter(Boolean);
}

function normalizeDurableMemoryEntry(value: unknown): LocalChatDurableMemoryEntry | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const id = trimString(record.id);
  const targetId = trimString(record.targetId);
  const viewerId = trimString(record.viewerId);
  const type = trimString(record.type) as LocalChatDurableMemoryEntry['type'];
  if (!id || !targetId || !viewerId || !type) return null;
  const createdAt = asIsoString(record.createdAt, nowIso());
  const subjectRaw = trimString(record.subject);
  const subject = subjectRaw === 'viewer' || subjectRaw === 'agent' ? subjectRaw : 'relationship';
  const statusRaw = trimString(record.status);
  const status = statusRaw === 'resolved' || statusRaw === 'superseded' ? statusRaw : 'active';
  return {
    id,
    targetId,
    viewerId,
    type,
    subject,
    slotKey: trimString(record.slotKey) || type,
    content: String(record.content || ''),
    confidence: Math.max(0, Math.min(1, Number(record.confidence) || 0)),
    importance: Math.max(0, Math.min(1, Number(record.importance) || 0)),
    status,
    sourceBundleSeqs: Array.isArray(record.sourceBundleSeqs)
      ? record.sourceBundleSeqs.map((item) => Math.floor(Number(item))).filter((item) => Number.isFinite(item) && item > 0)
      : [],
    supersedesIds: Array.isArray(record.supersedesIds)
      ? record.supersedesIds.map((item) => trimString(item)).filter(Boolean)
      : [],
    createdAt,
    updatedAt: asIsoString(record.updatedAt, createdAt),
  };
}

function sortBundles(bundles: LocalChatTurnBundle[]): LocalChatTurnBundle[] {
  return [...bundles].sort((left, right) => (
    left.seq - right.seq
    || left.createdAt.localeCompare(right.createdAt)
    || left.id.localeCompare(right.id)
  ));
}

function bundlesForConversation(conversationId: string): LocalChatTurnBundle[] {
  return sortBundles(
    [...ledgerCache.bundlesById.values()].filter((bundle) => bundle.conversationId === conversationId),
  );
}

function visibleSegments(bundle: LocalChatTurnBundle): LocalChatTurnSegment[] {
  return (bundle.segments || []).filter((segment) => (
    Boolean(segment)
    && segment.kind !== undefined
    && segment.deliveryStatus !== undefined
  ));
}

function latestVisibleSegment(bundle: LocalChatTurnBundle): LocalChatTurnSegment | null {
  for (let index = bundle.segments.length - 1; index >= 0; index -= 1) {
    const segment = bundle.segments[index];
    if (!segment) continue;
    if (segment.kind === undefined || segment.deliveryStatus === undefined) {
      continue;
    }
    return segment;
  }
  return null;
}

function projectSegmentToTurn(bundle: LocalChatTurnBundle, segment: LocalChatTurnSegment): LocalChatTurn {
  return {
    id: segment.id,
    role: segment.role,
    kind: segment.kind,
    content: segment.content,
    contextText: segment.contextText,
    semanticSummary: segment.semanticSummary,
    mediaSpec: segment.mediaSpec,
    mediaShadow: segment.mediaShadow,
    media: segment.media,
    timestamp: segment.timestamp,
    latencyMs: segment.latencyMs,
    meta: segment.meta,
    promptTrace: segment.promptTrace,
    audit: segment.audit,
    bundleId: bundle.id,
    bundleSeq: bundle.seq,
  };
}

function projectConversationToSession(record: LocalChatConversationRecord): LocalChatSession {
  const bundles = bundlesForConversation(record.id);
  const turns = bundles.flatMap((bundle) => visibleSegments(bundle).map((segment) => projectSegmentToTurn(bundle, segment)));
  const visibleBundleCount = bundles.filter((bundle) => visibleSegments(bundle).length > 0).length;
  return {
    id: record.id,
    targetId: record.targetId,
    viewerId: record.viewerId,
    worldId: record.worldId,
    title: record.title,
    turns,
    bundleCount: visibleBundleCount,
    messageCount: turns.length,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function latestTraceFromSession(session: LocalChatSession | null): LocalChatPromptTrace | null {
  if (!session) return null;
  for (let index = session.turns.length - 1; index >= 0; index -= 1) {
    const turn = session.turns[index];
    if (!turn || turn.role !== 'assistant') continue;
    if (turn.promptTrace) return turn.promptTrace;
  }
  return null;
}

function latestAuditFromSession(session: LocalChatSession | null): LocalChatTurnAudit | null {
  if (!session) return null;
  for (let index = session.turns.length - 1; index >= 0; index -= 1) {
    const turn = session.turns[index];
    if (!turn || turn.role !== 'assistant') continue;
    if (turn.audit) return turn.audit;
  }
  return null;
}

async function openLedgerDatabase(): Promise<IDBDatabase | null> {
  if (!isIndexedDbAvailable()) return null;
  if (openDatabasePromise) return openDatabasePromise;
  openDatabasePromise = new Promise<IDBDatabase | null>((resolve, reject) => {
    const request = indexedDB.open(LOCAL_CHAT_LEDGER_DB_NAME, LOCAL_CHAT_LEDGER_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_CONVERSATIONS)) {
        const store = database.createObjectStore(STORE_CONVERSATIONS, { keyPath: 'id' });
        store.createIndex('byTargetId', 'targetId', { unique: false });
        store.createIndex('byTargetUpdatedAt', ['targetId', 'updatedAt'], { unique: false });
      }
      if (!database.objectStoreNames.contains(STORE_BUNDLES)) {
        const store = database.createObjectStore(STORE_BUNDLES, { keyPath: 'id' });
        store.createIndex('byConversationId', 'conversationId', { unique: false });
        store.createIndex('byConversationSeq', ['conversationId', 'seq'], { unique: false });
      }
      if (!database.objectStoreNames.contains(STORE_RUNNING_SUMMARIES)) {
        database.createObjectStore(STORE_RUNNING_SUMMARIES, { keyPath: 'conversationId' });
      }
      if (!database.objectStoreNames.contains(STORE_DURABLE_MEMORY)) {
        const store = database.createObjectStore(STORE_DURABLE_MEMORY, { keyPath: 'id' });
        store.createIndex('byTargetId', 'targetId', { unique: false });
        store.createIndex('byViewerId', 'viewerId', { unique: false });
        store.createIndex('byType', 'type', { unique: false });
        store.createIndex('bySlotKey', 'slotKey', { unique: false });
        store.createIndex('byStatus', 'status', { unique: false });
      }
      if (!database.objectStoreNames.contains(STORE_SESSION_RECALL_DOCS)) {
        const store = database.createObjectStore(STORE_SESSION_RECALL_DOCS, { keyPath: 'id' });
        store.createIndex('byConversationId', 'conversationId', { unique: false });
      }
      if (!database.objectStoreNames.contains(STORE_MEDIA_CACHE)) {
        const store = database.createObjectStore(STORE_MEDIA_CACHE, { keyPath: 'executionCacheKey' });
        store.createIndex('bySpecHash', 'specHash', { unique: false });
        store.createIndex('byCreatedAt', 'createdAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('LOCAL_CHAT_LEDGER_OPEN_FAILED'));
  });
  return openDatabasePromise;
}

async function loadAllFromIndexedDb(): Promise<void> {
  const database = await openLedgerDatabase();
  if (!database) {
    ledgerCache.hydrated = true;
    return;
  }
  const transaction = database.transaction(
    [
      STORE_CONVERSATIONS,
      STORE_BUNDLES,
      STORE_RUNNING_SUMMARIES,
      STORE_DURABLE_MEMORY,
      STORE_SESSION_RECALL_DOCS,
      STORE_MEDIA_CACHE,
    ],
    'readonly',
  );
  const conversations = await requestToPromise(
    transaction.objectStore(STORE_CONVERSATIONS).getAll(),
  );
  const bundles = await requestToPromise(
    transaction.objectStore(STORE_BUNDLES).getAll(),
  );
  const summaries = await requestToPromise(
    transaction.objectStore(STORE_RUNNING_SUMMARIES).getAll(),
  );
  const durableMemory = await requestToPromise(
    transaction.objectStore(STORE_DURABLE_MEMORY).getAll(),
  );
  const sessionRecallDocs = await requestToPromise(
    transaction.objectStore(STORE_SESSION_RECALL_DOCS).getAll(),
  );
  const mediaCache = await requestToPromise(
    transaction.objectStore(STORE_MEDIA_CACHE).getAll(),
  );
  await transactionDone(transaction);

  ledgerCache = emptyLedgerCache();
  conversations
    .map((item) => normalizeConversationRecord(item))
    .filter((item): item is LocalChatConversationRecord => Boolean(item))
    .forEach((item) => {
      ledgerCache.conversationsById.set(item.id, item);
    });
  bundles
    .map((item) => normalizeBundleRecord(item))
    .filter((item): item is LocalChatTurnBundle => Boolean(item))
    .forEach((item) => {
      ledgerCache.bundlesById.set(item.id, item);
    });
  summaries
    .map((item) => normalizeRunningSummary(item))
    .filter((item): item is LocalChatRunningSummary => Boolean(item))
    .forEach((item) => {
      ledgerCache.runningSummariesByConversationId.set(item.conversationId, item);
    });
  durableMemory
    .map((item) => normalizeDurableMemoryEntry(item))
    .filter((item): item is LocalChatDurableMemoryEntry => Boolean(item))
    .forEach((item) => {
      ledgerCache.durableMemoryById.set(item.id, item);
    });
  sessionRecallDocs
    .map((item) => normalizeSessionRecallDoc(item))
    .filter((item): item is LocalChatSessionRecallDoc => Boolean(item))
    .forEach((item) => {
      ledgerCache.sessionRecallDocsById.set(item.id, item);
    });
  mediaCache
    .map((item) => normalizeCachedMediaAsset(item))
    .filter((item): item is LocalChatCachedMediaAsset => Boolean(item))
    .forEach((item) => {
      ledgerCache.mediaCacheByExecutionKey.set(item.executionCacheKey, item);
    });
  ledgerCache.hydrated = true;
}

async function ensureLedgerHydrated(): Promise<void> {
  if (ledgerCache.hydrated) return;
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(LEGACY_LOCAL_CHAT_SESSION_STORE_KEY);
    } catch {
      // ignore legacy cleanup errors
    }
  }
  if (hydratePromise) return hydratePromise;
  hydratePromise = loadAllFromIndexedDb()
    .finally(() => {
      hydratePromise = null;
    });
  return hydratePromise;
}

function emitSessionUpdated(payload: { targetId: string; sessionId: string }): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  if (typeof CustomEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent(LOCAL_CHAT_SESSION_UPDATED_EVENT, {
    detail: payload,
  }));
}

async function persistMutation(mutation: LedgerMutation): Promise<void> {
  const database = await openLedgerDatabase();
  if (!database) return;
  const storeNames = new Set<StoreName>();
  Object.keys(mutation.puts || {}).forEach((key) => {
    storeNames.add(key as StoreName);
  });
  Object.keys(mutation.deletes || {}).forEach((key) => {
    storeNames.add(key as StoreName);
  });
  if (storeNames.size === 0) return;
  const transaction = database.transaction([...storeNames], 'readwrite');
  for (const storeName of storeNames) {
    const store = transaction.objectStore(storeName);
    const puts = mutation.puts?.[storeName] || [];
    for (const row of puts) {
      store.put(row);
    }
    const deletes = mutation.deletes?.[storeName] || [];
    for (const key of deletes) {
      store.delete(key);
    }
  }
  await transactionDone(transaction);
}

function cloneConversation(record: LocalChatConversationRecord): LocalChatConversationRecord {
  return {
    ...record,
  };
}

function cloneBundle(record: LocalChatTurnBundle): LocalChatTurnBundle {
  return {
    ...record,
    segments: [...record.segments],
  };
}

function cloneSummary(record: LocalChatRunningSummary): LocalChatRunningSummary {
  return {
    ...record,
    relationshipState: [...record.relationshipState],
    userFactsEstablished: [...record.userFactsEstablished],
    assistantCommitments: [...record.assistantCommitments],
    openLoops: [...record.openLoops],
    sceneState: [...record.sceneState],
  };
}

function cloneDurableMemory(record: LocalChatDurableMemoryEntry): LocalChatDurableMemoryEntry {
  return {
    ...record,
    sourceBundleSeqs: [...record.sourceBundleSeqs],
    supersedesIds: [...record.supersedesIds],
  };
}

function rebuildRecallDocsForConversation(conversationId: string): LocalChatSessionRecallDoc[] {
  const docs = [...ledgerCache.sessionRecallDocsById.values()].filter((doc) => doc.conversationId === conversationId);
  return docs.sort((left, right) => (
    right.updatedAt.localeCompare(left.updatedAt)
    || left.id.localeCompare(right.id)
  ));
}

function buildBundleRecallDoc(bundle: LocalChatTurnBundle): LocalChatSessionRecallDoc | null {
  const segments = visibleSegments(bundle);
  const text = segments
    .map((segment) => [segment.contextText, segment.semanticSummary || ''].filter(Boolean).join(' '))
    .join('\n')
    .trim();
  if (!text) return null;
  return {
    id: `recall_${bundle.id}`,
    conversationId: bundle.conversationId,
    sourceKind: 'bundle',
    sourceBundleSeq: bundle.seq,
    text,
    createdAt: bundle.createdAt,
    updatedAt: bundle.updatedAt,
  };
}

function buildSummaryRecallDoc(summary: LocalChatRunningSummary): LocalChatSessionRecallDoc | null {
  const text = [
    ...summary.relationshipState,
    ...summary.userFactsEstablished,
    ...summary.assistantCommitments,
    ...summary.openLoops,
    ...summary.sceneState,
  ].join('\n').trim();
  if (!text) return null;
  return {
    id: `summary_${summary.conversationId}`,
    conversationId: summary.conversationId,
    sourceKind: 'running-summary',
    sourceBundleSeq: summary.lastSummarizedBundleSeq,
    text,
    createdAt: summary.updatedAt,
    updatedAt: summary.updatedAt,
  };
}

async function upsertRecallDoc(doc: LocalChatSessionRecallDoc | null): Promise<void> {
  if (!doc) return;
  ledgerCache.sessionRecallDocsById.set(doc.id, doc);
  await persistMutation({
    puts: {
      [STORE_SESSION_RECALL_DOCS]: [doc],
    },
  });
}

function createProjectionTurnFromMessage(message: ChatMessage, promptTrace?: LocalChatPromptTrace | null, audit?: LocalChatTurnAudit | null): LocalChatTurn {
  return {
    id: message.id,
    role: message.role,
    kind: message.kind === 'voice' || message.kind === 'image' || message.kind === 'video'
      ? message.kind
      : 'text',
    content: message.content,
    contextText: message.content,
    semanticSummary: null,
    mediaSpec: message.meta?.mediaSpec,
    mediaShadow: message.meta?.mediaShadow,
    media: message.media,
    timestamp: message.timestamp.toISOString(),
    latencyMs: message.latencyMs,
    meta: message.meta,
    promptTrace: promptTrace || undefined,
    audit: audit || undefined,
    bundleId: '',
    bundleSeq: 0,
  };
}

function buildProjectionSession(session: LocalChatSession): LocalChatSession {
  return {
    ...session,
    turns: [...session.turns],
  };
}

function lexicalScore(haystack: string, query: string): number {
  const normalizedHaystack = haystack.toLowerCase();
  const normalizedQuery = query.toLowerCase();
  if (!normalizedHaystack || !normalizedQuery) return 0;
  const tokens = normalizedQuery
    .split(/[\s,.;:!?/\\|()[\]{}"'`]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
  if (tokens.length === 0) {
    return normalizedHaystack.includes(normalizedQuery) ? 1 : 0;
  }
  let hits = 0;
  for (const token of tokens) {
    if (normalizedHaystack.includes(token)) hits += 1;
  }
  return hits / tokens.length;
}

function compareIsoTimestamp(left: string | null | undefined, right: string | null | undefined): number {
  const leftMs = Date.parse(String(left || ''));
  const rightMs = Date.parse(String(right || ''));
  const normalizedLeft = Number.isFinite(leftMs) ? leftMs : 0;
  const normalizedRight = Number.isFinite(rightMs) ? rightMs : 0;
  return normalizedLeft - normalizedRight;
}

export function getLocalChatSessionUpdatedEventName(): string {
  return LOCAL_CHAT_SESSION_UPDATED_EVENT;
}

export async function resetLocalChatConversationLedgerForTests(): Promise<void> {
  ledgerCache = emptyLedgerCache();
  const database = await openLedgerDatabase();
  if (!database) return;
  const transaction = database.transaction(
    [STORE_CONVERSATIONS, STORE_BUNDLES, STORE_RUNNING_SUMMARIES, STORE_DURABLE_MEMORY, STORE_SESSION_RECALL_DOCS, STORE_MEDIA_CACHE],
    'readwrite',
  );
  transaction.objectStore(STORE_CONVERSATIONS).clear();
  transaction.objectStore(STORE_BUNDLES).clear();
  transaction.objectStore(STORE_RUNNING_SUMMARIES).clear();
  transaction.objectStore(STORE_DURABLE_MEMORY).clear();
  transaction.objectStore(STORE_SESSION_RECALL_DOCS).clear();
  transaction.objectStore(STORE_MEDIA_CACHE).clear();
  await transactionDone(transaction);
}

export async function listLocalChatSessions(targetId: string, viewerId?: string): Promise<LocalChatSession[]> {
  await ensureLedgerHydrated();
  const normalizedTargetId = trimString(targetId);
  if (!normalizedTargetId) return [];
  return [...ledgerCache.conversationsById.values()]
    .filter((conversation) => (
      conversation.targetId === normalizedTargetId
      && matchesViewerId(conversation.viewerId, viewerId)
    ))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((conversation) => buildProjectionSession(projectConversationToSession(conversation)));
}

export async function listLocalChatTargetPreviews(viewerId?: string): Promise<LocalChatTargetPreview[]> {
  await ensureLedgerHydrated();
  const conversations = [...ledgerCache.conversationsById.values()]
    .filter((conversation) => matchesViewerId(conversation.viewerId, viewerId));
  if (conversations.length === 0) {
    return [];
  }

  const conversationIds = new Set(conversations.map((conversation) => conversation.id));
  const latestByConversationId = new Map<string, {
    latestLocalMessage: string | null;
    latestLocalMessageAt: string | null;
    bundleSeq: number;
  }>();

  for (const bundle of ledgerCache.bundlesById.values()) {
    if (!conversationIds.has(bundle.conversationId)) {
      continue;
    }
    const segment = latestVisibleSegment(bundle);
    if (!segment) {
      continue;
    }
    const candidateAt = trimString(segment.timestamp) || trimString(bundle.updatedAt) || null;
    const candidateMessage = trimString(segment.content) || trimString(segment.contextText) || null;
    const previous = latestByConversationId.get(bundle.conversationId);
    if (
      !previous
      || compareIsoTimestamp(previous.latestLocalMessageAt, candidateAt) < 0
      || (
        compareIsoTimestamp(previous.latestLocalMessageAt, candidateAt) === 0
        && bundle.seq > previous.bundleSeq
      )
    ) {
      latestByConversationId.set(bundle.conversationId, {
        latestLocalMessage: candidateMessage,
        latestLocalMessageAt: candidateAt,
        bundleSeq: bundle.seq,
      });
    }
  }

  const latestByTargetId = new Map<string, LocalChatTargetPreview>();
  for (const conversation of conversations) {
    const preview = latestByConversationId.get(conversation.id);
    const candidate: LocalChatTargetPreview = {
      targetId: conversation.targetId,
      latestLocalMessage: preview?.latestLocalMessage || null,
      latestLocalMessageAt: preview?.latestLocalMessageAt || conversation.updatedAt || null,
    };
    const previous = latestByTargetId.get(conversation.targetId);
    if (!previous || compareIsoTimestamp(previous.latestLocalMessageAt, candidate.latestLocalMessageAt) < 0) {
      latestByTargetId.set(conversation.targetId, candidate);
    }
  }

  return [...latestByTargetId.values()].sort((left, right) => (
    compareIsoTimestamp(right.latestLocalMessageAt, left.latestLocalMessageAt)
    || left.targetId.localeCompare(right.targetId)
  ));
}

export async function listAllLocalChatSessions(viewerId?: string): Promise<LocalChatSession[]> {
  await ensureLedgerHydrated();
  return [...ledgerCache.conversationsById.values()]
    .filter((conversation) => matchesViewerId(conversation.viewerId, viewerId))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((conversation) => buildProjectionSession(projectConversationToSession(conversation)));
}

export async function getLocalChatSession(sessionId: string, viewerId?: string): Promise<LocalChatSession | null> {
  await ensureLedgerHydrated();
  const conversation = ledgerCache.conversationsById.get(trimString(sessionId));
  if (!conversation || !matchesViewerId(conversation.viewerId, viewerId)) return null;
  return buildProjectionSession(projectConversationToSession(conversation));
}

export async function getLocalChatConversationRecord(sessionId: string, viewerId?: string): Promise<LocalChatConversationRecord | null> {
  await ensureLedgerHydrated();
  const conversation = ledgerCache.conversationsById.get(trimString(sessionId));
  if (!conversation || !matchesViewerId(conversation.viewerId, viewerId)) return null;
  return cloneConversation(conversation);
}

export async function listLocalChatTurnBundles(conversationId: string, viewerId?: string): Promise<LocalChatTurnBundle[]> {
  await ensureLedgerHydrated();
  const conversation = ledgerCache.conversationsById.get(trimString(conversationId));
  if (!conversation || !matchesViewerId(conversation.viewerId, viewerId)) return [];
  return bundlesForConversation(trimString(conversationId)).map((bundle) => cloneBundle(bundle));
}

export async function listLocalChatExactHistoryBundles(conversationId: string, viewerId?: string): Promise<LocalChatTurnBundle[]> {
  const bundles = await listLocalChatTurnBundles(conversationId, viewerId);
  return bundles
    .filter((bundle) => visibleSegments(bundle).length > 0)
    .slice(-EXACT_HISTORY_BUNDLE_LIMIT);
}

export async function createLocalChatSession(input: CreateConversationInput): Promise<LocalChatSession> {
  await ensureLedgerHydrated();
  const createdAt = nowIso();
  const conversation: LocalChatConversationRecord = {
    id: `conv_${createUlid()}`,
    targetId: trimString(input.targetId),
    viewerId: trimString(input.viewerId) || 'viewer',
    worldId: trimString(input.worldId) || null,
    title: trimString(input.title) || 'Session',
    createdAt,
    updatedAt: createdAt,
    lastBundleSeq: 0,
  };
  ledgerCache.conversationsById.set(conversation.id, conversation);
  await persistMutation({
    puts: {
      [STORE_CONVERSATIONS]: [conversation],
    },
  });
  emitSessionUpdated({
    targetId: conversation.targetId,
    sessionId: conversation.id,
  });
  return projectConversationToSession(conversation);
}

export async function upsertLocalChatSession(session: UpsertConversationInput | LocalChatSession): Promise<LocalChatSession> {
  await ensureLedgerHydrated();
  const existing = ledgerCache.conversationsById.get(trimString(session.id));
  const createdAt = existing?.createdAt || nowIso();
  const next: LocalChatConversationRecord = {
    id: trimString(session.id),
    targetId: trimString(session.targetId) || existing?.targetId || '',
    viewerId: trimString(session.viewerId) || existing?.viewerId || 'viewer',
    worldId: trimString(session.worldId) || existing?.worldId || null,
    title: trimString(session.title) || existing?.title || 'Session',
    createdAt,
    updatedAt: nowIso(),
    lastBundleSeq: existing?.lastBundleSeq || 0,
  };
  ledgerCache.conversationsById.set(next.id, next);
  await persistMutation({
    puts: {
      [STORE_CONVERSATIONS]: [next],
    },
  });
  emitSessionUpdated({
    targetId: next.targetId,
    sessionId: next.id,
  });
  return projectConversationToSession(next);
}

export async function deleteLocalChatSession(sessionId: string): Promise<void> {
  await ensureLedgerHydrated();
  const conversation = ledgerCache.conversationsById.get(trimString(sessionId));
  if (!conversation) return;
  const durableMemoryIds = [...ledgerCache.durableMemoryById.values()]
    .filter((entry) => entry.targetId === conversation.targetId && entry.viewerId === conversation.viewerId)
    .map((entry) => entry.id);
  ledgerCache.conversationsById.delete(conversation.id);
  const bundleIds = [...ledgerCache.bundlesById.values()]
    .filter((bundle) => bundle.conversationId === conversation.id)
    .map((bundle) => bundle.id);
  for (const bundleId of bundleIds) {
    ledgerCache.bundlesById.delete(bundleId);
    ledgerCache.sessionRecallDocsById.delete(`recall_${bundleId}`);
  }
  ledgerCache.runningSummariesByConversationId.delete(conversation.id);
  for (const durableMemoryId of durableMemoryIds) {
    ledgerCache.durableMemoryById.delete(durableMemoryId);
  }
  for (const [id, doc] of ledgerCache.sessionRecallDocsById.entries()) {
    if (doc.conversationId === conversation.id) {
      ledgerCache.sessionRecallDocsById.delete(id);
    }
  }
  await persistMutation({
    deletes: {
      [STORE_CONVERSATIONS]: [conversation.id],
      [STORE_BUNDLES]: bundleIds,
      [STORE_RUNNING_SUMMARIES]: [conversation.id],
      [STORE_SESSION_RECALL_DOCS]: [`summary_${conversation.id}`, ...bundleIds.map((bundleId) => `recall_${bundleId}`)],
      [STORE_DURABLE_MEMORY]: durableMemoryIds,
    },
  });
  emitSessionUpdated({
    targetId: conversation.targetId,
    sessionId: conversation.id,
  });
}

export async function createLocalChatTurnBundle(input: BundleInsertInput): Promise<LocalChatTurnBundle> {
  await ensureLedgerHydrated();
  const conversation = ledgerCache.conversationsById.get(trimString(input.conversationId));
  if (!conversation) {
    throw new Error('LOCAL_CHAT_CONVERSATION_NOT_FOUND');
  }
  const createdAt = nowIso();
  const nextSeq = Number.isFinite(input.seq) && Number(input.seq) > 0
    ? Math.floor(Number(input.seq))
    : conversation.lastBundleSeq + 1;
  const bundle: LocalChatTurnBundle = {
    id: trimString(input.bundleId) || `bundle_${createUlid()}`,
    conversationId: conversation.id,
    seq: nextSeq,
    role: input.role,
    turnTxnId: trimString(input.turnTxnId) || null,
    createdAt,
    updatedAt: createdAt,
    segments: [],
  };
  ledgerCache.bundlesById.set(bundle.id, bundle);
  ledgerCache.conversationsById.set(conversation.id, {
    ...conversation,
    lastBundleSeq: Math.max(conversation.lastBundleSeq, bundle.seq),
    updatedAt: createdAt,
  });
  await persistMutation({
    puts: {
      [STORE_BUNDLES]: [bundle],
      [STORE_CONVERSATIONS]: [ledgerCache.conversationsById.get(conversation.id)!],
    },
  });
  emitSessionUpdated({
    targetId: conversation.targetId,
    sessionId: conversation.id,
  });
  return cloneBundle(bundle);
}

export async function appendSegmentToLocalChatBundle(input: SegmentInsertInput): Promise<LocalChatTurnSegment> {
  await ensureLedgerHydrated();
  const conversation = ledgerCache.conversationsById.get(trimString(input.conversationId));
  const bundle = ledgerCache.bundlesById.get(trimString(input.bundleId));
  if (!conversation || !bundle || bundle.conversationId !== conversation.id) {
    throw new Error('LOCAL_CHAT_BUNDLE_NOT_FOUND');
  }
  const timestamp = asIsoString(input.timestamp, nowIso());
  const segment: LocalChatTurnSegment = {
    id: trimString(input.segmentId) || `seg_${createUlid()}`,
    bundleId: bundle.id,
    role: input.role,
    kind: input.kind,
    deliveryStatus: input.deliveryStatus || 'ready',
    content: String(input.content || ''),
    contextText: String(input.contextText || input.content || ''),
    semanticSummary: trimString(input.semanticSummary) || null,
    mediaSpec: input.mediaSpec,
    mediaShadow: input.mediaShadow,
    media: input.media,
    timestamp,
    latencyMs: input.latencyMs,
    meta: input.meta,
    promptTrace: input.promptTrace || undefined,
    audit: input.audit || undefined,
  };
  const nextBundle: LocalChatTurnBundle = {
    ...bundle,
    updatedAt: timestamp,
    segments: [...bundle.segments, segment],
  };
  const nextConversation: LocalChatConversationRecord = {
    ...conversation,
    updatedAt: timestamp,
  };
  ledgerCache.bundlesById.set(nextBundle.id, nextBundle);
  ledgerCache.conversationsById.set(nextConversation.id, nextConversation);
  const recallDoc = buildBundleRecallDoc(nextBundle);
  if (recallDoc) {
    ledgerCache.sessionRecallDocsById.set(recallDoc.id, recallDoc);
  }
  await persistMutation({
    puts: {
      [STORE_BUNDLES]: [nextBundle],
      [STORE_CONVERSATIONS]: [nextConversation],
      ...(recallDoc ? { [STORE_SESSION_RECALL_DOCS]: [recallDoc] } : {}),
    },
  });
  emitSessionUpdated({
    targetId: nextConversation.targetId,
    sessionId: nextConversation.id,
  });
  return segment;
}

export async function patchLocalChatSegmentArtifacts(input: {
  sessionId: string;
  segmentId: string;
  promptTrace?: LocalChatPromptTrace | null;
  audit?: LocalChatTurnAudit | null;
  contextText?: string;
  semanticSummary?: string | null;
  deliveryStatus?: LocalChatTurnSegment['deliveryStatus'];
  media?: LocalChatTurnSegment['media'];
  meta?: ChatMessageMeta;
}): Promise<LocalChatSession | null> {
  await ensureLedgerHydrated();
  const conversation = ledgerCache.conversationsById.get(trimString(input.sessionId));
  if (!conversation) return null;
  let nextBundle: LocalChatTurnBundle | null = null;
  for (const bundle of bundlesForConversation(conversation.id)) {
    const index = bundle.segments.findIndex((segment) => segment.id === trimString(input.segmentId));
    if (index < 0) continue;
    const currentSegment = bundle.segments[index]!;
    const updatedSegment: LocalChatTurnSegment = {
      ...currentSegment,
      promptTrace: input.promptTrace === undefined ? currentSegment.promptTrace : (input.promptTrace || undefined),
      audit: input.audit === undefined ? currentSegment.audit : (input.audit || undefined),
      contextText: input.contextText === undefined ? currentSegment.contextText : input.contextText,
      semanticSummary: input.semanticSummary === undefined ? currentSegment.semanticSummary : (input.semanticSummary || null),
      deliveryStatus: input.deliveryStatus || currentSegment.deliveryStatus,
      mediaSpec: input.meta?.mediaSpec === undefined ? currentSegment.mediaSpec : input.meta.mediaSpec,
      mediaShadow: input.meta?.mediaShadow === undefined ? currentSegment.mediaShadow : input.meta.mediaShadow,
      media: input.media === undefined ? currentSegment.media : input.media,
      meta: input.meta === undefined ? currentSegment.meta : input.meta,
    };
    const segments = [...bundle.segments];
    segments[index] = updatedSegment;
    nextBundle = {
      ...bundle,
      updatedAt: nowIso(),
      segments,
    };
    ledgerCache.bundlesById.set(nextBundle.id, nextBundle);
    const recallDoc = buildBundleRecallDoc(nextBundle);
    if (recallDoc) {
      ledgerCache.sessionRecallDocsById.set(recallDoc.id, recallDoc);
      await persistMutation({
        puts: {
          [STORE_BUNDLES]: [nextBundle],
          [STORE_SESSION_RECALL_DOCS]: [recallDoc],
        },
      });
    } else {
      await persistMutation({
        puts: {
          [STORE_BUNDLES]: [nextBundle],
        },
      });
    }
    break;
  }
  if (!nextBundle) return null;
  const nextConversation = {
    ...conversation,
    updatedAt: nextBundle.updatedAt,
  };
  ledgerCache.conversationsById.set(nextConversation.id, nextConversation);
  await persistMutation({
    puts: {
      [STORE_CONVERSATIONS]: [nextConversation],
    },
  });
  emitSessionUpdated({
    targetId: nextConversation.targetId,
    sessionId: nextConversation.id,
  });
  return projectConversationToSession(nextConversation);
}

export async function appendTurnsToSession(sessionId: string, turns: LocalChatTurn[]): Promise<LocalChatSession | null> {
  await ensureLedgerHydrated();
  const conversation = ledgerCache.conversationsById.get(trimString(sessionId));
  if (!conversation) return null;
  let currentConversation = conversation;
  for (const turn of turns) {
    const bundle = await createLocalChatTurnBundle({
      conversationId: currentConversation.id,
      role: turn.role,
    });
    await appendSegmentToLocalChatBundle({
      conversationId: currentConversation.id,
      bundleId: bundle.id,
      role: turn.role,
      kind: turn.kind,
      content: turn.content,
      contextText: turn.contextText || turn.content,
      semanticSummary: turn.semanticSummary || null,
      mediaSpec: turn.mediaSpec,
      mediaShadow: turn.mediaShadow,
      media: turn.media,
      timestamp: turn.timestamp,
      latencyMs: turn.latencyMs,
      meta: turn.meta,
      promptTrace: turn.promptTrace || null,
      audit: turn.audit || null,
      deliveryStatus: 'ready',
      segmentId: turn.id,
    });
    currentConversation = ledgerCache.conversationsById.get(currentConversation.id)!;
  }
  return projectConversationToSession(currentConversation);
}

export async function updateLocalChatTurnArtifacts(input: {
  sessionId: string;
  turnId: string;
  promptTrace?: LocalChatPromptTrace | null;
  audit?: LocalChatTurnAudit | null;
}): Promise<LocalChatSession | null> {
  return patchLocalChatSegmentArtifacts({
    sessionId: input.sessionId,
    segmentId: input.turnId,
    promptTrace: input.promptTrace,
    audit: input.audit,
  });
}

export async function getLocalChatCachedMediaAsset(executionCacheKey: string): Promise<LocalChatCachedMediaAsset | null> {
  await ensureLedgerHydrated();
  const cached = ledgerCache.mediaCacheByExecutionKey.get(trimString(executionCacheKey));
  return cached ? { ...cached } : null;
}

export async function putLocalChatCachedMediaAsset(asset: LocalChatCachedMediaAsset): Promise<LocalChatCachedMediaAsset> {
  await ensureLedgerHydrated();
  const normalized = normalizeCachedMediaAsset(asset);
  if (!normalized) {
    throw new Error('LOCAL_CHAT_MEDIA_CACHE_INVALID_ASSET');
  }
  ledgerCache.mediaCacheByExecutionKey.set(normalized.executionCacheKey, normalized);
  await persistMutation({
    puts: {
      [STORE_MEDIA_CACHE]: [normalized],
    },
  });
  return { ...normalized };
}

export async function getLocalChatRunningSummary(conversationId: string): Promise<LocalChatRunningSummary | null> {
  await ensureLedgerHydrated();
  const summary = ledgerCache.runningSummariesByConversationId.get(trimString(conversationId));
  return summary ? cloneSummary(summary) : null;
}

export async function upsertLocalChatRunningSummary(summary: LocalChatRunningSummary): Promise<LocalChatRunningSummary> {
  await ensureLedgerHydrated();
  const normalized = normalizeRunningSummary(summary) || {
    ...summary,
    updatedAt: summary.updatedAt || nowIso(),
  };
  ledgerCache.runningSummariesByConversationId.set(normalized.conversationId, normalized);
  const recallDoc = buildSummaryRecallDoc(normalized);
  if (recallDoc) {
    ledgerCache.sessionRecallDocsById.set(recallDoc.id, recallDoc);
  }
  await persistMutation({
    puts: {
      [STORE_RUNNING_SUMMARIES]: [normalized],
      ...(recallDoc ? { [STORE_SESSION_RECALL_DOCS]: [recallDoc] } : {}),
    },
  });
  return cloneSummary(normalized);
}

export async function listLocalChatSessionRecallDocs(conversationId: string): Promise<LocalChatSessionRecallDoc[]> {
  await ensureLedgerHydrated();
  return rebuildRecallDocsForConversation(trimString(conversationId)).map((doc) => ({
    ...doc,
  }));
}

export async function replaceLocalChatSessionRecallDocs(input: {
  conversationId: string;
  docs: LocalChatSessionRecallDoc[];
}): Promise<void> {
  await ensureLedgerHydrated();
  const conversationId = trimString(input.conversationId);
  const deleted: string[] = [];
  for (const [id, doc] of ledgerCache.sessionRecallDocsById.entries()) {
    if (doc.conversationId !== conversationId) continue;
    ledgerCache.sessionRecallDocsById.delete(id);
    deleted.push(id);
  }
  const normalized = input.docs
    .map((doc) => normalizeSessionRecallDoc(doc))
    .filter((doc): doc is LocalChatSessionRecallDoc => Boolean(doc));
  normalized.forEach((doc) => {
    ledgerCache.sessionRecallDocsById.set(doc.id, doc);
  });
  await persistMutation({
    puts: {
      [STORE_SESSION_RECALL_DOCS]: normalized,
    },
    deletes: {
      [STORE_SESSION_RECALL_DOCS]: deleted,
    },
  });
}

export async function listLocalChatDurableMemoryEntries(input: {
  targetId: string;
  viewerId: string;
  includeResolved?: boolean;
}): Promise<LocalChatDurableMemoryEntry[]> {
  await ensureLedgerHydrated();
  return [...ledgerCache.durableMemoryById.values()]
    .filter((entry) => (
      entry.targetId === trimString(input.targetId)
      && entry.viewerId === trimString(input.viewerId)
      && (input.includeResolved ? true : entry.status === 'active')
    ))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((entry) => cloneDurableMemory(entry));
}

export async function upsertLocalChatDurableMemoryEntries(entries: LocalChatDurableMemoryEntry[]): Promise<LocalChatDurableMemoryEntry[]> {
  await ensureLedgerHydrated();
  const normalized = entries
    .map((entry) => normalizeDurableMemoryEntry(entry))
    .filter((entry): entry is LocalChatDurableMemoryEntry => Boolean(entry));
  normalized.forEach((entry) => {
    ledgerCache.durableMemoryById.set(entry.id, entry);
  });
  await persistMutation({
    puts: {
      [STORE_DURABLE_MEMORY]: normalized,
    },
  });
  return normalized.map((entry) => cloneDurableMemory(entry));
}

export async function lexicalRecallLocalChatSession(input: {
  conversationId: string;
  query: string;
  topK?: number;
}): Promise<LocalChatSessionRecallDoc[]> {
  const docs = await listLocalChatSessionRecallDocs(input.conversationId);
  const topK = Number.isFinite(input.topK) && Number(input.topK) > 0 ? Math.floor(Number(input.topK)) : 6;
  return docs
    .map((doc) => ({
      doc,
      score: lexicalScore(doc.text, input.query),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || right.doc.updatedAt.localeCompare(left.doc.updatedAt))
    .slice(0, topK)
    .map((item) => ({
      ...item.doc,
    }));
}

export async function getLatestLocalChatArtifacts(sessionId: string, viewerId?: string): Promise<{
  promptTrace: LocalChatPromptTrace | null;
  audit: LocalChatTurnAudit | null;
}> {
  const session = await getLocalChatSession(sessionId, viewerId);
  return {
    promptTrace: latestTraceFromSession(session),
    audit: latestAuditFromSession(session),
  };
}

export function createSessionTurn(input: {
  message: ChatMessage;
  promptTrace?: LocalChatPromptTrace | null;
  audit?: LocalChatTurnAudit | null;
}): LocalChatTurn {
  const projected = createProjectionTurnFromMessage(input.message, input.promptTrace, input.audit);
  return {
    ...projected,
    bundleId: '',
    bundleSeq: 0,
  };
}
