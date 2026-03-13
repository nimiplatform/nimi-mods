import {
  NARRATIVE_ACTION_HINT_BY_REASON_CODE,
  NARRATIVE_ENGINE_DATA_API_CORE_AGENT_MEMORY_RECALL_FOR_ENTITY,
  NARRATIVE_ENGINE_DATA_API_WORLD_ACCESS_ME,
  NARRATIVE_ENGINE_DATA_API_WORLD_EVENTS_LIST,
  NARRATIVE_ENGINE_DATA_API_WORLD_LOREBOOKS_LIST,
  NARRATIVE_ENGINE_DATA_API_WORLD_NARRATIVE_CONTEXTS_LIST,
  NARRATIVE_ENGINE_DATA_API_WORLD_SCENES_LIST,
  NARRATIVE_REASON_CODES,
  type NarrativeReasonCode,
} from '../contracts.js';
import {
  evaluateNarrativeInitiativePolicy,
  recordNarrativeInitiativeFired,
  recordNarrativeNonInitiativeTurn,
} from '../initiative/policy.js';
import { enrichNarrativeCoreOutputCausality } from './causal-enrichment.js';
import { buildNarrativeRenderInput } from '../projection/render-input.js';
import { NarrativeRunEventLog } from '../run/event-log.js';
import {
  appendNarrativeSpine,
  findIdempotentTurn,
  getNarrativeSpineByStoryId,
  saveIdempotentTurn,
  upsertNarrativeTurn,
} from '../store/repository.js';
import type {
  NarrativeCoreOutput,
  NarrativeAiTextRequest,
  NarrativeRenderInput,
  NarrativeRunEnvelope,
  NarrativeTurnInputNormalized,
  NarrativeTurnResponse,
  NarrativeTurnStatus,
  NarrativeTurnRecord,
} from '../types.js';
import { createStableHash } from '../utils/stable-hash.js';
import { createUlid } from '../utils/ulid.js';
import { runNarrativeStep0Intent } from './step0-intent.js';
import { runNarrativeStep1Assembly } from './step1-assembly.js';
import { runNarrativeStep2Generate } from './step2-generate.js';
import { runNarrativeStep3Guard } from './step3-guard.js';

export type NarrativeProcessTurnDeps = {
  queryData: (capability: string, query: Record<string, unknown>) => Promise<unknown>;
  generateText: (payload: NarrativeAiTextRequest) => Promise<{ text: string }>;
};

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readStringField(input: unknown, key: string): string {
  const value = toRecord(input)[key];
  return String(value || '').trim();
}

function readFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function countRowsLikePayload(value: unknown): number {
  if (Array.isArray(value)) {
    return value.length;
  }
  const record = toRecord(value);
  if (Array.isArray(record.items)) {
    return record.items.length;
  }
  if (Array.isArray(record.rows)) {
    return record.rows.length;
  }
  if (Array.isArray(record.data)) {
    return record.data.length;
  }
  return 0;
}

function resolveActionHint(reasonCode: NarrativeReasonCode | null, fallback: string): string {
  if (reasonCode) {
    return NARRATIVE_ACTION_HINT_BY_REASON_CODE[reasonCode] || fallback;
  }
  return fallback;
}

function buildFallbackRunEnvelope(input?: {
  traceId?: string;
  runId?: string;
  taskId?: string;
}): NarrativeRunEnvelope {
  return {
    traceId: input?.traceId || createUlid(),
    runId: input?.runId || createUlid(),
    taskId: input?.taskId || createUlid(),
    state: 'FAILED',
    eventType: 'run.error',
    seq: 0,
    attempt: 1,
  };
}

function buildTurnResponse(input: {
  status: NarrativeTurnStatus;
  reasonCode: NarrativeReasonCode | null;
  actionHint: string;
  traceId: string;
  turnId: string;
  storyId: string;
  runEnvelope: NarrativeRunEnvelope;
  coreOutput: NarrativeCoreOutput | null;
  projection: NarrativeRenderInput | null;
}): NarrativeTurnResponse {
  return {
    status: input.status,
    reasonCode: input.reasonCode,
    actionHint: input.actionHint,
    traceId: input.traceId,
    turnId: input.turnId,
    storyId: input.storyId,
    runEnvelope: input.runEnvelope,
    coreOutput: input.coreOutput,
    projection: input.projection,
  };
}

