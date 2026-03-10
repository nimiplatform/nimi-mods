import type {
  ChatMessage,
  ChatMessageMeta,
  LocalChatCachedMediaAsset,
  LocalChatMediaArtifactShadow,
  LocalChatMediaGenerationSpec,
} from './types.js';
import type {
  DerivedInteractionProfile,
  FirstBeatResult,
  InteractionBeat,
  InteractionRecallDoc,
  InteractionSnapshot,
  InteractionTurnPlan,
  LocalChatContextLaneId,
  LocalChatContextRecentTurn,
  LocalChatContextPacket,
  LocalChatContextTrace,
  LocalChatConversationRecord,
  LocalChatPlatformWarmStartMemory,
  LocalChatPromptLaneBudget,
  LocalChatPromptTrace,
  LocalChatReplyPacingPlan,
  LocalChatReplyStyleProfile,
  LocalChatTurnSendPhase,
  LocalChatStoredBeat,
  LocalChatMediaAssetRecord,
  LocalChatSession,
  LocalChatTurn,
  LocalChatTurnAudit,
  LocalChatTurnRecord,
  LocalChatTurnWithBeats,
  RelationMemorySlot,
  VoiceConversationMode,
} from './state/ledger-types.js';
import { createUlid } from './utils/ulid.js';

export type {
  DerivedInteractionProfile,
  FirstBeatResult,
  InteractionBeat,
  InteractionRecallDoc,
  InteractionSnapshot,
  InteractionTurnPlan,
  LocalChatContextLaneId,
  LocalChatContextRecentTurn,
  LocalChatContextPacket,
  LocalChatContextTrace,
  LocalChatConversationRecord,
  LocalChatPlatformWarmStartMemory,
  LocalChatPromptLaneBudget,
  LocalChatPromptTrace,
  LocalChatReplyPacingPlan,
  LocalChatReplyStyleProfile,
  LocalChatTurnSendPhase,
  LocalChatStoredBeat,
  LocalChatMediaAssetRecord,
  LocalChatSession,
  LocalChatTurn,
  LocalChatTurnAudit,
  LocalChatTurnRecord,
  LocalChatTurnWithBeats,
  RelationMemorySlot,
  VoiceConversationMode,
} from './state/ledger-types.js';

const LOCAL_CHAT_LEDGER_DB_NAME = 'nimi.local-chat.ledger.v3';
const LOCAL_CHAT_LEDGER_DB_VERSION = 1;
const LOCAL_CHAT_SESSION_UPDATED_EVENT = 'local-chat:session-updated';
const LEGACY_LOCAL_CHAT_SESSION_STORE_KEY = 'nimi.local-chat.sessions.v2';
const STORE_CONVERSATIONS = 'conversations';
const STORE_TURNS = 'turns';
const STORE_BEATS = 'beats';
const STORE_MEDIA_ASSETS = 'mediaAssets';
const STORE_INTERACTION_SNAPSHOTS = 'interactionSnapshots';
const STORE_RELATION_MEMORY_SLOTS = 'relationMemorySlots';
const STORE_RECALL_INDEX = 'recallIndex';
const EXACT_HISTORY_TURN_LIMIT = 8;

type StoreName =
  | typeof STORE_CONVERSATIONS
  | typeof STORE_TURNS
  | typeof STORE_BEATS
  | typeof STORE_MEDIA_ASSETS
  | typeof STORE_INTERACTION_SNAPSHOTS
  | typeof STORE_RELATION_MEMORY_SLOTS
  | typeof STORE_RECALL_INDEX;

type LedgerCache = {
  hydrated: boolean;
  conversationsById: Map<string, LocalChatConversationRecord>;
  turnsById: Map<string, LocalChatTurnRecord>;
  beatsById: Map<string, LocalChatStoredBeat>;
  mediaAssetsById: Map<string, LocalChatMediaAssetRecord>;
  interactionSnapshotsByConversationId: Map<string, InteractionSnapshot>;
  relationMemorySlotsById: Map<string, RelationMemorySlot>;
  recallIndexById: Map<string, InteractionRecallDoc>;
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

type TurnRecordInsertInput = {
  conversationId: string;
  role: 'user' | 'assistant';
  turnTxnId?: string | null;
  turnId?: string;
  seq?: number;
  createdAt?: string;
  beatCount?: number;
};

type BeatInsertInput = {
  conversationId: string;
  turnId: string;
  role: 'user' | 'assistant';
  kind: LocalChatStoredBeat['kind'];
  content: string;
  contextText: string;
  semanticSummary?: string | null;
  media?: LocalChatStoredBeat['media'];
  timestamp?: string;
  latencyMs?: number;
  meta?: ChatMessageMeta;
  promptTrace?: LocalChatPromptTrace | null;
  audit?: LocalChatTurnAudit | null;
  deliveryStatus?: LocalChatStoredBeat['deliveryStatus'];
  beatId?: string;
  beatIndex?: number;
  beatCount?: number;
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
    turnsById: new Map(),
    beatsById: new Map(),
    mediaAssetsById: new Map(),
    interactionSnapshotsByConversationId: new Map(),
    relationMemorySlotsById: new Map(),
    recallIndexById: new Map(),
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

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asIsoString(value: unknown, fallback: string): string {
  const normalized = trimString(value);
  return normalized || fallback;
}

function matchesViewerId(recordViewerId: string, viewerId?: string): boolean {
  const normalizedViewerId = trimString(viewerId);
  if (!normalizedViewerId) return true;
  return trimString(recordViewerId) === normalizedViewerId;
}

function compareIsoTimestamp(left: string | null | undefined, right: string | null | undefined): number {
  const leftMs = Date.parse(String(left || ''));
  const rightMs = Date.parse(String(right || ''));
  const normalizedLeft = Number.isFinite(leftMs) ? leftMs : 0;
  const normalizedRight = Number.isFinite(rightMs) ? rightMs : 0;
  return normalizedLeft - normalizedRight;
}

function buildConversationScopeKey(targetId: string, viewerId: string): string {
  return `${trimString(viewerId)}::${trimString(targetId)}`;
}

function sortConversationRecords(records: LocalChatConversationRecord[]): LocalChatConversationRecord[] {
  return [...records].sort((left, right) => (
    compareIsoTimestamp(right.updatedAt, left.updatedAt)
    || compareIsoTimestamp(right.createdAt, left.createdAt)
    || left.id.localeCompare(right.id)
  ));
}

function normalizeBeatKind(value: unknown): LocalChatStoredBeat['kind'] {
  return value === 'voice' || value === 'image' || value === 'video' ? value : 'text';
}

function normalizeDeliveryStatus(value: unknown): LocalChatStoredBeat['deliveryStatus'] {
  return value === 'pending' || value === 'blocked' || value === 'failed' ? value : 'ready';
}

function normalizeBeatMedia(value: unknown): LocalChatStoredBeat['media'] {
  if (!value || typeof value !== 'object') return undefined;
  const media = value as Record<string, unknown>;
  const normalized: LocalChatStoredBeat['media'] = {};
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
    routeSource: record.routeSource === 'cloud' ? 'cloud' : 'local',
    ...(trimString(record.connectorId) ? { connectorId: trimString(record.connectorId) } : {}),
    ...(trimString(record.model) ? { model: trimString(record.model) } : {}),
    createdAt,
    lastHitAt: asIsoString(record.lastHitAt, createdAt),
  };
}

function normalizeMediaAssetRecord(value: unknown): LocalChatMediaAssetRecord | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const cached = normalizeCachedMediaAsset(record);
  if (!cached) return null;
  return {
    ...cached,
    id: trimString(record.id) || `media_${createUlid()}`,
    conversationId: trimString(record.conversationId) || null,
    turnId: trimString(record.turnId) || null,
    beatId: trimString(record.beatId) || null,
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

function normalizeInteractionSnapshot(value: unknown): InteractionSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const conversationId = trimString(record.conversationId);
  if (!conversationId) return null;
  const updatedAt = asIsoString(record.updatedAt, nowIso());
  const relationshipStateRaw = trimString(record.relationshipState);
  const relationshipState: InteractionSnapshot['relationshipState'] = relationshipStateRaw === 'friendly'
    || relationshipStateRaw === 'warm'
    || relationshipStateRaw === 'intimate'
    ? relationshipStateRaw
    : 'new';
  const emotionalTemperatureRaw = trimString(record.emotionalTemperature);
  const emotionalTemperature: InteractionSnapshot['emotionalTemperature'] = emotionalTemperatureRaw === 'steady'
    || emotionalTemperatureRaw === 'warm'
    || emotionalTemperatureRaw === 'heated'
    ? emotionalTemperatureRaw
    : 'low';
  return {
    conversationId,
    relationshipState,
    activeScene: asArray(record.activeScene).map(trimString).filter(Boolean),
    emotionalTemperature,
    assistantCommitments: asArray(record.assistantCommitments).map(trimString).filter(Boolean),
    userPrefs: asArray(record.userPrefs).map(trimString).filter(Boolean),
    openLoops: asArray(record.openLoops).map(trimString).filter(Boolean),
    topicThreads: asArray(record.topicThreads).map(trimString).filter(Boolean),
    lastResolvedTurnId: trimString(record.lastResolvedTurnId) || null,
    conversationDirective: trimString(record.conversationDirective) || null,
    updatedAt,
  };
}

function normalizeRelationMemorySlot(value: unknown): RelationMemorySlot | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const id = trimString(record.id);
  const targetId = trimString(record.targetId);
  const viewerId = trimString(record.viewerId);
  const slotType = trimString(record.slotType) as RelationMemorySlot['slotType'];
  const key = trimString(record.key);
  const normalizedSlotType = slotType === 'boundary'
    || slotType === 'rapport'
    || slotType === 'promise'
    || slotType === 'recurringCue'
    || slotType === 'taboo'
    ? slotType
    : 'preference';
  if (!id || !targetId || !viewerId || !key) return null;
  return {
    id,
    targetId,
    viewerId,
    slotType: normalizedSlotType,
    key,
    value: trimString(record.value),
    confidence: Number.isFinite(Number(record.confidence)) ? Number(record.confidence) : 0,
    portability: record.portability === 'portable' || record.portability === 'blocked'
      ? record.portability
      : 'local-only',
    sensitivity: record.sensitivity === 'safe' || record.sensitivity === 'intimate'
      ? record.sensitivity
      : 'personal',
    userOverride: record.userOverride === 'never-sync' || record.userOverride === 'force-portable'
      ? record.userOverride
      : 'inherit',
    updatedAt: asIsoString(record.updatedAt, nowIso()),
  };
}

