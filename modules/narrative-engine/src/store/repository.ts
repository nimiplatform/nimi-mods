import {
  createEmptyNarrativeStoreState,
  loadNarrativeStoreState,
  saveNarrativeStoreState,
} from './persistence.js';
import type {
  NarrativeContextScopes,
  NarrativeRenderInput,
  NarrativeReplayResult,
  NarrativeRunEvent,
  NarrativeSpineEvent,
  NarrativeStorySnapshot,
  NarrativeStoreState,
  NarrativeTurnRecord,
  NarrativeTurnResponse,
} from '../types.js';

const NARRATIVE_STORE_GLOBAL_KEY = '__NIMI_NARRATIVE_STORE_STATE_V1__';

type NarrativeGlobalState = typeof globalThis & {
  [NARRATIVE_STORE_GLOBAL_KEY]?: NarrativeStoreState | null;
};

function readGlobalStoreState(): NarrativeStoreState | null {
  const globalState = globalThis as NarrativeGlobalState;
  return globalState[NARRATIVE_STORE_GLOBAL_KEY] || null;
}

function writeGlobalStoreState(state: NarrativeStoreState | null): void {
  const globalState = globalThis as NarrativeGlobalState;
  globalState[NARRATIVE_STORE_GLOBAL_KEY] = state;
}

function ensureStore(): NarrativeStoreState {
  const existing = readGlobalStoreState();
  if (!existing) {
    const loaded = loadNarrativeStoreState();
    writeGlobalStoreState(loaded);
    return loaded;
  }
  return existing;
}

function commitStore(): void {
  const state = readGlobalStoreState();
  if (!state) {
    return;
  }
  saveNarrativeStoreState(state);
}

function ensureStoryTurnList(storyId: string): string[] {
  const state = ensureStore();
  const existing = state.turnIdsByStoryId[storyId];
  if (existing) {
    return existing;
  }
  state.turnIdsByStoryId[storyId] = [];
  return state.turnIdsByStoryId[storyId]!;
}

function ensureStorySpine(storyId: string): NarrativeSpineEvent[] {
  const state = ensureStore();
  const existing = state.spineByStoryId[storyId];
  if (existing) {
    return existing;
  }
  state.spineByStoryId[storyId] = [];
  return state.spineByStoryId[storyId]!;
}

function ensureRunAudit(runId: string): NarrativeRunEvent[] {
  const state = ensureStore();
  const existing = state.auditEventsByRunId[runId];
  if (existing) {
    return existing;
  }
  state.auditEventsByRunId[runId] = [];
  return state.auditEventsByRunId[runId]!;
}

function compareIsoDate(a: string, b: string): number {
  return a.localeCompare(b);
}

export function resetNarrativeRepositoryForTests(): void {
  writeGlobalStoreState(null);
  saveNarrativeStoreState(createEmptyNarrativeStoreState());
}

export function readNarrativeStoreForDiagnostics(): NarrativeStoreState {
  return ensureStore();
}

export function exportStoryState(storyId: string): NarrativeStorySnapshot {
  const state = ensureStore();
  const turnIds = [...(state.turnIdsByStoryId[storyId] || [])];
  const turns: Record<string, NarrativeTurnRecord> = {};
  const projections: Record<string, NarrativeRenderInput> = {};

  for (const turnId of turnIds) {
    const turn = state.turnsById[turnId];
    if (!turn) {
      continue;
    }
    turns[turnId] = turn;
    const projection = state.projectionsByTurnId[turnId];
    if (projection) {
      projections[turnId] = projection;
    }
  }

  return {
    version: 1,
    storyId,
    turnIds,
    latestTurnId: state.latestTurnIdByStoryId[storyId] || null,
    turns,
    projections,
    spineEvents: [...(state.spineByStoryId[storyId] || [])],
    contexts: resolveNarrativeContext(storyId),
  };
}

