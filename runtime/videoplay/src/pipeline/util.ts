import { VIDEOPLAY_REASON, type VideoPlayReasonCode, type VideoPlayRouteStage, } from '../contracts.js';
import { VideoPlayError } from '../errors.js';
import { DEFAULT_SEGMENTATION_POLICY, SEGMENTATION_POLICY_BOUNDS, } from '../policy.js';
import type { NarrativeTurn, SegmentationPolicy, FallbackAuditRecord, StoryboardShot, } from '../types.js';
import { type RuntimeRouteHealthResult, type RuntimeCanonicalCapability } from "@nimiplatform/sdk/mod";

export function nowIso(): string {
    return new Date().toISOString();
}
export type RuntimeRouteCatalogSnapshot = {
    selected: {
        source: 'local' | 'cloud';
        connectorId: string;
        model: string;
    };
};
export type RuntimeRouteCatalog = Record<'chat' | 'image' | 'video' | 'tts', RuntimeRouteCatalogSnapshot>;
export function parseRuntimeRouteCatalogSnapshot(value: unknown): RuntimeRouteCatalogSnapshot | null {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const record = value as Record<string, unknown>;
    const selected = record.selected;
    if (!selected || typeof selected !== 'object') {
        return null;
    }
    const selectedRecord = selected as Record<string, unknown>;
    const source = String(selectedRecord.source || '').trim() === 'cloud' ? 'cloud' : 'local';
    const connectorId = String(selectedRecord.connectorId || '').trim();
    const model = String(selectedRecord.model || '').trim();
    if (!model) {
        return null;
    }
    return {
        selected: {
            source,
            connectorId,
            model,
        },
    };
}
export function isRouteHealthy(result: RuntimeRouteHealthResult | null | undefined): boolean {
    const reasonCode = String(result?.reasonCode || '');
    const status = String(result?.status || '');
    return (reasonCode === 'RUNTIME_ROUTE_HEALTHY'
        || reasonCode === 'RUNTIME_ROUTE_DEGRADED'
        || status === 'healthy'
        || status === 'degraded');
}
export function actionHintByReasonCode(reasonCode: string): string {
    switch (reasonCode) {
        case VIDEOPLAY_REASON.INPUT_INVALID:
            return 'Fix input schema and value bounds, then retry.';
        case VIDEOPLAY_REASON.FACT_PROJECTION_INVALID:
            return 'Repair narrative projection mapping and retry.';
        case VIDEOPLAY_REASON.STORY_PACKAGE_INVALID:
            return 'Repair story package schema/coverage and retry.';
        case VIDEOPLAY_REASON.STORY_SOURCE_UNAVAILABLE:
            return 'Select an available story source mode and retry.';
        case VIDEOPLAY_REASON.SEGMENTATION_FAILED:
            return 'Adjust segmentation policy or input window and retry.';
        case VIDEOPLAY_REASON.SEGMENTATION_NON_DETERMINISTIC:
            return 'Remove non-deterministic segmentation branch.';
        case VIDEOPLAY_REASON.SCREENPLAY_SCHEMA_INVALID:
            return 'Repair screenplay schema contract.';
        case VIDEOPLAY_REASON.STORYBOARD_SCHEMA_INVALID:
            return 'Repair storyboard schema contract.';
        case VIDEOPLAY_REASON.ROUTE_UNAVAILABLE:
            return 'Restore available route source and retry.';
        case VIDEOPLAY_REASON.COVERAGE_LOW:
            return 'Fill missing shot coverage before QC.';
        case VIDEOPLAY_REASON.ASSET_ANALYSIS_INVALID:
            return 'Repair asset analysis inputs and rerun render.';
        case VIDEOPLAY_REASON.BATCH_QUEUE_ORCHESTRATION_FAILED:
            return 'Repair render queue orchestration and rerun render stage.';
        case VIDEOPLAY_REASON.VOICE_RENDER_FAILED:
            return 'Fix TTS route or voice profile, then rerun render.';
        case VIDEOPLAY_REASON.TIMELINE_SCHEMA_INVALID:
            return 'Repair timeline constraints and retry.';
        case VIDEOPLAY_REASON.AV_SYNC_DRIFT:
            return 'Re-align AV anchors within drift threshold.';
        case VIDEOPLAY_REASON.EDIT_COMPOSE_FAILED:
            return 'Repair asset inputs and compose parameters.';
        case VIDEOPLAY_REASON.VISUAL_ATTRACTION_LOW:
            return 'Rework storyboard and key shot generation.';
        case VIDEOPLAY_REASON.QC_FAILED:
            return 'Resolve failed quality gates and rerun pipeline.';
        case VIDEOPLAY_REASON.RELEASE_PACKAGE_INVALID:
            return 'Complete release package minimum set and retry.';
        case VIDEOPLAY_REASON.PROMPT_CANARY_FAILED:
            return 'Repair prompt catalog/template drift and rerun.';
        case VIDEOPLAY_REASON.CHECKPOINT_INVALID:
            return 'Refresh checkpoint snapshot and rerun from an explicit stage.';
        case VIDEOPLAY_REASON.STEP_RESUME_HASH_MISMATCH:
            return 'Rerun the selected step to rebuild downstream outputs.';
        case VIDEOPLAY_REASON.CHARACTER_CASTING_FAILED:
            return 'Fix character memory data or LLM route, then retry.';
        case VIDEOPLAY_REASON.SCENE_PLANNING_FAILED:
            return 'Fix scene data or LLM route, then retry.';
        case VIDEOPLAY_REASON.CANDIDATE_SELECTION_FAILED:
            return 'Fix candidate selection inputs and retry.';
        case VIDEOPLAY_REASON.AUDIO_DESIGN_FAILED:
            return 'Fix audio design inputs or LLM route, then retry.';
        case VIDEOPLAY_REASON.CHARACTER_CONSISTENCY_LOW:
            return 'Improve character visual consistency and retry QC.';
        case VIDEOPLAY_REASON.PHOTOGRAPHY_COMPLIANCE_LOW:
            return 'Improve photography rule compliance and retry QC.';
        case VIDEOPLAY_REASON.ACTING_QUALITY_LOW:
            return 'Improve acting direction quality and retry QC.';
        case VIDEOPLAY_REASON.AUDIO_COMPLETENESS_LOW:
            return 'Complete audio design coverage and retry QC.';
        case VIDEOPLAY_REASON.SELECTION_COVERAGE_LOW:
            return 'Increase selected segment coverage and retry QC.';
        case VIDEOPLAY_REASON.SELECTION_RATIONALITY_LOW:
            return 'Fix selection ordering/trim constraints and retry QC.';
        case VIDEOPLAY_REASON.CASTING_VISUAL_FAILED:
            return 'Fix image generation route for character casting.';
        case VIDEOPLAY_REASON.SCENE_VISUAL_FAILED:
            return 'Fix image generation route for scene planning.';
        case VIDEOPLAY_REASON.RUN_CANCELED:
            return 'Start a new run or continue from a non-canceled checkpoint.';
        default:
            return 'Retry after fixing upstream dependency.';
    }
}
export function isPlaceholderUri(value: string): boolean {
    return value.startsWith('videoplay://');
}
export function createInlineDataUri(mimeType: string, body: string): string {
    return `data:${mimeType};charset=utf-8,${encodeURIComponent(body)}`;
}
export function createJsonDataUri(value: unknown): string {
    return createInlineDataUri('application/json', JSON.stringify(value));
}
export function requireMaterializedUri(input: {
    uri: unknown;
    reasonCode: VideoPlayReasonCode;
    stage: string;
    message: string;
    details?: Record<string, unknown>;
}): string {
    const uri = String(input.uri || '').trim();
    if (!uri || isPlaceholderUri(uri)) {
        throw new VideoPlayError({
            reasonCode: input.reasonCode,
            actionHint: actionHintByReasonCode(input.reasonCode),
            stage: input.stage,
            message: input.message,
            details: input.details,
        });
    }
    return uri;
}
export function extractFallbackAuditRecord(details: unknown): FallbackAuditRecord | null {
    if (!details || typeof details !== 'object') {
        return null;
    }
    const candidate = (details as {
        fallbackAudit?: unknown;
    }).fallbackAudit;
    if (!candidate || typeof candidate !== 'object') {
        return null;
    }
    const record = candidate as Record<string, unknown>;
    const traceId = String(record.traceId || '').trim();
    const stage = String(record.stage || '').trim();
    const capability = String(record.capability || '').trim();
    const from = String(record.from || '').trim();
    const to = String(record.to || '').trim();
    const reason = String(record.reason || '').trim();
    if (!traceId || !stage || !capability || from !== 'local' || to !== 'cloud' || !reason) {
        return null;
    }
    return {
        traceId,
        stage: stage as VideoPlayRouteStage,
        capability: capability as RuntimeCanonicalCapability,
        from: 'local',
        to: 'cloud',
        reason,
    };
}
export function formatVttTime(ms: number): string {
    const totalMs = Math.max(0, Math.floor(ms));
    const hours = Math.floor(totalMs / 3600000);
    const minutes = Math.floor((totalMs % 3600000) / 60000);
    const seconds = Math.floor((totalMs % 60000) / 1000);
    const millis = totalMs % 1000;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}
