import {
  TEXTPLAY_DATA_API_WORLD_NARRATIVE_CONTEXTS_LIST,
  TEXTPLAY_DATA_API_WORLD_SATELLITES_BY_SPINE_LIST,
  TEXTPLAY_DATA_API_WORLD_SATELLITES_CREATE,
  TEXTPLAY_DATA_API_WORLD_SPINE_GET_OR_CREATE,
  TEXTPLAY_DATA_API_WORLD_WORLDS_MINE,
} from '../contracts.js';
import { createUlid } from '../utils/ulid.js';
import type { TextplayHistorySession, TextplayPersistRecord, TextplayRunEvent } from '../types.js';

const TEXTPLAY_SATELLITE_SCHEMA = 'textplay.persist.v1';
const TEXTPLAY_SATELLITE_MARKER = 'textplay.persist';
const MAX_HISTORY_SYNC_WORLDS = 3;
const MAX_HISTORY_SYNC_AGENTS_PER_WORLD = 3;
const MAX_HISTORY_SCOPE_RECORDS = 200;
const MAX_HISTORY_SESSION_ITEMS = 200;
const ENTITY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{1,}$/;

type TextplayPersistStoreState = {
  recordsByKey: Record<string, TextplayPersistRecord>;
  runIdToKey: Record<string, string>;
  spineIdByScope: Record<string, string>;
  sessionIndexByStory: Record<string, TextplayHistorySession>;
  historySyncedAtByPlayer: Record<string, string>;
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
    sessionIndexByStory: {},
    historySyncedAtByPlayer: {},
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

function isEntityId(value: string): boolean {
  return ENTITY_ID_PATTERN.test(value);
}

function abbreviateText(value: string, maxLength = 72): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}

function buildHistoryPreview(record: TextplayPersistRecord): string {
  const renderText = abbreviateText(String(record.text || ''));
  if (renderText) {
    return renderText;
  }
  const userMessage = abbreviateText(String(record.userMessage || ''));
  if (userMessage) {
    return userMessage;
  }
  return '(no preview)';
}

function toHistoryStoryKey(input: {
  playerId: string;
  worldId: string;
  storyId: string;
}): string {
  return `${input.playerId}::${input.worldId}::${input.storyId}`;
}

function toHistorySessionFromRecord(record: TextplayPersistRecord): TextplayHistorySession | null {
  const playerId = asString(record.playerId);
  const runId = asString(record.runId);
  const storyId = asString(record.storyId);
  const worldId = asString(record.worldId) || parseWorldIdFromStoryId(storyId);
  const agentId = asString(record.agentId);
  const updatedAt = asString(record.updatedAt) || nowIso();
  if (!playerId || !runId || !storyId || !worldId || !agentId) {
    return null;
  }
  return {
    runId,
    storyId,
    worldId,
    agentId,
    storyTitle: storyId,
    updatedAt,
    triggerSource: record.triggerSource,
    preview: buildHistoryPreview(record),
  };
}

function upsertHistorySessionIndex(state: TextplayPersistStoreState, record: TextplayPersistRecord): void {
  const playerId = asString(record.playerId);
  const session = toHistorySessionFromRecord(record);
  if (!playerId || !session) {
    return;
  }
  const key = toHistoryStoryKey({
    playerId,
    worldId: session.worldId,
    storyId: session.storyId,
  });
  const existing = state.sessionIndexByStory[key];
  if (existing && existing.updatedAt.localeCompare(session.updatedAt) >= 0) {
    return;
  }
  state.sessionIndexByStory[key] = session;
}

function sortHistorySessions(sessions: TextplayHistorySession[]): TextplayHistorySession[] {
  return [...sessions].sort((left, right) => (
    right.updatedAt.localeCompare(left.updatedAt)
    || left.storyId.localeCompare(right.storyId)
    || left.runId.localeCompare(right.runId)
  ));
}