function normalizeInteractionRecallDoc(value: unknown): InteractionRecallDoc | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const id = trimString(record.id);
  const conversationId = trimString(record.conversationId);
  const text = trimString(record.text);
  if (!id || !conversationId || !text) return null;
  const createdAt = asIsoString(record.createdAt, nowIso());
  return {
    id,
    conversationId,
    sourceTurnId: trimString(record.sourceTurnId) || null,
    text,
    createdAt,
    updatedAt: asIsoString(record.updatedAt, createdAt),
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
    lastTurnSeq: Number(record.lastTurnSeq) > 0 ? Math.floor(Number(record.lastTurnSeq)) : 0,
  };
}

function normalizeTurnRecord(value: unknown): LocalChatTurnRecord | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const id = trimString(record.id);
  const conversationId = trimString(record.conversationId);
  if (!id || !conversationId) return null;
  const createdAt = asIsoString(record.createdAt, nowIso());
  return {
    id,
    conversationId,
    seq: Number(record.seq) > 0 ? Math.floor(Number(record.seq)) : 0,
    role: record.role === 'assistant' ? 'assistant' : 'user',
    turnTxnId: trimString(record.turnTxnId) || null,
    createdAt,
    updatedAt: asIsoString(record.updatedAt, createdAt),
    beatCount: Number(record.beatCount) > 0 ? Math.floor(Number(record.beatCount)) : 0,
  };
}

function normalizeBeatRecord(value: unknown): LocalChatStoredBeat | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const id = trimString(record.id);
  const turnId = trimString(record.turnId);
  const conversationId = trimString(record.conversationId);
  if (!id || !turnId || !conversationId) return null;
  const timestamp = asIsoString(record.timestamp, nowIso());
  return {
    id,
    turnId,
    turnSeq: Number(record.turnSeq) > 0 ? Math.floor(Number(record.turnSeq)) : 0,
    conversationId,
    role: record.role === 'assistant' ? 'assistant' : 'user',
    beatIndex: Number(record.beatIndex) >= 0 ? Math.floor(Number(record.beatIndex)) : 0,
    beatCount: Number(record.beatCount) > 0 ? Math.floor(Number(record.beatCount)) : 1,
    kind: normalizeBeatKind(record.kind),
    deliveryStatus: normalizeDeliveryStatus(record.deliveryStatus),
    content: String(record.content || ''),
    contextText: String(record.contextText || record.content || ''),
    semanticSummary: trimString(record.semanticSummary) || null,
    mediaSpec: normalizeMediaSpec(record.mediaSpec),
    mediaShadow: normalizeMediaShadow(record.mediaShadow),
    media: normalizeBeatMedia(record.media),
    timestamp,
    latencyMs: Number.isFinite(Number(record.latencyMs)) ? Number(record.latencyMs) : undefined,
    meta: record.meta && typeof record.meta === 'object' ? record.meta as ChatMessageMeta : undefined,
    promptTrace: normalizeContextTrace(record.promptTrace),
    audit: normalizeTurnAudit(record.audit),
  };
}

function cloneConversation(record: LocalChatConversationRecord): LocalChatConversationRecord {
  return {
    ...record,
  };
}

function cloneTurnRecord(record: LocalChatTurnRecord): LocalChatTurnRecord {
  return {
    ...record,
  };
}

function cloneStoredBeat(record: LocalChatStoredBeat): LocalChatStoredBeat {
  return {
    ...record,
    ...(record.media ? { media: { ...record.media } } : {}),
    ...(record.meta ? { meta: { ...record.meta } } : {}),
  };
}

function cloneInteractionSnapshot(record: InteractionSnapshot): InteractionSnapshot {
  return {
    ...record,
    activeScene: [...record.activeScene],
    assistantCommitments: [...record.assistantCommitments],
    userPrefs: [...record.userPrefs],
    openLoops: [...record.openLoops],
    topicThreads: [...record.topicThreads],
  };
}

function cloneRelationMemorySlot(record: RelationMemorySlot): RelationMemorySlot {
  return {
    ...record,
  };
}

function cloneInteractionRecallDoc(record: InteractionRecallDoc): InteractionRecallDoc {
  return {
    ...record,
  };
}

function cloneMediaAssetRecord(record: LocalChatMediaAssetRecord): LocalChatMediaAssetRecord {
  return {
    ...record,
  };
}

function sortTurnRecords(records: LocalChatTurnRecord[]): LocalChatTurnRecord[] {
  return [...records].sort((left, right) => (
    left.seq - right.seq
    || left.createdAt.localeCompare(right.createdAt)
    || left.id.localeCompare(right.id)
  ));
}

function sortStoredBeats(records: LocalChatStoredBeat[]): LocalChatStoredBeat[] {
  return [...records].sort((left, right) => (
    left.turnSeq - right.turnSeq
    || left.beatIndex - right.beatIndex
    || left.timestamp.localeCompare(right.timestamp)
    || left.id.localeCompare(right.id)
  ));
}

function turnsForConversation(conversationId: string): LocalChatTurnRecord[] {
  return sortTurnRecords(
    [...ledgerCache.turnsById.values()].filter((turn) => turn.conversationId === conversationId),
  );
}

function findConversationForScope(input: {
  targetId: string;
  viewerId: string;
}): LocalChatConversationRecord | null {
  const scopeKey = buildConversationScopeKey(input.targetId, input.viewerId);
  return sortConversationRecords(
    [...ledgerCache.conversationsById.values()].filter((conversation) => (
      buildConversationScopeKey(conversation.targetId, conversation.viewerId) === scopeKey
    )),
  )[0] || null;
}

function beatsForTurn(turnId: string): LocalChatStoredBeat[] {
  return sortStoredBeats(
    [...ledgerCache.beatsById.values()].filter((beat) => beat.turnId === turnId),
  );
}

