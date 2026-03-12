import { resolveContextTokenBudget } from '../../../engine/accumulated-context.js';
import { isContextOverflowText } from '../../../engine/errors.js';
import type { AccumulatedState, FinalDraftAccumulator } from '../../../engine/types.js';
import { runPhase1ExtractionFromChunks } from '../../../generation/pipeline.js';
import { worldStudioMessage } from '../../../i18n/messages.js';
import { emitWorldStudioLog } from '../../../logging.js';
import { toFailedChunkIndices } from '../../../services/event-graph-map.js';
import { formatRouteBindingSummary } from '../../../services/mutation-payload.js';
import type { WorldStudioCreateActionsInput } from './types.js';
import type { AdaptiveChunkPolicy } from './chunk-policy.js';
import { shrinkAdaptiveChunkPolicy } from './chunk-policy.js';
import { buildParseJobStartState, mergeRetryPhase1Result, resolvePhase1Chunks, } from './run-phase1-helpers.js';
import { applyPhase1ResultSnapshot, diagLog, hasTerminalContextOverflowFailures, isFinalDraftAccumulatorPopulated, summarizeChunkTasks, summarizeDraftPatch, summarizeFinalDraftAccumulator, summarizeTerminalChunkFailures, toTaskProgressMessage, } from './run-phase1-utils.js';
import { asRecord, type RuntimeRouteBinding } from "@nimiplatform/sdk/mod";
export type ExtractionLoopContext = {
    input: WorldStudioCreateActionsInput;
    taskId: string;
    abortSignal: AbortSignal | undefined;
    shouldInterrupt: () => 'cancel' | 'pause' | null;
    bindings: {
        coarse: RuntimeRouteBinding | null;
        fine: RuntimeRouteBinding | null;
    };
    effectiveMode: 'all' | 'failed';
    isResumeRun: boolean;
    usedLegacyFileChunks: boolean;
    sourceDigest: string;
    initialChunkPolicy: AdaptiveChunkPolicy;
    updateTaskCheckpoint: (checkpoint: {
        step: 'SOURCE' | 'INGEST' | 'EXTRACT' | 'CHECKPOINTS' | 'SYNTHESIZE' | 'DRAFT' | 'PUBLISH' | 'MAINTAIN';
        chunkTotal?: number;
        chunkCompleted?: number;
        chunkFailed?: number;
    }, payloadPatch?: Record<string, unknown>) => void;
};
export type ExtractionLoopInput = {
    allChunks: string[];
    chunksToRun: string[];
    chunkIndexMap: number[] | undefined;
    activeChunkPolicy: AdaptiveChunkPolicy;
    initialAccumulatedState: AccumulatedState | undefined;
    initialFinalDraftAccumulator: FinalDraftAccumulator | undefined;
};
export async function executePhase1ExtractionLoop(ctx: ExtractionLoopContext, loopInput: ExtractionLoopInput): Promise<void> {
    const { input, taskId, abortSignal, shouldInterrupt, bindings, effectiveMode, isResumeRun, usedLegacyFileChunks, sourceDigest, initialChunkPolicy, updateTaskCheckpoint, } = ctx;
    let { allChunks, chunksToRun, chunkIndexMap, activeChunkPolicy } = loopInput;
    const { initialAccumulatedState, initialFinalDraftAccumulator } = loopInput;
    let autoShrinkRetried = false;
    let lastDiagProgressPhase = '';
    let lastDiagChunkProcessed = -1;
    const runExtractionAttempt = async (attemptInput: {
        chunks: string[];
        chunkIndexMap?: number[];
        chunkPolicy: AdaptiveChunkPolicy;
        initialAccumulatedState?: AccumulatedState;
        initialFinalDraftAccumulator?: FinalDraftAccumulator;
    }) => {
        const ctxBudget = resolveContextTokenBudget(attemptInput.chunkPolicy.effectiveContextTokens, attemptInput.chunkPolicy.chunkSize);
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
                if (progress.phase !== lastDiagProgressPhase
                    || progress.chunkProcessed !== lastDiagChunkProcessed) {
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
            bindings,
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
    try {
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
                finalDraftAccumulator: pausedResult.finalDraftAccumulator,
            });
            input.taskController.pauseTask(taskId, worldStudioMessage('task.extractionPaused', 'Extraction paused. Resume to continue.'));
            input.taskController.updateTask(taskId, {
                progress: Math.max(0.1, Math.min(0.95, pausedResult.qualityGate.metrics.chunkSuccessRatio)),
            });
            input.setNotice(worldStudioMessage('notice.extractionPaused', 'Extraction paused. Resume task to continue.'));
            input.setStatusBanner({
                kind: 'info',
                message: worldStudioMessage('banner.extractionPaused', 'Extraction paused'),
            });
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
            input.taskController.cancelTask(taskId, worldStudioMessage('task.extractionCanceled', 'Extraction canceled'));
            input.setNotice(worldStudioMessage('notice.extractionCanceled', 'Extraction canceled.'));
            input.setStatusBanner({
                kind: 'warning',
                message: worldStudioMessage('banner.extractionCanceled', 'Extraction canceled'),
            });
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
            startTimeOptionsCount: effectiveResult.startTimeOptions.length,
            startTimeOptionsPreview: effectiveResult.startTimeOptions.slice(0, 30).map((item) => ({
                id: item.id,
                label: item.label,
            })),
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
        });
        if (effectiveResult.qualityGate.status === 'PASS') {
            input.setNotice(effectiveMode === 'failed'
                ? worldStudioMessage('notice.extractionRetryCompletedConfirm', 'Failed chunks re-extracted. Confirm checkpoints.')
                : worldStudioMessage('notice.extractionCompletedConfirm', 'Extraction completed. Confirm checkpoints.'));
            input.setStatusBanner({
                kind: 'success',
                message: worldStudioMessage('banner.extractionCompleted', 'Extraction completed'),
            });
            emitWorldStudioLog({
                level: 'info',
                message: 'world-studio:event-gate:pass',
                flowId: input.flowId,
                source: 'WorldStudioPage.onRunPhase1',
                details: effectiveResult.qualityGate.metrics,
            });
        }
        else if (effectiveResult.qualityGate.status === 'WARN') {
            input.setNotice(effectiveMode === 'failed'
                ? worldStudioMessage('notice.extractionRetryCompletedWarnConfirm', 'Failed chunks re-extracted with warnings. Confirm checkpoints before synthesize.')
                : worldStudioMessage('notice.extractionCompletedWarnConfirm', 'Extraction completed with warnings. Confirm checkpoints before synthesize.'));
            input.setStatusBanner({
                kind: 'warning',
                message: worldStudioMessage('banner.extractionCompletedWithWarnings', 'Extraction completed with warnings'),
            });
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
        }
        else {
            input.setNotice(effectiveMode === 'failed'
                ? worldStudioMessage('notice.extractionRetryBlocked', 'Retry completed, but quality gate is still blocked. Try switching Fine model and rerun failed chunks again.')
                : worldStudioMessage('notice.extractionBlocked', 'Extraction completed, but quality gate blocked synthesize. Try switching Fine model and rerun extract.'));
            input.setError(`WORLD_STUDIO_PHASE1_QUALITY_GATE_BLOCKED: ${effectiveResult.qualityGate.reasons.join(' | ')}`);
            input.setStatusBanner({
                kind: 'warning',
                message: worldStudioMessage('banner.extractionQualityGateBlocked', 'Extraction finished with quality gate block'),
            });
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
        input.taskController.completeTask(taskId, worldStudioMessage('task.extractionCompleted', 'Extraction completed'));
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
    }
    catch (error) {
        let runError: unknown = error;
        if (input.taskController.shouldCancel(taskId) || abortSignal?.aborted) {
            input.patchSnapshot({
                parseJob: {
                    phase: 'failed',
                    updatedAt: new Date().toISOString(),
                    chunkPolicy: activeChunkPolicy,
                },
            });
            input.taskController.cancelTask(taskId, worldStudioMessage('task.extractionCanceled', 'Extraction canceled'));
            input.setNotice(worldStudioMessage('notice.extractionCanceled', 'Extraction canceled.'));
            input.setStatusBanner({
                kind: 'warning',
                message: worldStudioMessage('banner.extractionCanceled', 'Extraction canceled'),
            });
            diagLog('Phase1 canceled during catch', {
                taskId,
                error: error instanceof Error ? error.message : String(error),
            });
            return;
        }
        const canAutoShrink = (effectiveMode === 'all'
            && !isResumeRun
            && !usedLegacyFileChunks
            && isContextOverflowText(runError instanceof Error ? runError.message : runError));
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
                const shrinkCtxBudget = resolveContextTokenBudget(activeChunkPolicy.effectiveContextTokens, activeChunkPolicy.chunkSize);
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
                    bindings,
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
                    input.setNotice(worldStudioMessage('notice.extractionAdaptiveShrinkCompleted', 'Extraction completed after adaptive chunk shrink. Confirm checkpoints.'));
                    input.setStatusBanner({
                        kind: 'success',
                        message: worldStudioMessage('banner.extractionCompleted', 'Extraction completed'),
                    });
                }
                else if (effectiveRetriedResult.qualityGate.status === 'WARN') {
                    input.setNotice(worldStudioMessage('notice.extractionAdaptiveShrinkWarn', 'Extraction completed after adaptive chunk shrink with warnings. Confirm checkpoints.'));
                    input.setStatusBanner({
                        kind: 'warning',
                        message: worldStudioMessage('banner.extractionCompletedWithWarnings', 'Extraction completed with warnings'),
                    });
                }
                else {
                    input.setNotice(worldStudioMessage('notice.extractionAdaptiveShrinkBlocked', 'Extraction retried with smaller chunks, but quality gate is still blocked.'));
                    input.setError(`WORLD_STUDIO_PHASE1_QUALITY_GATE_BLOCKED: ${effectiveRetriedResult.qualityGate.reasons.join(' | ')}`);
                    input.setStatusBanner({
                        kind: 'warning',
                        message: worldStudioMessage('banner.extractionQualityGateBlocked', 'Extraction finished with quality gate block'),
                    });
                }
                input.taskController.completeTask(taskId, worldStudioMessage('task.extractionCompleted', 'Extraction completed'));
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
            }
            catch (retryError) {
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
