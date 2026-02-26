import { asRecord } from '@nimiplatform/mod-sdk/utils';
import type { RuntimeRouteBinding } from '@nimiplatform/mod-sdk/runtime-route';
import type { EventNodeDraft, WorldStudioTaskRecord } from '../../../contracts.js';
import { resolveContextTokenBudget } from '../../../engine/accumulated-context.js';
import { isContextOverflowText } from '../../../engine/errors.js';
import type { AccumulatedState, ChunkTaskResult, DraftPatch, FinalDraftAccumulator } from '../../../engine/types.js';
import { runPhase1ExtractionFromChunks } from '../../../generation/pipeline.js';
import { emitWorldStudioLog } from '../../../logging.js';
import { toFailedChunkIndices } from '../../../services/event-graph-map.js';
import { formatRouteBindingSummary } from '../../../services/mutation-payload.js';
import { buildPhase1ArtifactFromResult } from '../../../services/phase1-artifact.js';
import { worldStudioMessage } from '../../../i18n/messages.js';
import type { WorldStudioCreateActionsInput } from './types.js';
import { resolveAdaptiveChunkPolicy, shrinkAdaptiveChunkPolicy, type AdaptiveChunkPolicy } from './chunk-policy.js';
import {
  buildParseJobStartState,
  mergeRetryPhase1Result,
  resolveCreatePhase1RouteOverrides,
  resolvePhase1Chunks,
  resolveRetryChunks,
} from './run-phase1-helpers.js';
import { areDistillRoutesReady, evaluateRouteBindingReadiness } from '../../route-overrides/readiness.js';

type RunCreatePhase1Options = {
  taskId?: string;
  resume?: boolean;
};

function diagLog(message: string, details?: Record<string, unknown>) {
  try {
    emitWorldStudioLog({
      level: 'error',
      message: `[AGENT_SYNC_DIAG] ${message}`,
      source: 'DIAG',
      details,
    });
  } catch {
    // Ignore diagnostics sink failures in non-runtime environments (tests, headless execution).
  }
}

function summarizeChunkTasks(tasks: ChunkTaskResult[]): {
  total: number;
  success: number;
  failed: number;
  failedByCode: Array<{ code: string; count: number }>;
} {
  const total = tasks.length;
  const success = tasks.filter((task) => task.status === 'success').length;
  const failed = total - success;
  const failedByCodeMap = new Map<string, number>();
  tasks
    .filter((task) => task.status !== 'success')
    .forEach((task) => {
      const code = String(task.errorCode || 'UNKNOWN');
      failedByCodeMap.set(code, (failedByCodeMap.get(code) || 0) + 1);
    });
  const failedByCode = Array.from(failedByCodeMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([code, count]) => ({ code, count }));
  return { total, success, failed, failedByCode };
}

function summarizeFinalDraftAccumulator(accumulator: FinalDraftAccumulator | undefined): Record<string, unknown> {
  if (!accumulator) {
    return {
      hasAccumulator: false,
    };
  }
  return {
    hasAccumulator: true,
    worldKeys: Object.keys(asRecord(accumulator.world || {})),
    worldviewKeys: Object.keys(asRecord(accumulator.worldview || {})),
    worldLorebooks: Array.isArray(accumulator.worldLorebooks) ? accumulator.worldLorebooks.length : 0,
    futureHistoricalEvents: Array.isArray(accumulator.futureHistoricalEvents) ? accumulator.futureHistoricalEvents.length : 0,
    agentDraftKeys: Object.keys(accumulator.agentDraftsByCharacter || {}),
    revisionCount: Array.isArray(accumulator.revisions) ? accumulator.revisions.length : 0,
    lastUpdatedChunk: accumulator.lastUpdatedChunk,
  };
}

function isFinalDraftAccumulatorPopulated(accumulator: FinalDraftAccumulator | undefined): boolean {
  if (!accumulator) return false;
  return (
    Object.keys(asRecord(accumulator.world || {})).length > 0
    || Object.keys(asRecord(accumulator.worldview || {})).length > 0
    || (Array.isArray(accumulator.worldLorebooks) && accumulator.worldLorebooks.length > 0)
    || (Array.isArray(accumulator.futureHistoricalEvents) && accumulator.futureHistoricalEvents.length > 0)
    || Object.keys(accumulator.agentDraftsByCharacter || {}).length > 0
  );
}

function summarizeDraftPatch(patch: DraftPatch): Record<string, unknown> {
  return {
    chunkIndex: patch.chunkIndex,
    worldKeys: Object.keys(asRecord(patch.world || {})),
    worldviewKeys: Object.keys(asRecord(patch.worldview || {})),
    worldLorebookCount: Array.isArray(patch.worldLorebooks) ? patch.worldLorebooks.length : 0,
    futureEventCount: Array.isArray(patch.futureHistoricalEvents) ? patch.futureHistoricalEvents.length : 0,
    agentDraftCharacters: Array.isArray(patch.agentDrafts)
      ? patch.agentDrafts.map((item) => String(item.characterName || '')).filter(Boolean)
      : [],
    evidenceRefCount: Array.isArray(patch.evidenceRefs) ? patch.evidenceRefs.length : 0,
    noteCount: Array.isArray(patch.notes) ? patch.notes.length : 0,
  };
}

