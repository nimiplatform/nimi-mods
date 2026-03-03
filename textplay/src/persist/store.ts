import {
  TEXTPLAY_DATA_API_WORLD_SATELLITES_BY_SPINE_LIST,
  TEXTPLAY_DATA_API_WORLD_SATELLITES_CREATE,
  TEXTPLAY_DATA_API_WORLD_SPINE_GET_OR_CREATE,
} from '../contracts.js';
import { createUlid } from '../utils/ulid.js';
import type { TextplayPersistRecord, TextplayRunEvent } from '../types.js';

const TEXTPLAY_SATELLITE_SCHEMA = 'textplay.persist.v1';
const TEXTPLAY_SATELLITE_MARKER = 'textplay.persist';

type TextplayPersistStoreState = {
  recordsByKey: Record<string, TextplayPersistRecord>;
  runIdToKey: Record<string, string>;
  spineIdByScope: Record<string, string>;
};

type TextplayDataQuery = (input: {
  capability: string;
  query: Record<string, unknown>;
}) => Promise<unknown>;

type TextplaySatelliteEnvelope = {
  schema: string;
  version?: number;
  record: TextplayPersistRecord;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string {
  return String(value || '').trim();
}

function nowIso(): string {
  return new Date().toISOString();
}

function toStoreKey(record: {
  storyId: string;
  turnId: string;
  runId: string;
}): string {
  return `${record.storyId}::${record.turnId}::${record.runId}`;
}

function toScopeKey(input: {
  worldId: string;
  agentId: string;
}): string {
  return `${input.worldId}::${input.agentId}`;
}

function parseWorldIdFromStoryId(storyId: string): string {
  const parts = storyId.split('.');
  if (parts.length >= 3 && parts[0] === 'story') {
    return parts[1] || '';
  }
  return '';
}

function emptyState(): TextplayPersistStoreState {
  return {
    recordsByKey: {},
    runIdToKey: {},
    spineIdByScope: {},
  };
}

let textplayPersistState: TextplayPersistStoreState = emptyState();

function loadState(): TextplayPersistStoreState {
  return textplayPersistState;
}

function saveState(state: TextplayPersistStoreState): void {
  textplayPersistState = state;
}

export function resetTextplayPersistStoreForTests(): void {
  saveState(emptyState());
}

function normalizeRecord(
  record: Omit<TextplayPersistRecord, 'id' | 'createdAt' | 'updatedAt'> & {
    id?: string;
    createdAt?: string;
    updatedAt?: string;
  },
): TextplayPersistRecord | null {
  if (!record || typeof record !== 'object') {
    return null;
  }
  const storyId = asString(record.storyId);
  const worldId = asString(record.worldId) || parseWorldIdFromStoryId(storyId);
  const agentId = asString(record.agentId);
  const turnId = asString(record.turnId);
  const runId = asString(record.runId);
  const traceId = asString(record.traceId);
  if (!storyId || !worldId || !agentId || !turnId || !runId || !traceId) {
    return null;
  }
  const createdAt = asString(record.createdAt) || nowIso();
  const updatedAt = asString(record.updatedAt) || createdAt;
  return {
    ...record,
    id: asString(record.id) || createUlid(),
    storyId,
    worldId,
    agentId,
    turnId,
    runId,
    traceId,
    playerId: asString(record.playerId),
    playerIdentity: asString(record.playerIdentity) || undefined,
    userMessage: String(record.userMessage || ''),
    text: String(record.text || ''),
    triggerSource: record.triggerSource,
    systemPayload: record.systemPayload && typeof record.systemPayload === 'object'
      ? record.systemPayload
      : null,
    runEvents: Array.isArray(record.runEvents) ? record.runEvents : [],
    warnings: Array.isArray(record.warnings) ? record.warnings : [],
    presenceReports: Array.isArray(record.presenceReports) ? record.presenceReports : [],
    createdAt,
    updatedAt,
  };
}

function sortByUpdatedDesc(records: TextplayPersistRecord[]): TextplayPersistRecord[] {
  return [...records].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function upsertCacheRecord(record: TextplayPersistRecord): TextplayPersistRecord {
  const state = loadState();
  const key = toStoreKey(record);
  const existing = state.recordsByKey[key];
  const merged: TextplayPersistRecord = {
    ...record,
    id: record.id || existing?.id || createUlid(),
    createdAt: record.createdAt || existing?.createdAt || nowIso(),
    updatedAt: record.updatedAt || nowIso(),
  };
  state.recordsByKey[key] = merged;
  state.runIdToKey[merged.runId] = key;
  saveState(state);
  return merged;
}

function cacheRecords(records: TextplayPersistRecord[]): void {
  for (const record of records) {
    upsertCacheRecord(record);
  }
}

function dedupeLatestByRunId(records: TextplayPersistRecord[]): TextplayPersistRecord[] {
  const latestByRunId = new Map<string, TextplayPersistRecord>();
  for (const row of records) {
    const existing = latestByRunId.get(row.runId);
    if (!existing || row.updatedAt.localeCompare(existing.updatedAt) > 0) {
      latestByRunId.set(row.runId, row);
    }
  }
  return sortByUpdatedDesc([...latestByRunId.values()]);
}

function normalizeSatelliteRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.map(asRecord);
  }
  const record = asRecord(payload);
  if (Array.isArray(record.items)) {
    return record.items.map(asRecord);
  }
  const data = asRecord(record.data);
  if (Array.isArray(data.items)) {
    return data.items.map(asRecord);
  }
  return [];
}