function mediaAssetsForConversation(conversationId: string): LocalChatMediaAssetRecord[] {
  return [...ledgerCache.mediaAssetsById.values()]
    .filter((asset) => asset.conversationId === conversationId)
    .sort((left, right) => (
      compareIsoTimestamp(right.lastHitAt, left.lastHitAt)
      || compareIsoTimestamp(right.createdAt, left.createdAt)
      || left.id.localeCompare(right.id)
    ));
}

function buildTurnWithBeats(turn: LocalChatTurnRecord): LocalChatTurnWithBeats {
  const beats = beatsForTurn(turn.id);
  return {
    ...cloneTurnRecord(turn),
    beats: beats.map((beat) => cloneStoredBeat(beat)),
  };
}

function projectBeatToTurn(turn: LocalChatTurnRecord, beat: LocalChatStoredBeat): LocalChatTurn {
  return {
    id: beat.id,
    turnId: turn.id,
    turnSeq: turn.seq,
    beatIndex: beat.beatIndex,
    beatCount: Math.max(turn.beatCount, beat.beatCount, beat.beatIndex + 1),
    role: beat.role,
    kind: beat.kind,
    content: beat.content,
    contextText: beat.contextText,
    semanticSummary: beat.semanticSummary,
    mediaSpec: beat.mediaSpec,
    mediaShadow: beat.mediaShadow,
    media: beat.media,
    timestamp: beat.timestamp,
    latencyMs: beat.latencyMs,
    meta: beat.meta,
    promptTrace: beat.promptTrace,
    audit: beat.audit,
  };
}

