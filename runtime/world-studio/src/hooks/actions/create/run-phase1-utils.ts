import type { EventNodeDraft, WorldStudioTaskRecord } from '../../../contracts.js';
import { classifyChunkFailureKind, isContextOverflowText } from '../../../engine/errors.js';
import type { ChunkTaskResult, DraftPatch, FinalDraftAccumulator } from '../../../engine/types.js';
import { emitWorldStudioLog } from '../../../logging.js';
import { buildPhase1ArtifactFromResult } from '../../../services/phase1-artifact.js';
import { projectEventsForSelectedStartTime } from '../../../services/start-time-projection.js';
import type { WorldStudioCreateActionsInput } from './types.js';
import type { AdaptiveChunkPolicy } from './chunk-policy.js';
import type { mergeRetryPhase1Result } from './run-phase1-helpers.js';
import { asRecord } from "@nimiplatform/sdk/mod";
export type RunCreatePhase1Options = {
    taskId?: string;
    resume?: boolean;
};
export function diagLog(message: string, details?: Record<string, unknown>) {
    try {
        emitWorldStudioLog({
            level: 'error',
            message: `[MODS-TEST-DIAG] ${message}`,
            source: 'DIAG',
            details,
        });
    }
    catch {
        // Ignore diagnostics sink failures in non-runtime environments (tests, headless execution).
    }
}
export function summarizeChunkTasks(tasks: ChunkTaskResult[]): {
    total: number;
    success: number;
    failed: number;
    failedByCode: Array<{
        code: string;
        count: number;
    }>;
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
export function summarizeFinalDraftAccumulator(accumulator: FinalDraftAccumulator | undefined): Record<string, unknown> {
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
export function isFinalDraftAccumulatorPopulated(accumulator: FinalDraftAccumulator | undefined): boolean {
    if (!accumulator)
        return false;
    return (Object.keys(asRecord(accumulator.world || {})).length > 0
        || Object.keys(asRecord(accumulator.worldview || {})).length > 0
        || (Array.isArray(accumulator.worldLorebooks) && accumulator.worldLorebooks.length > 0)
        || (Array.isArray(accumulator.futureHistoricalEvents) && accumulator.futureHistoricalEvents.length > 0)
        || Object.keys(accumulator.agentDraftsByCharacter || {}).length > 0);
}
export function summarizeDraftPatch(patch: DraftPatch): Record<string, unknown> {
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
export function summarizeTerminalChunkFailures(tasks: ChunkTaskResult[]): {
    terminalTotal: number;
    terminalSuccess: number;
    terminalFailed: number;
    failedByStage: Array<{
        stage: string;
        count: number;
    }>;
    failedByKind: Array<{
        kind: 'json_parse' | 'context_overflow' | 'provider_timeout' | 'provider_internal' | 'other';
        count: number;
    }>;
    topFailedErrorCodes: Array<{
        code: string;
        count: number;
    }>;
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
    const failedByKindMap = new Map<'json_parse' | 'context_overflow' | 'provider_timeout' | 'provider_internal' | 'other', number>();
    const topFailedErrorCodeMap = new Map<string, number>();
    failedTasks.forEach((task) => {
        const stage = String(task.stage || 'unknown').toLowerCase();
        failedByStageMap.set(stage, (failedByStageMap.get(stage) || 0) + 1);
        const kind = classifyChunkFailureKind(`${String(task.errorCode || '')}\n${String(task.errorMessage || '')}`);
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
export function isContextOverflowTask(task: Pick<ChunkTaskResult, 'errorCode' | 'errorMessage'>): boolean {
    const code = String(task.errorCode || '').trim().toUpperCase();
    if (code === 'WORLD_STUDIO_CONTEXT_OVERFLOW' || code.includes('CONTEXT_OVERFLOW'))
        return true;
    return isContextOverflowText(task.errorMessage);
}
export function hasTerminalContextOverflowFailures(chunkTasks: ChunkTaskResult[]): boolean {
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
export function sourceSampleForPolicy(input: WorldStudioCreateActionsInput): string {
    if (input.sourceMode === 'FILE' && input.sourceRawTextRef.current.trim()) {
        return input.sourceRawTextRef.current;
    }
    return input.snapshot.sourceText;
}
export function buildSourceDigest(chunks: string[]): string {
    const joined = chunks.join('\n');
    let hash = 2166136261;
    for (let index = 0; index < joined.length; index += 1) {
        hash ^= joined.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    const normalized = (hash >>> 0).toString(16).padStart(8, '0');
    return `len:${joined.length}:fnv1a:${normalized}`;
}
export function resolvePhase1ResumeTask(input: WorldStudioCreateActionsInput, options?: RunCreatePhase1Options): WorldStudioTaskRecord | null {
    if (!options?.resume)
        return null;
    const specifiedId = String(options.taskId || '').trim();
    const specifiedTask = specifiedId ? input.taskController.getTaskById(specifiedId) : null;
    const activeTask = input.taskController.getActiveTask();
    const candidate = specifiedTask || activeTask;
    if (!candidate)
        return null;
    if (candidate.kind !== 'CREATE_PHASE1')
        return null;
    if (candidate.status !== 'PAUSED' && candidate.status !== 'PAUSE_REQUESTED')
        return null;
    return candidate;
}
export function applyPhase1ResultSnapshot(input: WorldStudioCreateActionsInput, params: {
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
            message: '[MODS-TEST-DIAG] Phase1 applyResult: writing selectedCharacters + agentSync.selectedCharacterIds',
            source: 'DIAG',
            details: {
                selectedCharacters,
                characterCandidateCount: params.result.characterCandidates.length,
                characterCandidateNames: params.result.characterCandidates.map((c) => c.name),
                existingSelectedCharacters: input.snapshot.selectedCharacters,
                existingAgentSyncSelectedCharacterIds: input.snapshot.agentSync.selectedCharacterIds,
                existingAgentSyncDraftKeys: Object.keys(input.snapshot.agentSync.draftsByCharacter || {}),
            },
        });
    }
    catch {
        // Ignore diagnostics sink failures in non-runtime environments (tests, headless execution).
    }
    const selectedStartTimeId = params.result.startTimeOptions[params.result.startTimeOptions.length - 1]?.id || '';
    const projection = projectEventsForSelectedStartTime({
        selectedStartTimeId,
        startTimeOptions: params.result.startTimeOptions,
        events: params.result.knowledgeGraph.events as unknown as {
            primary: EventNodeDraft[];
            secondary: EventNodeDraft[];
        },
        futureHistoricalEvents: params.result.knowledgeGraph.futureHistoricalEvents || [],
    });
    const projectedKnowledgeGraph = {
        ...params.result.knowledgeGraph,
        events: projection.events,
        futureHistoricalEvents: projection.futureHistoricalEvents,
    };
    input.setPhase1(params.result);
    input.patchSnapshot({
        selectedStartTimeId,
        selectedCharacters,
        phase1Artifact: artifact,
        agentSync: {
            ...input.snapshot.agentSync,
            selectedCharacterIds: selectedCharacters,
        },
        knowledgeGraph: projectedKnowledgeGraph,
        finalDraftAccumulator: params.result.finalDraftAccumulator,
        eventsDraft: projection.events,
        futureEventsText: JSON.stringify(projection.futureHistoricalEvents || [], null, 2),
        eventGraphLayout: {
            selectedEventId: String(projection.events.primary[0]?.id
                || projection.events.secondary[0]?.id
                || ''),
            expandedPrimaryIds: projection.events.primary[0]?.id
                ? [String(projection.events.primary[0].id)]
                : [],
        },
        unsavedChangesByPanel: {
            ...input.snapshot.unsavedChangesByPanel,
            worldEvents: true,
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
export function toTaskProgressMessage(phase: 'ingest' | 'extract' | 'merge' | 'synthesize' | 'validate'): string {
    if (phase === 'ingest')
        return 'Preparing chunks';
    if (phase === 'extract')
        return 'Extracting structured knowledge';
    if (phase === 'merge')
        return 'Merging chunk outputs';
    if (phase === 'synthesize')
        return 'Synthesizing draft';
    return 'Validating extraction quality';
}
