import { TEXTPLAY_CHAIN_REASON, TEXTPLAY_REASON } from '../contracts.js';
import { NARRATIVE_REASON_CODES } from '../../../../modules/narrative-engine/src/contracts.js';
import {
  queryNarrativeProjectionRenderInput,
  queryNarrativeTurnById,
  queryNarrativeTurnResultUpsert,
} from '../data/narrative.js';
import { assertTextplayChatRouteAvailable } from '../data/route-options.js';
import type {
  NarrativeProjectionRenderInputResponse,
  NarrativeTurnByIdResponse,
} from '../data/schemas.js';
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
  const narrativeReason = String(input.reasonCode || '').trim();
  const textplayReason = narrativeReason === NARRATIVE_REASON_CODES.NARRATIVE_CONTEXT_INSUFFICIENT
    ? TEXTPLAY_REASON.CONTEXT_MISSING_CRITICAL
    : TEXTPLAY_REASON.PROMPT_BUILD_FAILED;
  const defaultActionHint = textplayReason === TEXTPLAY_REASON.CONTEXT_MISSING_CRITICAL
    ? 'Complete required context scopes and retry.'
    : 'Repair narrative output contract and retry.';
  throw new TextplayPipelineError({
    reasonCode: textplayReason,
    actionHint: String(input.actionHint || defaultActionHint),
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstNonEmpty(values: unknown[]): string {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) {
      return text;
    }
  }
  return '';
}

