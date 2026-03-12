import { VIDEOPLAY_REASON, VIDEOPLAY_QUALITY_RULE, type VideoPlayReasonCode, } from '../contracts.js';
import { createHash, createDeterministicUlid } from '../id.js';
import { VideoPlayError } from '../errors.js';
import { QUALITY_GATE_POLICY, EDIT_COMPOSE_POLICY, } from '../policy.js';
import { EpisodePlanSchema, EditComposeOutputSchema, QualityGateReportSchema, } from '../schemas.js';
import type { AssetRenderOutput, CandidateSelectionOutput, EditComposeOutput, FallbackAuditRecord, NarrativeTurn, QualityGateReport, ReleasePackage, RenderedAsset, ScreenplayBeat, ScreenplayOutput, SegmentedEpisode, SegmentationOutput, SegmentationPolicy, StoryboardOutput, StoryboardShot, } from '../types.js';
import { actionHintByReasonCode, collectTurnSourceEventIds, createInlineDataUri, createJsonDataUri, ensureNonOverlappingTurnWindow, estimateTurnDurationSec, formatVttTime, inferShotComplexity, isSubset, normalizeLanguageTag, normalizeSegmentationPolicy, requireMaterializedUri, type AssetAnalysisShotPlan, type AssetRenderBatch, type AssetRenderModality, type AssetRenderQueueItem, } from './util.js';

