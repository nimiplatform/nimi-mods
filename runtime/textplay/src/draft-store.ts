import type { RuntimeRouteBinding } from '@nimiplatform/sdk/mod';
import type { NarrativeStorySnapshot } from '../../../modules/narrative-engine/src/index.js';
import type { TextplayDraftRecord, TextplayDraftStatus, TextplayStartupPackage } from './types.js';

const TEXTPLAY_DRAFT_DB_NAME = 'nimi.textplay.draft.v1';
const TEXTPLAY_DRAFT_DB_VERSION = 1;
const STORE_DRAFTS = 'drafts';
const INDEX_WORLD_SCOPE = 'worldScope';

type DraftRow = Omit<TextplayDraftRecord, 'startupPackage' | 'engineSnapshot' | 'records' | 'routeOverride'> & {
  startupPackage: TextplayStartupPackage;
  engineSnapshot: NarrativeStorySnapshot;
  records: TextplayDraftRecord['records'];
  routeOverride: RuntimeRouteBinding | null;
};

function createMemoryStore() {
  return new Map<string, DraftRow>();
}

let dbPromise: Promise<IDBDatabase | null> | null = null;
let memoryStore: Map<string, DraftRow> | null = null;

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

function toText(value: unknown): string {
  return String(value || '').trim();
}

function toNullableText(value: unknown): string | null {
  const normalized = toText(value);
  return normalized || null;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('TEXTPLAY_DRAFT_STORE_REQUEST_FAILED'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('TEXTPLAY_DRAFT_STORE_TX_FAILED'));
    transaction.onabort = () => reject(transaction.error || new Error('TEXTPLAY_DRAFT_STORE_TX_ABORTED'));
  });
}

function normalizeDraftRow(value: unknown): DraftRow | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const key = toText(record.key);
  const worldScope = toText(record.worldScope);
  const userId = toText(record.userId);
  const worldId = toText(record.worldId);
  const storyId = toText(record.storyId);
  const agentId = toText(record.agentId);
  const entryEventId = toText(record.entryEventId);
  const sessionId = toText(record.sessionId);
  const playerName = toText(record.playerName);
  const playerIdentity = toText(record.playerIdentity);
  const entryTitle = toText(record.entryTitle);
  const agentName = toText(record.agentName);
  const createdAt = toText(record.createdAt);
  const updatedAt = toText(record.updatedAt);
  const startupPackage = record.startupPackage;
  const engineSnapshot = record.engineSnapshot;
  const statusRaw = toText(record.status).toLowerCase();
  const status: TextplayDraftStatus = statusRaw === 'paused' ? 'paused' : 'active';
  const records = Array.isArray(record.records)
    ? (record.records as TextplayDraftRecord['records'])
    : [];
  if (
    !key
    || !worldScope
    || !userId
    || !worldId
    || !storyId
    || !agentId
    || !entryEventId
    || !sessionId
    || !playerName
    || !entryTitle
    || !agentName
    || !createdAt
    || !updatedAt
    || !startupPackage
    || !engineSnapshot
  ) {
    return null;
  }
  return {
    key,
    worldScope,
    userId,
    worldId,
    storyId,
    agentId,
    entryEventId,
    sessionId,
    status,
    playerName,
    playerIdentity,
    entryTitle,
    agentName,
    agentAvatar: toNullableText(record.agentAvatar),
    startupPackage: startupPackage as TextplayStartupPackage,
    engineSnapshot: engineSnapshot as NarrativeStorySnapshot,
    records,
    routeOverride: (record.routeOverride as RuntimeRouteBinding | null | undefined) || null,
    createdAt,
    updatedAt,
  };
}

async function openDatabase(): Promise<IDBDatabase | null> {
  if (memoryStore) {
    return null;
  }
  if (!hasIndexedDb()) {
    memoryStore = createMemoryStore();
    return null;
  }
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase | null>((resolve) => {
      const request = indexedDB.open(TEXTPLAY_DRAFT_DB_NAME, TEXTPLAY_DRAFT_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_DRAFTS)) {
          const store = db.createObjectStore(STORE_DRAFTS, { keyPath: 'key' });
          store.createIndex(INDEX_WORLD_SCOPE, 'worldScope', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        memoryStore = createMemoryStore();
        resolve(null);
      };
    });
  }
  return dbPromise;
}

function sortDrafts(rows: DraftRow[]): DraftRow[] {
  return [...rows].sort((left, right) => (
    right.updatedAt.localeCompare(left.updatedAt)
    || right.createdAt.localeCompare(left.createdAt)
    || left.key.localeCompare(right.key)
  ));
}

export function buildTextplayDraftKey(input: {
  userId: string;
  worldId: string;
  storyId: string;
  agentId: string;
}): string {
  return `${toText(input.userId)}::${toText(input.worldId)}::${toText(input.storyId)}::${toText(input.agentId)}`;
}

export function buildTextplayDraftWorldScope(input: {
  userId: string;
  worldId: string;
}): string {
  return `${toText(input.userId)}::${toText(input.worldId)}`;
}

export async function saveTextplayDraft(record: TextplayDraftRecord): Promise<TextplayDraftRecord> {
  const normalized = normalizeDraftRow(record);
  if (!normalized) {
    throw new Error('TEXTPLAY_DRAFT_INVALID');
  }
  const db = await openDatabase();
  if (!db) {
    memoryStore ||= createMemoryStore();
    memoryStore.set(normalized.key, normalized);
    return normalized;
  }
  const tx = db.transaction(STORE_DRAFTS, 'readwrite');
  tx.objectStore(STORE_DRAFTS).put(normalized);
  await transactionDone(tx);
  return normalized;
}

export async function loadTextplayDraft(key: string): Promise<TextplayDraftRecord | null> {
  const normalizedKey = toText(key);
  if (!normalizedKey) {
    return null;
  }
  const db = await openDatabase();
  if (!db) {
    return memoryStore?.get(normalizedKey) || null;
  }
  const tx = db.transaction(STORE_DRAFTS, 'readonly');
  const raw = await requestToPromise(tx.objectStore(STORE_DRAFTS).get(normalizedKey));
  return normalizeDraftRow(raw);
}

export async function deleteTextplayDraft(key: string): Promise<void> {
  const normalizedKey = toText(key);
  if (!normalizedKey) {
    return;
  }
  const db = await openDatabase();
  if (!db) {
    memoryStore?.delete(normalizedKey);
    return;
  }
  const tx = db.transaction(STORE_DRAFTS, 'readwrite');
  tx.objectStore(STORE_DRAFTS).delete(normalizedKey);
  await transactionDone(tx);
}

export async function listTextplayDraftsByWorldScope(worldScope: string): Promise<TextplayDraftRecord[]> {
  const normalizedScope = toText(worldScope);
  if (!normalizedScope) {
    return [];
  }
  const db = await openDatabase();
  if (!db) {
    return sortDrafts(
      Array.from(memoryStore?.values() || []).filter((row) => row.worldScope === normalizedScope),
    );
  }
  const tx = db.transaction(STORE_DRAFTS, 'readonly');
  const store = tx.objectStore(STORE_DRAFTS);
  const index = store.index(INDEX_WORLD_SCOPE);
  const rows = await requestToPromise(index.getAll(normalizedScope));
  return sortDrafts(
    rows
      .map((row) => normalizeDraftRow(row))
      .filter((row): row is DraftRow => row !== null),
  );
}
