import type {
  NarrativeSpineEvent,
  NarrativeRenderInput,
  NarrativeRunEvent,
  NarrativeStoreState,
  NarrativeTurnRecord,
  NarrativeTurnResponse,
  NarrativeContextScopes,
} from '../types.js';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string {
  return String(value || '').trim();
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => asString(item)).filter(Boolean);
}

export function createEmptyNarrativeStoreState(): NarrativeStoreState {
  return {
    version: 1,
    contextsByStoryId: {},
    turnsById: {},
    turnIdsByStoryId: {},
    latestTurnIdByStoryId: {},
    projectionsByTurnId: {},
    spineByStoryId: {},
    auditEventsByRunId: {},
    idempotencyByKey: {},
  };
}

function normalizeContexts(value: unknown): Record<string, NarrativeContextScopes> {
  const source = asRecord(value);
  const out: Record<string, NarrativeContextScopes> = {};
  for (const [storyId, scopes] of Object.entries(source)) {
    const normalizedStoryId = asString(storyId);
    if (!normalizedStoryId) continue;
    const scopeRecord = asRecord(scopes);
    out[normalizedStoryId] = {
      CANON: asRecord(scopeRecord.CANON),
      STORY: asRecord(scopeRecord.STORY),
      SUBJECT: asRecord(scopeRecord.SUBJECT),
      RELATION: asRecord(scopeRecord.RELATION),
    };
  }
  return out;
}

function normalizeTurns(value: unknown): Record<string, NarrativeTurnRecord> {
  const source = asRecord(value);
  const out: Record<string, NarrativeTurnRecord> = {};
  for (const [turnId, record] of Object.entries(source)) {
    const normalizedTurnId = asString(turnId);
    if (!normalizedTurnId) continue;
    const row = asRecord(record);
    if (!asString(row.storyId)) continue;
    out[normalizedTurnId] = row as unknown as NarrativeTurnRecord;
  }
  return out;
}

function normalizeStoryTurnIndex(value: unknown): Record<string, string[]> {
  const source = asRecord(value);
  const out: Record<string, string[]> = {};
  for (const [storyId, turnIds] of Object.entries(source)) {
    const normalizedStoryId = asString(storyId);
    if (!normalizedStoryId) continue;
    out[normalizedStoryId] = asStringArray(turnIds);
  }
  return out;
}

function normalizeLatestTurnIndex(value: unknown): Record<string, string> {
  const source = asRecord(value);
  const out: Record<string, string> = {};
  for (const [storyId, turnId] of Object.entries(source)) {
    const normalizedStoryId = asString(storyId);
    const normalizedTurnId = asString(turnId);
    if (!normalizedStoryId || !normalizedTurnId) continue;
    out[normalizedStoryId] = normalizedTurnId;
  }
  return out;
}

function normalizeProjectionIndex(value: unknown): Record<string, NarrativeRenderInput> {
  const source = asRecord(value);
  const out: Record<string, NarrativeRenderInput> = {};
  for (const [turnId, projection] of Object.entries(source)) {
    const normalizedTurnId = asString(turnId);
    if (!normalizedTurnId) continue;
    out[normalizedTurnId] = asRecord(projection) as unknown as NarrativeRenderInput;
  }
  return out;
}

function normalizeSpine(value: unknown): Record<string, NarrativeSpineEvent[]> {
  const source = asRecord(value);
  const out: Record<string, NarrativeSpineEvent[]> = {};
  for (const [storyId, events] of Object.entries(source)) {
    const normalizedStoryId = asString(storyId);
    if (!normalizedStoryId) continue;
    out[normalizedStoryId] = Array.isArray(events)
      ? events.filter((item) => item && typeof item === 'object') as NarrativeSpineEvent[]
      : [];
  }
  return out;
}

function normalizeAudit(value: unknown): Record<string, NarrativeRunEvent[]> {
  const source = asRecord(value);
  const out: Record<string, NarrativeRunEvent[]> = {};
  for (const [runId, events] of Object.entries(source)) {
    const normalizedRunId = asString(runId);
    if (!normalizedRunId) continue;
    out[normalizedRunId] = Array.isArray(events)
      ? events.filter((item) => item && typeof item === 'object') as NarrativeRunEvent[]
      : [];
  }
  return out;
}

function normalizeIdempotency(value: unknown): NarrativeStoreState['idempotencyByKey'] {
  const source = asRecord(value);
  const out: NarrativeStoreState['idempotencyByKey'] = {};
  for (const [key, row] of Object.entries(source)) {
    const normalizedKey = asString(key);
    const normalizedRow = asRecord(row);
    const turnId = asString(normalizedRow.turnId);
    const inputHash = asString(normalizedRow.inputHash);
    if (!normalizedKey || !turnId || !inputHash) continue;
    out[normalizedKey] = {
      turnId,
      inputHash,
      response: asRecord(normalizedRow.response) as unknown as NarrativeTurnResponse,
    };
  }
  return out;
}

function normalizeStore(value: unknown): NarrativeStoreState {
  const record = asRecord(value);
  return {
    version: 1,
    contextsByStoryId: normalizeContexts(record.contextsByStoryId),
    turnsById: normalizeTurns(record.turnsById),
    turnIdsByStoryId: normalizeStoryTurnIndex(record.turnIdsByStoryId),
    latestTurnIdByStoryId: normalizeLatestTurnIndex(record.latestTurnIdByStoryId),
    projectionsByTurnId: normalizeProjectionIndex(record.projectionsByTurnId),
    spineByStoryId: normalizeSpine(record.spineByStoryId),
    auditEventsByRunId: normalizeAudit(record.auditEventsByRunId),
    idempotencyByKey: normalizeIdempotency(record.idempotencyByKey),
  };
}

let narrativeStoreState: NarrativeStoreState = createEmptyNarrativeStoreState();

export function loadNarrativeStoreState(): NarrativeStoreState {
  return narrativeStoreState;
}

export function saveNarrativeStoreState(state: NarrativeStoreState): void {
  narrativeStoreState = normalizeStore(state);
}
