import { loadLocalStorageJson, saveLocalStorageJson } from '@nimiplatform/sdk/mod/utils';
import { createUlid } from '../utils/ulid.js';
import type { TextplayPersistRecord, TextplayRunEvent } from '../types.js';

const TEXTPLAY_PERSIST_STORE_KEY = 'nimi.textplay.render.persist.v1';

function nowIso(): string {
  return new Date().toISOString();
}

function toStoreKey(record: { storyId: string; turnId: string; runId: string }): string {
  return `${record.storyId}::${record.turnId}::${record.runId}`;
}

type TextplayPersistStoreState = {
  recordsByKey: Record<string, TextplayPersistRecord>;
  runIdToKey: Record<string, string>;
};

function emptyState(): TextplayPersistStoreState {
  return {
    recordsByKey: {},
    runIdToKey: {},
  };
}

function normalizeRecord(record: TextplayPersistRecord): TextplayPersistRecord | null {
  if (!record || typeof record !== 'object') return null;
  const storyId = String(record.storyId || '').trim();
  const turnId = String(record.turnId || '').trim();
  const runId = String(record.runId || '').trim();
  const traceId = String(record.traceId || '').trim();
  if (!storyId || !turnId || !runId || !traceId) {
    return null;
  }
  return {
    ...record,
    id: String(record.id || '').trim() || createUlid(),
    storyId,
    turnId,
    runId,
    traceId,
    playerId: String(record.playerId || '').trim(),
    userMessage: String(record.userMessage || ''),
    text: String(record.text || ''),
    triggerSource: record.triggerSource,
    systemPayload: record.systemPayload && typeof record.systemPayload === 'object'
      ? record.systemPayload
      : null,
    runEvents: Array.isArray(record.runEvents) ? record.runEvents : [],
    warnings: Array.isArray(record.warnings) ? record.warnings : [],
    presenceReports: Array.isArray(record.presenceReports) ? record.presenceReports : [],
    createdAt: String(record.createdAt || nowIso()),
    updatedAt: String(record.updatedAt || nowIso()),
  };
}

function loadState(): TextplayPersistStoreState {
  return loadLocalStorageJson<TextplayPersistStoreState>(
    TEXTPLAY_PERSIST_STORE_KEY,
    emptyState(),
    (value) => {
      if (!value || typeof value !== 'object') {
        return emptyState();
      }
      const input = value as Partial<TextplayPersistStoreState>;
      const recordsByKey: Record<string, TextplayPersistRecord> = {};
      const runIdToKey: Record<string, string> = {};
      const rawRecords = input.recordsByKey && typeof input.recordsByKey === 'object'
        ? input.recordsByKey
        : {};
      for (const [key, rawRecord] of Object.entries(rawRecords as Record<string, TextplayPersistRecord>)) {
        const normalized = normalizeRecord(rawRecord);
        if (!normalized) continue;
        const normalizedKey = toStoreKey(normalized);
        recordsByKey[normalizedKey] = normalized;
        runIdToKey[normalized.runId] = normalizedKey;
      }
      return {
        recordsByKey,
        runIdToKey,
      };
    },
  );
}

function saveState(state: TextplayPersistStoreState): void {
  saveLocalStorageJson(TEXTPLAY_PERSIST_STORE_KEY, state);
}

export function upsertTextplayPersistRecord(
  record: Omit<TextplayPersistRecord, 'id' | 'createdAt' | 'updatedAt'> & {
    id?: string;
    createdAt?: string;
    updatedAt?: string;
  },
): TextplayPersistRecord {
  const state = loadState();
  const key = toStoreKey(record);
  const existing = state.recordsByKey[key];
  const timestamp = nowIso();
  const next: TextplayPersistRecord = {
    ...record,
    id: String(record.id || existing?.id || '').trim() || createUlid(),
    createdAt: String(record.createdAt || existing?.createdAt || timestamp),
    updatedAt: String(record.updatedAt || timestamp),
  };
  state.recordsByKey[key] = next;
  state.runIdToKey[next.runId] = key;
  saveState(state);
  return next;
}

export function getTextplayPersistRecordsByTurn(input: {
  storyId: string;
  turnId: string;
}): TextplayPersistRecord[] {
  const storyId = String(input.storyId || '').trim();
  const turnId = String(input.turnId || '').trim();
  if (!storyId || !turnId) return [];
  const state = loadState();
  return Object.values(state.recordsByKey)
    .filter((record) => record.storyId === storyId && record.turnId === turnId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
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

export function getTextplayPersistRunEvents(input: {
  runId: string;
  afterSeq?: number;
  limit?: number;
}): {
  record: TextplayPersistRecord | null;
  events: TextplayRunEvent[];
  gapRefillApplied: boolean;
  nextAfterSeq: number;
} {
  const runId = String(input.runId || '').trim();
  if (!runId) {
    return {
      record: null,
      events: [],
      gapRefillApplied: false,
      nextAfterSeq: 0,
    };
  }

  const state = loadState();
  const key = state.runIdToKey[runId];
  const record = key ? state.recordsByKey[key] || null : null;
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

export function listTextplayPersistRecordsByStory(input: {
  storyId: string;
  limit?: number;
}): TextplayPersistRecord[] {
  const storyId = String(input.storyId || '').trim();
  if (!storyId) return [];
  const limitRaw = Number.isFinite(input.limit) ? Number(input.limit) : 30;
  const limit = Math.max(1, Math.min(200, Math.floor(limitRaw)));

  const state = loadState();
  return Object.values(state.recordsByKey)
    .filter((record) => record.storyId === storyId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, limit);
}
