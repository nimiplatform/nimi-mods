import type { ModAiClient } from '@nimiplatform/sdk/mod/ai';
import type { HookClient } from '@nimiplatform/sdk/mod/types';
import {
  NARRATIVE_ACTION_HINT_BY_REASON_CODE,
  NARRATIVE_ENGINE_DATA_API_AUDIT_APPEND,
  NARRATIVE_ENGINE_DATA_API_CONTEXT_RESOLVE,
  NARRATIVE_ENGINE_DATA_API_PROJECTION_RENDER_INPUT,
  NARRATIVE_ENGINE_DATA_API_SPINE_APPEND,
  NARRATIVE_ENGINE_DATA_API_TURN_BY_ID,
  NARRATIVE_ENGINE_DATA_API_TURN_LATEST,
  NARRATIVE_ENGINE_DATA_API_TURN_RESULT_UPSERT,
  NARRATIVE_ENGINE_DATA_API_TURN_WINDOW,
  NARRATIVE_REASON_CODES,
  NARRATIVE_SPINE_EVENT_TYPES,
  NARRATIVE_VISIBILITY_VALUES,
} from '../contracts.js';
import { createNarrativeFlowId, emitNarrativeLog } from '../logging.js';
import { processNarrativeTurn } from '../pipeline/process-turn.js';
import {
  buildNarrativeRenderInput,
  collectProjectionSourceEventIds,
} from '../projection/render-input.js';
import {
  NarrativeAuditAppendQuerySchema,
  NarrativeContextResolveQuerySchema,
  NarrativeProjectionQuerySchema,
  NarrativeRunCancelQuerySchema,
  NarrativeRunReplayQuerySchema,
  NarrativeTurnByIdQuerySchema,
  NarrativeTurnLatestQuerySchema,
  NarrativeTurnWindowQuerySchema,
} from '../schemas.js';
import {
  appendNarrativeRunEvent,
  appendNarrativeSpine,
  getLatestNarrativeTurn,
  getNarrativeProjectionByTurnId,
  getNarrativeRunNextSeq,
  getNarrativeSpineByStoryId,
  getNarrativeTurnById,
  getNarrativeTurnWindow,
  replayNarrativeRunEvents,
  resolveNarrativeContext,
  upsertNarrativeContext,
} from '../store/repository.js';
import type {
  NarrativeRunEvent,
  NarrativeSpineEvent,
  NarrativeTurnRecord,
} from '../types.js';
import { createStableHash } from '../utils/stable-hash.js';
import { createUlid } from '../utils/ulid.js';

type SpineAppendIdempotencyRow = {
  inputHash: string;
  response: Record<string, unknown>;
};

const spineAppendIdempotency = new Map<string, SpineAppendIdempotencyRow>();

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toString(value: unknown): string {
  return String(value || '').trim();
}

function toPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const rounded = Math.floor(parsed);
  return rounded > 0 ? rounded : fallback;
}

function toNonNegativeInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const rounded = Math.floor(parsed);
  return rounded >= 0 ? rounded : fallback;
}

function toTurnWindowQuery(query: unknown): {
  storyId: string;
  afterTurnId?: string;
  limit: number;
  ingestCursorStart: string;
  projectId: string;
} {
  const parsed = NarrativeTurnWindowQuerySchema.safeParse(query);
  if (parsed.success) {
    const raw = asRecord(query);
    const ingestCursorStart = toString(raw.ingestCursorStart || parsed.data.afterTurnId || '');
    const projectId = toString(raw.projectId || parsed.data.storyId);
    return {
      storyId: parsed.data.storyId,
      afterTurnId: parsed.data.afterTurnId,
      limit: parsed.data.limit,
      ingestCursorStart,
      projectId,
    };
  }

  const raw = asRecord(query);
  const storyId = toString(raw.storyId);
  if (!storyId) {
    throw new Error('NARRATIVE_TURN_WINDOW_STORY_ID_REQUIRED');
  }
  const ingestCursorStart = toString(raw.ingestCursorStart);
  const afterTurnId = toString(raw.afterTurnId || ingestCursorStart) || undefined;
  const limit = toPositiveInt(raw.limit, 20);
  const projectId = toString(raw.projectId || storyId);
  return {
    storyId,
    afterTurnId,
    limit,
    ingestCursorStart,
    projectId,
  };
}