function toStepInputHash(input: NarrativeTurnInputNormalized): string {
  return createStableHash({
    storyId: input.storyId,
    entryEventId: input.entryEventId,
    worldId: input.worldId,
    agentId: input.agentId,
    userId: input.userId,
    triggerSource: input.triggerSource,
    userMessage: input.userMessage,
    systemContext: input.systemContext,
    capability: input.capability,
    binding: input.binding,
    cancelRequested: input.cancelRequested,
  });
}

function createUniqueSpineEventId(input: {
  usedIds: Set<string>;
  nowMs: number;
  index: number;
}): string {
  let attempt = 0;
  while (attempt < 4_096) {
    const candidate = `evt-${createUlid(input.nowMs + input.index + attempt)}`;
    if (!input.usedIds.has(candidate)) {
      return candidate;
    }
    attempt += 1;
  }
  return `evt-${createUlid(input.nowMs + input.index + 4_096)}`;
}

function toTemplateStoryId(worldId: string, entryEventId: string): string {
  const normalizedWorldId = String(worldId || '').trim();
  const normalizedEntryEventId = String(entryEventId || '').trim();
  if (!normalizedWorldId || !normalizedEntryEventId) {
    return '';
  }
  return `story.${normalizedWorldId}.${normalizedEntryEventId}`;
}

function rewriteConflictingSpineEventIds(input: {
  storyId: string;
  nowMs: number;
  events: NarrativeCoreOutput['spineEvents'];
}): {
  events: NarrativeCoreOutput['spineEvents'];
  remappedCount: number;
} {
  const usedIds = new Set(
    getNarrativeSpineByStoryId(input.storyId)
      .map((event) => String(event.id || '').trim())
      .filter(Boolean),
  );
  let remappedCount = 0;

  const rewrittenIds = new Map<string, string>();
  const events = input.events.map((event, index) => {
    const sourceId = String(event.id || '').trim();
    const needsRemap = !sourceId || usedIds.has(sourceId);
    const nextId = needsRemap
      ? createUniqueSpineEventId({
        usedIds,
        nowMs: input.nowMs,
        index,
      })
      : sourceId;
    if (needsRemap) {
      remappedCount += 1;
    }
    usedIds.add(nextId);
    if (sourceId && sourceId !== nextId) {
      rewrittenIds.set(sourceId, nextId);
    }
    if (nextId === sourceId) {
      return event;
    }
    return {
      ...event,
      id: nextId,
    };
  });

  return {
    events: events.map((event) => {
      if (!Array.isArray(event.sourceEventIds) || event.sourceEventIds.length === 0) {
        return event;
      }
      const sourceEventIds = event.sourceEventIds
        .map((eventId) => rewrittenIds.get(String(eventId || '').trim()) || String(eventId || '').trim())
        .filter(Boolean);
      return sourceEventIds.length > 0
        ? { ...event, sourceEventIds: [...new Set(sourceEventIds)] }
        : event;
    }),
    remappedCount,
  };
}