export function ensureSourceEventTraceability(input: {
    baseline: Set<string>;
    episode: SegmentedEpisode;
    screenplay: ScreenplayOutput;
    storyboard: StoryboardOutput;
}): void {
    const checks: Array<{
        unit: string;
        ids: string[];
    }> = [
        { unit: `episode:${input.episode.episodeId}`, ids: input.episode.sourceEventIds },
        ...input.storyboard.clipPlans.map((clip) => ({ unit: `clip:${clip.clipId}`, ids: clip.sourceEventIds })),
        ...input.screenplay.beats.map((beat) => ({ unit: `beat:${beat.beatId}`, ids: beat.sourceEventIds })),
        ...input.storyboard.shotPlans.map((shot) => ({ unit: `shot:${shot.shotId}`, ids: shot.sourceEventIds })),
    ];
    for (const check of checks) {
        if (check.ids.length === 0) {
            throw new VideoPlayError({
                reasonCode: VIDEOPLAY_REASON.QC_FAILED,
                actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.QC_FAILED),
                stage: 'qc',
                message: 'VIDEOPLAY_SOURCE_EVENT_IDS_MISSING',
                details: {
                    unit: check.unit,
                },
            });
        }
        if (!isSubset(check.ids, input.baseline)) {
            throw new VideoPlayError({
                reasonCode: VIDEOPLAY_REASON.QC_FAILED,
                actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.QC_FAILED),
                stage: 'qc',
                message: 'VIDEOPLAY_SOURCE_EVENT_IDS_OUT_OF_BASELINE',
                details: {
                    unit: check.unit,
                    ids: check.ids,
                },
            });
        }
    }
}
export function segmentEpisodes(input: {
    storyId: string;
    ingestCursorStart: string;
    turns: NarrativeTurn[];
    policy?: Partial<SegmentationPolicy>;
}): SegmentationOutput {
    const policy = normalizeSegmentationPolicy(input.policy);
    const policyHash = createHash(JSON.stringify(policy));
    ensureNonOverlappingTurnWindow(input.turns);
    const episodes: SegmentedEpisode[] = [];
    const backlogTurnIds: string[] = [];
    let cursor = 0;
    while (cursor < input.turns.length) {
        let nextCursor = cursor;
        let accumulatedDuration = 0;
        let accumulatedTurns = 0;
        const segmented: NarrativeTurn[] = [];
        while (nextCursor < input.turns.length) {
            const turn = input.turns[nextCursor]!;
            const nextDuration = estimateTurnDurationSec(turn);
            const wouldExceedDuration = accumulatedDuration + nextDuration > policy.maxEpisodeDurationSec;
            const wouldExceedTurns = accumulatedTurns + 1 > policy.maxTurnsPerEpisode;
            if (segmented.length > 0 && (wouldExceedDuration || wouldExceedTurns)) {
                break;
            }
            segmented.push(turn);
            accumulatedDuration += nextDuration;
            accumulatedTurns += 1;
            nextCursor += 1;
            if (accumulatedDuration >= policy.targetEpisodeDurationSec) {
                break;
            }
        }
        if (segmented.length === 0) {
            break;
        }
        if (accumulatedDuration < policy.minEpisodeDurationSec && nextCursor < input.turns.length) {
            if (episodes.length > 0) {
                backlogTurnIds.push(...segmented.map((turn) => turn.turnId));
                cursor = nextCursor;
                continue;
            }
        }
        const sourceTurnIds = segmented.map((turn) => turn.turnId);
        const sourceEventIds = new Set<string>();
        for (const turn of segmented) {
            for (const eventId of collectTurnSourceEventIds(turn)) {
                sourceEventIds.add(eventId);
            }
        }
        const seed = `${input.storyId}:${sourceTurnIds.join(',')}:${policyHash}`;
        const episodeId = createDeterministicUlid(seed);
        const episode: SegmentedEpisode = {
            episodeId,
            sourceTurnRange: {
                startTurnId: sourceTurnIds[0] || '',
                endTurnId: sourceTurnIds[sourceTurnIds.length - 1] || '',
            },
            sourceTurnIds,
            sourceEventIds: [...sourceEventIds],
            segmentationReason: accumulatedDuration >= policy.targetEpisodeDurationSec
                ? 'target-duration-reached'
                : 'window-exhausted',
            policyHash,
            turns: segmented,
            estimatedDurationSec: accumulatedDuration,
        };
        const parsed = EpisodePlanSchema.safeParse(episode);
        if (!parsed.success) {
            throw new VideoPlayError({
                reasonCode: VIDEOPLAY_REASON.SEGMENTATION_FAILED,
                actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.SEGMENTATION_FAILED),
                stage: 'segment',
                message: 'VIDEOPLAY_SEGMENT_OUTPUT_INVALID',
                details: {
                    issues: parsed.error.issues.map((item) => `${item.path.join('.')}:${item.message}`),
                },
            });
        }
        episodes.push(parsed.data);
        cursor = nextCursor;
    }
    if (episodes.length === 0) {
        throw new VideoPlayError({
            reasonCode: VIDEOPLAY_REASON.SEGMENTATION_FAILED,
            actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.SEGMENTATION_FAILED),
            stage: 'segment',
            message: 'VIDEOPLAY_SEGMENT_EMPTY_OUTPUT',
        });
    }
    return {
        episodes,
        backlogTurnIds,
        nextIngestCursor: input.turns[input.turns.length - 1]!.turnId,
        segmentationTrace: {
            policyHash,
            consumedTurnCount: input.turns.length,
            episodeCount: episodes.length,
            backlogTurnCount: backlogTurnIds.length,
        },
    };
}
export function buildDeterministicScreenplay(episode: SegmentedEpisode): ScreenplayOutput {
    const beats: ScreenplayBeat[] = episode.turns.map((turn, index) => ({
        beatId: createDeterministicUlid(`${episode.episodeId}:beat:${turn.turnId}:${index}`),
        title: `Beat ${index + 1}`,
        summary: turn.userMessage || turn.spineEvents[0]?.summary || 'Narrative beat',
        sourceEventIds: collectTurnSourceEventIds(turn),
    }));
    const clipId = createDeterministicUlid(`${episode.episodeId}:clip:0`);
    return {
        episodeId: episode.episodeId,
        clipPlans: [{
                clipId,
                title: `Episode ${episode.episodeId.slice(-6)} Clip`,
                beatIds: beats.map((beat) => beat.beatId),
                sourceEventIds: [...episode.sourceEventIds],
            }],
        beats,
    };
}
export function buildDeterministicStoryboard(screenplay: ScreenplayOutput): StoryboardOutput {
    const clipId = screenplay.clipPlans[0]!.clipId;
    const shotPlans: StoryboardShot[] = screenplay.beats.map((beat, index) => ({
        shotId: createDeterministicUlid(`${screenplay.episodeId}:shot:${beat.beatId}:${index}`),
        clipId,
        beatId: beat.beatId,
        visualPrompt: `Cinematic shot for ${beat.summary}`,
        motionCue: index % 2 === 0 ? 'slow dolly in' : 'static frame',
        continuityAnchors: [
            `anchor:beat:${beat.beatId}`,
        ],
        sourceEventIds: [...beat.sourceEventIds],
        durationMs: 3000,
        startMs: index * 3000,
        shotType: 'medium',
        cameraMove: index % 2 === 0 ? 'dolly-in' : 'static',
        photographyRule: {
            composition: 'center',
            lighting: 'natural',
            colorPalette: 'neutral',
            atmosphere: 'calm',
            technicalNotes: '',
        },
        actingDirection: { characters: [] },
        videoPrompt: `Cinematic shot for ${beat.summary}`,
        characterIds: [],
        locationId: null,
    }));
    return {
        episodeId: screenplay.episodeId,
        clipPlans: [{
                clipId,
                shotIds: shotPlans.map((shot) => shot.shotId),
                sourceEventIds: [...new Set(shotPlans.flatMap((shot) => shot.sourceEventIds))],
            }],
        shotPlans,
        sourceEventIds: [...new Set(shotPlans.flatMap((shot) => shot.sourceEventIds))],
    };
}
export function buildCaptionTrack(storyboard: StoryboardOutput): EditComposeOutput['episodeCaptionTrack'] {
    const lines: Array<{
        startMs: number;
        endMs: number;
        text: string;
    }> = [];
    let cursor = 0;
    for (const shot of storyboard.shotPlans) {
        lines.push({
            startMs: cursor,
            endMs: cursor + shot.durationMs,
            text: shot.visualPrompt,
        });
        cursor += shot.durationMs;
    }
    const vtt = [
        'WEBVTT',
        '',
        ...lines.flatMap((line, index) => [
            String(index + 1),
            `${formatVttTime(line.startMs)} --> ${formatVttTime(line.endMs)}`,
            line.text,
            '',
        ]),
    ].join('\n');
    return {
        uri: createInlineDataUri('text/vtt', vtt),
        mimeType: 'text/vtt',
        lines,
    };
}
export function composeEpisode(input: {
    episodeId: string;
    storyboard: StoryboardOutput;
    assetOutput: AssetRenderOutput;
    candidateSelection: CandidateSelectionOutput;
    forceMasterUri?: string;
    forcedAvDriftMs?: number;
    forcedBlackGapMs?: number;
}): EditComposeOutput {
    const videoByAssetId = new Map(input.assetOutput.shotAssets
        .filter((asset) => asset.assetType === 'video')
        .map((asset) => [asset.assetId, asset] as const));
    const imageByShotId = new Map<string, RenderedAsset>();
    for (const asset of input.assetOutput.shotAssets) {
        if (asset.assetType === 'image' && !imageByShotId.has(asset.shotId)) {
            imageByShotId.set(asset.shotId, asset);
        }
    }
    const selectedAssetIds = new Set(input.candidateSelection.selectedAssetIds.map((assetId) => String(assetId || '').trim()).filter(Boolean));
    const orderedSegments = input.candidateSelection.timelineSegments
        .filter((segment) => selectedAssetIds.has(segment.assetId))
        .slice()
        .sort((left, right) => left.order - right.order);
    if (orderedSegments.length === 0) {
        throw new VideoPlayError({
            reasonCode: VIDEOPLAY_REASON.CANDIDATE_SELECTION_FAILED,
            actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.CANDIDATE_SELECTION_FAILED),
            stage: 'edit',
            message: 'VIDEOPLAY_SELECTED_SEGMENTS_EMPTY',
        });
    }
    const timeline = [] as EditComposeOutput['episodeTimeline'];
    let cursor = 0;
    for (const segment of orderedSegments) {
        const video = videoByAssetId.get(segment.assetId);
        if (!video) {
            throw new VideoPlayError({
                reasonCode: VIDEOPLAY_REASON.CANDIDATE_SELECTION_FAILED,
                actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.CANDIDATE_SELECTION_FAILED),
                stage: 'edit',
                message: 'VIDEOPLAY_SELECTED_ASSET_NOT_FOUND',
                details: {
                    assetId: segment.assetId,
                    episodeId: input.episodeId,
                },
            });
        }
        const assetDuration = Math.max(1, Number(video.durationMs || 0));
        const trimIn = Math.min(Math.max(Number(segment.trimInMs ?? 0), 0), assetDuration - 1);
        const defaultTrimOut = segment.trimOutMs == null ? assetDuration : Number(segment.trimOutMs);
        const trimOut = Math.min(Math.max(defaultTrimOut, trimIn + 1), assetDuration);
        const startMs = cursor;
        const endMs = startMs + Math.max(trimOut - trimIn, 250);
        timeline.push({
            assetId: video.assetId,
            clipId: video.clipId,
            shotId: video.shotId,
            startMs,
            endMs,
            trimInMs: segment.trimInMs,
            trimOutMs: segment.trimOutMs,
            uri: video.uri,
            sourceEventIds: [...video.sourceEventIds],
            transitionIn: null,
            transitionOut: null,
        });
        cursor = endMs;
    }
    timeline.sort((a, b) => a.startMs - b.startMs);
    for (let i = 1; i < timeline.length; i += 1) {
        if (timeline[i]!.startMs < timeline[i - 1]!.endMs) {
            throw new VideoPlayError({
                reasonCode: VIDEOPLAY_REASON.TIMELINE_SCHEMA_INVALID,
                actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.TIMELINE_SCHEMA_INVALID),
                stage: 'edit',
                message: 'VIDEOPLAY_TIMELINE_OVERLAP_FORBIDDEN',
            });
        }
    }
    const durationMs = timeline.length > 0
        ? timeline[timeline.length - 1]!.endMs
        : 0;
    const primaryShotId = timeline[0]?.shotId || '';
    const firstImage = imageByShotId.get(primaryShotId) || imageByShotId.values().next().value;
    const timelineHash = createHash(JSON.stringify(timeline));
    const output: EditComposeOutput = {
        episodeTimeline: timeline,
        episodeMasterVideo: {
            uri: String(input.forceMasterUri || '').trim() || createJsonDataUri({
                kind: 'videoplay.compose-manifest',
                episodeId: input.episodeId,
                timeline,
                timelineHash,
            }),
            mimeType: String(input.forceMasterUri || '').trim()
                ? 'video/mp4'
                : 'application/vnd.nimiplatform.videoplay.compose-manifest+json',
            durationMs,
            timelineHash,
        },
        episodePoster: {
            uri: requireMaterializedUri({
                uri: firstImage?.uri,
                reasonCode: VIDEOPLAY_REASON.EDIT_COMPOSE_FAILED,
                stage: 'edit',
                message: 'VIDEOPLAY_POSTER_URI_REQUIRED',
                details: {
                    episodeId: input.episodeId,
                    shotId: primaryShotId,
                },
            }),
            mimeType: firstImage?.mimeType || 'image/png',
        },
        episodeCaptionTrack: buildCaptionTrack(input.storyboard),
        composeTrace: {
            avDriftMs: Number(input.forcedAvDriftMs ?? 0),
            blackGapMs: Number(input.forcedBlackGapMs ?? 0),
            exportSpec: {
                videoCodec: EDIT_COMPOSE_POLICY.exportSpec.videoCodec,
                audioCodec: EDIT_COMPOSE_POLICY.exportSpec.audioCodec,
                container: EDIT_COMPOSE_POLICY.exportSpec.container,
            },
        },
        bgmTrack: null,
        sfxLayers: [],
        subtitleOverlay: null,
    };
    const parsed = EditComposeOutputSchema.safeParse(output);
    if (!parsed.success) {
        throw new VideoPlayError({
            reasonCode: VIDEOPLAY_REASON.EDIT_COMPOSE_FAILED,
            actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.EDIT_COMPOSE_FAILED),
            stage: 'edit',
            message: 'VIDEOPLAY_EDIT_COMPOSE_INVALID',
            details: {
                issues: parsed.error.issues.map((item) => `${item.path.join('.')}:${item.message}`),
            },
        });
    }
    return parsed.data;
}
export function evaluateVisualAttraction(storyboard: StoryboardOutput, assetOutput: AssetRenderOutput): {
    score: number;
    components: QualityGateReport['visualAttractionComponents'];
} {
    const shotCount = Math.max(storyboard.shotPlans.length, 1);
    const renderedRatio = assetOutput.coverage.ratio;
    const continuityRichShots = storyboard.shotPlans.filter((shot) => shot.continuityAnchors.length > 0).length;
    const componentBase = Math.min(1, continuityRichShots / shotCount);
    const components = {
        characterConsistency: Math.max(0.55, componentBase * 0.9),
        motionContinuity: Math.max(0.55, renderedRatio * 0.95),
        compositionReadability: Math.max(0.55, componentBase * 0.85),
        lightColorCoherence: Math.max(0.55, renderedRatio * 0.88),
    };
    const score = (components.characterConsistency * QUALITY_GATE_POLICY.visualAttractionWeight.characterConsistency
        + components.motionContinuity * QUALITY_GATE_POLICY.visualAttractionWeight.motionContinuity
        + components.compositionReadability * QUALITY_GATE_POLICY.visualAttractionWeight.compositionReadability
        + components.lightColorCoherence * QUALITY_GATE_POLICY.visualAttractionWeight.lightColorCoherence);
    return {
        score: Number(score.toFixed(6)),
        components,
    };
}
export function evaluateQualityGates(input: {
    baselineSourceEventIds: Set<string>;
    episode: SegmentedEpisode;
    screenplay: ScreenplayOutput;
    storyboard: StoryboardOutput;
    assetOutput: AssetRenderOutput;
    composeOutput: EditComposeOutput;
    forceVisualAttractionScore?: number;
}): QualityGateReport {
    const durationSec = input.composeOutput.episodeMasterVideo.durationMs / 1000;
    const visual = evaluateVisualAttraction(input.storyboard, input.assetOutput);
    const visualAttractionScore = Number(input.forceVisualAttractionScore ?? visual.score);
    const voiceCoverageRatio = Number(input.assetOutput.coverage.voiceRatio ?? 1);
    const coverage = {
        episode: input.episode.sourceEventIds,
        clip: input.storyboard.clipPlans.flatMap((clip) => clip.sourceEventIds),
        beat: input.screenplay.beats.flatMap((beat) => beat.sourceEventIds),
        shot: input.storyboard.shotPlans.flatMap((shot) => shot.sourceEventIds),
    };
    const unitChecks = [
        coverage.episode,
        ...input.storyboard.clipPlans.map((clip) => clip.sourceEventIds),
        ...input.screenplay.beats.map((beat) => beat.sourceEventIds),
        ...input.storyboard.shotPlans.map((shot) => shot.sourceEventIds),
    ];
    const groundedUnits = unitChecks.filter((ids) => ids.length > 0 && isSubset(ids, input.baselineSourceEventIds)).length;
    const groundedRatio = unitChecks.length > 0
        ? groundedUnits / unitChecks.length
        : 0;
    const gates: Array<{
        gate: string;
        passed: boolean;
        value: number;
        min: number | null;
        max: number | null;
        reasonCode: VideoPlayReasonCode;
    }> = [
        {
            gate: 'grounded_ratio',
            passed: groundedRatio >= QUALITY_GATE_POLICY.groundedRatioMin,
            value: groundedRatio,
            min: QUALITY_GATE_POLICY.groundedRatioMin,
            max: null,
            reasonCode: VIDEOPLAY_REASON.QC_FAILED,
        },
        {
            gate: 'asset_coverage_ratio',
            passed: input.assetOutput.coverage.ratio >= QUALITY_GATE_POLICY.assetCoverageRatioMin,
            value: input.assetOutput.coverage.ratio,
            min: QUALITY_GATE_POLICY.assetCoverageRatioMin,
            max: null,
            reasonCode: VIDEOPLAY_REASON.COVERAGE_LOW,
        },
        {
            gate: 'voice_coverage_ratio',
            passed: voiceCoverageRatio >= QUALITY_GATE_POLICY.voiceCoverageRatioMin,
            value: voiceCoverageRatio,
            min: QUALITY_GATE_POLICY.voiceCoverageRatioMin,
            max: null,
            reasonCode: VIDEOPLAY_REASON.VOICE_RENDER_FAILED,
        },
        {
            gate: 'episode_master_duration_sec',
            passed: durationSec >= QUALITY_GATE_POLICY.durationSecMin && durationSec <= QUALITY_GATE_POLICY.durationSecMax,
            value: durationSec,
            min: QUALITY_GATE_POLICY.durationSecMin,
            max: QUALITY_GATE_POLICY.durationSecMax,
            reasonCode: VIDEOPLAY_REASON.QC_FAILED,
        },
        {
            gate: 'max_av_drift_ms',
            passed: input.composeOutput.composeTrace.avDriftMs <= QUALITY_GATE_POLICY.maxAvDriftMs,
            value: input.composeOutput.composeTrace.avDriftMs,
            min: null,
            max: QUALITY_GATE_POLICY.maxAvDriftMs,
            reasonCode: VIDEOPLAY_REASON.AV_SYNC_DRIFT,
        },
        {
            gate: 'visual_attraction_score',
            passed: visualAttractionScore >= QUALITY_GATE_POLICY.visualAttractionMin,
            value: visualAttractionScore,
            min: QUALITY_GATE_POLICY.visualAttractionMin,
            max: 1,
            reasonCode: VIDEOPLAY_REASON.VISUAL_ATTRACTION_LOW,
        },
    ];
    if (visual.components.characterConsistency < QUALITY_GATE_POLICY.visualAttractionComponentMin
        || visual.components.motionContinuity < QUALITY_GATE_POLICY.visualAttractionComponentMin
        || visual.components.compositionReadability < QUALITY_GATE_POLICY.visualAttractionComponentMin
        || visual.components.lightColorCoherence < QUALITY_GATE_POLICY.visualAttractionComponentMin) {
        gates.push({
            gate: 'visual_component_floor',
            passed: false,
            value: Math.min(visual.components.characterConsistency, visual.components.motionContinuity, visual.components.compositionReadability, visual.components.lightColorCoherence),
            min: QUALITY_GATE_POLICY.visualAttractionComponentMin,
            max: null,
            reasonCode: VIDEOPLAY_REASON.VISUAL_ATTRACTION_LOW,
        });
    }
    const characterConsistencyScore = visual.components.characterConsistency;
    const photographyComplianceScore = Math.max(0.55, visual.components.compositionReadability * 0.95);
    const actingQualityScore = Math.max(0.55, visual.components.motionContinuity * 0.9);
    const audioCompletenessRatio = input.composeOutput.bgmTrack ? 1.0 : 0.5;
    const renderedVideoAssetCount = input.assetOutput.shotAssets.filter((asset) => asset.assetType === 'video').length;
    const selectedTimelineCount = input.composeOutput.episodeTimeline.length;
    const selectionCoverageRatio = renderedVideoAssetCount > 0
        ? Number((selectedTimelineCount / renderedVideoAssetCount).toFixed(6))
        : 1;
    const duplicateAssetCount = selectedTimelineCount - new Set(input.composeOutput.episodeTimeline.map((clip) => clip.assetId)).size;
    const invalidTrimCount = input.composeOutput.episodeTimeline.filter((clip) => (clip.trimInMs != null
        && clip.trimOutMs != null
        && clip.trimOutMs <= clip.trimInMs)).length;
    let overlapCount = 0;
    for (let index = 1; index < input.composeOutput.episodeTimeline.length; index += 1) {
        if (input.composeOutput.episodeTimeline[index]!.startMs < input.composeOutput.episodeTimeline[index - 1]!.endMs) {
            overlapCount += 1;
        }
    }
    const rationalityPenalty = duplicateAssetCount + invalidTrimCount + overlapCount;
    const selectionRationalityScore = Math.max(0, Number((1 - (rationalityPenalty / Math.max(selectedTimelineCount, 1))).toFixed(6)));
    gates.push({
        gate: 'character_consistency',
        passed: characterConsistencyScore >= VIDEOPLAY_QUALITY_RULE.CHARACTER_CONSISTENCY_MIN,
        value: characterConsistencyScore,
        min: VIDEOPLAY_QUALITY_RULE.CHARACTER_CONSISTENCY_MIN,
        max: null,
        reasonCode: VIDEOPLAY_REASON.CHARACTER_CONSISTENCY_LOW,
    }, {
        gate: 'photography_compliance',
        passed: photographyComplianceScore >= VIDEOPLAY_QUALITY_RULE.PHOTOGRAPHY_COMPLIANCE_MIN,
        value: photographyComplianceScore,
        min: VIDEOPLAY_QUALITY_RULE.PHOTOGRAPHY_COMPLIANCE_MIN,
        max: null,
        reasonCode: VIDEOPLAY_REASON.PHOTOGRAPHY_COMPLIANCE_LOW,
    }, {
        gate: 'acting_quality',
        passed: actingQualityScore >= VIDEOPLAY_QUALITY_RULE.ACTING_QUALITY_MIN,
        value: actingQualityScore,
        min: VIDEOPLAY_QUALITY_RULE.ACTING_QUALITY_MIN,
        max: null,
        reasonCode: VIDEOPLAY_REASON.ACTING_QUALITY_LOW,
    }, {
        gate: 'audio_completeness',
        passed: audioCompletenessRatio >= VIDEOPLAY_QUALITY_RULE.AUDIO_COMPLETENESS_MIN,
        value: audioCompletenessRatio,
        min: VIDEOPLAY_QUALITY_RULE.AUDIO_COMPLETENESS_MIN,
        max: null,
        reasonCode: VIDEOPLAY_REASON.AUDIO_COMPLETENESS_LOW,
    }, {
        gate: 'selection_coverage',
        passed: selectionCoverageRatio >= VIDEOPLAY_QUALITY_RULE.SELECTION_COVERAGE_MIN,
        value: selectionCoverageRatio,
        min: VIDEOPLAY_QUALITY_RULE.SELECTION_COVERAGE_MIN,
        max: null,
        reasonCode: VIDEOPLAY_REASON.SELECTION_COVERAGE_LOW,
    }, {
        gate: 'selection_rationality',
        passed: selectionRationalityScore >= VIDEOPLAY_QUALITY_RULE.SELECTION_RATIONALITY_MIN,
        value: selectionRationalityScore,
        min: VIDEOPLAY_QUALITY_RULE.SELECTION_RATIONALITY_MIN,
        max: null,
        reasonCode: VIDEOPLAY_REASON.SELECTION_RATIONALITY_LOW,
    });
    const failed = gates.find((gate) => !gate.passed) || null;
    const report: QualityGateReport = {
        status: failed ? 'REJECTED' : 'APPROVED',
        gates,
        groundedRatio,
        assetCoverageRatio: input.assetOutput.coverage.ratio,
        voiceCoverageRatio,
        visualAttractionScore,
        visualAttractionComponents: visual.components,
        avDriftMs: input.composeOutput.composeTrace.avDriftMs,
        durationSec,
        failReasonCode: failed?.reasonCode || null,
        characterConsistencyScore,
        photographyComplianceScore,
        actingQualityScore,
        audioCompletenessRatio,
    };
    const parsed = QualityGateReportSchema.safeParse(report);
    if (!parsed.success) {
        throw new VideoPlayError({
            reasonCode: VIDEOPLAY_REASON.QC_FAILED,
            actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.QC_FAILED),
            stage: 'qc',
            message: 'VIDEOPLAY_QC_REPORT_INVALID',
            details: {
                issues: parsed.error.issues.map((item) => `${item.path.join('.')}:${item.message}`),
            },
        });
    }
    return parsed.data;
}
export function buildTraceCoverage(input: {
    episode: SegmentedEpisode;
    screenplay: ScreenplayOutput;
    storyboard: StoryboardOutput;
}): ReleasePackage['episodeTraceBundle']['sourceCoverage'] {
    const clip: Record<string, string[]> = {};
    const beat: Record<string, string[]> = {};
    const shot: Record<string, string[]> = {};
    for (const clipPlan of input.storyboard.clipPlans) {
        clip[clipPlan.clipId] = [...clipPlan.sourceEventIds];
    }
    for (const beatPlan of input.screenplay.beats) {
        beat[beatPlan.beatId] = [...beatPlan.sourceEventIds];
    }
    for (const shotPlan of input.storyboard.shotPlans) {
        shot[shotPlan.shotId] = [...shotPlan.sourceEventIds];
    }
    return {
        episode: [...input.episode.sourceEventIds],
        clip,
        beat,
        shot,
    };
}
export function buildAssetAnalysisPlan(input: {
    storyboard: StoryboardOutput;
    screenplay: ScreenplayOutput;
    projectionLocale: string;
}): AssetAnalysisShotPlan[] {
    const beatSummaryById = new Map(input.screenplay.beats.map((beat) => [beat.beatId, beat.summary] as const));
    const language = normalizeLanguageTag(input.projectionLocale);
    const plans: AssetAnalysisShotPlan[] = input.storyboard.shotPlans.map((shot, index) => {
        const beatSummary = String(beatSummaryById.get(shot.beatId) || '').trim();
        const voiceLineText = beatSummary || shot.visualPrompt;
        const complexity = inferShotComplexity(shot);
        const requiredModalities: AssetRenderModality[] = voiceLineText
            ? ['voice', 'image', 'video']
            : ['image', 'video'];
        return {
            shotId: shot.shotId,
            clipId: shot.clipId,
            beatId: shot.beatId,
            durationMs: shot.durationMs,
            sourceEventIds: [...shot.sourceEventIds],
            complexity,
            priority: index + 1,
            requiredModalities,
            voiceLineText,
            language,
        };
    });
    if (plans.length === 0) {
        throw new VideoPlayError({
            reasonCode: VIDEOPLAY_REASON.ASSET_ANALYSIS_INVALID,
            actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.ASSET_ANALYSIS_INVALID),
            stage: 'render',
            message: 'VIDEOPLAY_ASSET_ANALYSIS_EMPTY',
        });
    }
    return plans;
}
export function buildAssetRenderQueue(input: {
    episodeId: string;
    plans: AssetAnalysisShotPlan[];
}): {
    batches: AssetRenderBatch[];
    queueItems: AssetRenderQueueItem[];
} {
    const modalities: AssetRenderModality[] = ['voice', 'image', 'video'];
    const queueItems: AssetRenderQueueItem[] = [];
    const batches: AssetRenderBatch[] = [];
    for (const modality of modalities) {
        const scopedPlans = input.plans.filter((plan) => plan.requiredModalities.includes(modality));
        if (scopedPlans.length === 0) {
            continue;
        }
        const batchId = createDeterministicUlid(`${input.episodeId}:batch:${modality}`);
        const queueItemIds: string[] = [];
        const shotIds: string[] = [];
        for (const plan of scopedPlans) {
            const queueItemId = createDeterministicUlid(`${batchId}:${plan.shotId}`);
            queueItemIds.push(queueItemId);
            shotIds.push(plan.shotId);
            queueItems.push({
                queueItemId,
                batchId,
                episodeId: input.episodeId,
                shotId: plan.shotId,
                clipId: plan.clipId,
                modality,
                status: 'QUEUED',
                routeSource: 'unknown',
                errorMessage: null,
            });
        }
        batches.push({
            batchId,
            modality,
            queueItemIds,
            shotIds,
        });
    }
    if (queueItems.length === 0 || !queueItems.some((item) => item.modality === 'video')) {
        throw new VideoPlayError({
            reasonCode: VIDEOPLAY_REASON.BATCH_QUEUE_ORCHESTRATION_FAILED,
            actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.BATCH_QUEUE_ORCHESTRATION_FAILED),
            stage: 'render',
            message: 'VIDEOPLAY_RENDER_QUEUE_EMPTY',
        });
    }
    return {
        batches,
        queueItems,
    };
}
