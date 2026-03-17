import type { AccumulatedState, FinalDraftAccumulator } from '../../../engine/types.js';
import { emitWorldStudioLog } from '../../../logging.js';
import { formatRouteBindingSummary } from '../../../services/mutation-payload.js';
import { worldStudioMessage } from '../../../i18n/messages.js';
import type { WorldStudioCreateActionsInput } from './types.js';
import { resolveAdaptiveChunkPolicy } from './chunk-policy.js';
import { buildParseJobStartState, resolveCreatePhase1RouteBindings, resolvePhase1Chunks, resolveRetryChunks, } from './run-phase1-helpers.js';
import { areDistillRoutesReady, evaluateRouteBindingReadiness } from '../../route-overrides/readiness.js';
import { type RunCreatePhase1Options, buildSourceDigest, diagLog, resolvePhase1ResumeTask, sourceSampleForPolicy, } from './run-phase1-utils.js';
import { executePhase1ExtractionLoop } from './run-phase1-extraction-loop.js';
import { asRecord, type RuntimeRouteBinding } from "@nimiplatform/sdk/mod";
export async function runCreatePhase1(input: WorldStudioCreateActionsInput, mode: 'all' | 'failed' = 'all', forcedRetryErrorCode?: string | null, options?: RunCreatePhase1Options): Promise<void> {
    const resumeTask = resolvePhase1ResumeTask(input, options);
    const isResumeRun = Boolean(resumeTask);
    const effectiveMode: 'all' | 'failed' = isResumeRun ? 'failed' : mode;
    const { bindings } = await resolveCreatePhase1RouteBindings(input, effectiveMode);
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
    if (!isResumeRun && !areDistillRoutesReady(bindings, input.routeOptions)) {
        const coarse = evaluateRouteBindingReadiness(bindings.coarse, input.routeOptions);
        const fine = evaluateRouteBindingReadiness(bindings.fine, input.routeOptions);
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
        input.setNotice(worldStudioMessage('routeConfig.notReadyWithDetail', `Please complete coarse/fine routing. Diagnostics: ${firstFailure.reasonCode} (${firstFailure.actionHint})`, {
            reasonCode: firstFailure.reasonCode,
            actionHint: firstFailure.actionHint,
        }));
        return;
    }
    let activeChunkPolicy = resolveAdaptiveChunkPolicy({
        coarseRouteBinding: bindings.coarse,
        fineRouteBinding: bindings.fine,
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
    }
    catch (error) {
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
        if (!savedAccState
            || !Number.isFinite(Number(savedAccState.lastProcessedChunk))
            || !Number.isFinite(Number(savedAccState.successfulChunks))) {
            const resumeError = 'WORLD_STUDIO_PHASE1_RESUME_STATE_MISSING: checkpoint has no valid accumulatedState.';
            diagLog('Phase1 resume rejected: missing accumulated state', {
                taskId: resumeTask.id,
                checkpointPayloadKeys: Object.keys(checkpointPayload),
                hasFinalDraftAccumulator: Boolean(savedFinalDraftAccumulator),
            });
            input.taskController.failTask(resumeTask.id, resumeError);
            input.setError(resumeError);
            input.setNotice(worldStudioMessage('notice.resumeStateMissing', 'Resume state missing. Please rerun extraction.'));
            return;
        }
        // Resume requires accumulated state and always reuses the full chunk list.
        chunksToRun = allChunks;
        chunkIndexMap = undefined;
        initialAccumulatedState = savedAccState;
        initialFinalDraftAccumulator = savedFinalDraftAccumulator || input.snapshot.finalDraftAccumulator;
        diagLog('Phase1 resume with accumulated state', {
            taskId: resumeTask.id,
            lastProcessedChunk: savedAccState.lastProcessedChunk,
            successfulChunks: savedAccState.successfulChunks,
            hasFinalDraftAccumulator: Boolean(savedFinalDraftAccumulator),
            totalChunks: allChunks.length,
        });
    }
    else {
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
            input.taskController.completeTask(resumeTask.id, worldStudioMessage('task.noRemainingChunksToResume', 'No remaining chunks to resume.'));
            input.setNotice(worldStudioMessage('notice.noRemainingChunksToRun', 'No remaining chunks to run.'));
        }
        return;
    }
    let taskId = '';
    let abortSignal: AbortSignal | undefined;
    if (isResumeRun && resumeTask) {
        const resumed = input.taskController.resumeTask(resumeTask.id, worldStudioMessage('task.resumingExtraction', 'Resuming extraction'));
        if (!resumed) {
            input.setError('WORLD_STUDIO_TASK_RESUME_FAILED: task is not resumable.');
            return;
        }
        taskId = resumeTask.id;
        abortSignal = input.taskController.getAbortSignal(taskId) || undefined;
        diagLog('Phase1 task resumed', { taskId });
    }
    else {
        const started = input.taskController.startTask({
            kind: 'CREATE_PHASE1',
            label: worldStudioMessage('task.extractionLabel', 'Extract world events'),
            atomic: false,
            resumable: true,
            canPause: true,
            canCancel: true,
            step: 'INGEST',
            message: worldStudioMessage('task.extractionStarted', 'Extraction started'),
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
    input.setPhase2(null);
    input.patchSnapshot({
        draftQuality: {
            worldCutStatus: 'idle',
            enrichStatus: 'idle',
            enrichFailureReason: null,
            weakFieldIssues: [],
            updatedAt: new Date().toISOString(),
        },
        parseJob: buildParseJobStartState(activeChunkPolicy),
    });
    input.setCreateStep('INGEST');
    input.taskController.updateTask(taskId, {
        progress: 0,
        message: isResumeRun
            ? worldStudioMessage('task.resumingExtraction', 'Resuming extraction')
            : worldStudioMessage('task.extractionStarted', 'Extraction started'),
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
        finalDraftAccumulator: initialFinalDraftAccumulator || input.snapshot.finalDraftAccumulator,
    });
    const extractConcurrency = effectiveMode === 'failed'
        ? Math.max(1, Math.min(3, input.retryConcurrency))
        : 1;
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
            coarseRoute: formatRouteBindingSummary(bindings.coarse as RuntimeRouteBinding | null),
            fineRoute: formatRouteBindingSummary(bindings.fine as RuntimeRouteBinding | null),
            resume: isResumeRun,
            taskId,
        },
    });
    const shouldInterrupt = () => {
        if (abortSignal?.aborted || input.taskController.shouldCancel(taskId))
            return 'cancel' as const;
        if (input.taskController.shouldPause(taskId))
            return 'pause' as const;
        return null;
    };
    await executePhase1ExtractionLoop({
        input,
        taskId,
        abortSignal,
        shouldInterrupt,
        bindings,
        effectiveMode,
        isResumeRun,
        usedLegacyFileChunks,
        sourceDigest,
        initialChunkPolicy,
        updateTaskCheckpoint,
    }, {
        allChunks,
        chunksToRun,
        chunkIndexMap,
        activeChunkPolicy,
        initialAccumulatedState,
        initialFinalDraftAccumulator,
    });
}