function toTurnWindowEvent(event: NarrativeSpineEvent): Record<string, unknown> {
  const payload = event.payload || {};
  return {
    eventId: event.id,
    type: event.type,
    visibility: event.visibility,
    summary: toString(
      payload.summary
      || payload.content
      || payload.text
      || payload.description
      || event.type,
    ) || event.type,
    sourceEventIds: Array.isArray(event.sourceEventIds)
      ? event.sourceEventIds.map((item) => toString(item)).filter(Boolean)
      : [event.id],
  };
}

function toTurnWindowRows(input: {
  storyId: string;
  turns: NarrativeTurnRecord[];
  projectId: string;
  ingestCursorStart: string;
}) {
  const fullOrdered = getNarrativeTurnWindow({
    storyId: input.storyId,
    limit: 10_000,
  });
  const turnIndexById = new Map<string, number>();
  fullOrdered.forEach((row, index) => {
    turnIndexById.set(row.turnId, index);
  });

  const turns = input.turns.map((turn, position) => ({
    turnId: turn.turnId,
    turnIndex: turnIndexById.get(turn.turnId) ?? position,
    triggerSource: turn.triggerSource,
    userMessage: turn.input.userMessage,
    systemContext: turn.input.systemContext,
    spineEvents: (turn.coreOutput?.spineEvents || []).map(toTurnWindowEvent),
    stateChanges: turn.coreOutput?.stateChanges || {},
    metrics: turn.coreOutput?.metrics || {},
    createdAt: turn.createdAt,
    status: turn.status,
    reasonCode: turn.reasonCode,
    traceId: turn.traceId,
    runId: turn.runId,
  }));

  return {
    projectId: input.projectId,
    storyId: input.storyId,
    ingestCursorStart: input.ingestCursorStart,
    turns,
    items: turns,
  };
}

function toLatestTurnResponse(turn: NarrativeTurnRecord) {
  return {
    storyId: turn.storyId,
    turnId: turn.turnId,
    traceId: turn.traceId,
    runId: turn.runId,
    triggerSource: turn.triggerSource,
    status: turn.status,
    reasonCode: turn.reasonCode || undefined,
    actionHint: turn.actionHint,
    createdAt: turn.createdAt,
  };
}

function toTurnByIdResponse(turn: NarrativeTurnRecord) {
  return {
    storyId: turn.storyId,
    turnId: turn.turnId,
    triggerSource: turn.triggerSource,
    createdAt: turn.createdAt,
    status: turn.status,
    reasonCode: turn.reasonCode,
    actionHint: turn.actionHint,
    traceId: turn.traceId,
    runId: turn.runId,
    coreOutput: turn.coreOutput,
  };
}

function normalizeSpineEvents(value: unknown): NarrativeSpineEvent[] {
  if (!Array.isArray(value)) {
    throw new Error('NARRATIVE_SPINE_APPEND_EVENTS_REQUIRED');
  }
  return value.map((row) => {
    const record = asRecord(row);
    const id = toString(record.id || record.eventId);
    const type = toString(record.type);
    const visibility = toString(record.visibility);
    const payload = asRecord(record.payload);
    if (!id) {
      throw new Error('NARRATIVE_SPINE_APPEND_EVENT_ID_REQUIRED');
    }
    if (!NARRATIVE_SPINE_EVENT_TYPES.includes(type as NarrativeSpineEvent['type'])) {
      throw new Error('NARRATIVE_SPINE_APPEND_EVENT_TYPE_INVALID');
    }
    if (!NARRATIVE_VISIBILITY_VALUES.includes(visibility as NarrativeSpineEvent['visibility'])) {
      throw new Error('NARRATIVE_SPINE_APPEND_VISIBILITY_INVALID');
    }
    if (Object.keys(payload).length === 0) {
      throw new Error('NARRATIVE_SPINE_APPEND_PAYLOAD_EMPTY');
    }
    const sourceEventIds = Array.isArray(record.sourceEventIds)
      ? record.sourceEventIds.map((item) => toString(item)).filter(Boolean)
      : undefined;
    return {
      id,
      type: type as NarrativeSpineEvent['type'],
      visibility: visibility as NarrativeSpineEvent['visibility'],
      payload,
      ...(sourceEventIds ? { sourceEventIds } : {}),
      thinker: toString(record.thinker) || undefined,
      decider: toString(record.decider) || undefined,
      experiencer: toString(record.experiencer) || undefined,
      owner: toString(record.owner) || undefined,
    };
  });
}

