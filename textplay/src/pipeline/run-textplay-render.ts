import { TEXTPLAY_CHAIN_REASON, TEXTPLAY_REASON } from '../contracts.js';
import {
  queryNarrativeProjectionRenderInput,
  queryNarrativeTurnById,
  queryNarrativeTurnResultUpsert,
} from '../data/narrative.js';
import { assertTextplayChatRouteAvailable } from '../data/route-options.js';
import { TextplayRenderRequestSchema } from '../data/schemas.js';
import type {
  TextplayNormalizedRenderInput,
  TextplayRenderFailure,
  TextplayRenderResult,
  TextplayRenderSuccess,
  TextplayRunEvent,
  TextplayRunSnapshot,
  TextplayWarning,
} from '../types.js';
import { createUlid } from '../utils/ulid.js';
import { buildTextplayPrompt } from './build-prompt.js';
import { TextplayPipelineError, mapReasonCodeToChainReason } from './error.js';
import { filterTextplayVisibility } from './filter-visibility.js';
import { generateTextplayOutput } from './generate.js';
import { normalizeTextplayRenderInput } from './normalize.js';
import { persistTextplayRenderBestEffort } from './persist-best-effort.js';
import type { TextplayPipelineStep, TextplayRenderExecutionInput } from './types.js';
import { wrapTextplayOutput } from './wrap-output.js';
import { hashString } from '../utils/hash.js';

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || '');
}

function assertNotAborted(abortSignal: AbortSignal | undefined): void {
  if (!abortSignal?.aborted) {
    return;
  }
  throw new TextplayPipelineError({
    reasonCode: TEXTPLAY_REASON.RUN_CANCELED,
    actionHint: 'Run is canceled. Resume from checkpoint or start a new run.',
    message: 'TEXTPLAY_ABORT_SIGNAL_TRIGGERED',
    stage: 'run',
    chainReasonCode: TEXTPLAY_CHAIN_REASON.RENDER_FAILED,
    retryClass: 'non-retryable',
  });
}

function createRunSnapshot(input: {
  stepInputHash: string;
  checkpointToken: string;
}): TextplayRunSnapshot {
  return {
    status: 'RUNNING',
    lastSeq: 0,
    lastCompletedStep: 'received',
    checkpointToken: input.checkpointToken,
    stepInputHash: input.stepInputHash,
    lastCompletedUnit: 'received',
    gapRefillApplied: false,
  };
}

function assertNarrativeTurnAccepted(input: {
  status: string;
  reasonCode?: string | null;
  actionHint?: string;
}): void {
  if (input.status === 'APPROVED' || input.status === 'ADJUSTED') {
    return;
  }
  throw new TextplayPipelineError({
    reasonCode: TEXTPLAY_REASON.CONTEXT_MISSING_CRITICAL,
    actionHint: String(input.actionHint || 'Resolve narrative compile rejection and retry.'),
    message: `TEXTPLAY_NARRATIVE_COMPILE_REJECTED:${String(input.reasonCode || input.status || 'unknown')}`,
    stage: 'context',
    chainReasonCode: TEXTPLAY_CHAIN_REASON.NARRATIVE_REJECTED,
    retryClass: 'non-retryable',
  });
}

function toPersistIdempotencyKey(input: {
  storyId: string;
  turnId: string;
  runId: string;
}): string {
  return `textplay:${input.storyId}:${input.turnId}:${input.runId}`;
}