export function resetStoryState(storyId: string): void {
  const state = ensureStore();
  const turnIds = [...(state.turnIdsByStoryId[storyId] || [])];
  delete state.contextsByStoryId[storyId];
  delete state.turnIdsByStoryId[storyId];
  delete state.latestTurnIdByStoryId[storyId];
  delete state.spineByStoryId[storyId];

  for (const turnId of turnIds) {
    delete state.turnsById[turnId];
    delete state.projectionsByTurnId[turnId];
  }

  commitStore();
}

export function hydrateStoryState(snapshot: NarrativeStorySnapshot): void {
  resetStoryState(snapshot.storyId);
  const state = ensureStore();
  state.contextsByStoryId[snapshot.storyId] = {
    CANON: { ...snapshot.contexts.CANON },
    STORY: { ...snapshot.contexts.STORY },
    SUBJECT: { ...snapshot.contexts.SUBJECT },
    RELATION: { ...snapshot.contexts.RELATION },
  };
  state.turnIdsByStoryId[snapshot.storyId] = [...snapshot.turnIds];
  if (snapshot.latestTurnId) {
    state.latestTurnIdByStoryId[snapshot.storyId] = snapshot.latestTurnId;
  }
  state.spineByStoryId[snapshot.storyId] = [...snapshot.spineEvents];

  for (const [turnId, turn] of Object.entries(snapshot.turns)) {
    state.turnsById[turnId] = turn;
  }
  for (const [turnId, projection] of Object.entries(snapshot.projections)) {
    state.projectionsByTurnId[turnId] = projection;
  }

  commitStore();
}

export function resolveNarrativeContext(storyId: string): NarrativeContextScopes {
  const state = ensureStore();
  return state.contextsByStoryId[storyId] || {
    CANON: {},
    STORY: {},
    SUBJECT: {},
    RELATION: {},
  };
}

export function upsertNarrativeContext(storyId: string, scopes: NarrativeContextScopes): NarrativeContextScopes {
  const state = ensureStore();
  state.contextsByStoryId[storyId] = {
    CANON: { ...scopes.CANON },
    STORY: { ...scopes.STORY },
    SUBJECT: { ...scopes.SUBJECT },
    RELATION: { ...scopes.RELATION },
  };
  commitStore();
  return state.contextsByStoryId[storyId]!;
}

export function getNarrativeTurnById(turnId: string): NarrativeTurnRecord | null {
  const state = ensureStore();
  return state.turnsById[turnId] || null;
}

export function getLatestNarrativeTurn(storyId: string): NarrativeTurnRecord | null {
  const state = ensureStore();
  const turnId = state.latestTurnIdByStoryId[storyId];
  if (!turnId) {
    return null;
  }
  return state.turnsById[turnId] || null;
}

export function getNarrativeTurnWindow(input: {
  storyId: string;
  afterTurnId?: string;
  limit: number;
}): NarrativeTurnRecord[] {
  const state = ensureStore();
  const orderedTurnIds = state.turnIdsByStoryId[input.storyId] || [];
  if (orderedTurnIds.length === 0) {
    return [];
  }

  let startIndex = 0;
  if (input.afterTurnId) {
    const found = orderedTurnIds.indexOf(input.afterTurnId);
    if (found >= 0) {
      startIndex = found + 1;
    }
  }

  const selectedIds = orderedTurnIds.slice(startIndex, startIndex + input.limit);
  return selectedIds
    .map((turnId) => state.turnsById[turnId])
    .filter((item): item is NarrativeTurnRecord => Boolean(item))
    .sort((a, b) => compareIsoDate(a.createdAt, b.createdAt));
}

export function upsertNarrativeTurn(record: NarrativeTurnRecord): NarrativeTurnRecord {
  const state = ensureStore();
  const existing = state.turnsById[record.turnId] || null;

  const nextRecord: NarrativeTurnRecord = {
    ...record,
    createdAt: existing?.createdAt || record.createdAt,
    updatedAt: record.updatedAt,
  };

  state.turnsById[record.turnId] = nextRecord;

  const storyTurnIds = ensureStoryTurnList(record.storyId);
  if (!storyTurnIds.includes(record.turnId)) {
    storyTurnIds.push(record.turnId);
  }

  storyTurnIds.sort((a, b) => {
    const left = state.turnsById[a];
    const right = state.turnsById[b];
    if (!left && !right) return 0;
    if (!left) return -1;
    if (!right) return 1;
    return compareIsoDate(left.createdAt, right.createdAt);
  });

  state.latestTurnIdByStoryId[record.storyId] = record.turnId;

  if (record.projection) {
    state.projectionsByTurnId[record.turnId] = record.projection;
  }

  commitStore();
  return nextRecord;
}

