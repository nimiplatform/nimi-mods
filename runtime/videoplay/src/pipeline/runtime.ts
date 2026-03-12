import { VIDEOPLAY_PIPELINE_CHAIN, VIDEOPLAY_REASON, VIDEOPLAY_RETRY_CLASS, type VideoPlayPipelineStep, type VideoPlayReasonCode, } from '../contracts.js';
import { createHash } from '../id.js';
import { VideoPlayError } from '../errors.js';
import { RunEventSchema, } from '../schemas.js';
import type { CharacterCastingOutput, EditComposeOutput, EpisodeRecord, FallbackAuditRecord, NarrativeProjectionRenderInput, NarrativeTurnWindow, QualityGateReport, ReleasePackage, SegmentationOutput, SegmentationPolicy, AssetRenderOutput, AudioDesignOutput, CandidateSelectionOutput, ScenePlanningOutput, ScreenplayOutput, SegmentedEpisode, StoryboardOutput, VideoPlayPipelineCheckpoint, VideoPlayPipelineExecutionControl, VideoPlayPipelineInput, VideoPlayPipelineLifecycleStatus, VideoPlayPipelineStageProgress, VideoPlayRunEvent, VideoPlayRunEventType, } from '../types.js';
import type { VideoPlayPromptLocale } from '../prompt/registry.js';
import { nowIso, normalizeSegmentationPolicy, actionHintByReasonCode, type RuntimeRouteCatalog, } from './util.js';