function summarizeTerminalChunkFailures(tasks: ChunkTaskResult[]): {
  terminalTotal: number;
  terminalSuccess: number;
  terminalFailed: number;
  failedByStage: Array<{ stage: string; count: number }>;
  failedByKind: Array<{ kind: 'json_parse' | 'context_overflow' | 'other'; count: number }>;
  topFailedErrorCodes: Array<{ code: string; count: number }>;
} {
  const terminalMap = new Map<number, ChunkTaskResult>();
  tasks.forEach((task) => {
    const existing = terminalMap.get(task.chunkIndex);
    if (!existing) {
      terminalMap.set(task.chunkIndex, task);
      return;
    }
    if (task.status === 'success' || existing.status !== 'success') {
      terminalMap.set(task.chunkIndex, task);
    }
  });

  const terminalTasks = Array.from(terminalMap.values());
  const failedTasks = terminalTasks.filter((task) => task.status !== 'success');
  const failedByStageMap = new Map<string, number>();
  const failedByKindMap = new Map<'json_parse' | 'context_overflow' | 'other', number>();
  const topFailedErrorCodeMap = new Map<string, number>();

  failedTasks.forEach((task) => {
    const stage = String(task.stage || 'unknown').toLowerCase();
    failedByStageMap.set(stage, (failedByStageMap.get(stage) || 0) + 1);

    const code = String(task.errorCode || '').toLowerCase();
    const message = String(task.errorMessage || '').toLowerCase();
    const kind: 'json_parse' | 'context_overflow' | 'other' = isContextOverflowTask(task)
      ? 'context_overflow'
      : (
        code.includes('json')
        || code.includes('parse')
        || message.includes('json')
        || message.includes('parse')
      )
        ? 'json_parse'
        : 'other';
    failedByKindMap.set(kind, (failedByKindMap.get(kind) || 0) + 1);

    const errorCode = String(task.errorCode || 'UNKNOWN');
    topFailedErrorCodeMap.set(errorCode, (topFailedErrorCodeMap.get(errorCode) || 0) + 1);
  });

  return {
    terminalTotal: terminalTasks.length,
    terminalSuccess: terminalTasks.length - failedTasks.length,
    terminalFailed: failedTasks.length,
    failedByStage: Array.from(failedByStageMap.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([stage, count]) => ({ stage, count })),
    failedByKind: Array.from(failedByKindMap.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([kind, count]) => ({ kind, count })),
    topFailedErrorCodes: Array.from(topFailedErrorCodeMap.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 10)
      .map(([code, count]) => ({ code, count })),
  };
}

function isContextOverflowTask(task: Pick<ChunkTaskResult, 'errorCode' | 'errorMessage'>): boolean {
  const code = String(task.errorCode || '').trim().toUpperCase();
  if (code === 'WORLD_STUDIO_CONTEXT_OVERFLOW' || code.includes('CONTEXT_OVERFLOW')) return true;
  return isContextOverflowText(task.errorMessage);
}

function hasTerminalContextOverflowFailures(chunkTasks: ChunkTaskResult[]): boolean {
  const terminalMap = new Map<number, ChunkTaskResult>();
  chunkTasks.forEach((task) => {
    const existing = terminalMap.get(task.chunkIndex);
    if (!existing) {
      terminalMap.set(task.chunkIndex, task);
      return;
    }
    if (task.status === 'success' || existing.status !== 'success') {
      terminalMap.set(task.chunkIndex, task);
    }
  });
  return Array.from(terminalMap.values()).some((task) => task.status === 'failed' && isContextOverflowTask(task));
}

function sourceSampleForPolicy(input: WorldStudioCreateActionsInput): string {
  if (input.sourceMode === 'FILE' && input.sourceRawTextRef.current.trim()) {
    return input.sourceRawTextRef.current;
  }
  return input.snapshot.sourceText;
}

function buildSourceDigest(chunks: string[]): string {
  const joined = chunks.join('\n');
  let hash = 2166136261;
  for (let index = 0; index < joined.length; index += 1) {
    hash ^= joined.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const normalized = (hash >>> 0).toString(16).padStart(8, '0');
  return `len:${joined.length}:fnv1a:${normalized}`;
}

function sanitizeChunkIndices(value: unknown, total: number): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 0 && item < total);
}

function resolvePhase1ResumeTask(
  input: WorldStudioCreateActionsInput,
  options?: RunCreatePhase1Options,
): WorldStudioTaskRecord | null {
  if (!options?.resume) return null;
  const specifiedId = String(options.taskId || '').trim();
  const specifiedTask = specifiedId ? input.taskController.getTaskById(specifiedId) : null;
  const activeTask = input.taskController.getActiveTask();
  const candidate = specifiedTask || activeTask;
  if (!candidate) return null;
  if (candidate.kind !== 'CREATE_PHASE1') return null;
  if (candidate.status !== 'PAUSED' && candidate.status !== 'PAUSE_REQUESTED') return null;
  return candidate;
}

function applyPhase1ResultSnapshot(input: WorldStudioCreateActionsInput, params: {
  result: ReturnType<typeof mergeRetryPhase1Result>;
  chunkPolicy: AdaptiveChunkPolicy;
  sourceDigest: string;
  parsePhase: 'extract' | 'done';
  parseProgress: number;
  createStep: 'EXTRACT' | 'CHECKPOINTS';
}) {
  const selectedCharacters = params.result.characterCandidates.slice(0, 6).map((item) => item.name);
  const artifact = buildPhase1ArtifactFromResult({
    result: params.result,
    sourceDigest: params.sourceDigest,
  });

  // >>> DIAG: remove after debugging <<<
  try {
    emitWorldStudioLog({
      level: 'error',
      message: '[AGENT_SYNC_DIAG] Phase1 applyResult: writing selectedCharacters + agentSync.selectedCharacterIds',
      source: 'DIAG',
      details: {
        selectedCharacters,
        characterCandidateCount: params.result.characterCandidates.length,
        characterCandidateNames: params.result.characterCandidates.map((c) => c.name),
        existingAgentSyncSelectedCharacterIds: input.snapshot.agentSync.selectedCharacterIds,
        existingAgentSyncDraftKeys: Object.keys(input.snapshot.agentSync.draftsByCharacter || {}),
      },
    });
  } catch {
    // Ignore diagnostics sink failures in non-runtime environments (tests, headless execution).
  }

  input.setPhase1(params.result);
  input.patchSnapshot({
    selectedStartTimeId: params.result.startTimeOptions[0]?.id || '',
    selectedCharacters,
    phase1Artifact: artifact,
    agentSync: {
      ...input.snapshot.agentSync,
      selectedCharacterIds: selectedCharacters,
    },
    knowledgeGraph: params.result.knowledgeGraph,
    finalDraftAccumulator: params.result.finalDraftAccumulator,
    eventsDraft: params.result.knowledgeGraph.events as unknown as { primary: EventNodeDraft[]; secondary: EventNodeDraft[] },
    futureEventsText: JSON.stringify(params.result.knowledgeGraph.futureHistoricalEvents || [], null, 2),
    eventGraphLayout: {
      selectedEventId: String(
        params.result.knowledgeGraph.events.primary[0]?.id
        || params.result.knowledgeGraph.events.secondary[0]?.id
        || '',
      ),
      expandedPrimaryIds: params.result.knowledgeGraph.events.primary[0]?.id
        ? [String(params.result.knowledgeGraph.events.primary[0].id)]
        : [],
    },
    unsavedChangesByPanel: {
      ...input.snapshot.unsavedChangesByPanel,
      events: true,
    },
    parseJob: {
      phase: params.parsePhase,
      chunkTotal: params.result.qualityGate.metrics.totalChunks,
      chunkProcessed: params.result.qualityGate.metrics.successChunks + params.result.qualityGate.metrics.failedChunks,
      chunkCompleted: params.result.qualityGate.metrics.successChunks,
      chunkFailed: params.result.qualityGate.metrics.failedChunks,
      progress: params.parseProgress,
      etaSeconds: params.parsePhase === 'done' ? 0 : null,
      updatedAt: new Date().toISOString(),
      chunkPolicy: params.chunkPolicy,
    },
    createStep: params.createStep,
  });
}