function parseSatelliteRecord(row: Record<string, unknown>): TextplayPersistRecord | null {
  const content = asString(row.content);
  if (!content) {
    return null;
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(content);
  } catch {
    return null;
  }
  const root = asRecord(decoded);
  const schema = asString(root.schema);
  let candidate = asRecord(root.record);
  if (!candidate.storyId) {
    candidate = root;
  }
  if (schema && schema !== TEXTPLAY_SATELLITE_SCHEMA) {
    return null;
  }
  const normalized = normalizeRecord({
    ...(candidate as unknown as Omit<TextplayPersistRecord, 'id' | 'createdAt' | 'updatedAt'>),
    id: asString(candidate.id),
    createdAt: asString(candidate.createdAt) || asString(row.createdAt),
    updatedAt: asString(candidate.updatedAt) || asString(row.updatedAt) || asString(row.createdAt),
  });
  return normalized;
}

function findCachedRecordByRunId(runId: string): TextplayPersistRecord | null {
  const state = loadState();
  const key = state.runIdToKey[runId];
  if (!key) {
    return null;
  }
  return state.recordsByKey[key] || null;
}

async function ensureSpineId(input: {
  queryData: TextplayDataQuery;
  worldId: string;
  agentId: string;
}): Promise<string> {
  const worldId = asString(input.worldId);
  const agentId = asString(input.agentId);
  if (!worldId || !agentId) {
    throw new Error('TEXTPLAY_PERSIST_SCOPE_MISSING_WORLD_OR_AGENT');
  }
  const scopeKey = toScopeKey({ worldId, agentId });
  const state = loadState();
  const cached = asString(state.spineIdByScope[scopeKey]);
  if (cached) {
    return cached;
  }
  const payload = await input.queryData({
    capability: TEXTPLAY_DATA_API_WORLD_SPINE_GET_OR_CREATE,
    query: { worldId, agentId },
  });
  const record = asRecord(payload);
  const spineRecord = asRecord(record.spine);
  const dataRecord = asRecord(record.data);
  const id = asString(record.id)
    || asString(record.spineId)
    || asString(spineRecord.id)
    || asString(dataRecord.id);
  if (!id) {
    throw new Error('TEXTPLAY_PERSIST_SPINE_ID_MISSING');
  }
  state.spineIdByScope[scopeKey] = id;
  saveState(state);
  return id;
}