function toTurnRecord(input: {
  normalized: NarrativeTurnInputNormalized;
  status: NarrativeTurnStatus;
  reasonCode: NarrativeReasonCode | null;
  actionHint: string;
  inputHash: string;
  contextSnapshot: NarrativeTurnRecord['contextSnapshot'];
  coreOutput: NarrativeCoreOutput | null;
  projection: NarrativeRenderInput | null;
  adjustmentReason: string | null;
}): NarrativeTurnRecord {
  const nowIso = new Date(input.normalized.nowMs).toISOString();
  return {
    turnId: input.normalized.turnId,
    storyId: input.normalized.storyId,
    worldId: input.normalized.worldId,
    agentId: input.normalized.agentId,
    userId: input.normalized.userId,
    triggerSource: input.normalized.triggerSource,
    status: input.status,
    reasonCode: input.reasonCode,
    actionHint: input.actionHint,
    requestId: input.normalized.requestId,
    traceId: input.normalized.traceId,
    idempotencyKey: input.normalized.idempotencyKey,
    inputHash: input.inputHash,
    runId: input.normalized.runId,
    taskId: input.normalized.taskId,
    input: input.normalized,
    contextSnapshot: input.contextSnapshot,
    coreOutput: input.coreOutput,
    projection: input.projection,
    adjustmentReason: input.adjustmentReason,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

function buildConflictResponse(input: {
  normalized: NarrativeTurnInputNormalized;
}): NarrativeTurnResponse {
  const eventLog = new NarrativeRunEventLog({
    traceId: input.normalized.traceId,
    runId: input.normalized.runId,
    taskId: input.normalized.taskId,
    parentRunId: input.normalized.parentRunId,
    idempotencyKey: input.normalized.idempotencyKey,
  });
  eventLog.startRun({
    storyId: input.normalized.storyId,
    turnId: input.normalized.turnId,
  });
  eventLog.errorStep('write-spine', {
    reasonCode: NARRATIVE_REASON_CODES.NARRATIVE_SPINE_WRITE_CONFLICT,
    actionHint: resolveActionHint(
      NARRATIVE_REASON_CODES.NARRATIVE_SPINE_WRITE_CONFLICT,
      'Resolve append conflict and retry.',
    ),
    retryClass: 'non-retryable',
  });
  eventLog.failRun({
    reasonCode: NARRATIVE_REASON_CODES.NARRATIVE_SPINE_WRITE_CONFLICT,
    actionHint: resolveActionHint(
      NARRATIVE_REASON_CODES.NARRATIVE_SPINE_WRITE_CONFLICT,
      'Resolve append conflict and retry.',
    ),
    retryClass: 'non-retryable',
  });
  return buildTurnResponse({
    status: 'REJECTED',
    reasonCode: NARRATIVE_REASON_CODES.NARRATIVE_SPINE_WRITE_CONFLICT,
    actionHint: resolveActionHint(
      NARRATIVE_REASON_CODES.NARRATIVE_SPINE_WRITE_CONFLICT,
      'Resolve append conflict and retry.',
    ),
    traceId: input.normalized.traceId,
    turnId: input.normalized.turnId,
    storyId: input.normalized.storyId,
    runEnvelope: eventLog.getEnvelope(),
    coreOutput: null,
    projection: null,
  });
}

function buildCancelResponse(input: {
  normalized: NarrativeTurnInputNormalized;
  eventLog: NarrativeRunEventLog;
}): NarrativeTurnResponse {
  input.eventLog.cancelRun({
    reasonCode: NARRATIVE_REASON_CODES.NARRATIVE_RUN_CANCELED,
    actionHint: resolveActionHint(
      NARRATIVE_REASON_CODES.NARRATIVE_RUN_CANCELED,
      'Run is canceled. Resume from checkpoint or start a new run.',
    ),
  });
  return buildTurnResponse({
    status: 'CANCELED',
    reasonCode: NARRATIVE_REASON_CODES.NARRATIVE_RUN_CANCELED,
    actionHint: resolveActionHint(
      NARRATIVE_REASON_CODES.NARRATIVE_RUN_CANCELED,
      'Run is canceled. Resume from checkpoint or start a new run.',
    ),
    traceId: input.normalized.traceId,
    turnId: input.normalized.turnId,
    storyId: input.normalized.storyId,
    runEnvelope: input.eventLog.getEnvelope(),
    coreOutput: null,
    projection: null,
  });
}

function buildStepFailureResponse(input: {
  normalized: NarrativeTurnInputNormalized;
  eventLog: NarrativeRunEventLog;
  step: string;
  reasonCode: NarrativeReasonCode;
  actionHint: string;
  status?: NarrativeTurnStatus;
  contextSnapshot?: NarrativeTurnRecord['contextSnapshot'];
  inputHash: string;
}): NarrativeTurnResponse {
  const actionHint = resolveActionHint(input.reasonCode, input.actionHint);
  input.eventLog.errorStep(input.step, {
    reasonCode: input.reasonCode,
    actionHint,
    retryClass: 'non-retryable',
  });
  input.eventLog.failRun({
    reasonCode: input.reasonCode,
    actionHint,
    retryClass: 'non-retryable',
  });
  const response = buildTurnResponse({
    status: input.status || 'REJECTED',
    reasonCode: input.reasonCode,
    actionHint,
    traceId: input.normalized.traceId,
    turnId: input.normalized.turnId,
    storyId: input.normalized.storyId,
    runEnvelope: input.eventLog.getEnvelope(),
    coreOutput: null,
    projection: null,
  });

  const record = toTurnRecord({
    normalized: input.normalized,
    status: response.status,
    reasonCode: response.reasonCode,
    actionHint: response.actionHint,
    inputHash: input.inputHash,
    contextSnapshot: input.contextSnapshot || null,
    coreOutput: null,
    projection: null,
    adjustmentReason: null,
  });
  upsertNarrativeTurn(record);
  saveIdempotentTurn({
    key: input.normalized.idempotencyKey,
    turnId: input.normalized.turnId,
    inputHash: input.inputHash,
    response,
  });
  return response;
}

export async function processNarrativeTurn(input: {
  rawInput: unknown;
  deps: NarrativeProcessTurnDeps;
}): Promise<NarrativeTurnResponse> {
  const { deps } = input;
  const step0 = await runNarrativeStep0Intent({
    rawInput: input.rawInput,
    queryWorldAccess: (normalized) => deps.queryData(
      NARRATIVE_ENGINE_DATA_API_WORLD_ACCESS_ME,
      {
        worldId: normalized.worldId,
        storyId: normalized.storyId,
        userId: normalized.userId,
        agentId: normalized.agentId,
      },
    ),
  });

  if (!step0.ok || !step0.value) {
    const rawRecord = toRecord(input.rawInput);
    const reasonCode = step0.reasonCode || NARRATIVE_REASON_CODES.NARRATIVE_INPUT_INVALID;
    const fallbackEnvelope = buildFallbackRunEnvelope({
      traceId: readStringField(rawRecord, 'traceId') || createUlid(),
      runId: readStringField(rawRecord, 'runId') || createUlid(),
      taskId: readStringField(rawRecord, 'taskId') || createUlid(),
    });
    return buildTurnResponse({
      status: 'REJECTED',
      reasonCode,
      actionHint: resolveActionHint(reasonCode, step0.actionHint),
      traceId: fallbackEnvelope.traceId,
      turnId: readStringField(rawRecord, 'turnId') || createUlid(),
      storyId: readStringField(rawRecord, 'storyId'),
      runEnvelope: fallbackEnvelope,
      coreOutput: null,
      projection: null,
    });
  }

  const normalized = step0.value;
  const inputHash = toStepInputHash(normalized);
  const replayed = findIdempotentTurn(normalized.idempotencyKey);
  if (replayed) {
    if (replayed.inputHash === inputHash) {
      return replayed.response;
    }
    return buildConflictResponse({ normalized });
  }

  const eventLog = new NarrativeRunEventLog({
    traceId: normalized.traceId,
    runId: normalized.runId,
    taskId: normalized.taskId,
    parentRunId: normalized.parentRunId,
    idempotencyKey: normalized.idempotencyKey,
  });
  eventLog.startRun({
    storyId: normalized.storyId,
    turnId: normalized.turnId,
    triggerSource: normalized.triggerSource,
  });

  if (normalized.cancelRequested) {
    return buildCancelResponse({
      normalized,
      eventLog,
    });
  }

  eventLog.startStep('step0-intent');
  eventLog.completeStep('step0-intent', {
    details: {
      storyId: normalized.storyId,
      worldId: normalized.worldId,
    },
  });

  eventLog.startStep('step1-assembly');
  const step1SpineHistory = getNarrativeSpineByStoryId(normalized.storyId).slice(-10);
  const step1 = await runNarrativeStep1Assembly({
    turn: normalized,
    recentSpineEvents: step1SpineHistory,
    queryWorldEvents: () => deps.queryData(
      NARRATIVE_ENGINE_DATA_API_WORLD_EVENTS_LIST,
      { worldId: normalized.worldId },
    ),
    queryWorldLorebooks: () => deps.queryData(
      NARRATIVE_ENGINE_DATA_API_WORLD_LOREBOOKS_LIST,
      { worldId: normalized.worldId },
    ),
    queryWorldScenes: () => deps.queryData(
      NARRATIVE_ENGINE_DATA_API_WORLD_SCENES_LIST,
      { worldId: normalized.worldId },
    ),
    queryNarrativeContexts: () => deps.queryData(
      NARRATIVE_ENGINE_DATA_API_WORLD_NARRATIVE_CONTEXTS_LIST,
      {
        worldId: normalized.worldId,
        ...(normalized.entryEventId
          ? { storyId: toTemplateStoryId(normalized.worldId, normalized.entryEventId) }
          : { storyId: normalized.storyId }),
      },
    ).then(async (scopedPayload) => {
      const scopedCount = countRowsLikePayload(scopedPayload);
      const shouldFallbackToWorldScope = scopedCount === 0;
      if (!shouldFallbackToWorldScope) {
        return scopedPayload;
      }
      const worldScopedPayload = await deps.queryData(
        NARRATIVE_ENGINE_DATA_API_WORLD_NARRATIVE_CONTEXTS_LIST,
        {
          worldId: normalized.worldId,
        },
      );
      return countRowsLikePayload(worldScopedPayload) > 0 ? worldScopedPayload : scopedPayload;
    }),
    queryAgentMemoryRecall: () => deps.queryData(
      NARRATIVE_ENGINE_DATA_API_CORE_AGENT_MEMORY_RECALL_FOR_ENTITY,
      {
        agentId: normalized.agentId,
        entityId: normalized.userId,
        topK: 10,
        queryText: normalized.userMessage,
      },
    ),
  });
  if (!step1.ok || !step1.value) {
    const reasonCode = step1.reasonCode || NARRATIVE_REASON_CODES.NARRATIVE_CONTEXT_INSUFFICIENT;
    return buildStepFailureResponse({
      normalized,
      eventLog,
      step: 'step1-assembly',
      reasonCode,
      actionHint: step1.actionHint,
      inputHash,
    });
  }

  const step1Hash = createStableHash({
    turn: normalized.turnId,
    snapshot: step1.value.snapshot,
  });
  eventLog.completeStep('step1-assembly', {
    checkpointToken: createUlid(normalized.nowMs + 10),
    stepInputHash: step1Hash,
    lastCompletedUnit: 'snapshot',
    details: {
      promptStats: step1.value.assets.promptStats,
    },
  });

  if (normalized.cancelRequested) {
    return buildCancelResponse({
      normalized,
      eventLog,
    });
  }

  const sceneFingerprint = createStableHash({
    place: step1.value.snapshot.place,
    sceneMaterial: step1.value.snapshot.sceneMaterial.slice(0, 8),
    openThreads: step1.value.snapshot.openThreads.slice(0, 8),
  });
  const startupPolicy = toRecord(step1.value.snapshot.startupPolicy);
  const initiativePolicy = toRecord(startupPolicy.initiative);
  const parsedCooldown = readFiniteNumber(initiativePolicy.cooldownSeconds)
    ?? readFiniteNumber(initiativePolicy.cooldownWindowSeconds);
  const parsedMaxConsecutive = readFiniteNumber(initiativePolicy.maxConsecutive);
  const initiative = evaluateNarrativeInitiativePolicy({
    storyId: normalized.storyId,
    triggerSource: normalized.triggerSource,
    presence: normalized.presence,
    nowMs: normalized.nowMs,
    openThreadCount: step1.value.snapshot.openThreads.length,
    sceneFingerprint,
    cooldownWindowSeconds: parsedCooldown ?? undefined,
    maxConsecutive: parsedMaxConsecutive ?? undefined,
  });
  eventLog.startStep('initiative', {
    triggerSource: normalized.triggerSource,
    presence: normalized.presence,
    openThreadCount: step1.value.snapshot.openThreads.length,
  });
  eventLog.completeStep('initiative', {
    details: {
      decision: initiative.shouldProcessTurn ? 'CONTINUE' : 'NOOP',
      reasonCode: initiative.reasonCode,
      actionHint: initiative.actionHint,
    },
  });
  if (!initiative.shouldProcessTurn && initiative.reasonCode) {
    eventLog.completeRun({
      status: 'NOOP',
    });
    return buildTurnResponse({
      status: 'NOOP',
      reasonCode: initiative.reasonCode,
      actionHint: resolveActionHint(initiative.reasonCode, initiative.actionHint),
      traceId: normalized.traceId,
      turnId: normalized.turnId,
      storyId: normalized.storyId,
      runEnvelope: eventLog.getEnvelope(),
      coreOutput: null,
      projection: null,
    });
  }

  eventLog.startStep('step2-generate');
  const step2 = await runNarrativeStep2Generate({
    turn: normalized,
    assembly: step1.value,
    generateText: deps.generateText,
  });
  if (!step2.ok || !step2.value) {
    const reasonCode = step2.reasonCode || NARRATIVE_REASON_CODES.NARRATIVE_GENERATION_SCHEMA_INVALID;
    return buildStepFailureResponse({
      normalized,
      eventLog,
      step: 'step2-generate',
      reasonCode,
      actionHint: step2.actionHint,
      inputHash,
      contextSnapshot: step1.value.snapshot,
    });
  }

  const step2Hash = createStableHash({
    turn: normalized.turnId,
    coreOutput: step2.value,
  });
  eventLog.completeStep('step2-generate', {
    checkpointToken: createUlid(normalized.nowMs + 11),
    stepInputHash: step2Hash,
    lastCompletedUnit: 'core-output',
  });

  if (normalized.cancelRequested) {
    return buildCancelResponse({
      normalized,
      eventLog,
    });
  }

  eventLog.startStep('step3-guard');
  const recentSpineEvents = getNarrativeSpineByStoryId(normalized.storyId).slice(-32);
  const guard = runNarrativeStep3Guard({
    coreOutput: step2.value,
    tensionTarget: step1.value.snapshot.tensionTarget,
    recentSpineEvents,
  });
  if (guard.status === 'REJECTED' || !guard.output) {
    const reasonCode = guard.reasonCode || NARRATIVE_REASON_CODES.NARRATIVE_GENERATION_SCHEMA_INVALID;
    return buildStepFailureResponse({
      normalized,
      eventLog,
      step: 'step3-guard',
      reasonCode,
      actionHint: guard.actionHint,
      inputHash,
      contextSnapshot: step1.value.snapshot,
    });
  }

  eventLog.completeStep('step3-guard', {
    details: {
      guardStatus: guard.status,
      reasonCode: guard.reasonCode,
      adjustmentReason: guard.adjustmentReason,
    },
  });

  const finalOutput = enrichNarrativeCoreOutputCausality({
    triggerSource: normalized.triggerSource,
    snapshot: step1.value.snapshot,
    recentSpineEvents,
    coreOutput: guard.output,
  });
  eventLog.startStep('write-spine');
  const spineRewrite = rewriteConflictingSpineEventIds({
    storyId: normalized.storyId,
    nowMs: normalized.nowMs,
    events: finalOutput.spineEvents,
  });
  const coreOutput = spineRewrite.remappedCount > 0
    ? {
      ...finalOutput,
      spineEvents: spineRewrite.events,
    }
    : finalOutput;

  const appendResult = appendNarrativeSpine({
    storyId: normalized.storyId,
    events: coreOutput.spineEvents,
  });
  if (appendResult.appendedCount !== coreOutput.spineEvents.length) {
    return buildStepFailureResponse({
      normalized,
      eventLog,
      step: 'write-spine',
      reasonCode: NARRATIVE_REASON_CODES.NARRATIVE_SPINE_WRITE_CONFLICT,
      actionHint: 'Partial append detected.',
      inputHash,
      contextSnapshot: step1.value.snapshot,
    });
  }
  eventLog.completeStep('write-spine', {
    details: {
      appendedCount: appendResult.appendedCount,
      totalCount: appendResult.totalCount,
      remappedCount: spineRewrite.remappedCount,
    },
  });

  const projection = buildNarrativeRenderInput({
    turn: normalized,
    snapshot: step1.value.snapshot,
    coreOutput,
  });
  const reasonCode = guard.status === 'ADJUSTED'
    ? (guard.reasonCode || NARRATIVE_REASON_CODES.NARRATIVE_EVENT_COUNT_OVERFLOW_ADJUSTED)
    : null;
  const actionHint = resolveActionHint(reasonCode, guard.actionHint);

  eventLog.completeRun({
    status: guard.status,
  });

  if (normalized.triggerSource === 'AgentInitiative') {
    recordNarrativeInitiativeFired({
      storyId: normalized.storyId,
      nowMs: normalized.nowMs,
      sceneFingerprint,
    });
  } else {
    recordNarrativeNonInitiativeTurn({
      storyId: normalized.storyId,
      sceneFingerprint,
    });
  }

  const response = buildTurnResponse({
    status: guard.status,
    reasonCode,
    actionHint,
    traceId: normalized.traceId,
    turnId: normalized.turnId,
    storyId: normalized.storyId,
    runEnvelope: eventLog.getEnvelope(),
    coreOutput,
    projection,
  });

  const record = toTurnRecord({
    normalized,
    status: response.status,
    reasonCode: response.reasonCode,
    actionHint: response.actionHint,
    inputHash,
    contextSnapshot: step1.value.snapshot,
    coreOutput: response.coreOutput,
    projection: response.projection,
    adjustmentReason: guard.adjustmentReason,
  });
  upsertNarrativeTurn(record);
  saveIdempotentTurn({
    key: normalized.idempotencyKey,
    turnId: normalized.turnId,
    inputHash,
    response,
  });
  return response;
}