function projectConversationToSession(record: LocalChatConversationRecord): LocalChatSession {
  const groupedTurns = turnsForConversation(record.id)
    .map((turn) => buildTurnWithBeats(turn))
    .filter((turn) => turn.beats.length > 0);
  const turns = groupedTurns.flatMap((turn) => (
    turn.beats.map((beat) => projectBeatToTurn(turn, beat))
  ));
  return {
    id: record.id,
    targetId: record.targetId,
    viewerId: record.viewerId,
    worldId: record.worldId,
    title: record.title,
    turns,
    turnCount: groupedTurns.length,
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
      if (!database.objectStoreNames.contains(STORE_TURNS)) {
        const store = database.createObjectStore(STORE_TURNS, { keyPath: 'id' });
        store.createIndex('byConversationId', 'conversationId', { unique: false });
        store.createIndex('byConversationSeq', ['conversationId', 'seq'], { unique: false });
      }
      if (!database.objectStoreNames.contains(STORE_BEATS)) {
        const store = database.createObjectStore(STORE_BEATS, { keyPath: 'id' });
        store.createIndex('byConversationId', 'conversationId', { unique: false });
        store.createIndex('byTurnId', 'turnId', { unique: false });
        store.createIndex('byConversationTurnBeat', ['conversationId', 'turnSeq', 'beatIndex'], { unique: false });
      }
      if (!database.objectStoreNames.contains(STORE_MEDIA_ASSETS)) {
        const store = database.createObjectStore(STORE_MEDIA_ASSETS, { keyPath: 'id' });
        store.createIndex('byConversationId', 'conversationId', { unique: false });
        store.createIndex('byTurnId', 'turnId', { unique: false });
        store.createIndex('byBeatId', 'beatId', { unique: false });
        store.createIndex('byExecutionCacheKey', 'executionCacheKey', { unique: false });
      }
      if (!database.objectStoreNames.contains(STORE_INTERACTION_SNAPSHOTS)) {
        database.createObjectStore(STORE_INTERACTION_SNAPSHOTS, { keyPath: 'conversationId' });
      }
      if (!database.objectStoreNames.contains(STORE_RELATION_MEMORY_SLOTS)) {
        const store = database.createObjectStore(STORE_RELATION_MEMORY_SLOTS, { keyPath: 'id' });
        store.createIndex('byTargetViewer', ['targetId', 'viewerId'], { unique: false });
      }
      if (!database.objectStoreNames.contains(STORE_RECALL_INDEX)) {
        const store = database.createObjectStore(STORE_RECALL_INDEX, { keyPath: 'id' });
        store.createIndex('byConversationId', 'conversationId', { unique: false });
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
      STORE_TURNS,
      STORE_BEATS,
      STORE_MEDIA_ASSETS,
      STORE_INTERACTION_SNAPSHOTS,
      STORE_RELATION_MEMORY_SLOTS,
      STORE_RECALL_INDEX,
    ],
    'readonly',
  );
  const [conversations, turns, beats, mediaAssets, interactionSnapshots, relationMemorySlots, recallIndex] = await Promise.all([
    requestToPromise(transaction.objectStore(STORE_CONVERSATIONS).getAll()),
    requestToPromise(transaction.objectStore(STORE_TURNS).getAll()),
    requestToPromise(transaction.objectStore(STORE_BEATS).getAll()),
    requestToPromise(transaction.objectStore(STORE_MEDIA_ASSETS).getAll()),
    requestToPromise(transaction.objectStore(STORE_INTERACTION_SNAPSHOTS).getAll()),
    requestToPromise(transaction.objectStore(STORE_RELATION_MEMORY_SLOTS).getAll()),
    requestToPromise(transaction.objectStore(STORE_RECALL_INDEX).getAll()),
  ]);
  await transactionDone(transaction);

  ledgerCache = emptyLedgerCache();
  conversations
    .map((item) => normalizeConversationRecord(item))
    .filter((item): item is LocalChatConversationRecord => Boolean(item))
    .forEach((item) => {
      ledgerCache.conversationsById.set(item.id, item);
    });
  turns
    .map((item) => normalizeTurnRecord(item))
    .filter((item): item is LocalChatTurnRecord => Boolean(item))
    .forEach((item) => {
      ledgerCache.turnsById.set(item.id, item);
    });
  beats
    .map((item) => normalizeBeatRecord(item))
    .filter((item): item is LocalChatStoredBeat => Boolean(item))
    .forEach((item) => {
      ledgerCache.beatsById.set(item.id, item);
    });
  mediaAssets
    .map((item) => normalizeMediaAssetRecord(item))
    .filter((item): item is LocalChatMediaAssetRecord => Boolean(item))
    .forEach((item) => {
      ledgerCache.mediaAssetsById.set(item.id, item);
    });
  interactionSnapshots
    .map((item) => normalizeInteractionSnapshot(item))
    .filter((item): item is InteractionSnapshot => Boolean(item))
    .forEach((item) => {
      ledgerCache.interactionSnapshotsByConversationId.set(item.conversationId, item);
    });
  relationMemorySlots
    .map((item) => normalizeRelationMemorySlot(item))
    .filter((item): item is RelationMemorySlot => Boolean(item))
    .forEach((item) => {
      ledgerCache.relationMemorySlotsById.set(item.id, item);
    });
  recallIndex
    .map((item) => normalizeInteractionRecallDoc(item))
    .filter((item): item is InteractionRecallDoc => Boolean(item))
    .forEach((item) => {
      ledgerCache.recallIndexById.set(item.id, item);
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
  hydratePromise = loadAllFromIndexedDb().finally(() => {
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

function createProjectionTurnFromMessage(
  message: ChatMessage,
  promptTrace?: LocalChatPromptTrace | null,
  audit?: LocalChatTurnAudit | null,
): LocalChatTurn {
  const metaTurnId = trimString(message.meta?.turnId);
  const beatIndex = Number.isFinite(message.meta?.beatIndex) ? Math.max(0, Number(message.meta?.beatIndex)) : 0;
  const beatCount = Number.isFinite(message.meta?.beatCount) && Number(message.meta?.beatCount) > 0
    ? Math.floor(Number(message.meta?.beatCount))
    : 1;
  return {
    id: message.id,
    turnId: metaTurnId || message.id,
    turnSeq: 0,
    beatIndex,
    beatCount,
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

const RELATION_MEMORY_RESOLUTION_RE = /已经|好了|完成|提醒了|办好了|安排好了|处理好了|搞定|兑现|实现|做到了|结束了|记住了|resolved|done|finished|handled|reminded/u;

function normalizeMemoryText(value: string): string {
  return trimString(value).replace(/\s+/g, ' ').toLowerCase();
}

function toMemoryBigrams(text: string): Set<string> {
  const normalized = normalizeMemoryText(text).replace(/\s+/g, '');
  const output = new Set<string>();
  for (let index = 0; index < normalized.length - 1; index += 1) {
    output.add(normalized.slice(index, index + 2));
  }
  return output;
}

function relationMemorySimilarity(left: string, right: string): number {
  const normalizedLeft = normalizeMemoryText(left);
  const normalizedRight = normalizeMemoryText(right);
  if (!normalizedLeft || !normalizedRight) return 0;
  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) {
    return 1;
  }
  const leftBigrams = toMemoryBigrams(normalizedLeft);
  const rightBigrams = toMemoryBigrams(normalizedRight);
  if (leftBigrams.size === 0 || rightBigrams.size === 0) {
    const leftChars = new Set([...normalizedLeft]);
    const rightChars = new Set([...normalizedRight]);
    let overlap = 0;
    for (const char of leftChars) {
      if (rightChars.has(char)) overlap += 1;
    }
    const union = new Set([...leftChars, ...rightChars]).size;
    return union === 0 ? 0 : overlap / union;
  }
  let overlap = 0;
  for (const gram of leftBigrams) {
    if (rightBigrams.has(gram)) overlap += 1;
  }
  const union = new Set([...leftBigrams, ...rightBigrams]).size;
  return union === 0 ? 0 : overlap / union;
}

function stripTemporalLead(text: string): string {
  return trimString(text)
    .replace(/^(?:之后|待会|回头|下次|稍后|再来|改天|晚点|别忘|说好了|有空|等你)\s*/u, '')
    .trim();
}

function hasFocusedPhraseMatch(left: string, right: string): boolean {
  const a = stripTemporalLead(left);
  const b = stripTemporalLead(right);
  if (!a || !b) return false;
  const shorter = a.length <= b.length ? a : b;
  const longer = shorter === a ? b : a;
  for (let length = Math.min(4, shorter.length); length >= 3; length -= 1) {
    for (let index = 0; index <= shorter.length - length; index += 1) {
      const fragment = shorter.slice(index, index + length).trim();
      if (fragment.length >= 3 && longer.includes(fragment)) {
        return true;
      }
    }
  }
  return false;
}

function relationMemoryMatchThreshold(slotType: RelationMemorySlot['slotType']): number {
  if (slotType === 'promise' || slotType === 'recurringCue') return 0.22;
  if (slotType === 'boundary' || slotType === 'taboo') return 0.28;
  return 0.36;
}

function relationMemoryCombinedText(slot: Pick<RelationMemorySlot, 'key' | 'value'>): string {
  return trimString(`${slot.key} ${slot.value}`);
}

function relationMemoryPairScore(
  left: Pick<RelationMemorySlot, 'slotType' | 'key' | 'value'>,
  right: Pick<RelationMemorySlot, 'slotType' | 'key' | 'value'>,
): number {
  if (left.slotType !== right.slotType) return 0;
  const keyScore = relationMemorySimilarity(left.key, right.key);
  const valueScore = relationMemorySimilarity(left.value, right.value);
  const combinedScore = relationMemorySimilarity(
    relationMemoryCombinedText(left),
    relationMemoryCombinedText(right),
  );
  return Math.max(
    combinedScore,
    (keyScore * 0.6) + (valueScore * 0.4),
    lexicalScore(relationMemoryCombinedText(left), relationMemoryCombinedText(right)),
  );
}

function findBestRelationMemoryMatch(
  existingSlots: RelationMemorySlot[],
  candidate: RelationMemorySlot,
): RelationMemorySlot | null {
  let bestMatch: RelationMemorySlot | null = null;
  let bestScore = 0;
  for (const slot of existingSlots) {
    if (slot.slotType !== candidate.slotType) continue;
    const score = relationMemoryPairScore(slot, candidate);
    const threshold = relationMemoryMatchThreshold(candidate.slotType);
    const focusedMatch = hasFocusedPhraseMatch(relationMemoryCombinedText(slot), relationMemoryCombinedText(candidate));
    if (score < threshold && !focusedMatch) continue;
    const effectiveScore = focusedMatch ? Math.max(score, threshold) : score;
    if (effectiveScore > bestScore) {
      bestScore = effectiveScore;
      bestMatch = slot;
    }
  }
  return bestMatch;
}

function shouldResolveRelationMemorySlot(slot: RelationMemorySlot, resolutionTexts: string[]): boolean {
  if (slot.slotType !== 'promise' && slot.slotType !== 'recurringCue') {
    return false;
  }
  const slotText = relationMemoryCombinedText(slot);
  return resolutionTexts.some((text) => {
    const normalizedText = trimString(text);
    if (!normalizedText || !RELATION_MEMORY_RESOLUTION_RE.test(normalizedText)) {
      return false;
    }
    return (
      relationMemorySimilarity(slotText, normalizedText) >= relationMemoryMatchThreshold(slot.slotType)
      || hasFocusedPhraseMatch(slotText, normalizedText)
    );
  });
}

function compareRelationMemoryRetention(left: RelationMemorySlot, right: RelationMemorySlot): number {
  const retentionRank = (slot: RelationMemorySlot): number => {
    if (slot.slotType === 'boundary' || slot.slotType === 'taboo') return 99;
    if (slot.slotType === 'promise') return 4;
    if (slot.slotType === 'preference') return 3;
    if (slot.slotType === 'recurringCue') return 2;
    if (slot.slotType === 'rapport') return 1;
    return 0;
  };
  return (
    retentionRank(left) - retentionRank(right)
    || left.confidence - right.confidence
    || left.updatedAt.localeCompare(right.updatedAt)
  );
}

function pruneRelationMemorySlots(slots: RelationMemorySlot[], limit: number): {
  kept: RelationMemorySlot[];
  removed: RelationMemorySlot[];
} {
  if (slots.length <= limit) {
    return {
      kept: slots,
      removed: [],
    };
  }
  const ranked = [...slots].sort(compareRelationMemoryRetention);
  const removed: RelationMemorySlot[] = [];
  while (ranked.length > limit) {
    const removableIndex = ranked.findIndex((slot) => slot.slotType !== 'boundary' && slot.slotType !== 'taboo');
    if (removableIndex < 0) break;
    removed.push(...ranked.splice(removableIndex, 1));
  }
  return {
    kept: ranked,
    removed,
  };
}

function withPreservedOverride(next: RelationMemorySlot, previous?: RelationMemorySlot): RelationMemorySlot {
  if (!previous) return next;
  if (next.userOverride !== 'inherit') return next;
  if (previous.userOverride === 'inherit') return next;
  return {
    ...next,
    userOverride: previous.userOverride,
  };
}

export function isSyncableRelationMemorySlot(slot: Pick<RelationMemorySlot, 'portability' | 'sensitivity' | 'userOverride'>): boolean {
  return slot.portability === 'portable'
    && slot.sensitivity !== 'intimate'
    && slot.userOverride !== 'never-sync';
}

export function getLocalChatSessionUpdatedEventName(): string {
  return LOCAL_CHAT_SESSION_UPDATED_EVENT;
}

export function warmUpLedgerHydration(): void {
  void ensureLedgerHydrated();
}

export async function resetLocalChatConversationLedgerForTests(): Promise<void> {
  ledgerCache = emptyLedgerCache();
  const database = await openLedgerDatabase();
  if (!database) return;
  const transaction = database.transaction(
    [
      STORE_CONVERSATIONS,
      STORE_TURNS,
      STORE_BEATS,
      STORE_MEDIA_ASSETS,
      STORE_INTERACTION_SNAPSHOTS,
      STORE_RELATION_MEMORY_SLOTS,
      STORE_RECALL_INDEX,
    ],
    'readwrite',
  );
  transaction.objectStore(STORE_CONVERSATIONS).clear();
  transaction.objectStore(STORE_TURNS).clear();
  transaction.objectStore(STORE_BEATS).clear();
  transaction.objectStore(STORE_MEDIA_ASSETS).clear();
  transaction.objectStore(STORE_INTERACTION_SNAPSHOTS).clear();
  transaction.objectStore(STORE_RELATION_MEMORY_SLOTS).clear();
  transaction.objectStore(STORE_RECALL_INDEX).clear();
  await transactionDone(transaction);
}

export async function listLocalChatSessions(targetId: string, viewerId?: string): Promise<LocalChatSession[]> {
  await ensureLedgerHydrated();
  const normalizedTargetId = trimString(targetId);
  if (!normalizedTargetId) return [];
  const normalizedViewerId = trimString(viewerId);
  if (normalizedViewerId) {
    const scopedConversation = findConversationForScope({
      targetId: normalizedTargetId,
      viewerId: normalizedViewerId,
    });
    return scopedConversation
      ? [buildProjectionSession(projectConversationToSession(scopedConversation))]
      : [];
  }
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
  const previews = (await listAllLocalChatSessions(viewerId))
    .map((session) => {
      const latestTurn = session.turns[session.turns.length - 1];
      return {
        targetId: session.targetId,
        latestLocalMessage: latestTurn?.contextText || latestTurn?.content || null,
        latestLocalMessageAt: latestTurn?.timestamp || session.updatedAt || null,
      };
    });
  const latestByTargetId = new Map<string, LocalChatTargetPreview>();
  for (const preview of previews) {
    const previous = latestByTargetId.get(preview.targetId);
    if (!previous || compareIsoTimestamp(previous.latestLocalMessageAt, preview.latestLocalMessageAt) < 0) {
      latestByTargetId.set(preview.targetId, preview);
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

export async function listLocalChatTurnRecords(conversationId: string, viewerId?: string): Promise<LocalChatTurnWithBeats[]> {
  await ensureLedgerHydrated();
  const conversation = ledgerCache.conversationsById.get(trimString(conversationId));
  if (!conversation || !matchesViewerId(conversation.viewerId, viewerId)) return [];
  return turnsForConversation(conversation.id).map((turn) => buildTurnWithBeats(turn));
}

export async function listLocalChatExactHistoryTurns(conversationId: string, viewerId?: string): Promise<LocalChatTurn[]> {
  const turns = await listLocalChatTurnRecords(conversationId, viewerId);
  return turns
    .filter((turn) => turn.beats.length > 0)
    .slice(-EXACT_HISTORY_TURN_LIMIT)
    .flatMap((turn) => turn.beats.map((beat) => projectBeatToTurn(turn, beat)));
}

export async function createLocalChatSession(input: CreateConversationInput): Promise<LocalChatSession> {
  await ensureLedgerHydrated();
  const targetId = trimString(input.targetId);
  const viewerId = trimString(input.viewerId) || 'viewer';
  const existing = findConversationForScope({
    targetId,
    viewerId,
  });
  if (existing) {
    return buildProjectionSession(projectConversationToSession(existing));
  }
  const createdAt = nowIso();
  const conversation: LocalChatConversationRecord = {
    id: `conv_${createUlid()}`,
    targetId,
    viewerId,
    worldId: trimString(input.worldId) || null,
    title: trimString(input.title) || 'Session',
    createdAt,
    updatedAt: createdAt,
    lastTurnSeq: 0,
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
  const requestedId = trimString(session.id);
  const targetId = trimString(session.targetId);
  const viewerId = trimString(session.viewerId) || 'viewer';
  const existing = ledgerCache.conversationsById.get(requestedId);
  const scopedExisting = targetId
    ? findConversationForScope({
      targetId,
      viewerId,
    })
    : null;
  const base = scopedExisting || existing || null;
  const createdAt = base?.createdAt || nowIso();
  const next: LocalChatConversationRecord = {
    id: scopedExisting?.id || requestedId,
    targetId: targetId || base?.targetId || '',
    viewerId: viewerId || base?.viewerId || 'viewer',
    worldId: trimString(session.worldId) || base?.worldId || null,
    title: trimString(session.title) || base?.title || 'Session',
    createdAt,
    updatedAt: nowIso(),
    lastTurnSeq: base?.lastTurnSeq || 0,
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
  ledgerCache.conversationsById.delete(conversation.id);

  const turnIds = turnsForConversation(conversation.id).map((turn) => turn.id);
  const beatIds = [...ledgerCache.beatsById.values()]
    .filter((beat) => beat.conversationId === conversation.id)
    .map((beat) => beat.id);
  const mediaAssetIds = [...ledgerCache.mediaAssetsById.values()]
    .filter((asset) => asset.conversationId === conversation.id)
    .map((asset) => asset.id);
  const recallIndexIds = [...ledgerCache.recallIndexById.values()]
    .filter((doc) => doc.conversationId === conversation.id)
    .map((doc) => doc.id);

  turnIds.forEach((turnId) => ledgerCache.turnsById.delete(turnId));
  beatIds.forEach((beatId) => ledgerCache.beatsById.delete(beatId));
  mediaAssetIds.forEach((assetId) => ledgerCache.mediaAssetsById.delete(assetId));
  ledgerCache.interactionSnapshotsByConversationId.delete(conversation.id);
  recallIndexIds.forEach((docId) => ledgerCache.recallIndexById.delete(docId));

  await persistMutation({
    deletes: {
      [STORE_CONVERSATIONS]: [conversation.id],
      [STORE_TURNS]: turnIds,
      [STORE_BEATS]: beatIds,
      [STORE_MEDIA_ASSETS]: mediaAssetIds,
      [STORE_INTERACTION_SNAPSHOTS]: [conversation.id],
      [STORE_RECALL_INDEX]: recallIndexIds,
    },
  });
  emitSessionUpdated({
    targetId: conversation.targetId,
    sessionId: conversation.id,
  });
}

export async function clearLocalChatSessionHistory(sessionId: string): Promise<void> {
  await ensureLedgerHydrated();
  const conversation = ledgerCache.conversationsById.get(trimString(sessionId));
  if (!conversation) return;

  const turnIds = turnsForConversation(conversation.id).map((turn) => turn.id);
  const beatIds = [...ledgerCache.beatsById.values()]
    .filter((beat) => beat.conversationId === conversation.id)
    .map((beat) => beat.id);
  const mediaAssetIds = [...ledgerCache.mediaAssetsById.values()]
    .filter((asset) => asset.conversationId === conversation.id)
    .map((asset) => asset.id);

  turnIds.forEach((turnId) => ledgerCache.turnsById.delete(turnId));
  beatIds.forEach((beatId) => ledgerCache.beatsById.delete(beatId));
  mediaAssetIds.forEach((assetId) => ledgerCache.mediaAssetsById.delete(assetId));

  const nextConversation: LocalChatConversationRecord = {
    ...conversation,
    lastTurnSeq: 0,
    updatedAt: nowIso(),
  };
  ledgerCache.conversationsById.set(nextConversation.id, nextConversation);

  await persistMutation({
    puts: {
      [STORE_CONVERSATIONS]: [nextConversation],
    },
    deletes: {
      [STORE_TURNS]: turnIds,
      [STORE_BEATS]: beatIds,
      [STORE_MEDIA_ASSETS]: mediaAssetIds,
    },
  });
  emitSessionUpdated({
    targetId: nextConversation.targetId,
    sessionId: nextConversation.id,
  });
}

export async function createLocalChatTurnRecord(input: TurnRecordInsertInput): Promise<LocalChatTurnRecord> {
  await ensureLedgerHydrated();
  const conversation = ledgerCache.conversationsById.get(trimString(input.conversationId));
  if (!conversation) {
    throw new Error('LOCAL_CHAT_CONVERSATION_NOT_FOUND');
  }
  const createdAt = asIsoString(input.createdAt, nowIso());
  const seq = Number.isFinite(input.seq) && Number(input.seq) > 0
    ? Math.floor(Number(input.seq))
    : conversation.lastTurnSeq + 1;
  const turn: LocalChatTurnRecord = {
    id: trimString(input.turnId) || `turn_${createUlid()}`,
    conversationId: conversation.id,
    seq,
    role: input.role,
    turnTxnId: trimString(input.turnTxnId) || null,
    createdAt,
    updatedAt: createdAt,
    beatCount: Number.isFinite(input.beatCount) && Number(input.beatCount) > 0
      ? Math.floor(Number(input.beatCount))
      : 0,
  };
  ledgerCache.turnsById.set(turn.id, turn);
  const nextConversation: LocalChatConversationRecord = {
    ...conversation,
    lastTurnSeq: Math.max(conversation.lastTurnSeq, turn.seq),
    updatedAt: createdAt,
  };
  ledgerCache.conversationsById.set(nextConversation.id, nextConversation);
  await persistMutation({
    puts: {
      [STORE_TURNS]: [turn],
      [STORE_CONVERSATIONS]: [nextConversation],
    },
  });
  emitSessionUpdated({
    targetId: nextConversation.targetId,
    sessionId: nextConversation.id,
  });
  return cloneTurnRecord(turn);
}

export async function appendBeatToLocalChatTurn(input: BeatInsertInput): Promise<LocalChatStoredBeat> {
  await ensureLedgerHydrated();
  const conversation = ledgerCache.conversationsById.get(trimString(input.conversationId));
  const turn = ledgerCache.turnsById.get(trimString(input.turnId));
  if (!conversation || !turn || turn.conversationId !== conversation.id) {
    throw new Error('LOCAL_CHAT_TURN_NOT_FOUND');
  }
  const beatId = trimString(input.beatId) || `beat_${createUlid()}`;
  const existingBeat = ledgerCache.beatsById.get(beatId);
  if (existingBeat && existingBeat.turnId !== turn.id) {
    throw new Error('LOCAL_CHAT_BEAT_TURN_MISMATCH');
  }
  const timestamp = asIsoString(input.timestamp, nowIso());
  const priorBeats = beatsForTurn(turn.id);
  const beatIndex = Number.isFinite(input.beatIndex) && Number(input.beatIndex) >= 0
    ? Math.floor(Number(input.beatIndex))
    : existingBeat?.beatIndex ?? priorBeats.length;
  const explicitBeatCount = Number.isFinite(input.beatCount) && Number(input.beatCount) > 0
    ? Math.floor(Number(input.beatCount))
    : 0;
  const beatCount = Math.max(
    explicitBeatCount,
    existingBeat?.beatCount || 0,
    turn.beatCount,
    beatIndex + 1,
  ) || 1;

  const beat: LocalChatStoredBeat = {
    id: beatId,
    turnId: turn.id,
    turnSeq: turn.seq,
    conversationId: conversation.id,
    role: input.role,
    beatIndex,
    beatCount,
    kind: input.kind,
    deliveryStatus: input.deliveryStatus || existingBeat?.deliveryStatus || 'ready',
    content: String(input.content || ''),
    contextText: String(input.contextText || input.content || ''),
    semanticSummary: trimString(input.semanticSummary) || null,
    mediaSpec: input.mediaSpec === undefined ? existingBeat?.mediaSpec : input.mediaSpec,
    mediaShadow: input.mediaShadow === undefined ? existingBeat?.mediaShadow : input.mediaShadow,
    media: input.media === undefined ? existingBeat?.media : input.media,
    timestamp,
    latencyMs: input.latencyMs === undefined ? existingBeat?.latencyMs : input.latencyMs,
    meta: input.meta === undefined ? existingBeat?.meta : input.meta,
    promptTrace: input.promptTrace === undefined ? existingBeat?.promptTrace : (input.promptTrace || undefined),
    audit: input.audit === undefined ? existingBeat?.audit : (input.audit || undefined),
  };

  const nextTurn: LocalChatTurnRecord = {
    ...turn,
    updatedAt: timestamp,
    beatCount: Math.max(turn.beatCount, beatCount),
  };
  const nextConversation: LocalChatConversationRecord = {
    ...conversation,
    updatedAt: timestamp,
    lastTurnSeq: Math.max(conversation.lastTurnSeq, turn.seq),
  };

  ledgerCache.beatsById.set(beat.id, beat);
  ledgerCache.turnsById.set(nextTurn.id, nextTurn);
  ledgerCache.conversationsById.set(nextConversation.id, nextConversation);
  await persistMutation({
    puts: {
      [STORE_BEATS]: [beat],
      [STORE_TURNS]: [nextTurn],
      [STORE_CONVERSATIONS]: [nextConversation],
    },
  });
  emitSessionUpdated({
    targetId: nextConversation.targetId,
    sessionId: nextConversation.id,
  });
  return cloneStoredBeat(beat);
}

export async function patchLocalChatBeatArtifacts(input: {
  sessionId: string;
  beatId: string;
  promptTrace?: LocalChatPromptTrace | null;
  audit?: LocalChatTurnAudit | null;
  contextText?: string;
  semanticSummary?: string | null;
  deliveryStatus?: LocalChatStoredBeat['deliveryStatus'];
  media?: LocalChatStoredBeat['media'];
  meta?: ChatMessageMeta;
  mediaSpec?: LocalChatMediaGenerationSpec;
  mediaShadow?: LocalChatMediaArtifactShadow;
}): Promise<LocalChatSession | null> {
  await ensureLedgerHydrated();
  const conversation = ledgerCache.conversationsById.get(trimString(input.sessionId));
  const beat = ledgerCache.beatsById.get(trimString(input.beatId));
  if (!conversation || !beat || beat.conversationId !== conversation.id) return null;
  const nextBeat: LocalChatStoredBeat = {
    ...beat,
    promptTrace: input.promptTrace === undefined ? beat.promptTrace : (input.promptTrace || undefined),
    audit: input.audit === undefined ? beat.audit : (input.audit || undefined),
    contextText: input.contextText === undefined ? beat.contextText : input.contextText,
    semanticSummary: input.semanticSummary === undefined ? beat.semanticSummary : (input.semanticSummary || null),
    deliveryStatus: input.deliveryStatus || beat.deliveryStatus,
    mediaSpec: input.mediaSpec === undefined ? beat.mediaSpec : input.mediaSpec,
    mediaShadow: input.mediaShadow === undefined ? beat.mediaShadow : input.mediaShadow,
    media: input.media === undefined ? beat.media : input.media,
    meta: input.meta === undefined ? beat.meta : input.meta,
  };
  const turn = ledgerCache.turnsById.get(beat.turnId);
  const timestamp = nowIso();
  const nextTurn = turn ? {
    ...turn,
    updatedAt: timestamp,
  } : null;
  const nextConversation: LocalChatConversationRecord = {
    ...conversation,
    updatedAt: timestamp,
  };

  ledgerCache.beatsById.set(nextBeat.id, nextBeat);
  if (nextTurn) {
    ledgerCache.turnsById.set(nextTurn.id, nextTurn);
  }
  ledgerCache.conversationsById.set(nextConversation.id, nextConversation);
  await persistMutation({
    puts: {
      [STORE_BEATS]: [nextBeat],
      ...(nextTurn ? { [STORE_TURNS]: [nextTurn] } : {}),
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
  const grouped = new Map<string, LocalChatTurn[]>();
  for (const turn of turns) {
    const key = trimString(turn.turnId) || trimString(turn.id);
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.push(turn);
    } else {
      grouped.set(key, [turn]);
    }
  }
  let currentConversation = conversation;
  for (const group of [...grouped.values()].sort((left, right) => {
    const leftSeq = left[0]?.turnSeq || 0;
    const rightSeq = right[0]?.turnSeq || 0;
    return leftSeq - rightSeq || String(left[0]?.timestamp || '').localeCompare(String(right[0]?.timestamp || ''));
  })) {
    const lead = group[0];
    if (!lead) continue;
    const turnRecord = await createLocalChatTurnRecord({
      conversationId: currentConversation.id,
      role: lead.role,
      turnTxnId: null,
      turnId: lead.turnId || lead.id,
      seq: lead.turnSeq > 0 ? lead.turnSeq : undefined,
      createdAt: lead.timestamp,
      beatCount: Math.max(...group.map((item) => item.beatCount || 1), 1),
    });
    const orderedBeats = [...group].sort((left, right) => (
      left.beatIndex - right.beatIndex
      || left.timestamp.localeCompare(right.timestamp)
      || left.id.localeCompare(right.id)
    ));
    for (const beat of orderedBeats) {
      await appendBeatToLocalChatTurn({
        conversationId: currentConversation.id,
        turnId: turnRecord.id,
        role: beat.role,
        kind: beat.kind,
        content: beat.content,
        contextText: beat.contextText || beat.content,
        semanticSummary: beat.semanticSummary || null,
        mediaSpec: beat.mediaSpec,
        mediaShadow: beat.mediaShadow,
        media: beat.media,
        timestamp: beat.timestamp,
        latencyMs: beat.latencyMs,
        meta: beat.meta,
        promptTrace: beat.promptTrace || null,
        audit: beat.audit || null,
        deliveryStatus: beat.meta?.mediaStatus === 'pending'
          ? 'pending'
          : beat.meta?.mediaStatus === 'failed'
            ? 'failed'
            : beat.meta?.mediaStatus === 'blocked'
              ? 'blocked'
              : 'ready',
        beatId: beat.id,
        beatIndex: beat.beatIndex,
        beatCount: beat.beatCount,
      });
    }
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
  return patchLocalChatBeatArtifacts({
    sessionId: input.sessionId,
    beatId: input.turnId,
    promptTrace: input.promptTrace,
    audit: input.audit,
  });
}

export async function listLocalChatMediaAssets(input: {
  conversationId?: string;
  turnId?: string;
  beatId?: string;
} = {}): Promise<LocalChatMediaAssetRecord[]> {
  await ensureLedgerHydrated();
  return [...ledgerCache.mediaAssetsById.values()]
    .filter((asset) => (
      (!input.conversationId || asset.conversationId === trimString(input.conversationId))
      && (!input.turnId || asset.turnId === trimString(input.turnId))
      && (!input.beatId || asset.beatId === trimString(input.beatId))
    ))
    .sort((left, right) => (
      compareIsoTimestamp(right.lastHitAt, left.lastHitAt)
      || compareIsoTimestamp(right.createdAt, left.createdAt)
      || left.id.localeCompare(right.id)
    ))
    .map((asset) => cloneMediaAssetRecord(asset));
}

export async function upsertLocalChatMediaAssetRecord(asset: LocalChatMediaAssetRecord): Promise<LocalChatMediaAssetRecord> {
  await ensureLedgerHydrated();
  const normalized = normalizeMediaAssetRecord(asset);
  if (!normalized) {
    throw new Error('LOCAL_CHAT_MEDIA_ASSET_INVALID');
  }
  ledgerCache.mediaAssetsById.set(normalized.id, normalized);
  await persistMutation({
    puts: {
      [STORE_MEDIA_ASSETS]: [normalized],
    },
  });
  return cloneMediaAssetRecord(normalized);
}

export async function getLocalChatCachedMediaAsset(executionCacheKey: string): Promise<LocalChatCachedMediaAsset | null> {
  await ensureLedgerHydrated();
  const normalizedKey = trimString(executionCacheKey);
  if (!normalizedKey) return null;
  const record = [...ledgerCache.mediaAssetsById.values()]
    .filter((asset) => asset.executionCacheKey === normalizedKey)
    .sort((left, right) => (
      compareIsoTimestamp(right.lastHitAt, left.lastHitAt)
      || compareIsoTimestamp(right.createdAt, left.createdAt)
      || left.id.localeCompare(right.id)
    ))[0];
  if (!record) return null;
  return {
    executionCacheKey: record.executionCacheKey,
    specHash: record.specHash,
    kind: record.kind,
    renderUri: record.renderUri,
    mimeType: record.mimeType,
    routeSource: record.routeSource,
    ...(record.connectorId ? { connectorId: record.connectorId } : {}),
    ...(record.model ? { model: record.model } : {}),
    createdAt: record.createdAt,
    lastHitAt: record.lastHitAt,
  };
}

export async function putLocalChatCachedMediaAsset(asset: LocalChatCachedMediaAsset): Promise<LocalChatCachedMediaAsset> {
  await ensureLedgerHydrated();
  const normalized = normalizeCachedMediaAsset(asset);
  if (!normalized) {
    throw new Error('LOCAL_CHAT_MEDIA_CACHE_INVALID_ASSET');
  }
  const record: LocalChatMediaAssetRecord = {
    ...normalized,
    id: `media_${createUlid()}`,
    conversationId: null,
    turnId: null,
    beatId: null,
  };
  ledgerCache.mediaAssetsById.set(record.id, record);
  await persistMutation({
    puts: {
      [STORE_MEDIA_ASSETS]: [record],
    },
  });
  return { ...normalized };
}

export async function getLocalChatInteractionSnapshot(conversationId: string): Promise<InteractionSnapshot | null> {
  await ensureLedgerHydrated();
  const snapshot = ledgerCache.interactionSnapshotsByConversationId.get(trimString(conversationId));
  return snapshot ? cloneInteractionSnapshot(snapshot) : null;
}

export async function upsertLocalChatInteractionSnapshot(snapshot: InteractionSnapshot): Promise<InteractionSnapshot> {
  await ensureLedgerHydrated();
  const normalized = normalizeInteractionSnapshot(snapshot) || {
    ...snapshot,
    updatedAt: snapshot.updatedAt || nowIso(),
  };
  ledgerCache.interactionSnapshotsByConversationId.set(normalized.conversationId, normalized);
  await persistMutation({
    puts: {
      [STORE_INTERACTION_SNAPSHOTS]: [normalized],
    },
  });
  return cloneInteractionSnapshot(normalized);
}

export async function listLocalChatRelationMemorySlots(input: {
  targetId: string;
  viewerId: string;
}): Promise<RelationMemorySlot[]> {
  await ensureLedgerHydrated();
  return [...ledgerCache.relationMemorySlotsById.values()]
    .filter((entry) => (
      entry.targetId === trimString(input.targetId)
      && entry.viewerId === trimString(input.viewerId)
    ))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((entry) => cloneRelationMemorySlot(entry));
}

export async function replaceLocalChatRelationMemorySlots(input: {
  targetId: string;
  viewerId: string;
  entries: RelationMemorySlot[];
}): Promise<void> {
  await ensureLedgerHydrated();
  const targetId = trimString(input.targetId);
  const viewerId = trimString(input.viewerId);
  const deleted: string[] = [];
  const preservedOverrideById = new Map<string, RelationMemorySlot['userOverride']>();
  for (const [id, slot] of ledgerCache.relationMemorySlotsById.entries()) {
    if (slot.targetId !== targetId || slot.viewerId !== viewerId) continue;
    preservedOverrideById.set(slot.id, slot.userOverride);
    ledgerCache.relationMemorySlotsById.delete(id);
    deleted.push(id);
  }
  const normalized = input.entries
    .map((entry) => normalizeRelationMemorySlot(entry))
    .filter((entry): entry is RelationMemorySlot => Boolean(entry));
  normalized.forEach((entry) => {
    const preservedOverride = preservedOverrideById.get(entry.id);
    const nextEntry = preservedOverride && entry.userOverride === 'inherit'
      ? {
        ...entry,
        userOverride: preservedOverride,
      }
      : entry;
    ledgerCache.relationMemorySlotsById.set(nextEntry.id, nextEntry);
  });
  await persistMutation({
    puts: {
      [STORE_RELATION_MEMORY_SLOTS]: normalized.map((entry) => {
        const preservedOverride = preservedOverrideById.get(entry.id);
        return preservedOverride && entry.userOverride === 'inherit'
          ? {
            ...entry,
            userOverride: preservedOverride,
          }
          : entry;
      }),
    },
    deletes: {
      [STORE_RELATION_MEMORY_SLOTS]: deleted,
    },
  });
}

export async function mergeLocalChatRelationMemorySlots(input: {
  targetId: string;
  viewerId: string;
  entries: RelationMemorySlot[];
  resolutionTexts?: string[];
  maxEntries?: number;
}): Promise<RelationMemorySlot[]> {
  await ensureLedgerHydrated();
  const targetId = trimString(input.targetId);
  const viewerId = trimString(input.viewerId);
  const normalizedEntries = input.entries
    .map((entry) => normalizeRelationMemorySlot(entry))
    .filter((entry): entry is RelationMemorySlot => Boolean(entry))
    .filter((entry) => entry.targetId === targetId && entry.viewerId === viewerId);
  const resolutionTexts = (input.resolutionTexts || []).map(trimString).filter(Boolean);
  const maxEntries = Number.isFinite(input.maxEntries) && Number(input.maxEntries) > 0
    ? Math.floor(Number(input.maxEntries))
    : 50;
  const existing = [...ledgerCache.relationMemorySlotsById.values()]
    .filter((entry) => entry.targetId === targetId && entry.viewerId === viewerId)
    .map((entry) => cloneRelationMemorySlot(entry));

  const deletedIds = new Set<string>();
  let merged = existing.filter((entry) => {
    if (!shouldResolveRelationMemorySlot(entry, resolutionTexts)) {
      return true;
    }
    deletedIds.add(entry.id);
    return false;
  });

  const putEntries = new Map<string, RelationMemorySlot>();
  for (const normalizedEntry of normalizedEntries) {
    const matched = findBestRelationMemoryMatch(merged, normalizedEntry);
    if (matched) {
      const nextEntry = withPreservedOverride({
        ...matched,
        ...normalizedEntry,
        id: matched.id,
      }, matched);
      merged = merged.map((entry) => entry.id === matched.id ? nextEntry : entry);
      putEntries.set(nextEntry.id, nextEntry);
      continue;
    }
    const nextEntry = withPreservedOverride({
      ...normalizedEntry,
      id: trimString(normalizedEntry.id) || `slot_${createUlid()}`,
    });
    merged.push(nextEntry);
    putEntries.set(nextEntry.id, nextEntry);
  }

  const { kept, removed } = pruneRelationMemorySlots(merged, maxEntries);
  removed.forEach((entry) => {
    deletedIds.add(entry.id);
    putEntries.delete(entry.id);
  });

  for (const entry of existing) {
    if (deletedIds.has(entry.id)) {
      ledgerCache.relationMemorySlotsById.delete(entry.id);
    }
  }
  kept.forEach((entry) => {
    ledgerCache.relationMemorySlotsById.set(entry.id, entry);
  });

  await persistMutation({
    puts: putEntries.size > 0
      ? {
        [STORE_RELATION_MEMORY_SLOTS]: [...putEntries.values()],
      }
      : undefined,
    deletes: deletedIds.size > 0
      ? {
        [STORE_RELATION_MEMORY_SLOTS]: [...deletedIds],
      }
      : undefined,
  });

  return kept
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((entry) => cloneRelationMemorySlot(entry));
}

export async function updateLocalChatRelationMemorySlot(input: {
  id: string;
  targetId: string;
  viewerId: string;
  updater: (previous: RelationMemorySlot) => RelationMemorySlot;
}): Promise<RelationMemorySlot | null> {
  await ensureLedgerHydrated();
  const existing = ledgerCache.relationMemorySlotsById.get(trimString(input.id));
  if (!existing) {
    return null;
  }
  if (existing.targetId !== trimString(input.targetId) || existing.viewerId !== trimString(input.viewerId)) {
    return null;
  }
  const next = normalizeRelationMemorySlot(input.updater(cloneRelationMemorySlot(existing)));
  if (!next) {
    return null;
  }
  ledgerCache.relationMemorySlotsById.set(next.id, next);
  await persistMutation({
    puts: {
      [STORE_RELATION_MEMORY_SLOTS]: [next],
    },
  });
  return cloneRelationMemorySlot(next);
}

export async function deleteLocalChatRelationMemorySlot(input: {
  id: string;
  targetId: string;
  viewerId: string;
}): Promise<void> {
  await ensureLedgerHydrated();
  const existing = ledgerCache.relationMemorySlotsById.get(trimString(input.id));
  if (!existing) {
    return;
  }
  if (existing.targetId !== trimString(input.targetId) || existing.viewerId !== trimString(input.viewerId)) {
    return;
  }
  ledgerCache.relationMemorySlotsById.delete(existing.id);
  await persistMutation({
    deletes: {
      [STORE_RELATION_MEMORY_SLOTS]: [existing.id],
    },
  });
}

export async function clearLocalChatHiddenMemoryState(input: {
  conversationId: string;
  targetId: string;
  viewerId: string;
}): Promise<void> {
  await ensureLedgerHydrated();
  const conversationId = trimString(input.conversationId);
  const targetId = trimString(input.targetId);
  const viewerId = trimString(input.viewerId);
  if (!conversationId || !targetId || !viewerId) {
    return;
  }

  const deletedSnapshotIds: string[] = [];
  if (ledgerCache.interactionSnapshotsByConversationId.has(conversationId)) {
    ledgerCache.interactionSnapshotsByConversationId.delete(conversationId);
    deletedSnapshotIds.push(conversationId);
  }

  const deletedRelationMemoryIds: string[] = [];
  for (const [id, slot] of ledgerCache.relationMemorySlotsById.entries()) {
    if (slot.targetId !== targetId || slot.viewerId !== viewerId) continue;
    ledgerCache.relationMemorySlotsById.delete(id);
    deletedRelationMemoryIds.push(id);
  }

  const deletedRecallIds: string[] = [];
  for (const [id, doc] of ledgerCache.recallIndexById.entries()) {
    if (doc.conversationId !== conversationId) continue;
    ledgerCache.recallIndexById.delete(id);
    deletedRecallIds.push(id);
  }

  await persistMutation({
    deletes: {
      ...(deletedSnapshotIds.length > 0
        ? {
          [STORE_INTERACTION_SNAPSHOTS]: deletedSnapshotIds,
        }
        : {}),
      ...(deletedRelationMemoryIds.length > 0
        ? {
          [STORE_RELATION_MEMORY_SLOTS]: deletedRelationMemoryIds,
        }
        : {}),
      ...(deletedRecallIds.length > 0
        ? {
          [STORE_RECALL_INDEX]: deletedRecallIds,
        }
        : {}),
    },
  });
  emitSessionUpdated({
    targetId,
    sessionId: conversationId,
  });
}

export async function listLocalChatRecallIndex(conversationId: string): Promise<InteractionRecallDoc[]> {
  await ensureLedgerHydrated();
  return [...ledgerCache.recallIndexById.values()]
    .filter((doc) => doc.conversationId === trimString(conversationId))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map((doc) => cloneInteractionRecallDoc(doc));
}

export async function replaceLocalChatRecallIndex(input: {
  conversationId: string;
  docs: InteractionRecallDoc[];
}): Promise<void> {
  await ensureLedgerHydrated();
  const conversationId = trimString(input.conversationId);
  const deleted: string[] = [];
  for (const [id, doc] of ledgerCache.recallIndexById.entries()) {
    if (doc.conversationId !== conversationId) continue;
    ledgerCache.recallIndexById.delete(id);
    deleted.push(id);
  }
  const normalized = input.docs
    .map((doc) => normalizeInteractionRecallDoc(doc))
    .filter((doc): doc is InteractionRecallDoc => Boolean(doc));
  normalized.forEach((doc) => {
    ledgerCache.recallIndexById.set(doc.id, doc);
  });
  await persistMutation({
    puts: {
      [STORE_RECALL_INDEX]: normalized,
    },
    deletes: {
      [STORE_RECALL_INDEX]: deleted,
    },
  });
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
  return createProjectionTurnFromMessage(input.message, input.promptTrace, input.audit);
}

export async function searchLocalChatRecallIndex(input: {
  conversationId: string;
  query: string;
  limit?: number;
}): Promise<InteractionRecallDoc[]> {
  const docs = await listLocalChatRecallIndex(input.conversationId);
  const query = trimString(input.query);
  if (!query) return docs.slice(0, input.limit || 8);
  return docs
    .map((doc) => ({
      doc,
      score: lexicalScore(doc.text, query),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => (
      right.score - left.score
      || right.doc.updatedAt.localeCompare(left.doc.updatedAt)
    ))
    .slice(0, input.limit || 8)
    .map((item) => item.doc);
}

export async function listLocalChatConversationMediaAssets(conversationId: string): Promise<LocalChatMediaAssetRecord[]> {
  await ensureLedgerHydrated();
  return mediaAssetsForConversation(trimString(conversationId)).map((asset) => cloneMediaAssetRecord(asset));
}