async function fetchRemoteRecordsByScope(input: {
  queryData: TextplayDataQuery;
  worldId: string;
  agentId: string;
}): Promise<TextplayPersistRecord[]> {
  const spineId = await ensureSpineId({
    queryData: input.queryData,
    worldId: input.worldId,
    agentId: input.agentId,
  });
  const payload = await input.queryData({
    capability: TEXTPLAY_DATA_API_WORLD_SATELLITES_BY_SPINE_LIST,
    query: { spineId },
  });
  const rows = normalizeSatelliteRows(payload);
  const parsed = rows
    .map(parseSatelliteRecord)
    .filter((item): item is TextplayPersistRecord => item !== null);
  const deduped = dedupeLatestByRunId(parsed);
  cacheRecords(deduped);
  return deduped;
}

function filterRecordsByStory(input: {
  records: TextplayPersistRecord[];
  storyId: string;
  playerId?: string;
  limit: number;
}): TextplayPersistRecord[] {
  const storyId = asString(input.storyId);
  const playerId = asString(input.playerId);
  return sortByUpdatedDesc(
    input.records.filter((record) => {
      if (record.storyId !== storyId) {
        return false;
      }
      if (playerId && record.playerId !== playerId) {
        return false;
      }
      return true;
    }),
  ).slice(0, input.limit);
}

function getCachedRecordsByStory(input: {
  storyId: string;
  playerId?: string;
  limit: number;
}): TextplayPersistRecord[] {
  const state = loadState();
  return filterRecordsByStory({
    records: Object.values(state.recordsByKey),
    storyId: input.storyId,
    playerId: input.playerId,
    limit: input.limit,
  });
}

function fillSeqGap(input: {
  allEvents: TextplayRunEvent[];
  eventsAfterSeq: TextplayRunEvent[];
  afterSeq: number;
}): {
  events: TextplayRunEvent[];
  gapRefillApplied: boolean;
} {
  const { allEvents, eventsAfterSeq, afterSeq } = input;
  if (afterSeq <= 0 || eventsAfterSeq.length === 0) {
    return {
      events: eventsAfterSeq,
      gapRefillApplied: false,
    };
  }
  const firstSeq = eventsAfterSeq[0]!.seq;
  const expectedSeq = afterSeq + 1;
  if (firstSeq <= expectedSeq) {
    return {
      events: eventsAfterSeq,
      gapRefillApplied: false,
    };
  }
  const gapEvents = allEvents
    .filter((event) => event.seq >= expectedSeq && event.seq < firstSeq)
    .sort((left, right) => left.seq - right.seq);
  return {
    events: [...gapEvents, ...eventsAfterSeq],
    gapRefillApplied: true,
  };
}

export async function upsertTextplayPersistRecord(input: {
  queryData: TextplayDataQuery;
  record: Omit<TextplayPersistRecord, 'id' | 'createdAt' | 'updatedAt'> & {
    id?: string;
    createdAt?: string;
    updatedAt?: string;
  };
}): Promise<TextplayPersistRecord> {
  const normalized = normalizeRecord(input.record);
  if (!normalized) {
    throw new Error('TEXTPLAY_PERSIST_RECORD_INVALID');
  }

  const timestamp = nowIso();
  const upserted = upsertCacheRecord({
    ...normalized,
    updatedAt: timestamp,
  });

  const envelope: TextplaySatelliteEnvelope = {
    schema: TEXTPLAY_SATELLITE_SCHEMA,
    version: 1,
    record: upserted,
  };
  const content = JSON.stringify(envelope);
  const spineId = await ensureSpineId({
    queryData: input.queryData,
    worldId: upserted.worldId,
    agentId: upserted.agentId,
  });

  await input.queryData({
    capability: TEXTPLAY_DATA_API_WORLD_SATELLITES_CREATE,
    query: {
      worldId: upserted.worldId,
      spineId,
      type: 'CONTEXT',
      provenance: 'REAL',
      narrativeWeight: 1,
      content,
      metadata: {
        source: 'SYSTEM_GENERATED',
        visibility: 'CREATOR_ONLY',
        emotionTags: [
          TEXTPLAY_SATELLITE_MARKER,
          upserted.storyId,
          upserted.runId,
        ],
        importance: 1,
      },
    },
  });

  return upserted;
}