function listHistorySessionsFromState(input: {
  state: TextplayPersistStoreState;
  playerId: string;
  worldId?: string;
}): TextplayHistorySession[] {
  const normalizedPlayerId = asString(input.playerId);
  const normalizedWorldId = asString(input.worldId);
  if (!normalizedPlayerId) {
    return [];
  }
  const prefix = `${normalizedPlayerId}::`;
  const rows = Object.entries(input.state.sessionIndexByStory)
    .filter(([key]) => key.startsWith(prefix))
    .map(([, value]) => value)
    .filter((value) => !normalizedWorldId || value.worldId === normalizedWorldId);
  return sortHistorySessions(rows);
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
  upsertHistorySessionIndex(state, merged);
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

function parseWorldRows(payload: unknown): Array<{ id: string; updatedAt: string }> {
  const root = asRecord(payload);
  const rows = Array.isArray(root.items)
    ? root.items
    : (Array.isArray(payload) ? payload : []);
  return rows
    .map((row) => asRecord(row))
    .map((row) => ({
      id: asString(row.id),
      updatedAt: asString(row.updatedAt) || nowIso(),
    }))
    .filter((row) => Boolean(row.id))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function parseNarrativeContextRows(payload: unknown): Record<string, unknown>[] {
  const root = asRecord(payload);
  const rows = Array.isArray(root.items)
    ? root.items
    : (Array.isArray(payload) ? payload : []);
  return rows.map((row) => asRecord(row));
}

function collectAgentCandidates(rows: Record<string, unknown>[]): string[] {
  const out = new Set<string>();
  for (const row of rows) {
    const subjectType = asString(row.subjectType).toUpperCase();
    const targetType = asString(row.targetSubjectType).toUpperCase();
    const subjectId = asString(row.subjectId);
    const targetSubjectId = asString(row.targetSubjectId);
    if (subjectType === 'AGENT' && isEntityId(subjectId)) {
      out.add(subjectId);
    }
    if (targetType === 'AGENT' && isEntityId(targetSubjectId)) {
      out.add(targetSubjectId);
    }
  }
  return [...out];
}

const historySyncInFlightByPlayer = new Map<string, Promise<void>>();

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
  createIfMissing?: boolean;
}): Promise<string> {
  const worldId = asString(input.worldId);
  const agentId = asString(input.agentId);
  const createIfMissing = input.createIfMissing !== false;
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
    query: {
      worldId,
      agentId,
      ...(createIfMissing ? {} : { createIfMissing: false }),
    },
  });
  const record = asRecord(payload);
  const spineRecord = asRecord(record.spine);
  const dataRecord = asRecord(record.data);
  const id = asString(record.id)
    || asString(record.spineId)
    || asString(spineRecord.id)
    || asString(dataRecord.id);
  if (!id) {
    if (createIfMissing) {
      throw new Error('TEXTPLAY_PERSIST_SPINE_ID_MISSING');
    }
    return '';
  }
  state.spineIdByScope[scopeKey] = id;
  saveState(state);
  return id;
}

