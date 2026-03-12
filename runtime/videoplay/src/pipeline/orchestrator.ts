import { VIDEOPLAY_PIPELINE_CHAIN, VIDEOPLAY_REASON, } from '../contracts.js';
import { createUlid } from '../id.js';
import { VideoPlayError, toVideoPlayError } from '../errors.js';
import { runPromptCanaryCases } from '../prompt/canary.js';
import type { FallbackAuditRecord, VideoPlayPipelineDeps, VideoPlayPipelineInput, VideoPlayPipelineLifecycleStatus, VideoPlayPipelineResult, VideoPlayRunEvent, } from '../types.js';
import { normalizeSegmentationPolicy, extractFallbackAuditRecord, actionHintByReasonCode, nowIso, } from './util.js';
import { createRunEventFactory, normalizeExecutionControl, createInitialRuntimeSnapshot, createInitialStageProgressMap, toStageProgressMap, toStageProgressList, parseRuntimeSnapshot, clearDownstreamFromStep, findNextStepIndex, resolveNextStep, validateResumeBoundary, computeStepInputHash, markStepRunning, markStepComplete, markStepError, createCheckpointToken, buildCheckpoint, fallbackForStep, throwIfCanceled, } from './runtime.js';
import { executeStep } from './steps.js';

export { segmentEpisodes, composeEpisode, evaluateQualityGates } from './domain.js';
export { invokeWithRouteFallback } from './route.js';