function normalizeAuditEvent(event: unknown, runId: string): NarrativeRunEvent {
  const record = asRecord(event);
  const eventType = toString(record.eventType);
  const allowedEventTypes: Array<NarrativeRunEvent['eventType']> = [
    'run.start',
    'step.start',
    'step.chunk',
    'step.complete',
    'step.error',
    'run.complete',
    'run.error',
    'run.canceled',
  ];
  if (!allowedEventTypes.includes(eventType as NarrativeRunEvent['eventType'])) {
    throw new Error('NARRATIVE_AUDIT_EVENT_TYPE_INVALID');
  }

  const seq = toNonNegativeInt(record.seq, 0);
  const attempt = toPositiveInt(record.attempt, 1);
  const timestamp = toString(record.timestamp) || new Date().toISOString();

  return {
    traceId: toString(record.traceId) || createUlid(),
    runId,
    parentRunId: toString(record.parentRunId) || null,
    stage: 'narrative-engine',
    step: toString(record.step) || 'run',
    eventType: eventType as NarrativeRunEvent['eventType'],
    seq: seq > 0 ? seq : getNarrativeRunNextSeq(runId),
    attempt,
    timestamp,
    taskId: toString(record.taskId) || undefined,
    idempotencyKey: toString(record.idempotencyKey) || undefined,
    checkpointToken: toString(record.checkpointToken) || undefined,
    stepInputHash: toString(record.stepInputHash) || undefined,
    lastCompletedUnit: toString(record.lastCompletedUnit) || undefined,
    reasonCode: toString(record.reasonCode) || undefined,
    actionHint: toString(record.actionHint) || undefined,
    retryClass: toString(record.retryClass) === 'retryable' ? 'retryable' : 'non-retryable',
    details: asRecord(record.details),
  };
}

function resolveProjectionFromTurn(turn: NarrativeTurnRecord): Record<string, unknown> {
  if (turn.projection) {
    return turn.projection;
  }
  if (!turn.coreOutput || !turn.contextSnapshot) {
    throw new Error('NARRATIVE_PROJECTION_NOT_AVAILABLE');
  }
  const rebuilt = buildNarrativeRenderInput({
    turn: turn.input,
    snapshot: turn.contextSnapshot,
    coreOutput: turn.coreOutput,
  });
  return rebuilt;
}