async function fetchRemoteRecordsByScope(input: {
  queryData: TextplayDataQuery;
  worldId: string;
  agentId: string;
  createIfMissing?: boolean;
}): Promise<TextplayPersistRecord[]> {
  const spineId = await ensureSpineId({
    queryData: input.queryData,
    worldId: input.worldId,
    agentId: input.agentId,
    createIfMissing: input.createIfMissing,
  });
  if (!spineId) {
    return [];
  }
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
    createIfMissing: true,
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
        createIfMissing: false,
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
        createIfMissing: false,
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

export async function listTextplayPersistRecordsByScope(input: {
  queryData: TextplayDataQuery;
  worldId: string;
  agentId: string;
  playerId?: string;
  limit?: number;
  createIfMissing?: boolean;
}): Promise<TextplayPersistRecord[]> {
  const worldId = asString(input.worldId);
  const agentId = asString(input.agentId);
  if (!worldId || !agentId) {
    return [];
  }

  const playerId = asString(input.playerId);
  const createIfMissing = input.createIfMissing === true;
  const limitRaw = Number.isFinite(input.limit) ? Number(input.limit) : 200;
  const limit = Math.max(1, Math.min(500, Math.floor(limitRaw)));

  try {
    const remote = await fetchRemoteRecordsByScope({
      queryData: input.queryData,
      worldId,
      agentId,
      createIfMissing,
    });
    const filtered = sortByUpdatedDesc(remote.filter((record) => (
      !playerId || record.playerId === playerId
    )));
    return filtered.slice(0, limit);
  } catch {
    const local = sortByUpdatedDesc(
      Object.values(loadState().recordsByKey).filter((record) => (
        record.worldId === worldId
        && record.agentId === agentId
        && (!playerId || record.playerId === playerId)
      )),
    );
    return local.slice(0, limit);
  }
}

function paginateHistorySessions(input: {
  sessions: TextplayHistorySession[];
  limit: number;
  cursor?: string;
}): {
  items: TextplayHistorySession[];
  nextCursor: string | null;
} {
  const normalizedCursor = asString(input.cursor);
  const startIndex = normalizedCursor
    ? (() => {
      const index = input.sessions.findIndex((session) => session.runId === normalizedCursor);
      return index >= 0 ? index + 1 : 0;
    })()
    : 0;
  const items = input.sessions.slice(startIndex, startIndex + input.limit);
  const hasMore = startIndex + items.length < input.sessions.length;
  return {
    items,
    nextCursor: hasMore && items.length > 0 ? items[items.length - 1]!.runId : null,
  };
}

async function syncHistorySessionsRemote(input: {
  queryData: TextplayDataQuery;
  playerId: string;
  worldId?: string;
}): Promise<void> {
  const normalizedPlayerId = asString(input.playerId);
  if (!normalizedPlayerId) {
    return;
  }

  const preferredWorldId = asString(input.worldId);
  let worldsPayload: unknown;
  try {
    worldsPayload = await input.queryData({
      capability: TEXTPLAY_DATA_API_WORLD_WORLDS_MINE,
      query: {},
    });
  } catch {
    return;
  }

  const allWorldRows = parseWorldRows(worldsPayload);
  const prioritizedWorldIds = allWorldRows.map((row) => row.id);
  const targetWorldIds = preferredWorldId
    ? [
      preferredWorldId,
      ...prioritizedWorldIds.filter((id) => id !== preferredWorldId),
    ]
    : prioritizedWorldIds;

  for (const worldId of targetWorldIds.slice(0, MAX_HISTORY_SYNC_WORLDS)) {
    let contextPayload: unknown;
    try {
      contextPayload = await input.queryData({
        capability: TEXTPLAY_DATA_API_WORLD_NARRATIVE_CONTEXTS_LIST,
        query: { worldId },
      });
    } catch {
      continue;
    }

    const contextRows = parseNarrativeContextRows(contextPayload);
    const agentCandidates = collectAgentCandidates(contextRows).slice(0, MAX_HISTORY_SYNC_AGENTS_PER_WORLD);
    for (const agentId of agentCandidates) {
      try {
        await listTextplayPersistRecordsByScope({
          queryData: input.queryData,
          worldId,
          agentId,
          playerId: normalizedPlayerId,
          limit: MAX_HISTORY_SCOPE_RECORDS,
          createIfMissing: false,
        });
      } catch {
        // Keep best-effort behavior for history aggregation.
      }
    }
  }

  const state = loadState();
  state.historySyncedAtByPlayer[normalizedPlayerId] = nowIso();
  saveState(state);
}

async function ensureHistorySessionsSynced(input: {
  queryData: TextplayDataQuery;
  playerId: string;
  worldId?: string;
  forceRefresh?: boolean;
}): Promise<void> {
  const normalizedPlayerId = asString(input.playerId);
  if (!normalizedPlayerId) {
    return;
  }
  const state = loadState();
  const hasLocalSessions = listHistorySessionsFromState({
    state,
    playerId: normalizedPlayerId,
    worldId: input.worldId,
  }).length > 0;
  const hasSyncedBefore = Boolean(asString(state.historySyncedAtByPlayer[normalizedPlayerId]));
  if (!input.forceRefresh && hasLocalSessions) {
    return;
  }
  if (!input.forceRefresh && !hasLocalSessions && hasSyncedBefore) {
    return;
  }

  const inFlight = historySyncInFlightByPlayer.get(normalizedPlayerId);
  if (inFlight) {
    await inFlight;
    return;
  }

  const task = syncHistorySessionsRemote({
    queryData: input.queryData,
    playerId: normalizedPlayerId,
    worldId: input.worldId,
  });
  historySyncInFlightByPlayer.set(normalizedPlayerId, task);
  try {
    await task;
  } finally {
    historySyncInFlightByPlayer.delete(normalizedPlayerId);
  }
}

export async function listTextplayHistorySessionsMine(input: {
  queryData: TextplayDataQuery;
  playerId: string;
  worldId?: string;
  limit?: number;
  cursor?: string;
  refresh?: boolean;
}): Promise<{
  items: TextplayHistorySession[];
  nextCursor: string | null;
  total: number;
}> {
  const normalizedPlayerId = asString(input.playerId);
  if (!normalizedPlayerId) {
    return {
      items: [],
      nextCursor: null,
      total: 0,
    };
  }
  const limitRaw = Number.isFinite(input.limit) ? Number(input.limit) : 40;
  const limit = Math.max(1, Math.min(MAX_HISTORY_SESSION_ITEMS, Math.floor(limitRaw)));

  await ensureHistorySessionsSynced({
    queryData: input.queryData,
    playerId: normalizedPlayerId,
    worldId: input.worldId,
    forceRefresh: input.refresh === true,
  });

  const sessions = listHistorySessionsFromState({
    state: loadState(),
    playerId: normalizedPlayerId,
    worldId: input.worldId,
  });
  const paged = paginateHistorySessions({
    sessions,
    limit,
    cursor: input.cursor,
  });
  return {
    items: paged.items,
    nextCursor: paged.nextCursor,
    total: sessions.length,
  };
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