function truncateText(value: string, maxChars: number): string {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return '';
  }
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}...`;
}

function shouldUseRenderableFallback(input: {
  error: TextplayPipelineError;
  normalized: TextplayNormalizedRenderInput | null;
  visibleEvents: TextplayNormalizedRenderInput['events'];
}): boolean {
  if (!input.normalized) {
    return false;
  }
  if (
    input.error.reasonCode === TEXTPLAY_REASON.RUN_CANCELED
    || input.error.reasonCode === TEXTPLAY_REASON.ROUTE_UNAVAILABLE
    || input.error.reasonCode === TEXTPLAY_REASON.CONTEXT_MISSING_CRITICAL
  ) {
    return false;
  }
  const hasEvent = input.visibleEvents.some((event) => String(event.content || '').trim().length > 0);
  const hasContext = String(input.normalized.sceneSummary || '').trim().length > 0;
  return hasEvent || hasContext;
}

function buildRenderableFallbackText(input: {
  normalized: TextplayNormalizedRenderInput;
  visibleEvents: TextplayNormalizedRenderInput['events'];
}): string {
  const playerName = String(input.normalized.playerName || '').trim() || '你';
  const playerIdentity = String(input.normalized.playerIdentity || '').trim();
  const identityText = playerIdentity ? `（${playerIdentity}）` : '';
  const userAction = truncateText(String(input.normalized.userMessage || ''), 90);
  const sceneSummary = truncateText(String(input.normalized.sceneSummary || ''), 120) || '局势仍在震荡，线索交错未明';
  const pressure = input.visibleEvents
    .map((event) => truncateText(String(event.content || ''), 120))
    .filter((item) => item.length > 0)
    .slice(0, 2)
    .join('；');

  if (input.normalized.triggerSource === 'UserTurn') {
    return [
      `${playerName}${identityText}方才的举动已在局中激起涟漪：${userAction || '你刚刚做出的选择仍在发酵'}。`,
      pressure || sceneSummary,
      '局势并未收束，暗涌仍在逼近，你准备如何应对下一步变化？',
    ].join('');
  }

  return [
    sceneSummary,
    pressure || '可见征兆仍在扩散，局面尚未稳定。',
    `${playerName}${identityText}正被这股变化裹挟向前，下一步选择将决定局势走向。`,
  ].join('');
}

function toFallbackRoute(request: TextplayRenderExecutionInput['request']): {
  source: string;
  connectorId: string;
  model: string;
  provider: string;
  endpoint: string;
} {
  const override = asRecord(request.binding);
  return {
    source: firstNonEmpty([override.source, 'fallback']),
    connectorId: String(override.connectorId || ''),
    model: firstNonEmpty([override.model, 'fallback-model']),
    provider: String(override.provider || 'fallback'),
    endpoint: String(override.endpoint || ''),
  };
}

function buildStartFallbackProjection(input: {
  request: TextplayRenderExecutionInput['request'];
  storyId: string;
  turnId: string;
  userId: string;
  agentId: string;
}): NarrativeProjectionRenderInputResponse {
  const opening = asRecord(asRecord(input.request.systemPayload).opening);
  const sceneSummary = firstNonEmpty([
    opening.background,
    opening.entrySummary,
    `Scene anchored for ${input.storyId}.`,
  ]);
  const agentSummary = firstNonEmpty([
    opening.objective && `Objective: ${opening.objective}`,
    `Primary agent ${input.agentId}.`,
  ]);
  const worldStyleSummary = firstNonEmpty([
    opening.phase && opening.objective ? `Phase ${opening.phase}, objective ${opening.objective}.` : '',
    opening.instruction,
    'Narrative style follows canonical world rules.',
  ]);
  const fallbackEventContent = firstNonEmpty([
    opening.entrySummary,
    opening.background,
  ]);

  return {
    storyId: input.storyId,
    turnId: input.turnId,
    triggerSource: input.request.triggerSource,
    player: {
      id: input.userId,
      name: firstNonEmpty([
        opening.playerName,
        input.request.playerName,
      ]),
      identity: firstNonEmpty([
        opening.playerIdentity,
        opening.playerRole,
        input.request.playerIdentity,
      ]),
    },
    userMessage: String(input.request.userMessage || ''),
    systemPayload: input.request.systemPayload,
    scene: {
      summary: sceneSummary,
    },
    agent: {
      id: input.agentId,
      summary: agentSummary,
    },
    worldStyle: {
      summary: worldStyleSummary,
    },
    events: fallbackEventContent
      ? [{
        eventId: `${input.turnId}:opening-fallback`,
        visibility: 'public',
        content: fallbackEventContent,
        sourceEventIds: [String(opening.entryEventId || input.turnId).trim() || input.turnId],
      }]
      : [],
    metrics: {},
  };
}

function buildStartFallbackTurnById(input: {
  storyId: string;
  turnId: string;
  triggerSource: TextplayRenderExecutionInput['request']['triggerSource'];
}): NarrativeTurnByIdResponse {
  return {
    storyId: input.storyId,
    turnId: input.turnId,
    triggerSource: input.triggerSource,
    createdAt: new Date().toISOString(),
  };
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
    userId: input.request.userId,
    playerName: input.request.playerName || '',
    playerIdentity: input.request.playerIdentity || '',
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
        entryEventId: input.request.entryEventId,
        worldId: input.request.worldId,
        agentId: input.request.agentId,
        userId: input.request.userId,
        triggerSource: input.request.triggerSource,
        userMessage: input.request.userMessage,
        systemContext: input.request.systemPayload,
        binding: input.request.binding,
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
    if (!input.request.binding) {
      await assertTextplayChatRouteAvailable({
        runtimeClient: input.deps.runtimeClient,
      });
    }
    const generated = await generateTextplayOutput({
      aiClient: input.deps.aiClient,
      worldId: normalized.worldId,
      prompt,
      binding: input.request.binding,
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

    if (shouldUseRenderableFallback({
      error: normalizedError,
      normalized,
      visibleEvents,
    }) && normalized) {
      appendStepStart('fallback-render');
      const fallbackText = buildRenderableFallbackText({
        normalized,
        visibleEvents,
      });
      warnings.push({
        code: TEXTPLAY_REASON.RENDER_FALLBACK_WARN,
        stage: 'fallback-render',
        actionHint: 'Renderer degraded to canonical-event fallback output.',
        message: `${normalizedError.reasonCode}: ${normalizedError.actionHint}`,
        at: new Date().toISOString(),
      });
      checkpointToken = createUlid();
      appendStepComplete('fallback-render');

      const persistIdempotencyKey = toPersistIdempotencyKey({
        storyId: normalized.storyId,
        turnId: normalized.turnId,
        runId: normalized.runId,
      });

      runSnapshot.status = 'COMPLETED';
      runSnapshot.terminalEventType = 'run.complete';

      const fallbackMeta = {
        storyId: normalized.storyId,
        turnId: normalized.turnId,
        runId: normalized.runId,
        traceId: normalized.traceId,
        promptTraceId: '',
        route: toFallbackRoute(input.request),
        sourceEventIds,
        warnings,
        presenceReports: input.presenceReports,
        runSnapshot,
      };

      appendStepStart('persist-best-effort', persistIdempotencyKey);
      const persistWarning = await persistTextplayRenderBestEffort({
        hookClient: input.deps.hookClient,
        normalized,
        text: fallbackText,
        meta: fallbackMeta,
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

      const fallbackSuccess: TextplayRenderSuccess = {
        ok: true,
        text: fallbackText,
        meta: {
          ...fallbackMeta,
          warnings,
          runSnapshot,
        },
        runEvents,
      };
      return fallbackSuccess;
    }

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