export async function getTextplayPersistRecordsByTurn(input: {
  queryData: TextplayDataQuery;
  storyId: string;
  turnId: string;
  worldId?: string;
  agentId?: string;
}): Promise<TextplayPersistRecord[]> {
  const storyId = asString(input.storyId);
  const turnId = asString(input.turnId);
  if (!storyId || !turnId) {
    return [];
  }

  const worldId = asString(input.worldId) || parseWorldIdFromStoryId(storyId);
  const agentId = asString(input.agentId);
  if (worldId && agentId) {
    try {
      const remote = await fetchRemoteRecordsByScope({
        queryData: input.queryData,
        worldId,
        agentId,
      });
      return sortByUpdatedDesc(remote.filter((record) => (
        record.storyId === storyId && record.turnId === turnId
      )));
    } catch {
      // Fall back to cache-only view when remote query fails.
    }
  }

  return sortByUpdatedDesc(
    Object.values(loadState().recordsByKey).filter((record) => (
      record.storyId === storyId && record.turnId === turnId
    )),
  );
}

export async function listTextplayPersistRecordsByStory(input: {
  queryData: TextplayDataQuery;
  storyId: string;
  worldId?: string;
  agentId?: string;
  playerId?: string;
  limit?: number;
}): Promise<TextplayPersistRecord[]> {
  const storyId = asString(input.storyId);
  if (!storyId) {
    return [];
  }
  const limitRaw = Number.isFinite(input.limit) ? Number(input.limit) : 30;
  const limit = Math.max(1, Math.min(200, Math.floor(limitRaw)));
  const worldId = asString(input.worldId) || parseWorldIdFromStoryId(storyId);
  const agentId = asString(input.agentId);

  if (worldId && agentId) {
    try {
      const remote = await fetchRemoteRecordsByScope({
        queryData: input.queryData,
        worldId,
        agentId,
      });
      return filterRecordsByStory({
        records: remote,
        storyId,
        playerId: input.playerId,
        limit,
      });
    } catch {
      // Keep local fallback for same-session visibility when remote path is unavailable.
    }
  }

  return getCachedRecordsByStory({
    storyId,
    playerId: input.playerId,
    limit,
  });
}

export async function getTextplayPersistRunEvents(input: {
  queryData: TextplayDataQuery;
  runId: string;
  storyId?: string;
  worldId?: string;
  agentId?: string;
  playerId?: string;
  afterSeq?: number;
  limit?: number;
}): Promise<{
  record: TextplayPersistRecord | null;
  events: TextplayRunEvent[];
  gapRefillApplied: boolean;
  nextAfterSeq: number;
}> {
  const runId = asString(input.runId);
  if (!runId) {
    return {
      record: null,
      events: [],
      gapRefillApplied: false,
      nextAfterSeq: 0,
    };
  }

  const storyId = asString(input.storyId);
  const worldId = asString(input.worldId) || parseWorldIdFromStoryId(storyId);
  const agentId = asString(input.agentId);
  if (storyId && worldId && agentId) {
    try {
      await listTextplayPersistRecordsByStory({
        queryData: input.queryData,
        storyId,
        worldId,
        agentId,
        playerId: input.playerId,
        limit: 200,
      });
    } catch {
      // Continue with cache fallback.
    }
  }

  const record = findCachedRecordByRunId(runId);
  if (!record) {
    return {
      record: null,
      events: [],
      gapRefillApplied: false,
      nextAfterSeq: 0,
    };
  }

  const afterSeq = Number.isFinite(input.afterSeq) ? Math.max(0, Number(input.afterSeq)) : 0;
  const limitRaw = Number.isFinite(input.limit) ? Number(input.limit) : 100;
  const limit = Math.max(1, Math.min(500, Math.floor(limitRaw)));
  const ordered = [...record.runEvents].sort((left, right) => left.seq - right.seq);
  const afterEvents = ordered.filter((event) => event.seq > afterSeq);
  const withGap = fillSeqGap({
    allEvents: ordered,
    eventsAfterSeq: afterEvents,
    afterSeq,
  });
  const events = withGap.events.slice(0, limit);
  const nextAfterSeq = events.length > 0 ? events[events.length - 1]!.seq : afterSeq;

  return {
    record,
    events,
    gapRefillApplied: withGap.gapRefillApplied,
    nextAfterSeq,
  };
}