export async function runVideoPlayEpisodeProduction(deps: VideoPlayPipelineDeps, input: VideoPlayPipelineInput): Promise<VideoPlayPipelineResult> {
    const control = normalizeExecutionControl(input.execution);
    const incomingPolicy = normalizeSegmentationPolicy(input.policy);
    let traceId = createUlid();
    let runId = createUlid();
    let snapshot = createInitialRuntimeSnapshot({
        policy: incomingPolicy,
        sourceMode: input.sourceMode,
    });
    let progressMap = createInitialStageProgressMap();
    let seededEvents: VideoPlayRunEvent[] = [];
    let fallbackAudits: FallbackAuditRecord[] = [];
    if (control.checkpoint) {
        traceId = control.checkpoint.traceId;
        runId = control.checkpoint.runId;
        progressMap = toStageProgressMap(control.checkpoint.stageProgress);
        seededEvents = [...control.checkpoint.runEvents];
        fallbackAudits = [...control.checkpoint.fallbackAudits];
        snapshot = parseRuntimeSnapshot({
            raw: control.checkpoint.snapshot,
            fallbackPolicy: incomingPolicy,
            fallbackSourceMode: input.sourceMode,
        });
        for (const step of VIDEOPLAY_PIPELINE_CHAIN) {
            if (progressMap[step].status === 'PAUSED') {
                progressMap[step] = {
                    ...progressMap[step],
                    status: 'PENDING',
                    updatedAt: nowIso(),
                };
            }
        }
    }
    snapshot.policy = control.checkpoint ? snapshot.policy : incomingPolicy;
    snapshot.sourceMode = input.sourceMode;
    const runEventFactory = createRunEventFactory({
        traceId,
        runId,
        ...(input.taskId ? { taskId: input.taskId } : {}),
        seedEvents: seededEvents,
    });
    if (!control.checkpoint) {
        runEventFactory.pushEvent({
            step: 'narrative-ingest',
            eventType: 'run.start',
        });
    }
    if (control.rerunStep) {
        clearDownstreamFromStep({
            step: control.rerunStep,
            progressMap,
            snapshot,
        });
    }
    let nextStepIndex = control.rerunStep
        ? VIDEOPLAY_PIPELINE_CHAIN.indexOf(control.rerunStep)
        : findNextStepIndex(progressMap);
    if (control.checkpoint && !control.rerunStep) {
        validateResumeBoundary({
            nextStepIndex,
            progressMap,
            snapshot,
            pipelineInput: input,
        });
    }
    let remainingBudget = control.stepBudget;
    let status: VideoPlayPipelineLifecycleStatus = 'RUNNING';
    while (nextStepIndex < VIDEOPLAY_PIPELINE_CHAIN.length) {
        if (remainingBudget <= 0) {
            status = 'PAUSED';
            break;
        }
        const step = VIDEOPLAY_PIPELINE_CHAIN[nextStepIndex]!;
        const stepInputHash = computeStepInputHash(step, snapshot, input);
        const attempt = markStepRunning(progressMap, {
            step,
            stepInputHash,
        });
        runEventFactory.pushEvent({
            step,
            eventType: 'step.start',
            attempt,
            stepInputHash,
            details: {
                rerunStep: control.rerunStep,
            },
        });
        try {
            throwIfCanceled(control, step);
            if (!snapshot.promptCanaryPassed) {
                const canaryReport = runPromptCanaryCases();
                if (!canaryReport.ok) {
                    throw new VideoPlayError({
                        reasonCode: VIDEOPLAY_REASON.PROMPT_CANARY_FAILED,
                        actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.PROMPT_CANARY_FAILED),
                        stage: 'prompt',
                        message: canaryReport.failures.join(';'),
                    });
                }
                snapshot.promptCanaryPassed = true;
            }
            const stepResult = await executeStep({
                step,
                deps,
                pipelineInput: input,
                snapshot,
                runEventFactory,
                fallbackAudits,
                attempt,
                stepInputHash,
                control,
                traceId,
                runId,
            });
            const checkpointToken = createCheckpointToken({
                runId,
                step,
                attempt,
                stepInputHash,
                eventCount: runEventFactory.events.length,
            });
            markStepComplete(progressMap, {
                step,
                checkpointToken,
                stepInputHash,
                lastCompletedUnit: stepResult.lastCompletedUnit || null,
            });
            runEventFactory.pushEvent({
                step,
                eventType: 'step.complete',
                attempt,
                checkpointToken,
                stepInputHash,
                ...(stepResult.lastCompletedUnit ? { lastCompletedUnit: stepResult.lastCompletedUnit } : {}),
                ...(stepResult.details ? { details: stepResult.details } : {}),
            });
            nextStepIndex += 1;
            remainingBudget -= 1;
        }
        catch (error) {
            const normalized = toVideoPlayError(error, fallbackForStep(step));
            const fallbackAudit = extractFallbackAuditRecord(normalized.details);
            if (fallbackAudit) {
                fallbackAudits.push(fallbackAudit);
            }
            if (normalized.reasonCode === VIDEOPLAY_REASON.RUN_CANCELED) {
                status = 'CANCELED';
                break;
            }
            markStepError(progressMap, {
                step,
                reasonCode: normalized.reasonCode,
                actionHint: normalized.actionHint,
            });
            runEventFactory.pushEvent({
                step,
                eventType: 'step.error',
                attempt,
                reasonCode: normalized.reasonCode,
                actionHint: normalized.actionHint,
                retryClass: normalized.retryClass,
                stepInputHash,
                details: normalized.details,
            });
            runEventFactory.pushEvent({
                step,
                eventType: 'run.error',
                attempt,
                reasonCode: normalized.reasonCode,
                actionHint: normalized.actionHint,
                retryClass: normalized.retryClass,
                details: normalized.details,
            });
            const failedCheckpoint = buildCheckpoint({
                traceId,
                runId,
                status: 'FAILED',
                nextStepIndex,
                progressMap,
                runEvents: runEventFactory.events,
                fallbackAudits,
                snapshot,
            });
            throw new VideoPlayError({
                reasonCode: normalized.reasonCode,
                actionHint: normalized.actionHint,
                retryClass: normalized.retryClass,
                stage: normalized.stage,
                message: normalized.message,
                details: {
                    ...(normalized.details || {}),
                    checkpoint: failedCheckpoint,
                },
            });
        }
    }
    if (status === 'RUNNING') {
        status = nextStepIndex >= VIDEOPLAY_PIPELINE_CHAIN.length
            ? 'COMPLETED'
            : 'PAUSED';
    }
    if (status === 'PAUSED' && nextStepIndex < VIDEOPLAY_PIPELINE_CHAIN.length) {
        const pausedStep = VIDEOPLAY_PIPELINE_CHAIN[nextStepIndex]!;
        progressMap[pausedStep] = {
            ...progressMap[pausedStep],
            status: 'PAUSED',
            updatedAt: nowIso(),
        };
    }
    if (status === 'CANCELED') {
        const canceledStep = resolveNextStep(nextStepIndex)
            || VIDEOPLAY_PIPELINE_CHAIN[VIDEOPLAY_PIPELINE_CHAIN.length - 1]!;
        progressMap[canceledStep] = {
            ...progressMap[canceledStep],
            status: 'CANCELED',
            reasonCode: VIDEOPLAY_REASON.RUN_CANCELED,
            actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.RUN_CANCELED),
            updatedAt: nowIso(),
        };
        runEventFactory.pushEvent({
            step: canceledStep,
            eventType: 'run.canceled',
            reasonCode: VIDEOPLAY_REASON.RUN_CANCELED,
            actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.RUN_CANCELED),
            retryClass: 'non-retryable',
        });
    }
    if (status === 'COMPLETED') {
        runEventFactory.pushEvent({
            step: 'release-package',
            eventType: 'run.complete',
            details: {
                episodeCount: snapshot.episodes.length,
                releaseCandidateCount: snapshot.releaseCandidates.length,
            },
        });
    }
    const checkpoint = buildCheckpoint({
        traceId,
        runId,
        status,
        nextStepIndex,
        progressMap,
        runEvents: runEventFactory.events,
        fallbackAudits,
        snapshot,
    });
    return {
        traceId,
        runId,
        status,
        nextStep: resolveNextStep(nextStepIndex),
        episodes: [...snapshot.episodes],
        releaseCandidates: [...snapshot.releaseCandidates],
        stageProgress: toStageProgressList(progressMap),
        checkpoint,
        runEvents: [...runEventFactory.events],
        fallbackAudits: [...fallbackAudits],
    };
}