export function normalizeSegmentationPolicy(input?: Partial<SegmentationPolicy>): SegmentationPolicy {
    const merged: SegmentationPolicy = {
        ...DEFAULT_SEGMENTATION_POLICY,
        ...(input || {}),
    };
    for (const [key, bounds] of Object.entries(SEGMENTATION_POLICY_BOUNDS)) {
        const value = Number((merged as Record<string, unknown>)[key]);
        if (!Number.isFinite(value) || value < bounds.min || value > bounds.max) {
            throw new VideoPlayError({
                reasonCode: VIDEOPLAY_REASON.INPUT_INVALID,
                actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.INPUT_INVALID),
                stage: 'segment',
                message: `VIDEOPLAY_SEGMENT_POLICY_OUT_OF_RANGE:${key}`,
            });
        }
    }
    return merged;
}
export function estimateTurnDurationSec(turn: NarrativeTurn): number {
    const base = 8;
    const eventWeight = Math.min(turn.spineEvents.length * 4, 24);
    const textWeight = Math.min(Math.ceil(turn.userMessage.length / 120), 6);
    return base + eventWeight + textWeight;
}
export function collectTurnSourceEventIds(turn: NarrativeTurn): string[] {
    const ids = new Set<string>();
    for (const event of turn.spineEvents) {
        ids.add(event.eventId);
        for (const sourceEventId of event.sourceEventIds || []) {
            ids.add(String(sourceEventId || '').trim());
        }
    }
    return [...ids].filter(Boolean);
}
export function ensureNonOverlappingTurnWindow(turns: NarrativeTurn[]): void {
    for (let i = 1; i < turns.length; i += 1) {
        if (turns[i]!.turnIndex <= turns[i - 1]!.turnIndex) {
            throw new VideoPlayError({
                reasonCode: VIDEOPLAY_REASON.SEGMENTATION_FAILED,
                actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.SEGMENTATION_FAILED),
                stage: 'segment',
                message: 'VIDEOPLAY_TURNS_NOT_STRICTLY_INCREASING',
            });
        }
    }
}
export function parseJsonObject(text: string): Record<string, unknown> | null {
    const normalized = String(text || '').trim();
    if (!normalized)
        return null;
    const fenced = normalized.match(/```(?:json)?\s*([\s\S]+?)```/i);
    const source = fenced ? String(fenced[1] || '').trim() : normalized;
    try {
        const parsed = JSON.parse(source);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return null;
        }
        return parsed as Record<string, unknown>;
    }
    catch {
        return null;
    }
}
export function isSubset(subset: string[], superset: Set<string>): boolean {
    for (const value of subset) {
        if (!superset.has(value)) {
            return false;
        }
    }
    return true;
}
export function parseStructuredModelOutput(text: string): Record<string, unknown> | null {
    return parseJsonObject(text);
}
export type AssetRenderModality = 'image' | 'video' | 'voice';
export type AssetAnalysisShotPlan = {
    shotId: string;
    clipId: string;
    beatId: string;
    durationMs: number;
    sourceEventIds: string[];
    complexity: 'low' | 'medium' | 'high';
    priority: number;
    requiredModalities: AssetRenderModality[];
    voiceLineText: string;
    language: string;
};
export type AssetRenderBatch = {
    batchId: string;
    modality: AssetRenderModality;
    queueItemIds: string[];
    shotIds: string[];
};
export type AssetRenderQueueItem = {
    queueItemId: string;
    batchId: string;
    episodeId: string;
    shotId: string;
    clipId: string;
    modality: AssetRenderModality;
    status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED';
    routeSource: 'local' | 'cloud' | 'unknown';
    errorMessage: string | null;
};
export function normalizeLanguageTag(input: string): string {
    const normalized = String(input || '').trim().toLowerCase();
    if (!normalized) {
        return 'zh';
    }
    if (normalized.startsWith('zh')) {
        return 'zh';
    }
    if (normalized.startsWith('en')) {
        return 'en';
    }
    return normalized;
}
export function inferShotComplexity(shot: StoryboardShot): 'low' | 'medium' | 'high' {
    if (shot.durationMs >= 5000 || shot.continuityAnchors.length >= 3) {
        return 'high';
    }
    if (shot.durationMs >= 3000 || shot.continuityAnchors.length >= 1) {
        return 'medium';
    }
    return 'low';
}
export function buildLipSyncAnchors(input: {
    text: string;
    durationMs: number;
}): Array<{
    t: number;
    viseme: string;
}> {
    const durationMs = Math.max(300, Math.floor(input.durationMs));
    const tokenCount = Math.max(3, Math.min(24, Math.ceil(String(input.text || '').length / 4)));
    const visemes = ['A', 'E', 'I', 'O', 'U', 'M'];
    const anchors: Array<{
        t: number;
        viseme: string;
    }> = [];
    for (let index = 0; index < tokenCount; index += 1) {
        const t = index === tokenCount - 1
            ? durationMs
            : Math.floor((durationMs * index) / Math.max(1, tokenCount - 1));
        anchors.push({
            t,
            viseme: visemes[index % visemes.length]!,
        });
    }
    return anchors;
}
export type VoiceProfile = {
    voiceId: string;
    providerId?: string;
    language?: string;
};
