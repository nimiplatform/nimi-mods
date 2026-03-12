import type {
  InteractionRecallDoc,
  InteractionSnapshot,
  LocalChatConversationRecord,
  LocalChatMediaAssetRecord,
  LocalChatStoredBeat,
  LocalChatTurnRecord,
  RelationMemorySlot,
} from '../state/ledger-types.js';
import {
  normalizeBeatRecord,
  normalizeConversationRecord,
  normalizeInteractionRecallDoc,
  normalizeInteractionSnapshot,
  normalizeMediaAssetRecord,
  normalizeRelationMemorySlot,
  normalizeTurnRecord,
} from './normalizers.js';

export const LOCAL_CHAT_LEDGER_DB_NAME = 'nimi.local-chat.ledger.v3';
export const LOCAL_CHAT_LEDGER_DB_VERSION = 1;
export const LOCAL_CHAT_SESSION_UPDATED_EVENT = 'local-chat:session-updated';
export const LEGACY_LOCAL_CHAT_SESSION_STORE_KEY = 'nimi.local-chat.sessions.v2';
export const STORE_CONVERSATIONS = 'conversations';
export const STORE_TURNS = 'turns';
export const STORE_BEATS = 'beats';
export const STORE_MEDIA_ASSETS = 'mediaAssets';
export const STORE_INTERACTION_SNAPSHOTS = 'interactionSnapshots';
export const STORE_RELATION_MEMORY_SLOTS = 'relationMemorySlots';
export const STORE_RECALL_INDEX = 'recallIndex';

export type StoreName =
  | typeof STORE_CONVERSATIONS
  | typeof STORE_TURNS
  | typeof STORE_BEATS
  | typeof STORE_MEDIA_ASSETS
  | typeof STORE_INTERACTION_SNAPSHOTS
  | typeof STORE_RELATION_MEMORY_SLOTS
  | typeof STORE_RECALL_INDEX;

export type LedgerCache = {
  hydrated: boolean;
  conversationsById: Map<string, LocalChatConversationRecord>;
  turnsById: Map<string, LocalChatTurnRecord>;
  beatsById: Map<string, LocalChatStoredBeat>;
  mediaAssetsById: Map<string, LocalChatMediaAssetRecord>;
  interactionSnapshotsByConversationId: Map<string, InteractionSnapshot>;
  relationMemorySlotsById: Map<string, RelationMemorySlot>;
  recallIndexById: Map<string, InteractionRecallDoc>;
};

export type LedgerMutation = {
  puts?: Partial<Record<StoreName, unknown[]>>;
  deletes?: Partial<Record<StoreName, IDBValidKey[]>>;
};

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

export function getLedgerCache(): LedgerCache {
  return ledgerCache;
}

export function resetLedgerCache(): void {
  ledgerCache = emptyLedgerCache();
}

function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('LOCAL_CHAT_LEDGER_IDB_REQUEST_FAILED'));
  });
}

export function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('LOCAL_CHAT_LEDGER_IDB_TX_FAILED'));
    transaction.onabort = () => reject(transaction.error || new Error('LOCAL_CHAT_LEDGER_IDB_TX_ABORTED'));
  });
}

export async function openLedgerDatabase(): Promise<IDBDatabase | null> {
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

export async function loadAllFromIndexedDb(): Promise<void> {
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

export async function ensureLedgerHydrated(): Promise<void> {
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

export function emitSessionUpdated(payload: { targetId: string; sessionId: string }): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  if (typeof CustomEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent(LOCAL_CHAT_SESSION_UPDATED_EVENT, {
    detail: payload,
  }));
}

export async function persistMutation(mutation: LedgerMutation): Promise<void> {
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