export async function registerNarrativeDataCapabilities(input: {
  hookClient: HookClient;
  aiClient: ModAiClient;
}): Promise<void> {
  const { hookClient, aiClient } = input;
  const flowId = createNarrativeFlowId('narrative-data-registrar');

  emitNarrativeLog({
    level: 'debug',
    message: 'action:data-registrar:init',
    flowId,
    source: 'registerNarrativeDataCapabilities',
  });

  await hookClient.data.register({
    capability: NARRATIVE_ENGINE_DATA_API_CONTEXT_RESOLVE,
    handler: async (query) => {
      const parsed = NarrativeContextResolveQuerySchema.safeParse(query);
      if (!parsed.success) {
        throw new Error(`NARRATIVE_CONTEXT_RESOLVE_QUERY_INVALID:${parsed.error.issues[0]?.message || 'unknown'}`);
      }
      if (parsed.data.action === 'upsert') {
        if (!parsed.data.scopes) {
          throw new Error('NARRATIVE_CONTEXT_RESOLVE_SCOPES_REQUIRED_FOR_UPSERT');
        }
        const scopes = upsertNarrativeContext(parsed.data.storyId, parsed.data.scopes);
        return {
          storyId: parsed.data.storyId,
          scopes,
        };
      }
      return {
        storyId: parsed.data.storyId,
        scopes: resolveNarrativeContext(parsed.data.storyId),
      };
    },
  });

  await hookClient.data.register({
    capability: NARRATIVE_ENGINE_DATA_API_TURN_RESULT_UPSERT,
    handler: async (query) => processNarrativeTurn({
      rawInput: query,
      deps: {
        queryData: (capability, capabilityQuery) => hookClient.data.query({
          capability,
          query: capabilityQuery,
        }),
        generateText: async (payload) => {
          const result = await aiClient.generateText(payload);
          return {
            text: result.text,
          };
        },
      },
    }),
  });

  await hookClient.data.register({
    capability: NARRATIVE_ENGINE_DATA_API_TURN_LATEST,
    handler: async (query) => {
      const parsed = NarrativeTurnLatestQuerySchema.safeParse(query);
      if (!parsed.success) {
        throw new Error(`NARRATIVE_TURN_LATEST_QUERY_INVALID:${parsed.error.issues[0]?.message || 'unknown'}`);
      }
      const turn = getLatestNarrativeTurn(parsed.data.storyId);
      if (!turn) {
        throw new Error('NARRATIVE_TURN_LATEST_NOT_FOUND');
      }
      return toLatestTurnResponse(turn);
    },
  });

  await hookClient.data.register({
    capability: NARRATIVE_ENGINE_DATA_API_TURN_BY_ID,
    handler: async (query) => {
      const parsed = NarrativeTurnByIdQuerySchema.safeParse(query);
      if (!parsed.success) {
        throw new Error(`NARRATIVE_TURN_BY_ID_QUERY_INVALID:${parsed.error.issues[0]?.message || 'unknown'}`);
      }
      const turn = getNarrativeTurnById(parsed.data.turnId);
      if (!turn) {
        throw new Error('NARRATIVE_TURN_BY_ID_NOT_FOUND');
      }
      return toTurnByIdResponse(turn);
    },
  });

  await hookClient.data.register({
    capability: NARRATIVE_ENGINE_DATA_API_TURN_WINDOW,
    handler: async (query) => {
      const parsedQuery = toTurnWindowQuery(query);
      const turns = getNarrativeTurnWindow({
        storyId: parsedQuery.storyId,
        afterTurnId: parsedQuery.afterTurnId,
        limit: parsedQuery.limit,
      });
      return toTurnWindowRows({
        storyId: parsedQuery.storyId,
        turns,
        ingestCursorStart: parsedQuery.ingestCursorStart,
        projectId: parsedQuery.projectId,
      });
    },
  });

  await hookClient.data.register({
    capability: NARRATIVE_ENGINE_DATA_API_PROJECTION_RENDER_INPUT,
    handler: async (query) => {
      const parsed = NarrativeProjectionQuerySchema.safeParse(query);
      if (!parsed.success) {
        throw new Error(`NARRATIVE_PROJECTION_QUERY_INVALID:${parsed.error.issues[0]?.message || 'unknown'}`);
      }

      let turnId = parsed.data.turnId || '';
      if (!turnId && parsed.data.storyId) {
        const latest = getLatestNarrativeTurn(parsed.data.storyId);
        if (!latest) {
          throw new Error('NARRATIVE_PROJECTION_STORY_NOT_FOUND');
        }
        turnId = latest.turnId;
      }
      if (!turnId) {
        throw new Error('NARRATIVE_PROJECTION_TURN_REQUIRED');
      }

      const projection = getNarrativeProjectionByTurnId(turnId);
      if (projection) {
        return projection;
      }

      const turn = getNarrativeTurnById(turnId);
      if (!turn) {
        throw new Error('NARRATIVE_PROJECTION_TURN_NOT_FOUND');
      }
      const rebuilt = resolveProjectionFromTurn(turn);
      return rebuilt;
    },
  });

  await hookClient.data.register({
    capability: NARRATIVE_ENGINE_DATA_API_SPINE_APPEND,
    handler: async (query) => {
      const record = asRecord(query);
      const storyId = toString(record.storyId);
      if (!storyId) {
        throw new Error('NARRATIVE_SPINE_APPEND_STORY_ID_REQUIRED');
      }
      const events = normalizeSpineEvents(record.events);
      const idempotencyKey = toString(record.idempotencyKey);
      const traceId = toString(record.traceId) || createUlid();
      const inputHash = createStableHash({
        storyId,
        events,
      });

      if (idempotencyKey) {
        const existing = spineAppendIdempotency.get(idempotencyKey);
        if (existing) {
          if (existing.inputHash === inputHash) {
            return existing.response;
          }
          return {
            status: 'REJECTED',
            reasonCode: NARRATIVE_REASON_CODES.NARRATIVE_SPINE_WRITE_CONFLICT,
            actionHint: NARRATIVE_ACTION_HINT_BY_REASON_CODE.NARRATIVE_SPINE_WRITE_CONFLICT,
            traceId,
            appendedCount: 0,
          };
        }
      }

      const existingIds = new Set(
        getNarrativeSpineByStoryId(storyId).map((event) => toString(event.id)),
      );
      const conflict = events.find((event) => existingIds.has(event.id));
      if (conflict) {
        return {
          status: 'REJECTED',
          reasonCode: NARRATIVE_REASON_CODES.NARRATIVE_SPINE_WRITE_CONFLICT,
          actionHint: NARRATIVE_ACTION_HINT_BY_REASON_CODE.NARRATIVE_SPINE_WRITE_CONFLICT,
          traceId,
          appendedCount: 0,
        };
      }

      const appendResult = appendNarrativeSpine({
        storyId,
        events,
      });
      const response = {
        status: 'APPROVED',
        reasonCode: null,
        actionHint: 'spine-appended',
        traceId,
        appendedCount: appendResult.appendedCount,
        totalCount: appendResult.totalCount,
        sourceEventIds: collectProjectionSourceEventIds({
          spineEvents: events,
          stateChanges: {},
          metrics: {},
        }),
      };

      if (idempotencyKey) {
        spineAppendIdempotency.set(idempotencyKey, {
          inputHash,
          response,
        });
      }

      return response;
    },
  });

  await hookClient.data.register({
    capability: NARRATIVE_ENGINE_DATA_API_AUDIT_APPEND,
    handler: async (query) => {
      const record = asRecord(query);
      const action = toString(record.action || 'append');

      if (action === 'append') {
        const parsed = NarrativeAuditAppendQuerySchema.safeParse(query);
        if (!parsed.success) {
          throw new Error(`NARRATIVE_AUDIT_APPEND_QUERY_INVALID:${parsed.error.issues[0]?.message || 'unknown'}`);
        }
        const event = normalizeAuditEvent(parsed.data.event, parsed.data.runId);
        appendNarrativeRunEvent({
          runId: parsed.data.runId,
          event,
        });
        return {
          ok: true,
          runId: parsed.data.runId,
          event,
        };
      }

      if (action === 'replay') {
        const parsed = NarrativeRunReplayQuerySchema.safeParse(query);
        if (!parsed.success) {
          throw new Error(`NARRATIVE_AUDIT_REPLAY_QUERY_INVALID:${parsed.error.issues[0]?.message || 'unknown'}`);
        }
        const replay = replayNarrativeRunEvents({
          runId: parsed.data.runId,
          afterSeq: parsed.data.afterSeq,
          limit: parsed.data.limit,
        });
        return {
          ok: true,
          runId: replay.runId,
          afterSeq: replay.afterSeq,
          gapRefillApplied: replay.gapRefillApplied,
          gapRefill: replay.gapRefillEvents,
          events: replay.events,
          nextAfterSeq: replay.nextAfterSeq,
        };
      }

      if (action === 'cancel-run') {
        const parsed = NarrativeRunCancelQuerySchema.safeParse(query);
        if (!parsed.success) {
          throw new Error(`NARRATIVE_AUDIT_CANCEL_QUERY_INVALID:${parsed.error.issues[0]?.message || 'unknown'}`);
        }
        const event: NarrativeRunEvent = {
          traceId: parsed.data.traceId || createUlid(),
          runId: parsed.data.runId,
          parentRunId: null,
          stage: 'narrative-engine',
          step: 'run',
          eventType: 'run.canceled',
          seq: getNarrativeRunNextSeq(parsed.data.runId),
          attempt: 1,
          timestamp: new Date().toISOString(),
          taskId: parsed.data.taskId,
          reasonCode: NARRATIVE_REASON_CODES.NARRATIVE_RUN_CANCELED,
          actionHint: NARRATIVE_ACTION_HINT_BY_REASON_CODE.NARRATIVE_RUN_CANCELED,
          retryClass: 'non-retryable',
        };
        appendNarrativeRunEvent({
          runId: parsed.data.runId,
          event,
        });
        return {
          ok: true,
          status: 'CANCELED',
          reasonCode: NARRATIVE_REASON_CODES.NARRATIVE_RUN_CANCELED,
          actionHint: NARRATIVE_ACTION_HINT_BY_REASON_CODE.NARRATIVE_RUN_CANCELED,
          runId: parsed.data.runId,
          event,
        };
      }

      throw new Error(`NARRATIVE_AUDIT_ACTION_UNSUPPORTED:${action}`);
    },
  });

  emitNarrativeLog({
    level: 'info',
    message: 'action:data-registrar:done',
    flowId,
    source: 'registerNarrativeDataCapabilities',
  });
}