function toTaskProgressMessage(phase: 'ingest' | 'extract' | 'merge' | 'synthesize' | 'validate'): string {
  if (phase === 'ingest') return 'Preparing chunks';
  if (phase === 'extract') return 'Extracting structured knowledge';
  if (phase === 'merge') return 'Merging chunk outputs';
  if (phase === 'synthesize') return 'Synthesizing draft';
  return 'Validating extraction quality';
}

export async function runCreatePhase1(
  input: WorldStudioCreateActionsInput,
  mode: 'all' | 'failed' = 'all',
  forcedRetryErrorCode?: string | null,
  options?: RunCreatePhase1Options,
): Promise<void> {
  const resumeTask = resolvePhase1ResumeTask(input, options);
  const isResumeRun = Boolean(resumeTask);
  const effectiveMode: 'all' | 'failed' = isResumeRun ? 'failed' : mode;
  const { routeOverrides } = await resolveCreatePhase1RouteOverrides(input, effectiveMode);
  diagLog('Phase1 ENTER', {
    mode,
    effectiveMode,
    resume: isResumeRun,
    taskId: resumeTask?.id || null,
    retryScope: input.retryScope,
    retryErrorCode: (forcedRetryErrorCode ?? input.retryErrorCode) || null,
    selectedCharactersCount: input.snapshot.selectedCharacters.length,
    sourceMode: input.sourceMode,
    sourceTextLength: input.snapshot.sourceText.length,
    sourceRawTextLength: input.sourceRawTextRef.current.length,
    sourceChunkCount: input.sourceChunksRef.current.length,
  });

  if (!isResumeRun && !areDistillRoutesReady(routeOverrides, input.routeOptions)) {
    const coarse = evaluateRouteBindingReadiness(routeOverrides.coarse, input.routeOptions);
    const fine = evaluateRouteBindingReadiness(routeOverrides.fine, input.routeOptions);
    const firstFailure = !coarse.ready ? coarse : fine;
    diagLog('Phase1 route not ready', {
      coarseReady: coarse.ready,
      coarseReasonCode: coarse.reasonCode,
      fineReady: fine.ready,
      fineReasonCode: fine.reasonCode,
      firstFailureReasonCode: firstFailure.reasonCode,
      firstFailureMessage: firstFailure.message,
    });
    input.setError(`WORLD_STUDIO_ROUTE_CONFIG_REQUIRED: ${firstFailure.message} (${firstFailure.reasonCode})`);
    input.setNotice(worldStudioMessage(
      'routeConfig.notReadyWithDetail',
      `Please complete coarse/fine routing. Diagnostics: ${firstFailure.reasonCode} (${firstFailure.actionHint})`,
      {
        reasonCode: firstFailure.reasonCode,
        actionHint: firstFailure.actionHint,
      },
    ));
    return;
  }
  let activeChunkPolicy = resolveAdaptiveChunkPolicy({
    coarseRouteBinding: routeOverrides.coarse,
    fineRouteBinding: routeOverrides.fine,
    routeOptions: input.routeOptions,
    sourceSample: sourceSampleForPolicy(input),
  });
  const initialChunkPolicy = activeChunkPolicy;
  let allChunks: string[];
  let usedLegacyFileChunks = false;
  try {
    const resolved = resolvePhase1Chunks(input, activeChunkPolicy);
    allChunks = resolved.allChunks;
    usedLegacyFileChunks = resolved.usedLegacyFileChunks;
    diagLog('Phase1 chunks resolved', {
      allChunks: allChunks.length,
      usedLegacyFileChunks,
      chunkSize: activeChunkPolicy.chunkSize,
      overlap: activeChunkPolicy.overlap,
      effectiveContextTokens: activeChunkPolicy.effectiveContextTokens,
      contextSource: activeChunkPolicy.contextSource,
      firstChunkLength: allChunks[0]?.length || 0,
      lastChunkLength: allChunks[allChunks.length - 1]?.length || 0,
    });
  } catch (error) {
    diagLog('Phase1 resolve chunks failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    input.setError(error instanceof Error ? error.message : String(error));
    return;
  }
  if (usedLegacyFileChunks) {
    emitWorldStudioLog({
      level: 'warn',
      message: 'world-studio:chunk-policy:file-raw-missing-fallback',
      flowId: input.flowId,
      source: 'WorldStudioPage.onRunPhase1',
      details: {
        sourceMode: input.sourceMode,
        chunkSize: activeChunkPolicy.chunkSize,
        overlap: activeChunkPolicy.overlap,
      },
    });
  }
  const sourceDigest = buildSourceDigest(allChunks);

  let chunksToRun: string[] = [];
  let chunkIndexMap: number[] | undefined;
  let initialAccumulatedState: AccumulatedState | undefined;
  let initialFinalDraftAccumulator: FinalDraftAccumulator | undefined;
  if (isResumeRun && resumeTask) {
    const checkpointPayload = asRecord(resumeTask.checkpoint?.payload);
    const savedAccState = checkpointPayload.accumulatedState as AccumulatedState | undefined;
    const savedFinalDraftAccumulator = checkpointPayload.finalDraftAccumulator as FinalDraftAccumulator | undefined;
    if (savedAccState && savedAccState.lastProcessedChunk >= 0) {
      // R2 resume: pass full chunk array + accumulated state, serial loop skips via startIndex
      chunksToRun = allChunks;
      chunkIndexMap = undefined;
      initialAccumulatedState = savedAccState;
      initialFinalDraftAccumulator = savedFinalDraftAccumulator || input.snapshot.finalDraftAccumulator;
      diagLog('Phase1 resume with accumulated state', {
        taskId: resumeTask.id,
        lastProcessedChunk: savedAccState.lastProcessedChunk,
        hasFinalDraftAccumulator: Boolean(savedFinalDraftAccumulator),
        totalChunks: allChunks.length,
      });
    } else {
      // Legacy resume (no accumulated state in checkpoint): fall back to old subset logic
      const checkpointRemaining = sanitizeChunkIndices(checkpointPayload.remainingChunkIndices, allChunks.length);
      const fallbackChunkTasks = input.phase1?.chunkTasks
        || input.snapshot.phase1Artifact?.chunkTasks
        || [];
      const fallbackRemaining = toFailedChunkIndices(fallbackChunkTasks, allChunks.length, 'all');
      const remainingChunkIndices = checkpointRemaining.length > 0
        ? checkpointRemaining
        : (fallbackRemaining.length > 0 ? fallbackRemaining : allChunks.map((_, index) => index));
      chunkIndexMap = remainingChunkIndices;
      chunksToRun = remainingChunkIndices
        .map((index) => allChunks[index])
        .filter((chunk): chunk is string => typeof chunk === 'string' && chunk.trim().length > 0);
      diagLog('Phase1 resume with legacy remainingChunkIndices', {
        taskId: resumeTask.id,
        remainingChunkIndices,
        hasFinalDraftAccumulator: Boolean(savedFinalDraftAccumulator),
        resolvedChunksToRun: chunksToRun.length,
      });
      initialFinalDraftAccumulator = savedFinalDraftAccumulator || input.snapshot.finalDraftAccumulator;
    }
  } else {
    const resolvedRetry = resolveRetryChunks(input, allChunks, effectiveMode, forcedRetryErrorCode);
    chunksToRun = resolvedRetry.chunksToRun;
    chunkIndexMap = resolvedRetry.chunkIndexMap;
    diagLog('Phase1 retry resolution', {
      mode: effectiveMode,
      allChunks: allChunks.length,
      chunksToRun: chunksToRun.length,
      chunkIndexMap: chunkIndexMap || [],
    });
  }

  if (chunksToRun.length === 0) {
    diagLog('Phase1 no chunks to run', {
      resume: isResumeRun,
      taskId: resumeTask?.id || null,
      mode: effectiveMode,
    });
    if (isResumeRun && resumeTask) {
      input.taskController.completeTask(resumeTask.id, 'No remaining chunks to resume.');
      input.setNotice('No remaining chunks to run.');
    }
    return;
  }

  let taskId = '';
  let abortSignal: AbortSignal | undefined;
  if (isResumeRun && resumeTask) {
    const resumed = input.taskController.resumeTask(resumeTask.id, 'Resuming extraction');
    if (!resumed) {
      input.setError('WORLD_STUDIO_TASK_RESUME_FAILED: task is not resumable.');
      return;
    }
    taskId = resumeTask.id;
    abortSignal = input.taskController.getAbortSignal(taskId) || undefined;
    diagLog('Phase1 task resumed', { taskId });
  } else {
    const started = input.taskController.startTask({
      kind: 'CREATE_PHASE1',
      label: 'Extract world events',
      atomic: false,
      resumable: true,
      canPause: true,
      canCancel: true,
      step: 'INGEST',
      message: 'Extraction started',
    });
    if (!started) {
      input.setError('WORLD_STUDIO_TASK_CONFLICT: another task is running.');
      return;
    }
    taskId = started.taskId;
    abortSignal = started.abortSignal;
    diagLog('Phase1 task started', { taskId });
  }

  const updateTaskCheckpoint = (checkpoint: {
    step: 'SOURCE' | 'INGEST' | 'EXTRACT' | 'CHECKPOINTS' | 'SYNTHESIZE' | 'DRAFT' | 'PUBLISH' | 'MAINTAIN';
    chunkTotal?: number;
    chunkCompleted?: number;
    chunkFailed?: number;
  }, payloadPatch?: Record<string, unknown>) => {
    const existingPayload = asRecord(input.taskController.getTaskById(taskId)?.checkpoint?.payload);
    input.taskController.setCheckpoint(taskId, {
      ...checkpoint,
      payload: {
        ...existingPayload,
        ...(payloadPatch || {}),
      },
    });
  };

  input.setError(null);
  input.setNotice(null);
  input.patchSnapshot({
    parseJob: buildParseJobStartState(activeChunkPolicy),
  });
  input.setCreateStep('INGEST');
  input.taskController.updateTask(taskId, {
    progress: 0,
    message: isResumeRun ? 'Resuming extraction' : 'Extraction started',
    canPause: true,
    canCancel: true,
  });
  updateTaskCheckpoint({
    step: 'INGEST',
    chunkTotal: allChunks.length,
    chunkCompleted: 0,
    chunkFailed: 0,
  }, {
    mode: effectiveMode,
    retryScope: input.retryScope,
    retryErrorCode: (forcedRetryErrorCode ?? input.retryErrorCode) || null,
    chunkPolicy: activeChunkPolicy,
    remainingChunkIndices: chunkIndexMap || [],
    finalDraftAccumulator: initialFinalDraftAccumulator || input.snapshot.finalDraftAccumulator,
  });

  const extractConcurrency = effectiveMode === 'failed'
    ? Math.max(1, Math.min(3, input.retryConcurrency))
    : 1;
  let autoShrinkRetried = false;
  let lastDiagProgressPhase = '';
  let lastDiagChunkProcessed = -1;

  emitWorldStudioLog({
    level: 'info',
    message: 'world-studio:event-extract:start',
    flowId: input.flowId,
    source: 'WorldStudioPage.onRunPhase1',
    details: {
      mode: effectiveMode,
      totalChunks: allChunks.length,
      rerunChunks: chunksToRun.length,
      extractConcurrency,
      retryWithFineRoute: input.retryWithFineRoute,
      retryScope: input.retryScope,
      retryErrorCode: (forcedRetryErrorCode ?? input.retryErrorCode) || null,
      sourceMode: input.sourceMode,
      chunkSize: activeChunkPolicy.chunkSize,
      overlap: activeChunkPolicy.overlap,
      effectiveContextTokens: activeChunkPolicy.effectiveContextTokens,
      contextSource: activeChunkPolicy.contextSource,
      coarseModel: activeChunkPolicy.coarseModel || null,
      fineModel: activeChunkPolicy.fineModel || null,
      autoShrinkRetried: false,
      coarseRoute: formatRouteBindingSummary(routeOverrides.coarse as RuntimeRouteBinding | null),
      fineRoute: formatRouteBindingSummary(routeOverrides.fine as RuntimeRouteBinding | null),
      resume: isResumeRun,
      taskId,
    },
  });

  const shouldInterrupt = () => {
    if (abortSignal?.aborted || input.taskController.shouldCancel(taskId)) return 'cancel' as const;
    if (input.taskController.shouldPause(taskId)) return 'pause' as const;
    return null;
  };

  try {
    const runExtractionAttempt = async (attemptInput: {
      chunks: string[];
      chunkIndexMap?: number[];
      chunkPolicy: AdaptiveChunkPolicy;
      initialAccumulatedState?: AccumulatedState;
      initialFinalDraftAccumulator?: FinalDraftAccumulator;
    }) => {
      const ctxBudget = resolveContextTokenBudget(
        attemptInput.chunkPolicy.effectiveContextTokens,
        attemptInput.chunkPolicy.chunkSize,
      );
      let firstNonEmptyLogicalChunk: number | null = null;
      diagLog('Phase1 extraction attempt start', {
        taskId,
        chunks: attemptInput.chunks.length,
        hasChunkIndexMap: Boolean(attemptInput.chunkIndexMap),
        chunkIndexMapSize: attemptInput.chunkIndexMap?.length || 0,
        chunkPolicy: attemptInput.chunkPolicy,
        contextBudget: ctxBudget,
        hasInitialAccumulatedState: Boolean(attemptInput.initialAccumulatedState),
        hasInitialFinalDraftAccumulator: Boolean(attemptInput.initialFinalDraftAccumulator),
        initialFinalDraftAccumulator: summarizeFinalDraftAccumulator(attemptInput.initialFinalDraftAccumulator),
        initialFinalDraftAccumulatorPopulated: isFinalDraftAccumulatorPopulated(attemptInput.initialFinalDraftAccumulator),
      });
      return runPhase1ExtractionFromChunks(input.aiClient, attemptInput.chunks, {
        onProgress: (progress) => {
          const nextStep = progress.phase === 'ingest' ? 'INGEST' : 'EXTRACT';
          input.patchSnapshot({
            parseJob: {
              phase: progress.phase,
              chunkTotal: progress.chunkTotal,
              chunkProcessed: progress.chunkProcessed,
              chunkCompleted: progress.chunkCompleted,
              chunkFailed: progress.chunkFailed,
              progress: progress.progress,
              etaSeconds: progress.etaSeconds,
              updatedAt: new Date().toISOString(),
              chunkPolicy: attemptInput.chunkPolicy,
            },
          });
          input.setCreateStep(nextStep);
          input.taskController.updateTask(taskId, {
            progress: progress.progress,
            message: toTaskProgressMessage(progress.phase),
            canPause: true,
            canCancel: true,
          });
          updateTaskCheckpoint({
            step: nextStep,
            chunkTotal: progress.chunkTotal,
            chunkCompleted: progress.chunkCompleted,
            chunkFailed: progress.chunkFailed,
          });
          if (
            progress.phase !== lastDiagProgressPhase
            || progress.chunkProcessed !== lastDiagChunkProcessed
          ) {
            lastDiagProgressPhase = progress.phase;
            lastDiagChunkProcessed = progress.chunkProcessed;
            diagLog('Phase1 progress', {
              taskId,
              phase: progress.phase,
              chunkTotal: progress.chunkTotal,
              chunkProcessed: progress.chunkProcessed,
              chunkCompleted: progress.chunkCompleted,
              chunkFailed: progress.chunkFailed,
              progress: progress.progress,
              etaSeconds: progress.etaSeconds,
            });
          }
        },
        routeOverrides,
        chunkIndexMap: attemptInput.chunkIndexMap,
        maxConcurrency: 1,
        abortSignal,
        shouldInterrupt,
        contextTokenBudget: ctxBudget,
        initialAccumulatedState: attemptInput.initialAccumulatedState,
        initialFinalDraftAccumulator: attemptInput.initialFinalDraftAccumulator,
        onAccumulatedStateUpdate: (accState) => {
          updateTaskCheckpoint({
            step: 'EXTRACT',
            chunkTotal: allChunks.length,
          }, {
            accumulatedState: accState,
          });
        },
        onFinalDraftAccumulatorUpdate: (finalDraftAccumulator) => {
          updateTaskCheckpoint({
            step: 'EXTRACT',
            chunkTotal: allChunks.length,
          }, {
            finalDraftAccumulator,
          });
        },
        onFinalDraftAccumulatorPatch: (update) => {
          const beforePopulated = isFinalDraftAccumulatorPopulated(update.before);
          const afterPopulated = isFinalDraftAccumulatorPopulated(update.after);
          const becameNonEmpty = !beforePopulated && afterPopulated;
          if (becameNonEmpty && firstNonEmptyLogicalChunk == null) {
            firstNonEmptyLogicalChunk = update.logicalChunkIndex;
          }
          if (update.hasChanges) {
            updateTaskCheckpoint({
              step: 'EXTRACT',
              chunkTotal: allChunks.length,
            }, {
              finalDraftAccumulator: update.after,
            });
          }
          diagLog('Phase1 finalDraftAccumulator patch', {
            taskId,
            chunkIndex: update.chunkIndex,
            logicalChunkIndex: update.logicalChunkIndex,
            hasChanges: update.hasChanges,
            changedFieldCount: update.changedFields.length,
            changedFields: update.changedFields,
            becameNonEmpty,
            firstNonEmptyLogicalChunk,
            before: summarizeFinalDraftAccumulator(update.before),
            after: summarizeFinalDraftAccumulator(update.after),
            patch: summarizeDraftPatch(update.patch),
          });
        },
      });
    };

    let result = await runExtractionAttempt({
      chunks: chunksToRun,
      chunkIndexMap,
      chunkPolicy: activeChunkPolicy,
      initialAccumulatedState,
      initialFinalDraftAccumulator,
    });
    diagLog('Phase1 extraction attempt done', {
      taskId,
      interruptedReason: result.interrupted?.reason || null,
      summary: summarizeChunkTasks(result.chunkTasks),
      terminalFailureHistogram: summarizeTerminalChunkFailures(result.chunkTasks),
      finalDraftAccumulator: summarizeFinalDraftAccumulator(result.finalDraftAccumulator),
      qualityGateStatus: result.qualityGate.status,
      qualityGatePass: result.qualityGate.pass,
    });

    if (result.interrupted?.reason === 'pause') {
      const pausedResult = mergeRetryPhase1Result(input, allChunks, chunksToRun, effectiveMode, result);
      const remainingChunkIndices = toFailedChunkIndices(pausedResult.chunkTasks, allChunks.length, 'all');
      applyPhase1ResultSnapshot(input, {
        result: pausedResult,
        chunkPolicy: activeChunkPolicy,
        sourceDigest,
        parsePhase: 'extract',
        parseProgress: Math.max(0.1, Math.min(0.95, pausedResult.qualityGate.metrics.chunkSuccessRatio)),
        createStep: 'EXTRACT',
      });
      updateTaskCheckpoint({
        step: 'EXTRACT',
        chunkTotal: allChunks.length,
        chunkCompleted: pausedResult.qualityGate.metrics.successChunks,
        chunkFailed: pausedResult.qualityGate.metrics.failedChunks,
      }, {
        chunkPolicy: activeChunkPolicy,
        remainingChunkIndices,
        finalDraftAccumulator: pausedResult.finalDraftAccumulator,
      });
      input.taskController.pauseTask(taskId, 'Extraction paused. Resume to continue.');
      input.taskController.updateTask(taskId, {
        progress: Math.max(0.1, Math.min(0.95, pausedResult.qualityGate.metrics.chunkSuccessRatio)),
      });
      input.setNotice('Extraction paused. Resume task to continue.');
      input.setStatusBanner({ kind: 'info', message: 'Extraction paused' });
      diagLog('Phase1 paused', {
        taskId,
        remainingChunkIndices,
        resultSummary: summarizeChunkTasks(pausedResult.chunkTasks),
      });
      return;
    }

    if (result.interrupted?.reason === 'cancel') {
      input.patchSnapshot({
        parseJob: {
          phase: 'failed',
          updatedAt: new Date().toISOString(),
          chunkPolicy: activeChunkPolicy,
        },
      });
      input.taskController.cancelTask(taskId, 'Extraction canceled');
      input.setNotice('Extraction canceled.');
      input.setStatusBanner({ kind: 'warn', message: 'Extraction canceled' });
      diagLog('Phase1 canceled', { taskId });
      return;
    }

    if (effectiveMode === 'all' && !isResumeRun && !usedLegacyFileChunks && hasTerminalContextOverflowFailures(result.chunkTasks)) {
      autoShrinkRetried = true;
      const firstPass = result;
      activeChunkPolicy = shrinkAdaptiveChunkPolicy(activeChunkPolicy, 0.7);
      const shrunkChunks = resolvePhase1Chunks(input, activeChunkPolicy);
      allChunks = shrunkChunks.allChunks;
      chunksToRun = allChunks;
      chunkIndexMap = undefined;
      input.patchSnapshot({
        parseJob: buildParseJobStartState(activeChunkPolicy),
      });
      input.setCreateStep('INGEST');
      updateTaskCheckpoint({
        step: 'INGEST',
        chunkTotal: allChunks.length,
        chunkCompleted: 0,
        chunkFailed: 0,
      }, {
        chunkPolicy: activeChunkPolicy,
        remainingChunkIndices: allChunks.map((_, index) => index),
      });
      emitWorldStudioLog({
        level: 'warn',
        message: 'world-studio:event-extract:auto-shrink-retry',
        flowId: input.flowId,
        source: 'WorldStudioPage.onRunPhase1',
        details: {
          initialChunkSize: initialChunkPolicy.chunkSize,
          initialOverlap: initialChunkPolicy.overlap,
          shrunkChunkSize: activeChunkPolicy.chunkSize,
          shrunkOverlap: activeChunkPolicy.overlap,
          effectiveContextTokens: activeChunkPolicy.effectiveContextTokens,
        },
      });
      const secondPass = await runExtractionAttempt({
        chunks: chunksToRun,
        chunkPolicy: activeChunkPolicy,
        initialFinalDraftAccumulator: input.snapshot.finalDraftAccumulator,
      });
      diagLog('Phase1 extraction second pass done', {
        taskId,
        interruptedReason: secondPass.interrupted?.reason || null,
        summary: summarizeChunkTasks(secondPass.chunkTasks),
        terminalFailureHistogram: summarizeTerminalChunkFailures(secondPass.chunkTasks),
        qualityGateStatus: secondPass.qualityGate.status,
      });
      result = {
        ...secondPass,
        chunkTasks: [...firstPass.chunkTasks, ...secondPass.chunkTasks],
      };
    }

    const effectiveResult = mergeRetryPhase1Result(input, allChunks, chunksToRun, effectiveMode, result);
    diagLog('Phase1 effective result', {
      taskId,
      summary: summarizeChunkTasks(effectiveResult.chunkTasks),
      terminalFailureHistogram: summarizeTerminalChunkFailures(effectiveResult.chunkTasks),
      finalDraftAccumulator: summarizeFinalDraftAccumulator(effectiveResult.finalDraftAccumulator),
      qualityGateStatus: effectiveResult.qualityGate.status,
      qualityGatePass: effectiveResult.qualityGate.pass,
      qualityGateReasons: effectiveResult.qualityGate.reasons,
      metrics: effectiveResult.qualityGate.metrics,
      selectedCharacterCandidates: effectiveResult.characterCandidates.slice(0, 10).map((item) => item.name),
      startTimeOptions: effectiveResult.startTimeOptions.slice(0, 10).map((item) => item.id),
    });
    applyPhase1ResultSnapshot(input, {
      result: effectiveResult,
      chunkPolicy: activeChunkPolicy,
      sourceDigest,
      parsePhase: 'done',
      parseProgress: 1,
      createStep: 'CHECKPOINTS',
    });
    updateTaskCheckpoint({
      step: 'CHECKPOINTS',
      chunkTotal: allChunks.length,
      chunkCompleted: effectiveResult.qualityGate.metrics.successChunks,
      chunkFailed: effectiveResult.qualityGate.metrics.failedChunks,
    }, {
      chunkPolicy: activeChunkPolicy,
      remainingChunkIndices: [],
    });

    if (effectiveResult.qualityGate.status === 'PASS') {
      input.setNotice(effectiveMode === 'failed'
        ? 'Failed chunks re-extracted. Confirm checkpoints.'
        : 'Extraction completed. Confirm checkpoints.');
      input.setStatusBanner({ kind: 'success', message: 'Extraction completed' });
      emitWorldStudioLog({
        level: 'info',
        message: 'world-studio:event-gate:pass',
        flowId: input.flowId,
        source: 'WorldStudioPage.onRunPhase1',
        details: effectiveResult.qualityGate.metrics,
      });
    } else if (effectiveResult.qualityGate.status === 'WARN') {
      input.setNotice(effectiveMode === 'failed'
        ? 'Failed chunks re-extracted with warnings. Confirm checkpoints before synthesize.'
        : 'Extraction completed with warnings. Confirm checkpoints before synthesize.');
      input.setStatusBanner({ kind: 'warn', message: 'Extraction completed with warnings' });
      emitWorldStudioLog({
        level: 'warn',
        message: 'world-studio:event-gate:warn',
        flowId: input.flowId,
        source: 'WorldStudioPage.onRunPhase1',
        details: {
          issues: effectiveResult.qualityGate.issues,
          metrics: effectiveResult.qualityGate.metrics,
        },
      });
    } else {
      input.setNotice(effectiveMode === 'failed'
        ? 'Retry completed, but quality gate is still blocked. Try switching Fine model and rerun failed chunks again.'
        : 'Extraction completed, but quality gate blocked synthesize. Try switching Fine model and rerun extract.');
      input.setError(`WORLD_STUDIO_PHASE1_QUALITY_GATE_BLOCKED: ${effectiveResult.qualityGate.reasons.join(' | ')}`);
      input.setStatusBanner({ kind: 'warn', message: 'Extraction finished with quality gate block' });
      emitWorldStudioLog({
        level: 'warn',
        message: 'world-studio:event-gate:blocked',
        flowId: input.flowId,
        source: 'WorldStudioPage.onRunPhase1',
        details: {
          reasons: effectiveResult.qualityGate.reasons,
          metrics: effectiveResult.qualityGate.metrics,
        },
      });
    }

    input.taskController.completeTask(taskId, 'Extraction completed');
    diagLog('Phase1 COMPLETE', {
      taskId,
      mode: effectiveMode,
      autoShrinkRetried,
      finalChunkPolicy: activeChunkPolicy,
      qualityGateStatus: effectiveResult.qualityGate.status,
    });
    emitWorldStudioLog({
      level: 'info',
      message: 'world-studio:event-extract:done',
      flowId: input.flowId,
      source: 'WorldStudioPage.onRunPhase1',
      details: {
        step: 'CHECKPOINTS',
        mode: effectiveMode,
        chunkTotal: effectiveResult.qualityGate.metrics.totalChunks,
        chunkSuccess: effectiveResult.qualityGate.metrics.successChunks,
        chunkFailed: effectiveResult.qualityGate.metrics.failedChunks,
        primaryEvents: effectiveResult.qualityGate.metrics.primaryCount,
        secondaryEvents: effectiveResult.qualityGate.metrics.secondaryCount,
        chunkSize: activeChunkPolicy.chunkSize,
        overlap: activeChunkPolicy.overlap,
        effectiveContextTokens: activeChunkPolicy.effectiveContextTokens,
        contextSource: activeChunkPolicy.contextSource,
        autoShrinkRetried,
        taskId,
      },
    });
  } catch (error) {
    let runError: unknown = error;
    if (input.taskController.shouldCancel(taskId) || abortSignal?.aborted) {
      input.patchSnapshot({
        parseJob: {
          phase: 'failed',
          updatedAt: new Date().toISOString(),
          chunkPolicy: activeChunkPolicy,
        },
      });
      input.taskController.cancelTask(taskId, 'Extraction canceled');
      input.setNotice('Extraction canceled.');
      input.setStatusBanner({ kind: 'warn', message: 'Extraction canceled' });
      diagLog('Phase1 canceled during catch', {
        taskId,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    const canAutoShrink = (
      effectiveMode === 'all'
      && !isResumeRun
      && !usedLegacyFileChunks
      && isContextOverflowText(runError instanceof Error ? runError.message : runError)
    );
    if (canAutoShrink) {
      try {
        autoShrinkRetried = true;
        activeChunkPolicy = shrinkAdaptiveChunkPolicy(activeChunkPolicy, 0.7);
        const shrunkChunks = resolvePhase1Chunks(input, activeChunkPolicy);
        allChunks = shrunkChunks.allChunks;
        chunksToRun = allChunks;
        chunkIndexMap = undefined;
        input.patchSnapshot({
          parseJob: buildParseJobStartState(activeChunkPolicy),
        });
        input.setCreateStep('INGEST');
        emitWorldStudioLog({
          level: 'warn',
          message: 'world-studio:event-extract:auto-shrink-retry',
          flowId: input.flowId,
          source: 'WorldStudioPage.onRunPhase1',
          details: {
            initialChunkSize: initialChunkPolicy.chunkSize,
            initialOverlap: initialChunkPolicy.overlap,
            shrunkChunkSize: activeChunkPolicy.chunkSize,
            shrunkOverlap: activeChunkPolicy.overlap,
            triggerError: runError instanceof Error ? runError.message : String(runError),
          },
        });
        const shrinkCtxBudget = resolveContextTokenBudget(
          activeChunkPolicy.effectiveContextTokens,
          activeChunkPolicy.chunkSize,
        );
        const retriedResult = await runPhase1ExtractionFromChunks(input.aiClient, chunksToRun, {
          onProgress: (progress) => {
            const nextStep = progress.phase === 'ingest' ? 'INGEST' : 'EXTRACT';
            input.patchSnapshot({
              parseJob: {
                phase: progress.phase,
                chunkTotal: progress.chunkTotal,
                chunkProcessed: progress.chunkProcessed,
                chunkCompleted: progress.chunkCompleted,
                chunkFailed: progress.chunkFailed,
                progress: progress.progress,
                etaSeconds: progress.etaSeconds,
                updatedAt: new Date().toISOString(),
                chunkPolicy: activeChunkPolicy,
              },
            });
            input.setCreateStep(nextStep);
          },
          routeOverrides,
          maxConcurrency: 1,
          abortSignal,
          shouldInterrupt,
          contextTokenBudget: shrinkCtxBudget,
          initialFinalDraftAccumulator: input.snapshot.finalDraftAccumulator,
          onAccumulatedStateUpdate: (accState) => {
            updateTaskCheckpoint({
              step: 'EXTRACT',
              chunkTotal: allChunks.length,
            }, {
              accumulatedState: accState,
            });
          },
          onFinalDraftAccumulatorUpdate: (finalDraftAccumulator) => {
            updateTaskCheckpoint({
              step: 'EXTRACT',
              chunkTotal: allChunks.length,
            }, {
              finalDraftAccumulator,
            });
          },
        });
        const effectiveRetriedResult = mergeRetryPhase1Result(input, allChunks, chunksToRun, effectiveMode, retriedResult);
        diagLog('Phase1 catch-path retry result', {
          taskId,
          summary: summarizeChunkTasks(effectiveRetriedResult.chunkTasks),
          terminalFailureHistogram: summarizeTerminalChunkFailures(effectiveRetriedResult.chunkTasks),
          finalDraftAccumulator: summarizeFinalDraftAccumulator(effectiveRetriedResult.finalDraftAccumulator),
          qualityGateStatus: effectiveRetriedResult.qualityGate.status,
          qualityGateReasons: effectiveRetriedResult.qualityGate.reasons,
        });
        applyPhase1ResultSnapshot(input, {
          result: effectiveRetriedResult,
          chunkPolicy: activeChunkPolicy,
          sourceDigest,
          parsePhase: 'done',
          parseProgress: 1,
          createStep: 'CHECKPOINTS',
        });
        if (effectiveRetriedResult.qualityGate.status === 'PASS') {
          input.setNotice('Extraction completed after adaptive chunk shrink. Confirm checkpoints.');
          input.setStatusBanner({ kind: 'success', message: 'Extraction completed' });
        } else if (effectiveRetriedResult.qualityGate.status === 'WARN') {
          input.setNotice('Extraction completed after adaptive chunk shrink with warnings. Confirm checkpoints.');
          input.setStatusBanner({ kind: 'warn', message: 'Extraction completed with warnings' });
        } else {
          input.setNotice('Extraction retried with smaller chunks, but quality gate is still blocked.');
          input.setError(`WORLD_STUDIO_PHASE1_QUALITY_GATE_BLOCKED: ${effectiveRetriedResult.qualityGate.reasons.join(' | ')}`);
          input.setStatusBanner({ kind: 'warn', message: 'Extraction finished with quality gate block' });
        }
        input.taskController.completeTask(taskId, 'Extraction completed');
        diagLog('Phase1 COMPLETE (catch retry path)', {
          taskId,
          mode: effectiveMode,
          autoShrinkRetried: true,
          finalChunkPolicy: activeChunkPolicy,
          qualityGateStatus: effectiveRetriedResult.qualityGate.status,
        });
        emitWorldStudioLog({
          level: 'info',
          message: 'world-studio:event-extract:done',
          flowId: input.flowId,
          source: 'WorldStudioPage.onRunPhase1',
          details: {
            step: 'CHECKPOINTS',
            mode: effectiveMode,
            chunkTotal: effectiveRetriedResult.qualityGate.metrics.totalChunks,
            chunkSuccess: effectiveRetriedResult.qualityGate.metrics.successChunks,
            chunkFailed: effectiveRetriedResult.qualityGate.metrics.failedChunks,
            primaryEvents: effectiveRetriedResult.qualityGate.metrics.primaryCount,
            secondaryEvents: effectiveRetriedResult.qualityGate.metrics.secondaryCount,
            chunkSize: activeChunkPolicy.chunkSize,
            overlap: activeChunkPolicy.overlap,
            effectiveContextTokens: activeChunkPolicy.effectiveContextTokens,
            contextSource: activeChunkPolicy.contextSource,
            autoShrinkRetried: true,
          },
        });
        return;
      } catch (retryError) {
        runError = retryError;
      }
    }
    input.patchSnapshot({
      parseJob: {
        phase: 'failed',
        updatedAt: new Date().toISOString(),
        chunkPolicy: activeChunkPolicy,
      },
    });
    input.taskController.failTask(taskId, runError);
    input.setError(runError instanceof Error ? runError.message : String(runError));
    diagLog('Phase1 FAILED', {
      taskId,
      error: runError instanceof Error ? runError.message : String(runError),
      stack: runError instanceof Error ? runError.stack?.slice(0, 1000) : null,
      chunkPolicy: activeChunkPolicy,
      autoShrinkRetried,
    });
    emitWorldStudioLog({
      level: 'error',
      message: 'world-studio:event-extract:failed',
      flowId: input.flowId,
      source: 'WorldStudioPage.onRunPhase1',
      details: {
        error: runError instanceof Error ? runError.message : String(runError),
        chunkSize: activeChunkPolicy.chunkSize,
        overlap: activeChunkPolicy.overlap,
        effectiveContextTokens: activeChunkPolicy.effectiveContextTokens,
        contextSource: activeChunkPolicy.contextSource,
        autoShrinkRetried,
        taskId,
      },
    });
  }
}