export type EpisodeRuntimeContext = {
    segmentedEpisode: SegmentedEpisode;
    baselineSourceEventIds: string[];
    projectionLocale: VideoPlayPromptLocale;
    screenplay: ScreenplayOutput | null;
    storyboard: StoryboardOutput | null;
    assetOutput: AssetRenderOutput | null;
    candidateSelection: CandidateSelectionOutput | null;
    audioDesign: AudioDesignOutput | null;
    composeOutput: EditComposeOutput | null;
    qcReport: QualityGateReport | null;
    releaseCandidate: ReleasePackage | null;
    episodeRecord: EpisodeRecord | null;
};
export type RuntimeSnapshot = {
    policy: SegmentationPolicy;
    sourceMode: VideoPlayPipelineInput['sourceMode'];
    storyPackageVersion: string;
    promptCanaryPassed: boolean;
    turnWindow: NarrativeTurnWindow | null;
    projection: NarrativeProjectionRenderInput | null;
    routeCatalog: RuntimeRouteCatalog | null;
    segmentation: SegmentationOutput | null;
    characterCasting: CharacterCastingOutput | null;
    scenePlanning: ScenePlanningOutput | null;
    episodeContexts: EpisodeRuntimeContext[];
    episodes: EpisodeRecord[];
    releaseCandidates: ReleasePackage[];
};
export type StageProgressMap = Record<VideoPlayPipelineStep, VideoPlayPipelineStageProgress>;
export type NormalizedExecutionControl = {
    mode: 'full' | 'stepwise';
    checkpoint: VideoPlayPipelineCheckpoint | null;
    rerunStep: VideoPlayPipelineStep | null;
    stepBudget: number;
    shouldCancel: (() => boolean) | null;
};
export type StepExecutionResult = {
    details?: Record<string, unknown>;
    lastCompletedUnit?: string;
};
export function cloneJson<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}
export function isPipelineStep(value: string): value is VideoPlayPipelineStep {
    return (VIDEOPLAY_PIPELINE_CHAIN as readonly string[]).includes(value);
}
export function createInitialStageProgressMap(): StageProgressMap {
    const now = nowIso();
    return VIDEOPLAY_PIPELINE_CHAIN.reduce((acc, step) => {
        acc[step] = {
            step,
            status: 'PENDING',
            attempt: 0,
            checkpointToken: null,
            stepInputHash: null,
            lastCompletedUnit: null,
            reasonCode: null,
            actionHint: null,
            updatedAt: now,
        };
        return acc;
    }, {} as StageProgressMap);
}
export function toStageProgressMap(progress: VideoPlayPipelineStageProgress[] | undefined): StageProgressMap {
    const map = createInitialStageProgressMap();
    if (!Array.isArray(progress)) {
        return map;
    }
    for (const row of progress) {
        if (!row || typeof row !== 'object') {
            continue;
        }
        const step = String(row.step || '').trim();
        if (!isPipelineStep(step)) {
            continue;
        }
        map[step] = {
            step,
            status: row.status,
            attempt: Number.isFinite(row.attempt) ? Math.max(0, Math.floor(row.attempt)) : 0,
            checkpointToken: row.checkpointToken || null,
            stepInputHash: row.stepInputHash || null,
            lastCompletedUnit: row.lastCompletedUnit || null,
            reasonCode: row.reasonCode || null,
            actionHint: row.actionHint || null,
            updatedAt: row.updatedAt || nowIso(),
        };
    }
    return map;
}
export function toStageProgressList(progressMap: StageProgressMap): VideoPlayPipelineStageProgress[] {
    return VIDEOPLAY_PIPELINE_CHAIN.map((step) => ({ ...progressMap[step] }));
}
export function createInitialRuntimeSnapshot(input: {
    policy: SegmentationPolicy;
    sourceMode: VideoPlayPipelineInput['sourceMode'];
}): RuntimeSnapshot {
    return {
        policy: input.policy,
        sourceMode: input.sourceMode,
        storyPackageVersion: '',
        promptCanaryPassed: false,
        turnWindow: null,
        projection: null,
        routeCatalog: null,
        segmentation: null,
        characterCasting: null,
        scenePlanning: null,
        episodeContexts: [],
        episodes: [],
        releaseCandidates: [],
    };
}
export function parseRuntimeSnapshot(input: {
    raw: unknown;
    fallbackPolicy: SegmentationPolicy;
    fallbackSourceMode: VideoPlayPipelineInput['sourceMode'];
}): RuntimeSnapshot {
    if (!input.raw || typeof input.raw !== 'object') {
        throw new VideoPlayError({
            reasonCode: VIDEOPLAY_REASON.CHECKPOINT_INVALID,
            actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.CHECKPOINT_INVALID),
            stage: 'orchestrator',
            message: 'VIDEOPLAY_CHECKPOINT_SNAPSHOT_INVALID',
        });
    }
    const record = input.raw as Record<string, unknown>;
    const policyCandidate = record.policy && typeof record.policy === 'object'
        ? (record.policy as Partial<SegmentationPolicy>)
        : input.fallbackPolicy;
    return {
        policy: normalizeSegmentationPolicy(policyCandidate),
        sourceMode: String(record.sourceMode || input.fallbackSourceMode).trim() === 'textplay-enriched-story'
            ? 'textplay-enriched-story'
            : 'canonical-story',
        storyPackageVersion: String(record.storyPackageVersion || '').trim(),
        promptCanaryPassed: Boolean(record.promptCanaryPassed),
        turnWindow: record.turnWindow && typeof record.turnWindow === 'object'
            ? (record.turnWindow as NarrativeTurnWindow)
            : null,
        projection: record.projection && typeof record.projection === 'object'
            ? (record.projection as NarrativeProjectionRenderInput)
            : null,
        routeCatalog: (() => {
            if (!record.routeCatalog || typeof record.routeCatalog !== 'object') {
                return null;
            }
            const candidate = record.routeCatalog as Partial<RuntimeRouteCatalog>;
            if (!candidate.chat || !candidate.image || !candidate.video || !candidate.tts) {
                return null;
            }
            return candidate as RuntimeRouteCatalog;
        })(),
        segmentation: record.segmentation && typeof record.segmentation === 'object'
            ? (record.segmentation as SegmentationOutput)
            : null,
        characterCasting: record.characterCasting && typeof record.characterCasting === 'object'
            ? (record.characterCasting as CharacterCastingOutput)
            : null,
        scenePlanning: record.scenePlanning && typeof record.scenePlanning === 'object'
            ? (record.scenePlanning as ScenePlanningOutput)
            : null,
        episodeContexts: Array.isArray(record.episodeContexts)
            ? (record.episodeContexts as EpisodeRuntimeContext[])
            : [],
        episodes: Array.isArray(record.episodes)
            ? (record.episodes as EpisodeRecord[])
            : [],
        releaseCandidates: Array.isArray(record.releaseCandidates)
            ? (record.releaseCandidates as ReleasePackage[])
            : [],
    };
}
export function normalizeExecutionControl(control: VideoPlayPipelineExecutionControl | undefined): NormalizedExecutionControl {
    const mode = control?.mode === 'stepwise' ? 'stepwise' : 'full';
    const stepBudgetFromInput = Number(control?.stepBudget);
    const stepBudget = Number.isFinite(stepBudgetFromInput)
        ? Math.max(1, Math.floor(stepBudgetFromInput))
        : (mode === 'stepwise' ? 1 : Number.POSITIVE_INFINITY);
    const rerunStep = control?.rerunStep && isPipelineStep(control.rerunStep)
        ? control.rerunStep
        : null;
    return {
        mode,
        checkpoint: control?.checkpoint || null,
        rerunStep,
        stepBudget,
        shouldCancel: typeof control?.shouldCancel === 'function' ? control.shouldCancel : null,
    };
}
export function findNextStepIndex(progressMap: StageProgressMap): number {
    for (let index = 0; index < VIDEOPLAY_PIPELINE_CHAIN.length; index += 1) {
        const step = VIDEOPLAY_PIPELINE_CHAIN[index]!;
        const status = progressMap[step].status;
        if (status !== 'COMPLETED') {
            return index;
        }
    }
    return VIDEOPLAY_PIPELINE_CHAIN.length;
}
export function resolveNextStep(nextStepIndex: number): VideoPlayPipelineStep | null {
    return nextStepIndex < VIDEOPLAY_PIPELINE_CHAIN.length
        ? VIDEOPLAY_PIPELINE_CHAIN[nextStepIndex]!
        : null;
}
export function computeStepInputHash(step: VideoPlayPipelineStep, snapshot: RuntimeSnapshot, input: VideoPlayPipelineInput): string {
    switch (step) {
        case 'narrative-ingest':
            return createHash(JSON.stringify({
                storyId: input.storyId,
                sourceMode: input.sourceMode,
                ingestCursorStart: input.ingestCursorStart,
                windowPolicy: input.windowPolicy || null,
                storyPackageVersion: snapshot.storyPackageVersion
                    || String((input.storyPackage as {
                        snapshot?: {
                            version?: string;
                        };
                    })?.snapshot?.version || ''),
            }));
        case 'character-casting':
            return createHash(JSON.stringify({
                storyId: input.storyId,
                participants: (input.storyPackage as Record<string, unknown>)?.cast
                    ? ((input.storyPackage as Record<string, unknown>).cast as Record<string, unknown>)?.participants || []
                    : [],
                storyPackageVersion: snapshot.storyPackageVersion,
            }));
        case 'scene-planning':
            return createHash(JSON.stringify({
                storyId: input.storyId,
                characterCastingHash: snapshot.characterCasting
                    ? createHash(JSON.stringify(snapshot.characterCasting))
                    : '',
                storyPackageVersion: snapshot.storyPackageVersion,
            }));
        case 'episode-segmentation':
            return createHash(JSON.stringify({
                policy: snapshot.policy,
                turnIds: snapshot.turnWindow?.turns.map((turn) => turn.turnId) || [],
            }));
        case 'screenplay':
            return createHash(JSON.stringify(snapshot.episodeContexts.map((context) => ({
                episodeId: context.segmentedEpisode.episodeId,
                sourceTurnIds: context.segmentedEpisode.sourceTurnIds,
            }))));
        case 'storyboard':
            return createHash(JSON.stringify(snapshot.episodeContexts.map((context) => ({
                episodeId: context.segmentedEpisode.episodeId,
                beatIds: context.screenplay?.beats.map((beat) => beat.beatId) || [],
            }))));
        case 'asset-render':
            return createHash(JSON.stringify(snapshot.episodeContexts.map((context) => ({
                episodeId: context.segmentedEpisode.episodeId,
                shots: context.storyboard?.shotPlans.map((shot) => ({
                    shotId: shot.shotId,
                    beatId: shot.beatId,
                    visualPrompt: shot.visualPrompt,
                    motionCue: shot.motionCue,
                    durationMs: shot.durationMs,
                })) || [],
                beatSummaries: context.screenplay?.beats.map((beat) => ({
                    beatId: beat.beatId,
                    summary: beat.summary,
                })) || [],
                projectionLocale: context.projectionLocale,
            }))));
        case 'candidate-selection':
            return createHash(JSON.stringify(snapshot.episodeContexts.map((context) => ({
                episodeId: context.segmentedEpisode.episodeId,
                assetShotIds: context.assetOutput?.shotAssets
                    .filter((a) => a.assetType === 'video')
                    .map((a) => a.assetId) || [],
            }))));
        case 'audio-design':
            return createHash(JSON.stringify(snapshot.episodeContexts.map((context) => ({
                episodeId: context.segmentedEpisode.episodeId,
                candidateSelectedAssets: context.candidateSelection?.selectedAssetIds || [],
                storyboardShotCount: context.storyboard?.shotPlans.length || 0,
            }))));
        case 'edit-compose':
            return createHash(JSON.stringify(snapshot.episodeContexts.map((context) => ({
                episodeId: context.segmentedEpisode.episodeId,
                selectedAssets: context.candidateSelection?.selectedAssetIds || [],
                orderedSegments: context.candidateSelection?.timelineSegments.map((segment) => ({
                    assetId: segment.assetId,
                    order: segment.order,
                    trimInMs: segment.trimInMs,
                    trimOutMs: segment.trimOutMs,
                })) || [],
            }))));
        case 'qc-gate':
            return createHash(JSON.stringify(snapshot.episodeContexts.map((context) => ({
                episodeId: context.segmentedEpisode.episodeId,
                timelineHash: context.composeOutput?.episodeMasterVideo.timelineHash || '',
                coverage: context.assetOutput?.coverage.ratio ?? 0,
            }))));
        case 'release-package':
            return createHash(JSON.stringify(snapshot.episodeContexts.map((context) => ({
                episodeId: context.segmentedEpisode.episodeId,
                qcStatus: context.qcReport?.status || 'NONE',
                durationSec: context.qcReport?.durationSec ?? 0,
            }))));
        default:
            return createHash(step);
    }
}
export function createCheckpointToken(input: {
    runId: string;
    step: VideoPlayPipelineStep;
    attempt: number;
    stepInputHash: string;
    eventCount: number;
}): string {
    return createHash(`${input.runId}:${input.step}:${input.attempt}:${input.stepInputHash}:${input.eventCount}`);
}
export function markStepRunning(progressMap: StageProgressMap, input: {
    step: VideoPlayPipelineStep;
    stepInputHash: string;
}): number {
    const current = progressMap[input.step];
    const attempt = current.attempt + 1;
    progressMap[input.step] = {
        ...current,
        status: 'RUNNING',
        attempt,
        stepInputHash: input.stepInputHash,
        reasonCode: null,
        actionHint: null,
        updatedAt: nowIso(),
    };
    return attempt;
}
export function markStepComplete(progressMap: StageProgressMap, input: {
    step: VideoPlayPipelineStep;
    checkpointToken: string;
    stepInputHash: string;
    lastCompletedUnit: string | null;
}): void {
    const current = progressMap[input.step];
    progressMap[input.step] = {
        ...current,
        status: 'COMPLETED',
        checkpointToken: input.checkpointToken,
        stepInputHash: input.stepInputHash,
        lastCompletedUnit: input.lastCompletedUnit,
        reasonCode: null,
        actionHint: null,
        updatedAt: nowIso(),
    };
}
export function markStepError(progressMap: StageProgressMap, input: {
    step: VideoPlayPipelineStep;
    reasonCode: VideoPlayReasonCode;
    actionHint: string;
}): void {
    const current = progressMap[input.step];
    progressMap[input.step] = {
        ...current,
        status: 'FAILED',
        reasonCode: input.reasonCode,
        actionHint: input.actionHint,
        updatedAt: nowIso(),
    };
}
export function clearDownstreamFromStep(input: {
    step: VideoPlayPipelineStep;
    progressMap: StageProgressMap;
    snapshot: RuntimeSnapshot;
}): void {
    const rerunIndex = VIDEOPLAY_PIPELINE_CHAIN.indexOf(input.step);
    for (let index = rerunIndex; index < VIDEOPLAY_PIPELINE_CHAIN.length; index += 1) {
        const step = VIDEOPLAY_PIPELINE_CHAIN[index]!;
        const current = input.progressMap[step];
        input.progressMap[step] = {
            ...current,
            status: 'PENDING',
            checkpointToken: null,
            stepInputHash: null,
            lastCompletedUnit: null,
            reasonCode: null,
            actionHint: null,
            updatedAt: nowIso(),
        };
    }
    // Index mapping for 12-step chain:
    //  0: narrative-ingest       → clear all
    //  1: character-casting      → clear characterCasting + downstream
    //  2: scene-planning         → clear scenePlanning + downstream
    //  3: episode-segmentation   → clear segmentation + downstream
    //  4: screenplay             → clear screenplay + downstream
    //  5: storyboard             → clear storyboard + downstream
    //  6: asset-render           → clear assetOutput + downstream
    //  7: candidate-selection    → clear candidateSelection + downstream
    //  8: audio-design           → clear audioDesign + downstream
    //  9: edit-compose           → clear composeOutput + downstream
    // 10: qc-gate                → clear qcReport + downstream
    // 11: release-package        → clear release
    if (rerunIndex <= 0) {
        input.snapshot.turnWindow = null;
        input.snapshot.projection = null;
        input.snapshot.routeCatalog = null;
        input.snapshot.characterCasting = null;
        input.snapshot.scenePlanning = null;
        input.snapshot.segmentation = null;
        input.snapshot.episodeContexts = [];
        input.snapshot.episodes = [];
        input.snapshot.releaseCandidates = [];
        return;
    }
    if (rerunIndex <= 1) {
        input.snapshot.characterCasting = null;
    }
    if (rerunIndex <= 2) {
        input.snapshot.scenePlanning = null;
    }
    if (rerunIndex <= 3) {
        input.snapshot.segmentation = null;
        input.snapshot.episodeContexts = [];
        input.snapshot.episodes = [];
        input.snapshot.releaseCandidates = [];
        return;
    }
    for (const context of input.snapshot.episodeContexts) {
        if (rerunIndex <= 4) {
            context.screenplay = null;
        }
        if (rerunIndex <= 5) {
            context.storyboard = null;
        }
        if (rerunIndex <= 6) {
            context.assetOutput = null;
        }
        if (rerunIndex <= 7) {
            context.candidateSelection = null;
        }
        if (rerunIndex <= 8) {
            context.audioDesign = null;
        }
        if (rerunIndex <= 9) {
            context.composeOutput = null;
        }
        if (rerunIndex <= 10) {
            context.qcReport = null;
        }
        if (rerunIndex <= 11) {
            context.releaseCandidate = null;
            context.episodeRecord = null;
        }
    }
    input.snapshot.episodes = [];
    input.snapshot.releaseCandidates = [];
}
export function validateResumeBoundary(input: {
    nextStepIndex: number;
    progressMap: StageProgressMap;
    snapshot: RuntimeSnapshot;
    pipelineInput: VideoPlayPipelineInput;
}): void {
    if (input.nextStepIndex <= 0 || input.nextStepIndex > VIDEOPLAY_PIPELINE_CHAIN.length) {
        return;
    }
    const previousStep = VIDEOPLAY_PIPELINE_CHAIN[input.nextStepIndex - 1]!;
    const previousProgress = input.progressMap[previousStep];
    if (!previousProgress.stepInputHash) {
        throw new VideoPlayError({
            reasonCode: VIDEOPLAY_REASON.CHECKPOINT_INVALID,
            actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.CHECKPOINT_INVALID),
            stage: 'orchestrator',
            message: 'VIDEOPLAY_CHECKPOINT_STEP_HASH_MISSING',
            details: { previousStep },
        });
    }
    const currentHash = computeStepInputHash(previousStep, input.snapshot, input.pipelineInput);
    if (currentHash !== previousProgress.stepInputHash) {
        throw new VideoPlayError({
            reasonCode: VIDEOPLAY_REASON.STEP_RESUME_HASH_MISMATCH,
            actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.STEP_RESUME_HASH_MISMATCH),
            stage: 'orchestrator',
            message: 'VIDEOPLAY_CHECKPOINT_RESUME_HASH_MISMATCH',
            details: {
                step: previousStep,
                expected: previousProgress.stepInputHash,
                current: currentHash,
            },
        });
    }
}
export function buildCheckpoint(input: {
    traceId: string;
    runId: string;
    status: VideoPlayPipelineLifecycleStatus;
    nextStepIndex: number;
    progressMap: StageProgressMap;
    runEvents: VideoPlayRunEvent[];
    fallbackAudits: FallbackAuditRecord[];
    snapshot: RuntimeSnapshot;
}): VideoPlayPipelineCheckpoint {
    return {
        traceId: input.traceId,
        runId: input.runId,
        status: input.status,
        nextStepIndex: input.nextStepIndex,
        stageProgress: toStageProgressList(input.progressMap),
        runEvents: [...input.runEvents],
        fallbackAudits: [...input.fallbackAudits],
        snapshot: cloneJson(input.snapshot) as Record<string, unknown>,
    };
}
export function fallbackForStep(step: VideoPlayPipelineStep): {
    reasonCode: VideoPlayReasonCode;
    actionHint: string;
    stage: string;
} {
    switch (step) {
        case 'narrative-ingest':
            return {
                reasonCode: VIDEOPLAY_REASON.FACT_PROJECTION_INVALID,
                actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.FACT_PROJECTION_INVALID),
                stage: 'narrative-bridge',
            };
        case 'character-casting':
            return {
                reasonCode: VIDEOPLAY_REASON.CHARACTER_CASTING_FAILED,
                actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.CHARACTER_CASTING_FAILED),
                stage: 'character-casting',
            };
        case 'scene-planning':
            return {
                reasonCode: VIDEOPLAY_REASON.SCENE_PLANNING_FAILED,
                actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.SCENE_PLANNING_FAILED),
                stage: 'scene-planning',
            };
        case 'episode-segmentation':
            return {
                reasonCode: VIDEOPLAY_REASON.SEGMENTATION_FAILED,
                actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.SEGMENTATION_FAILED),
                stage: 'segment',
            };
        case 'screenplay':
            return {
                reasonCode: VIDEOPLAY_REASON.SCREENPLAY_SCHEMA_INVALID,
                actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.SCREENPLAY_SCHEMA_INVALID),
                stage: 'screenplay',
            };
        case 'storyboard':
            return {
                reasonCode: VIDEOPLAY_REASON.STORYBOARD_SCHEMA_INVALID,
                actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.STORYBOARD_SCHEMA_INVALID),
                stage: 'storyboard',
            };
        case 'asset-render':
            return {
                reasonCode: VIDEOPLAY_REASON.SHOT_RENDER_FAILED,
                actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.SHOT_RENDER_FAILED),
                stage: 'render',
            };
        case 'candidate-selection':
            return {
                reasonCode: VIDEOPLAY_REASON.CANDIDATE_SELECTION_FAILED,
                actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.CANDIDATE_SELECTION_FAILED),
                stage: 'candidate-selection',
            };
        case 'audio-design':
            return {
                reasonCode: VIDEOPLAY_REASON.AUDIO_DESIGN_FAILED,
                actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.AUDIO_DESIGN_FAILED),
                stage: 'audio-design',
            };
        case 'edit-compose':
            return {
                reasonCode: VIDEOPLAY_REASON.EDIT_COMPOSE_FAILED,
                actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.EDIT_COMPOSE_FAILED),
                stage: 'edit',
            };
        case 'qc-gate':
            return {
                reasonCode: VIDEOPLAY_REASON.QC_FAILED,
                actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.QC_FAILED),
                stage: 'qc',
            };
        case 'release-package':
            return {
                reasonCode: VIDEOPLAY_REASON.RELEASE_PACKAGE_INVALID,
                actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.RELEASE_PACKAGE_INVALID),
                stage: 'package',
            };
        default:
            return {
                reasonCode: VIDEOPLAY_REASON.INPUT_INVALID,
                actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.INPUT_INVALID),
                stage: 'orchestrator',
            };
    }
}
export function throwIfCanceled(control: NormalizedExecutionControl, step: VideoPlayPipelineStep): void {
    if (control.shouldCancel?.()) {
        throw new VideoPlayError({
            reasonCode: VIDEOPLAY_REASON.RUN_CANCELED,
            actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.RUN_CANCELED),
            stage: step,
            retryClass: VIDEOPLAY_RETRY_CLASS.NON_RETRYABLE,
            message: 'VIDEOPLAY_RUN_CANCEL_REQUESTED',
        });
    }
}
export function createRunEventFactory(input: {
    traceId: string;
    runId: string;
    taskId?: string;
    seedEvents?: VideoPlayRunEvent[];
}) {
    let seq = (input.seedEvents || []).reduce((max, event) => Math.max(max, event.seq), 0);
    const events: VideoPlayRunEvent[] = [...(input.seedEvents || [])];
    function pushEvent(event: {
        step: VideoPlayPipelineStep;
        eventType: VideoPlayRunEventType;
        attempt?: number;
        reasonCode?: VideoPlayReasonCode;
        actionHint?: string;
        retryClass?: 'retryable' | 'non-retryable';
        idempotencyKey?: string;
        checkpointToken?: string;
        stepInputHash?: string;
        lastCompletedUnit?: string;
        details?: Record<string, unknown>;
    }): void {
        seq += 1;
        const runEvent: VideoPlayRunEvent = {
            traceId: input.traceId,
            runId: input.runId,
            parentRunId: null,
            stage: 'videoplay',
            step: event.step,
            eventType: event.eventType,
            seq,
            attempt: event.attempt || 1,
            timestamp: nowIso(),
            ...(input.taskId ? { taskId: input.taskId } : {}),
            ...(event.reasonCode ? { reasonCode: event.reasonCode } : {}),
            ...(event.actionHint ? { actionHint: event.actionHint } : {}),
            ...(event.retryClass ? { retryClass: event.retryClass } : {}),
            ...(event.idempotencyKey ? { idempotencyKey: event.idempotencyKey } : {}),
            ...(event.checkpointToken ? { checkpointToken: event.checkpointToken } : {}),
            ...(event.stepInputHash ? { stepInputHash: event.stepInputHash } : {}),
            ...(event.lastCompletedUnit ? { lastCompletedUnit: event.lastCompletedUnit } : {}),
            ...(event.details ? { details: event.details } : {}),
        };
        const parsed = RunEventSchema.safeParse(runEvent);
        if (parsed.success) {
            events.push(parsed.data);
        }
    }
    return {
        events,
        pushEvent,
    };
}