export async function runTextplayRender(input: TextplayRenderExecutionInput): Promise<TextplayRenderResult> {
  const sequence = {
    value: 0,
  };
  const warnings: TextplayWarning[] = [];
  const runEvents: TextplayRunEvent[] = [];

  let checkpointToken = createUlid();
  let stepInputHash = hashString(JSON.stringify({
    storyId: input.request.storyId,
    worldId: input.request.worldId,
    agentId: input.request.agentId,
    playerId: input.request.playerId,
    runId: input.request.runId,
    traceId: input.request.traceId,
    triggerSource: input.request.triggerSource,
  }));
  let lastCompletedUnit = 'received';
  let activeStep: TextplayPipelineStep = 'received';
  let resumeHashMismatch = false;

  if (input.resumeSnapshot) {
    const resumeStepHash = String(input.resumeSnapshot.stepInputHash || '').trim();
    if (resumeStepHash !== stepInputHash) {
      resumeHashMismatch = true;
    }
    const resumeCheckpointToken = String(input.resumeSnapshot.checkpointToken || '').trim();
    const resumeLastCompletedUnit = String(input.resumeSnapshot.lastCompletedUnit || '').trim();
    if (resumeCheckpointToken) {
      checkpointToken = resumeCheckpointToken;
    }
    if (resumeLastCompletedUnit) {
      lastCompletedUnit = resumeLastCompletedUnit;
    }
  }

  const runSnapshot = createRunSnapshot({
    stepInputHash,
    checkpointToken,
  });
  runSnapshot.lastCompletedUnit = lastCompletedUnit;

  const appendEvent = (event: Omit<TextplayRunEvent, 'seq' | 'timestamp'>): TextplayRunEvent => {
    sequence.value += 1;
    const nextEvent: TextplayRunEvent = {
      ...event,
      seq: sequence.value,
      timestamp: new Date().toISOString(),
    };
    runEvents.push(nextEvent);
    runSnapshot.lastSeq = nextEvent.seq;
    return nextEvent;
  };

  const appendStepStart = (step: TextplayPipelineStep, idempotencyKey?: string) => {
    activeStep = step;
    appendEvent({
      traceId: input.request.traceId,
      runId: input.request.runId,
      parentRunId: null,
      stage: 'textplay',
      step,
      eventType: 'step.start',
      attempt: 1,
      checkpointToken,
      stepInputHash,
      lastCompletedUnit,
      ...(idempotencyKey ? { idempotencyKey } : {}),
    });
  };

  const appendStepComplete = (step: TextplayPipelineStep, idempotencyKey?: string) => {
    appendEvent({
      traceId: input.request.traceId,
      runId: input.request.runId,
      parentRunId: null,
      stage: 'textplay',
      step,
      eventType: 'step.complete',
      attempt: 1,
      checkpointToken,
      stepInputHash,
      lastCompletedUnit,
      ...(idempotencyKey ? { idempotencyKey } : {}),
    });
    lastCompletedUnit = step;
    runSnapshot.lastCompletedStep = step;
    runSnapshot.lastCompletedUnit = step;
    runSnapshot.checkpointToken = checkpointToken;
    runSnapshot.stepInputHash = stepInputHash;
    activeStep = step;
  };

  const appendStepError = (step: TextplayPipelineStep, error: TextplayPipelineError) => {
    appendEvent({
      traceId: input.request.traceId,
      runId: input.request.runId,
      parentRunId: null,
      stage: 'textplay',
      step,
      eventType: 'step.error',
      attempt: 1,
      checkpointToken,
      stepInputHash,
      lastCompletedUnit,
      reasonCode: error.reasonCode,
      actionHint: error.actionHint,
      retryClass: error.retryClass,
    });
  };

  appendEvent({
    traceId: input.request.traceId,
    runId: input.request.runId,
    parentRunId: null,
    stage: 'textplay',
    step: 'received',
    eventType: 'run.start',
    attempt: 1,
    checkpointToken,
    stepInputHash,
    lastCompletedUnit,
  });

  let normalized: TextplayNormalizedRenderInput | null = null;
  let sourceEventIds: string[] = [];
  let visibleEvents: TextplayNormalizedRenderInput['events'] = [];
  let prompt = '';

  try {
    assertNotAborted(input.deps.abortSignal);

    appendStepStart('received');
    const requestParsed = TextplayRenderRequestSchema.safeParse(input.request);
    if (!requestParsed.success) {
      throw new TextplayPipelineError({
        reasonCode: TEXTPLAY_REASON.INPUT_INVALID,
        actionHint: 'Complete player, userMessage, and events, then retry.',
        message: requestParsed.error.issues[0]?.message || 'TEXTPLAY_REQUEST_INVALID',
        stage: 'input',
        retryClass: 'non-retryable',
      });
    }

    if (resumeHashMismatch) {
      throw new TextplayPipelineError({
        reasonCode: TEXTPLAY_REASON.INPUT_INVALID,
        actionHint: 'Complete player, userMessage, and events, then retry.',
        message: 'TEXTPLAY_RESUME_HASH_MISMATCH',
        stage: 'run',
        retryClass: 'non-retryable',
      });
    }
    appendStepComplete('received');

    assertNotAborted(input.deps.abortSignal);

    appendStepStart('normalize');
    const upsertedTurn = await queryNarrativeTurnResultUpsert({
      narrativeEngine: input.deps.narrativeEngine,
      request: {
        storyId: input.request.storyId,
        worldId: input.request.worldId,
        agentId: input.request.agentId,
        playerId: input.request.playerId,
        triggerSource: input.request.triggerSource,
        userMessage: input.request.userMessage,
        systemContext: input.request.systemPayload,
        runId: input.request.runId,
        traceId: input.request.traceId,
        idempotencyKey: `textplay:${input.request.storyId}:${input.request.runId}`,
      },
    });
    assertNarrativeTurnAccepted({
      status: upsertedTurn.status,
      reasonCode: upsertedTurn.reasonCode,
      actionHint: upsertedTurn.actionHint,
    });

    const turnById = await queryNarrativeTurnById({
      narrativeEngine: input.deps.narrativeEngine,
      request: {
        storyId: input.request.storyId,
        turnId: upsertedTurn.turnId,
        traceId: input.request.traceId,
      },
    });

    const projection = await queryNarrativeProjectionRenderInput({
      narrativeEngine: input.deps.narrativeEngine,
      request: {
        storyId: input.request.storyId,
        turnId: upsertedTurn.turnId,
        traceId: input.request.traceId,
      },
    });

    const normalizedResult = normalizeTextplayRenderInput({
      request: input.request,
      upsertedTurn,
      turnById,
      projection,
    });

    normalized = normalizedResult.normalized;
    sourceEventIds = normalizedResult.sourceEventIds;
    stepInputHash = normalizedResult.stepInputHash;
    checkpointToken = createUlid();
    appendStepComplete('normalize');

    assertNotAborted(input.deps.abortSignal);

    appendStepStart('filter-visibility');
    const visibilityResult = filterTextplayVisibility({
      normalized,
    });
    visibleEvents = visibilityResult.visibleEvents;
    sourceEventIds = visibilityResult.sourceEventIds;
    checkpointToken = createUlid();
    appendStepComplete('filter-visibility');

    assertNotAborted(input.deps.abortSignal);

    appendStepStart('build-prompt');
    prompt = buildTextplayPrompt({
      normalized,
      visibleEvents,
    });
    checkpointToken = createUlid();
    appendStepComplete('build-prompt');

    assertNotAborted(input.deps.abortSignal);

    appendStepStart('generate');
    await assertTextplayChatRouteAvailable({
      hookClient: input.deps.hookClient,
    });
    const generated = await generateTextplayOutput({
      aiClient: input.deps.aiClient,
      worldId: normalized.worldId,
      prompt,
      abortSignal: input.deps.abortSignal,
    });
    checkpointToken = createUlid();
    appendStepComplete('generate');

    appendStepStart('wrap-output');
    const wrapped = wrapTextplayOutput({
      normalized,
      generated,
      sourceEventIds,
      presenceReports: input.presenceReports,
      warnings,
      runSnapshot,
    });
    checkpointToken = createUlid();
    appendStepComplete('wrap-output');

    const persistIdempotencyKey = toPersistIdempotencyKey({
      storyId: normalized.storyId,
      turnId: normalized.turnId,
      runId: normalized.runId,
    });

    runSnapshot.status = 'COMPLETED';
    runSnapshot.terminalEventType = 'run.complete';

    appendStepStart('persist-best-effort', persistIdempotencyKey);
    const persistWarning = await persistTextplayRenderBestEffort({
      hookClient: input.deps.hookClient,
      normalized,
      text: wrapped.text,
      meta: wrapped.meta,
      runEvents,
      runSnapshot,
      warnings,
      presenceReports: input.presenceReports,
    });
    if (persistWarning) {
      warnings.push(persistWarning);
    }
    checkpointToken = createUlid();
    appendStepComplete('persist-best-effort', persistIdempotencyKey);

    appendEvent({
      traceId: normalized.traceId,
      runId: normalized.runId,
      parentRunId: null,
      stage: 'textplay',
      step: 'persist-best-effort',
      eventType: 'run.complete',
      attempt: 1,
      checkpointToken,
      stepInputHash,
      lastCompletedUnit,
      idempotencyKey: persistIdempotencyKey,
    });

    const success: TextplayRenderSuccess = {
      ok: true,
      text: wrapped.text,
      meta: {
        ...wrapped.meta,
        warnings,
        runSnapshot,
      },
      runEvents,
    };

    return success;
  } catch (rawError) {
    const normalizedError = rawError instanceof TextplayPipelineError
      ? rawError
      : new TextplayPipelineError({
        reasonCode: TEXTPLAY_REASON.PROMPT_BUILD_FAILED,
        actionHint: 'Repair prompt template and normalized inputs.',
        message: toErrorMessage(rawError),
        stage: 'renderer',
        retryClass: 'non-retryable',
      });

    const failedStep: TextplayPipelineStep = activeStep;

    appendStepError(failedStep, normalizedError);

    if (normalizedError.reasonCode === TEXTPLAY_REASON.RUN_CANCELED) {
      runSnapshot.status = 'CANCELED';
      runSnapshot.terminalEventType = 'run.canceled';
      appendEvent({
        traceId: input.request.traceId,
        runId: input.request.runId,
        parentRunId: null,
        stage: 'textplay',
        step: failedStep,
        eventType: 'run.canceled',
        attempt: 1,
        checkpointToken,
        stepInputHash,
        lastCompletedUnit,
        reasonCode: normalizedError.reasonCode,
        actionHint: normalizedError.actionHint,
        retryClass: normalizedError.retryClass,
      });
    } else {
      runSnapshot.status = 'FAILED';
      runSnapshot.terminalEventType = 'run.error';
      appendEvent({
        traceId: input.request.traceId,
        runId: input.request.runId,
        parentRunId: null,
        stage: 'textplay',
        step: failedStep,
        eventType: 'run.error',
        attempt: 1,
        checkpointToken,
        stepInputHash,
        lastCompletedUnit,
        reasonCode: normalizedError.reasonCode,
        actionHint: normalizedError.actionHint,
        retryClass: normalizedError.retryClass,
      });
    }

    const failure: TextplayRenderFailure = {
      ok: false,
      reasonCode: normalizedError.reasonCode,
      actionHint: normalizedError.actionHint,
      stage: 'renderer',
      chainReasonCode: normalizedError.chainReasonCode || mapReasonCodeToChainReason(normalizedError.reasonCode),
      traceId: input.request.traceId,
      runId: input.request.runId,
      runEvents,
      runSnapshot,
      warnings,
    };

    return failure;
  }
}
