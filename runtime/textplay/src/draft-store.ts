import { createModKvStore, createModStorageClient } from '@nimiplatform/sdk/mod';
import type { RuntimeRouteBinding } from '@nimiplatform/sdk/mod';
import type { NarrativeStorySnapshot } from '../../../modules/narrative-engine/src/index.js';
import { TEXTPLAY_MOD_ID } from './contracts.js';
import type { TextplayDraftRecord, TextplayDraftStatus, TextplayStartupPackage } from './types.js';

const DRAFTS_STATE_KEY = 'drafts';

type DraftRow = Omit<TextplayDraftRecord, 'startupPackage' | 'engineSnapshot' | 'records' | 'routeOverride'> & {
  startupPackage: TextplayStartupPackage;
  engineSnapshot: NarrativeStorySnapshot;
  records: TextplayDraftRecord['records'];
  routeOverride: RuntimeRouteBinding | null;
};

function createMemoryStore() {
  return new Map<string, DraftRow>();
}

let memoryStore: Map<string, DraftRow> | null = null;
let draftStateStore: ReturnType<typeof createModKvStore> | null = null;

function getDraftStateStore() {
  if (!draftStateStore) {
    draftStateStore = createModKvStore({
      storage: createModStorageClient(TEXTPLAY_MOD_ID),
      namespace: 'textplay.drafts',
    });
  }
  return draftStateStore;
}

function toText(value: unknown): string {
  return String(value || '').trim();
}

function toNullableText(value: unknown): string | null {
  const normalized = toText(value);
  return normalized || null;
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

async function loadDraftRows(): Promise<Map<string, DraftRow>> {
  if (memoryStore) {
    return memoryStore;
  }
  const persisted = await getDraftStateStore().getJson<Record<string, DraftRow>>(DRAFTS_STATE_KEY);
  memoryStore = new Map(Object.entries(persisted || {}));
  return memoryStore;
}

async function flushDraftRows(): Promise<void> {
  const store = await loadDraftRows();
  await getDraftStateStore().setJson(DRAFTS_STATE_KEY, Object.fromEntries(store.entries()));
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
  const store = await loadDraftRows();
  store.set(normalized.key, normalized);
  await flushDraftRows();
  return normalized;
}

export async function loadTextplayDraft(key: string): Promise<TextplayDraftRecord | null> {
  const normalizedKey = toText(key);
  if (!normalizedKey) {
    return null;
  }
  const store = await loadDraftRows();
  return store.get(normalizedKey) || null;
}

export async function deleteTextplayDraft(key: string): Promise<void> {
  const normalizedKey = toText(key);
  if (!normalizedKey) {
    return;
  }
  const store = await loadDraftRows();
  store.delete(normalizedKey);
  await flushDraftRows();
}

export async function listTextplayDraftsByWorldScope(worldScope: string): Promise<TextplayDraftRecord[]> {
  const normalizedScope = toText(worldScope);
  if (!normalizedScope) {
    return [];
  }
  const store = await loadDraftRows();
  const rows = Array.from(store.values()).filter((row) => row.worldScope === normalizedScope);
  return sortDrafts(
    rows
      .map((row) => normalizeDraftRow(row))
      .filter((row): row is DraftRow => row !== null),
  );
}