export function getNarrativeProjectionByTurnId(turnId: string): NarrativeRenderInput | null {
  const state = ensureStore();
  return state.projectionsByTurnId[turnId] || null;
}

export function appendNarrativeSpine(input: {
  storyId: string;
  events: NarrativeSpineEvent[];
}): { appendedCount: number; totalCount: number } {
  const state = ensureStore();
  const existing = ensureStorySpine(input.storyId);
  const seen = new Set(existing.map((item) => item.id));
  let appended = 0;

  for (const event of input.events) {
    if (!event?.id) continue;
    if (seen.has(event.id)) continue;
    existing.push(event);
    seen.add(event.id);
    appended += 1;
  }

  commitStore();
  return {
    appendedCount: appended,
    totalCount: existing.length,
  };
}

export function getNarrativeSpineByStoryId(storyId: string): NarrativeSpineEvent[] {
  const state = ensureStore();
  return [...(state.spineByStoryId[storyId] || [])];
}

export function findIdempotentTurn(key: string): {
  turnId: string;
  inputHash: string;
  response: NarrativeTurnResponse;
} | null {
  const state = ensureStore();
  return state.idempotencyByKey[key] || null;
}

export function saveIdempotentTurn(input: {
  key: string;
  turnId: string;
  inputHash: string;
  response: NarrativeTurnResponse;
}): void {
  const state = ensureStore();
  state.idempotencyByKey[input.key] = {
    turnId: input.turnId,
    inputHash: input.inputHash,
    response: input.response,
  };
  commitStore();
}

export function appendNarrativeRunEvent(input: {
  runId: string;
  event: NarrativeRunEvent;
}): NarrativeRunEvent[] {
  const events = ensureRunAudit(input.runId);
  events.push(input.event);
  events.sort((a, b) => a.seq - b.seq);
  commitStore();
  return events;
}

export function listNarrativeRunEvents(runId: string): NarrativeRunEvent[] {
  const state = ensureStore();
  return (state.auditEventsByRunId[runId] || []).slice().sort((a, b) => a.seq - b.seq);
}

export function getNarrativeRunNextSeq(runId: string): number {
  const events = listNarrativeRunEvents(runId);
  if (events.length === 0) {
    return 1;
  }
  return events[events.length - 1]!.seq + 1;
}

export function replayNarrativeRunEvents(input: {
  runId: string;
  afterSeq: number;
  limit: number;
}): NarrativeReplayResult {
  const events = listNarrativeRunEvents(input.runId);

  if (events.length === 0) {
    return {
      runId: input.runId,
      afterSeq: input.afterSeq,
      gapRefillEvents: [],
      events: [],
      gapRefillApplied: false,
      nextAfterSeq: input.afterSeq,
    };
  }

  const minSeq = events[0]!.seq;
  const maxSeq = events[events.length - 1]!.seq;
  const targetSeq = input.afterSeq;

  const containsAfterSeq = targetSeq === 0 || events.some((event) => event.seq === targetSeq);
  const gapRefillApplied = !containsAfterSeq && targetSeq >= minSeq && targetSeq <= maxSeq;

  const gapRefillEvents = gapRefillApplied
    ? events.filter((event) => event.seq > targetSeq).slice(0, input.limit)
    : [];
  const selected = gapRefillApplied
    ? []
    : events.filter((event) => event.seq > targetSeq).slice(0, input.limit);
  const newestSeq = [...gapRefillEvents, ...selected].reduce((acc, row) => Math.max(acc, row.seq), targetSeq);

  return {
    runId: input.runId,
    afterSeq: input.afterSeq,
    gapRefillEvents,
    events: selected,
    gapRefillApplied,
    nextAfterSeq: Math.min(newestSeq, maxSeq),
  };
}
