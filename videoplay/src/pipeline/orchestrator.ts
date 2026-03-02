import type { RuntimeRouteHealthResult, RuntimeRouteOverride } from '@nimiplatform/sdk/mod/types';
import {
  VIDEOPLAY_DATA_API_ASSET_BATCH_UPSERT,
  VIDEOPLAY_DATA_API_EPISODE_UPSERT,
  VIDEOPLAY_DATA_API_RUNTIME_ROUTE_OPTIONS,
  VIDEOPLAY_PROMPT_ID,
  VIDEOPLAY_PIPELINE_CHAIN,
  VIDEOPLAY_REASON,
  VIDEOPLAY_RETRY_CLASS,
  type VideoPlayPipelineStep,
  type VideoPlayReasonCode,
  type VideoPlayRouteStage,
} from '../contracts.js';
import { createHash, createDeterministicUlid, createUlid } from '../id.js';
import { VideoPlayError, toVideoPlayError } from '../errors.js';
import { emitVideoPlayLog } from '../logging.js';
import {
  AssetRenderOutputSchema,
  EditComposeOutputSchema,
  EpisodePlanSchema,
  NarrativeProjectionRenderInputSchema,
  NarrativeTurnWindowSchema,
  QualityGateReportSchema,
  ReleasePackageSchema,
  RunEventSchema,
  ScreenplaySchema,
  StoryboardSchema,
  VideoStoryPackageSchema,
} from '../schemas.js';
import {
  DEFAULT_SEGMENTATION_POLICY,
  EDIT_COMPOSE_POLICY,
  QUALITY_GATE_POLICY,
  SEGMENTATION_POLICY_BOUNDS,
} from '../policy.js';
import { runPromptCanaryCases } from '../prompt/canary.js';
import {
  resolvePromptLocale,
  renderPromptTemplate,
  validatePromptVariables,
} from '../prompt/registry.js';
import type {
  AssetRenderOutput,
  EditComposeOutput,
  EpisodeRecord,
  FallbackAuditRecord,
  NarrativeProjectionRenderInput,
  NarrativeTurn,
  NarrativeTurnWindow,
  QualityGateReport,
  ReleasePackage,
  RouteInvokeInput,
  ScreenplayBeat,
  ScreenplayOutput,
  SegmentationOutput,
  SegmentedEpisode,
  SegmentationPolicy,
  StoryboardOutput,
  StoryboardShot,
  VideoPlayPipelineDeps,
  VideoPlayPipelineInput,
  VideoPlayPipelineResult,
  VideoPlayRunEvent,
  VideoPlayRunEventType,
} from '../types.js';

function nowIso(): string {
  return new Date().toISOString();
}

type RuntimeRouteCatalogSnapshot = {
  selected: {
    source: 'local-runtime' | 'token-api';
    connectorId: string;
    model: string;
  };
};

function parseRuntimeRouteCatalogSnapshot(value: unknown): RuntimeRouteCatalogSnapshot | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const selected = record.selected;
  if (!selected || typeof selected !== 'object') {
    return null;
  }
  const selectedRecord = selected as Record<string, unknown>;
  const source = String(selectedRecord.source || '').trim() === 'token-api' ? 'token-api' : 'local-runtime';
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

function isRouteHealthy(result: RuntimeRouteHealthResult | null | undefined): boolean {
  const reasonCode = String(result?.reasonCode || '');
  const status = String(result?.status || '');
  return (
    reasonCode === 'RUNTIME_ROUTE_HEALTHY'
    || reasonCode === 'RUNTIME_ROUTE_DEGRADED'
    || status === 'healthy'
    || status === 'degraded'
  );
}

function actionHintByReasonCode(reasonCode: string): string {
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
    default:
      return 'Retry after fixing upstream dependency.';
  }
}

function normalizeSegmentationPolicy(input?: Partial<SegmentationPolicy>): SegmentationPolicy {
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

function estimateTurnDurationSec(turn: NarrativeTurn): number {
  const base = 8;
  const eventWeight = Math.min(turn.spineEvents.length * 4, 24);
  const textWeight = Math.min(Math.ceil(turn.userMessage.length / 120), 6);
  return base + eventWeight + textWeight;
}

function collectTurnSourceEventIds(turn: NarrativeTurn): string[] {
  const ids = new Set<string>();
  for (const event of turn.spineEvents) {
    ids.add(event.eventId);
    for (const sourceEventId of event.sourceEventIds || []) {
      ids.add(String(sourceEventId || '').trim());
    }
  }
  return [...ids].filter(Boolean);
}

function ensureNonOverlappingTurnWindow(turns: NarrativeTurn[]): void {
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

async function loadRuntimeRouteCatalog(input: {
  deps: VideoPlayPipelineDeps;
  modId: string;
}): Promise<Record<'chat' | 'image' | 'video', RuntimeRouteCatalogSnapshot>> {
  const chatRaw = await input.deps.hookClient.data.query({
    capability: VIDEOPLAY_DATA_API_RUNTIME_ROUTE_OPTIONS,
    query: {
      capability: 'chat',
      modId: input.modId,
    },
  });
  const imageRaw = await input.deps.hookClient.data.query({
    capability: VIDEOPLAY_DATA_API_RUNTIME_ROUTE_OPTIONS,
    query: {
      capability: 'image',
      modId: input.modId,
    },
  });
  const videoRaw = await input.deps.hookClient.data.query({
    capability: VIDEOPLAY_DATA_API_RUNTIME_ROUTE_OPTIONS,
    query: {
      capability: 'video',
      modId: input.modId,
    },
  });

  const chat = parseRuntimeRouteCatalogSnapshot(chatRaw);
  const image = parseRuntimeRouteCatalogSnapshot(imageRaw);
  const video = parseRuntimeRouteCatalogSnapshot(videoRaw);

  if (!chat || !image || !video) {
    throw new VideoPlayError({
      reasonCode: VIDEOPLAY_REASON.ROUTE_UNAVAILABLE,
      actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.ROUTE_UNAVAILABLE),
      stage: 'route',
      retryClass: VIDEOPLAY_RETRY_CLASS.RETRYABLE,
      message: 'VIDEOPLAY_RUNTIME_ROUTE_OPTIONS_INVALID',
    });
  }

  return {
    chat,
    image,
    video,
  };
}

function ensureSourceEventTraceability(input: {
  baseline: Set<string>;
  episode: SegmentedEpisode;
  screenplay: ScreenplayOutput;
  storyboard: StoryboardOutput;
}): void {
  const checks: Array<{ unit: string; ids: string[] }> = [
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

function parseJsonObject(text: string): Record<string, unknown> | null {
  const normalized = String(text || '').trim();
  if (!normalized) return null;
  const fenced = normalized.match(/```(?:json)?\s*([\s\S]+?)```/i);
  const source = fenced ? String(fenced[1] || '').trim() : normalized;
  try {
    const parsed = JSON.parse(source);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function buildDeterministicScreenplay(episode: SegmentedEpisode): ScreenplayOutput {
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

function buildDeterministicStoryboard(screenplay: ScreenplayOutput): StoryboardOutput {
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

function buildCaptionTrack(storyboard: StoryboardOutput): EditComposeOutput['episodeCaptionTrack'] {
  const lines: Array<{ startMs: number; endMs: number; text: string }> = [];
  let cursor = 0;
  for (const shot of storyboard.shotPlans) {
    lines.push({
      startMs: cursor,
      endMs: cursor + shot.durationMs,
      text: shot.visualPrompt,
    });
    cursor += shot.durationMs;
  }
  return {
    uri: `videoplay://caption/${storyboard.episodeId}.vtt`,
    mimeType: 'text/vtt',
    lines,
  };
}

export function composeEpisode(input: {
  episodeId: string;
  storyboard: StoryboardOutput;
  assetOutput: AssetRenderOutput;
  forceMasterUri?: string;
  forcedAvDriftMs?: number;
  forcedBlackGapMs?: number;
}): EditComposeOutput {
  const shots = [...input.storyboard.shotPlans];
  const videoByShotId = new Map(
    input.assetOutput.shotAssets
      .filter((asset) => asset.assetType === 'video')
      .map((asset) => [asset.shotId, asset] as const),
  );
  const imageByShotId = new Map(
    input.assetOutput.shotAssets
      .filter((asset) => asset.assetType === 'image')
      .map((asset) => [asset.shotId, asset] as const),
  );

  const timeline = [] as EditComposeOutput['episodeTimeline'];
  let cursor = 0;
  for (const shot of shots) {
    const video = videoByShotId.get(shot.shotId);
    if (!video) {
      continue;
    }
    const startMs = typeof shot.startMs === 'number' ? shot.startMs : cursor;
    const endMs = startMs + Math.max(shot.durationMs, 500);
    timeline.push({
      clipId: shot.clipId,
      shotId: shot.shotId,
      startMs,
      endMs,
      uri: video.uri,
      sourceEventIds: [...shot.sourceEventIds],
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

  const firstImage = imageByShotId.values().next().value;
  const output: EditComposeOutput = {
    episodeTimeline: timeline,
    episodeMasterVideo: {
      uri: input.forceMasterUri || `videoplay://master/${input.episodeId}.mp4`,
      mimeType: 'video/mp4',
      durationMs,
      timelineHash: createHash(JSON.stringify(timeline)),
    },
    episodePoster: {
      uri: firstImage?.uri || `videoplay://poster/${input.episodeId}.png`,
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

function isSubset(subset: string[], superset: Set<string>): boolean {
  for (const value of subset) {
    if (!superset.has(value)) {
      return false;
    }
  }
  return true;
}

function evaluateVisualAttraction(storyboard: StoryboardOutput, assetOutput: AssetRenderOutput): {
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
  const score = (
    components.characterConsistency * QUALITY_GATE_POLICY.visualAttractionWeight.characterConsistency
    + components.motionContinuity * QUALITY_GATE_POLICY.visualAttractionWeight.motionContinuity
    + components.compositionReadability * QUALITY_GATE_POLICY.visualAttractionWeight.compositionReadability
    + components.lightColorCoherence * QUALITY_GATE_POLICY.visualAttractionWeight.lightColorCoherence
  );
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

  if (
    visual.components.characterConsistency < QUALITY_GATE_POLICY.visualAttractionComponentMin
    || visual.components.motionContinuity < QUALITY_GATE_POLICY.visualAttractionComponentMin
    || visual.components.compositionReadability < QUALITY_GATE_POLICY.visualAttractionComponentMin
    || visual.components.lightColorCoherence < QUALITY_GATE_POLICY.visualAttractionComponentMin
  ) {
    gates.push({
      gate: 'visual_component_floor',
      passed: false,
      value: Math.min(
        visual.components.characterConsistency,
        visual.components.motionContinuity,
        visual.components.compositionReadability,
        visual.components.lightColorCoherence,
      ),
      min: QUALITY_GATE_POLICY.visualAttractionComponentMin,
      max: null,
      reasonCode: VIDEOPLAY_REASON.VISUAL_ATTRACTION_LOW,
    });
  }

  const failed = gates.find((gate) => !gate.passed) || null;
  const report: QualityGateReport = {
    status: failed ? 'REJECTED' : 'APPROVED',
    gates,
    groundedRatio,
    assetCoverageRatio: input.assetOutput.coverage.ratio,
    visualAttractionScore,
    visualAttractionComponents: visual.components,
    avDriftMs: input.composeOutput.composeTrace.avDriftMs,
    durationSec,
    failReasonCode: failed?.reasonCode || null,
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

function toRouteOverride(source: 'local-runtime' | 'token-api'): RuntimeRouteOverride {
  return { source };
}

export async function invokeWithRouteFallback<T>(
  input: RouteInvokeInput<T> & {
    checkHealth: (routeHint: string, routeOverride?: RuntimeRouteOverride) => Promise<RuntimeRouteHealthResult>;
  },
): Promise<{
  result: T;
  routeSource: 'local-runtime' | 'token-api';
  fallbackAudit: FallbackAuditRecord | null;
}> {
  let localReason = 'local-runtime-unavailable';
  try {
    const health = await input.checkHealth(input.routeHint, toRouteOverride('local-runtime'));
    if (isRouteHealthy(health)) {
      try {
        const result = await input.invoke(toRouteOverride('local-runtime'));
        return {
          result,
          routeSource: 'local-runtime',
          fallbackAudit: null,
        };
      } catch (error) {
        localReason = error instanceof Error ? error.message : String(error || 'local-runtime-error');
      }
    } else {
      localReason = String(health?.reasonCode || health?.status || localReason);
    }
  } catch (error) {
    localReason = error instanceof Error ? error.message : String(error || localReason);
  }

  let tokenHealth: RuntimeRouteHealthResult | null = null;
  try {
    tokenHealth = await input.checkHealth(input.routeHint, toRouteOverride('token-api'));
  } catch {
    tokenHealth = null;
  }

  if (!isRouteHealthy(tokenHealth)) {
    throw new VideoPlayError({
      reasonCode: VIDEOPLAY_REASON.ROUTE_UNAVAILABLE,
      actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.ROUTE_UNAVAILABLE),
      stage: 'route',
      retryClass: VIDEOPLAY_RETRY_CLASS.RETRYABLE,
      message: `VIDEOPLAY_BOTH_ROUTES_UNAVAILABLE:${input.stage}`,
      details: {
        localReason,
        fallbackReasonCode: String(tokenHealth?.reasonCode || tokenHealth?.status || 'unknown'),
      },
    });
  }

  try {
    const result = await input.invoke(toRouteOverride('token-api'));
    return {
      result,
      routeSource: 'token-api',
      fallbackAudit: {
        traceId: input.traceId,
        stage: input.stage,
        capability: input.capability,
        from: 'local-runtime',
        to: 'token-api',
        reason: localReason,
      },
    };
  } catch (error) {
    throw new VideoPlayError({
      reasonCode: VIDEOPLAY_REASON.ROUTE_UNAVAILABLE,
      actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.ROUTE_UNAVAILABLE),
      stage: 'route',
      retryClass: VIDEOPLAY_RETRY_CLASS.RETRYABLE,
      message: error instanceof Error ? error.message : String(error || 'token-api-error'),
      details: {
        localReason,
      },
    });
  }
}

function createRunEventFactory(input: {
  traceId: string;
  runId: string;
  taskId?: string;
}) {
  let seq = 0;
  const events: VideoPlayRunEvent[] = [];

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

function buildTraceCoverage(input: {
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

function parseStructuredModelOutput(text: string): Record<string, unknown> | null {
  return parseJsonObject(text);
}

export async function runVideoPlayEpisodeProduction(
  deps: VideoPlayPipelineDeps,
  input: VideoPlayPipelineInput,
): Promise<VideoPlayPipelineResult> {
  const traceId = createUlid();
  const runId = createUlid();
  const runEventFactory = createRunEventFactory({
    traceId,
    runId,
    ...(input.taskId ? { taskId: input.taskId } : {}),
  });
  const fallbackAudits: FallbackAuditRecord[] = [];

  runEventFactory.pushEvent({
    step: 'narrative-ingest',
    eventType: 'run.start',
  });

  const canaryReport = runPromptCanaryCases();
  if (!canaryReport.ok) {
    runEventFactory.pushEvent({
      step: 'narrative-ingest',
      eventType: 'run.error',
      reasonCode: VIDEOPLAY_REASON.PROMPT_CANARY_FAILED,
      actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.PROMPT_CANARY_FAILED),
      retryClass: 'non-retryable',
      details: { failures: canaryReport.failures },
    });
    throw new VideoPlayError({
      reasonCode: VIDEOPLAY_REASON.PROMPT_CANARY_FAILED,
      actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.PROMPT_CANARY_FAILED),
      stage: 'prompt',
      message: canaryReport.failures.join(';'),
    });
  }

  let turnWindow: NarrativeTurnWindow;
  let projection: NarrativeProjectionRenderInput;
  let routeCatalog: Record<'chat' | 'image' | 'video', RuntimeRouteCatalogSnapshot>;
  const policy = normalizeSegmentationPolicy(input.policy);
  const sourceMode = input.sourceMode;

  try {
    runEventFactory.pushEvent({
      step: 'narrative-ingest',
      eventType: 'step.start',
      details: {
        storyId: input.storyId,
        sourceMode,
      },
    });

    const storyPackageParsed = VideoStoryPackageSchema.safeParse(input.storyPackage);
    if (!storyPackageParsed.success) {
      throw new VideoPlayError({
        reasonCode: VIDEOPLAY_REASON.STORY_PACKAGE_INVALID,
        actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.STORY_PACKAGE_INVALID),
        stage: 'story-package',
        message: 'VIDEOPLAY_STORY_PACKAGE_SCHEMA_INVALID',
        details: {
          issues: storyPackageParsed.error.issues.map((item) => `${item.path.join('.')}:${item.message}`),
        },
      });
    }
    const storyPackage = storyPackageParsed.data;
    if (storyPackage.storyId !== input.storyId) {
      throw new VideoPlayError({
        reasonCode: VIDEOPLAY_REASON.STORY_PACKAGE_INVALID,
        actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.STORY_PACKAGE_INVALID),
        stage: 'story-package',
        message: 'VIDEOPLAY_STORY_PACKAGE_STORY_ID_MISMATCH',
        details: {
          packageStoryId: storyPackage.storyId,
          inputStoryId: input.storyId,
        },
      });
    }
    if (storyPackage.sourceMode !== sourceMode) {
      throw new VideoPlayError({
        reasonCode: VIDEOPLAY_REASON.STORY_PACKAGE_INVALID,
        actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.STORY_PACKAGE_INVALID),
        stage: 'story-package',
        message: 'VIDEOPLAY_STORY_PACKAGE_SOURCE_MODE_MISMATCH',
        details: {
          packageSourceMode: storyPackage.sourceMode,
          inputSourceMode: sourceMode,
        },
      });
    }

    const maxTurns = Number.isFinite(Number(input.windowPolicy?.maxTurns))
      ? Math.max(1, Math.floor(Number(input.windowPolicy?.maxTurns)))
      : storyPackage.windowPolicy.maxTurns;
    const requiredTriggerSources = Array.isArray(input.windowPolicy?.enrichedRequiredTriggerSources)
      ? [...new Set(input.windowPolicy.enrichedRequiredTriggerSources
        .map((item) => String(item || '').trim())
        .filter((item): item is 'UserTurn' | 'AgentInitiative' => item === 'UserTurn' || item === 'AgentInitiative'))]
      : storyPackage.windowPolicy.enrichedRequiredTriggerSources;
    const trimmedTurns = storyPackage.turnWindow.turns.slice(-maxTurns);
    if (trimmedTurns.length === 0) {
      throw new VideoPlayError({
        reasonCode: VIDEOPLAY_REASON.STORY_SOURCE_UNAVAILABLE,
        actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.STORY_SOURCE_UNAVAILABLE),
        stage: 'narrative-ingest',
        message: 'VIDEOPLAY_STORY_WINDOW_EMPTY',
      });
    }
    const turnWindowParsed = NarrativeTurnWindowSchema.safeParse({
      ...storyPackage.turnWindow,
      ingestCursorStart: trimmedTurns[0]!.turnId,
      turns: trimmedTurns,
    });
    if (!turnWindowParsed.success) {
      throw new VideoPlayError({
        reasonCode: VIDEOPLAY_REASON.STORY_PACKAGE_INVALID,
        actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.STORY_PACKAGE_INVALID),
        stage: 'story-package',
        message: 'VIDEOPLAY_STORY_TURN_WINDOW_SCHEMA_INVALID',
        details: {
          issues: turnWindowParsed.error.issues.map((item) => `${item.path.join('.')}:${item.message}`),
        },
      });
    }
    turnWindow = turnWindowParsed.data;

    if (sourceMode === 'textplay-enriched-story') {
      const required = new Set(requiredTriggerSources);
      const hasEnrichedTurn = turnWindow.turns.some((turn) => required.has(String(turn.triggerSource || '').trim() as 'UserTurn' | 'AgentInitiative'));
      if (!hasEnrichedTurn) {
        throw new VideoPlayError({
          reasonCode: VIDEOPLAY_REASON.STORY_SOURCE_UNAVAILABLE,
          actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.STORY_SOURCE_UNAVAILABLE),
          stage: 'narrative-ingest',
          message: 'VIDEOPLAY_ENRICHED_SOURCE_TRIGGER_MISSING',
          details: {
            requiredTriggerSources,
          },
        });
      }
    }

    const projectionParsed = NarrativeProjectionRenderInputSchema.safeParse(storyPackage.projection);
    if (!projectionParsed.success) {
      throw new VideoPlayError({
        reasonCode: VIDEOPLAY_REASON.STORY_PACKAGE_INVALID,
        actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.STORY_PACKAGE_INVALID),
        stage: 'story-package',
        message: 'VIDEOPLAY_STORY_PROJECTION_SCHEMA_INVALID',
        details: {
          issues: projectionParsed.error.issues.map((item) => `${item.path.join('.')}:${item.message}`),
        },
      });
    }
    projection = projectionParsed.data;
    routeCatalog = await loadRuntimeRouteCatalog({
      deps,
      modId: 'world.nimi.videoplay',
    });

    runEventFactory.pushEvent({
      step: 'narrative-ingest',
      eventType: 'step.complete',
      details: {
        sourceMode,
        storyPackageVersion: storyPackage.snapshot.version,
        turnCount: turnWindow.turns.length,
        projectionEvents: projection.events.length,
        routeSelected: {
          chat: routeCatalog.chat?.selected.source || 'unknown',
          image: routeCatalog.image?.selected.source || 'unknown',
          video: routeCatalog.video?.selected.source || 'unknown',
        },
      },
    });
  } catch (error) {
    const normalized = toVideoPlayError(error, {
      reasonCode: VIDEOPLAY_REASON.FACT_PROJECTION_INVALID,
      actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.FACT_PROJECTION_INVALID),
      stage: 'narrative-bridge',
    });
    runEventFactory.pushEvent({
      step: 'narrative-ingest',
      eventType: 'step.error',
      reasonCode: normalized.reasonCode,
      actionHint: normalized.actionHint,
      retryClass: normalized.retryClass,
      details: normalized.details,
    });
    runEventFactory.pushEvent({
      step: 'narrative-ingest',
      eventType: 'run.error',
      reasonCode: normalized.reasonCode,
      actionHint: normalized.actionHint,
      retryClass: normalized.retryClass,
      details: normalized.details,
    });
    throw normalized;
  }

  runEventFactory.pushEvent({
    step: 'episode-segmentation',
    eventType: 'step.start',
    details: {
      storyId: input.storyId,
      policyHash: createHash(JSON.stringify(policy)),
    },
  });

  const segmentation = segmentEpisodes({
    storyId: input.storyId,
    ingestCursorStart: input.ingestCursorStart,
    turns: turnWindow.turns,
    policy,
  });

  const secondPass = segmentEpisodes({
    storyId: input.storyId,
    ingestCursorStart: input.ingestCursorStart,
    turns: turnWindow.turns,
    policy,
  });
  if (JSON.stringify(segmentation) !== JSON.stringify(secondPass)) {
    throw new VideoPlayError({
      reasonCode: VIDEOPLAY_REASON.SEGMENTATION_NON_DETERMINISTIC,
      actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.SEGMENTATION_NON_DETERMINISTIC),
      stage: 'segment',
      message: 'VIDEOPLAY_SEGMENT_NON_DETERMINISTIC',
    });
  }

  runEventFactory.pushEvent({
    step: 'episode-segmentation',
    eventType: 'step.complete',
    details: {
      episodeCount: segmentation.episodes.length,
      backlogTurnCount: segmentation.backlogTurnIds.length,
      nextIngestCursor: segmentation.nextIngestCursor,
    },
  });

  const episodes: EpisodeRecord[] = [];
  const releaseCandidates: ReleasePackage[] = [];

  for (const segmentedEpisode of segmentation.episodes) {
    const baselineSourceEventIds = new Set<string>(segmentedEpisode.sourceEventIds);
    const projectionLocale = resolvePromptLocale(
      (projection.systemContext as Record<string, unknown> | undefined)?.locale as string
      || (projection.systemContext as Record<string, unknown> | undefined)?.language as string
      || (projection.systemContext as Record<string, unknown> | undefined)?.promptLocale as string
      || '',
    );

    runEventFactory.pushEvent({
      step: 'screenplay',
      eventType: 'step.start',
      details: { episodeId: segmentedEpisode.episodeId },
    });

    const screenplayVars = {
      storyId: input.storyId,
      episodeId: segmentedEpisode.episodeId,
      worldStyle: JSON.stringify(projection.worldStyle),
      beatsJson: JSON.stringify(segmentedEpisode.turns.map((turn) => ({ turnId: turn.turnId, message: turn.userMessage }))),
    };
    const screenplayValidated = validatePromptVariables('storyboard-plan', screenplayVars);
    if (!screenplayValidated.ok) {
      throw new VideoPlayError({
        reasonCode: VIDEOPLAY_REASON.SCREENPLAY_SCHEMA_INVALID,
        actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.SCREENPLAY_SCHEMA_INVALID),
        stage: 'screenplay',
        message: screenplayValidated.issues.join(';'),
      });
    }

    const screenplayPrompt = renderPromptTemplate('storyboard-plan', projectionLocale, screenplayValidated.data);

    const screenplayInvoke = await invokeWithRouteFallback({
      stage: 'screenplay',
      capability: 'llm.text.generate',
      traceId,
      routeHint: 'chat/fine',
      checkHealth: async (routeHint, routeOverride) => deps.aiClient.checkRouteHealth({ routeHint, routeOverride }),
      invoke: async (routeOverride) => deps.aiClient.generateText({
        prompt: screenplayPrompt,
        systemPrompt: 'Return concise structured planning hints in JSON.',
        routeHint: 'chat/fine',
        routeOverride,
        maxTokens: 1024,
      }),
    });
    if (screenplayInvoke.fallbackAudit) {
      fallbackAudits.push(screenplayInvoke.fallbackAudit);
    }

    const screenplayStructured = parseStructuredModelOutput(screenplayInvoke.result.text);
    let screenplay = buildDeterministicScreenplay(segmentedEpisode);
    if (screenplayStructured && Array.isArray(screenplayStructured.beats)) {
      const beatsPayload = screenplayStructured.beats as unknown[];
      const deterministic = buildDeterministicScreenplay(segmentedEpisode);
      screenplay = {
        ...deterministic,
        beats: deterministic.beats.map((beat, index) => {
          const src = beatsPayload[index];
          if (src && typeof src === 'object') {
            return {
              ...beat,
              summary: String((src as Record<string, unknown>).summary || beat.summary),
            };
          }
          return beat;
        }),
      };
    }

    const screenplayParsed = ScreenplaySchema.safeParse(screenplay);
    if (!screenplayParsed.success) {
      throw new VideoPlayError({
        reasonCode: VIDEOPLAY_REASON.SCREENPLAY_SCHEMA_INVALID,
        actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.SCREENPLAY_SCHEMA_INVALID),
        stage: 'screenplay',
        message: 'VIDEOPLAY_SCREENPLAY_SCHEMA_INVALID',
      });
    }
    screenplay = screenplayParsed.data;

    runEventFactory.pushEvent({
      step: 'screenplay',
      eventType: 'step.complete',
      details: {
        episodeId: segmentedEpisode.episodeId,
        routeSource: screenplayInvoke.routeSource,
      },
    });

    runEventFactory.pushEvent({
      step: 'storyboard',
      eventType: 'step.start',
      details: { episodeId: segmentedEpisode.episodeId },
    });

    const storyboardInvoke = await invokeWithRouteFallback({
      stage: 'storyboard',
      capability: 'llm.text.generate',
      traceId,
      routeHint: 'chat/fine',
      checkHealth: async (routeHint, routeOverride) => deps.aiClient.checkRouteHealth({ routeHint, routeOverride }),
      invoke: async (routeOverride) => deps.aiClient.generateText({
        prompt: renderPromptTemplate('storyboard-plan', projectionLocale, {
          storyId: input.storyId,
          episodeId: segmentedEpisode.episodeId,
          worldStyle: JSON.stringify(projection.worldStyle),
          beatsJson: JSON.stringify(screenplay.beats.map((beat) => ({
            beatId: beat.beatId,
            summary: beat.summary,
            sourceEventIds: beat.sourceEventIds,
          }))),
        }),
        systemPrompt: 'Return JSON with episodeId, clipPlans, shotPlans, sourceEventIds.',
        routeHint: 'chat/fine',
        routeOverride,
        maxTokens: 1024,
      }),
    });
    if (storyboardInvoke.fallbackAudit) {
      fallbackAudits.push(storyboardInvoke.fallbackAudit);
    }

    let storyboard = buildDeterministicStoryboard(screenplay);
    const storyboardStructured = parseStructuredModelOutput(storyboardInvoke.result.text);
    if (storyboardStructured && Array.isArray(storyboardStructured.shotPlans)) {
      const shotPlansPayload = storyboardStructured.shotPlans as unknown[];
      storyboard = {
        ...storyboard,
        shotPlans: storyboard.shotPlans.map((shot, index) => {
          const src = shotPlansPayload[index];
          if (!src || typeof src !== 'object') {
            return shot;
          }
          return {
            ...shot,
            visualPrompt: String((src as Record<string, unknown>).visualPrompt || shot.visualPrompt),
            motionCue: String((src as Record<string, unknown>).motionCue || shot.motionCue),
          };
        }),
      };
    }

    const storyboardParsed = StoryboardSchema.safeParse(storyboard);
    if (!storyboardParsed.success) {
      throw new VideoPlayError({
        reasonCode: VIDEOPLAY_REASON.STORYBOARD_SCHEMA_INVALID,
        actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.STORYBOARD_SCHEMA_INVALID),
        stage: 'storyboard',
        message: 'VIDEOPLAY_STORYBOARD_SCHEMA_INVALID',
      });
    }
    storyboard = storyboardParsed.data;

    ensureSourceEventTraceability({
      baseline: baselineSourceEventIds,
      episode: segmentedEpisode,
      screenplay,
      storyboard,
    });

    runEventFactory.pushEvent({
      step: 'storyboard',
      eventType: 'step.complete',
      details: {
        episodeId: segmentedEpisode.episodeId,
        routeSource: storyboardInvoke.routeSource,
        shotCount: storyboard.shotPlans.length,
      },
    });

    runEventFactory.pushEvent({
      step: 'asset-render',
      eventType: 'step.start',
      details: { episodeId: segmentedEpisode.episodeId },
    });

    const shotAssets = [] as AssetRenderOutput['shotAssets'];
    const clipAssets = [] as AssetRenderOutput['clipAssets'];
    const sourceEventMap: Record<string, string[]> = {};
    let renderedShots = 0;

    for (const shot of storyboard.shotPlans) {
      sourceEventMap[shot.shotId] = [...shot.sourceEventIds];
      let imageUri = '';
      let imageMime = 'image/png';
      let imageRouteSource: 'local-runtime' | 'token-api' | 'unknown' = 'unknown';
      let videoUri = '';
      let videoMime = 'video/mp4';
      let videoRouteSource: 'local-runtime' | 'token-api' | 'unknown' = 'unknown';

      try {
        const imageResult = await invokeWithRouteFallback({
          stage: 'asset-render-image',
          capability: 'llm.image.generate',
          traceId,
          routeHint: 'image/default',
          checkHealth: async (routeHint, routeOverride) => deps.aiClient.checkRouteHealth({ routeHint, routeOverride }),
          invoke: async (routeOverride) => deps.aiClient.generateImage({
            prompt: shot.visualPrompt,
            routeHint: 'image/default',
            routeOverride,
          }),
        });
        if (imageResult.fallbackAudit) {
          fallbackAudits.push(imageResult.fallbackAudit);
        }
        imageUri = String(imageResult.result.images[0]?.uri || `videoplay://image/${segmentedEpisode.episodeId}/${shot.shotId}.png`);
        imageMime = String(imageResult.result.images[0]?.mimeType || 'image/png');
        imageRouteSource = imageResult.routeSource;
      } catch (error) {
        emitVideoPlayLog({
          level: 'warn',
          message: 'videoplay:asset-render:image-failed',
          details: {
            shotId: shot.shotId,
            error: error instanceof Error ? error.message : String(error || ''),
          },
        });
      }

      try {
        const videoResult = await invokeWithRouteFallback({
          stage: 'asset-render-video',
          capability: 'llm.video.generate',
          traceId,
          routeHint: 'video/default',
          checkHealth: async (routeHint, routeOverride) => deps.aiClient.checkRouteHealth({ routeHint, routeOverride }),
          invoke: async (routeOverride) => deps.aiClient.generateVideo({
            prompt: `${shot.visualPrompt}. motion=${shot.motionCue}`,
            routeHint: 'video/default',
            routeOverride,
            durationSeconds: Math.max(1, Math.round(shot.durationMs / 1000)),
          }),
        });
        if (videoResult.fallbackAudit) {
          fallbackAudits.push(videoResult.fallbackAudit);
        }
        videoUri = String(videoResult.result.videos[0]?.uri || `videoplay://video/${segmentedEpisode.episodeId}/${shot.shotId}.mp4`);
        videoMime = String(videoResult.result.videos[0]?.mimeType || 'video/mp4');
        videoRouteSource = videoResult.routeSource;
      } catch (error) {
        emitVideoPlayLog({
          level: 'warn',
          message: 'videoplay:asset-render:video-failed',
          details: {
            shotId: shot.shotId,
            error: error instanceof Error ? error.message : String(error || ''),
          },
        });
      }

      if (imageUri) {
        shotAssets.push({
          assetId: createUlid(),
          episodeId: segmentedEpisode.episodeId,
          shotId: shot.shotId,
          clipId: shot.clipId,
          assetType: 'image',
          uri: imageUri,
          mimeType: imageMime,
          durationMs: shot.durationMs,
          fps: 30,
          resolution: '1920x1080',
          sourceEventIds: [...shot.sourceEventIds],
          routeSource: imageRouteSource,
          metadata: {
            promptId: VIDEOPLAY_PROMPT_ID.STORYBOARD_PLAN,
          },
        });
      }

      if (videoUri) {
        shotAssets.push({
          assetId: createUlid(),
          episodeId: segmentedEpisode.episodeId,
          shotId: shot.shotId,
          clipId: shot.clipId,
          assetType: 'video',
          uri: videoUri,
          mimeType: videoMime,
          durationMs: shot.durationMs,
          fps: 30,
          resolution: '1920x1080',
          sourceEventIds: [...shot.sourceEventIds],
          routeSource: videoRouteSource,
          metadata: {
            motionCue: shot.motionCue,
          },
        });
        renderedShots += 1;
      }
    }

    for (const clip of storyboard.clipPlans) {
      const representative = shotAssets.find((asset) => asset.clipId === clip.clipId && asset.assetType === 'video');
      if (representative) {
        clipAssets.push({
          ...representative,
          assetId: createUlid(),
          shotId: representative.shotId,
        });
      }
    }

    const assetOutput: AssetRenderOutput = {
      episodeId: segmentedEpisode.episodeId,
      clipAssets,
      shotAssets,
      sourceEventMap,
      renderTrace: {
        plannedShots: storyboard.shotPlans.length,
        renderedShots,
      },
      coverage: {
        plannedShots: storyboard.shotPlans.length,
        renderedShots,
        ratio: storyboard.shotPlans.length > 0
          ? Number((renderedShots / storyboard.shotPlans.length).toFixed(6))
          : 0,
      },
    };

    const assetParsed = AssetRenderOutputSchema.safeParse(assetOutput);
    if (!assetParsed.success) {
      throw new VideoPlayError({
        reasonCode: VIDEOPLAY_REASON.SHOT_RENDER_FAILED,
        actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.SHOT_RENDER_FAILED),
        stage: 'render',
        retryClass: VIDEOPLAY_RETRY_CLASS.RETRYABLE,
        message: 'VIDEOPLAY_ASSET_OUTPUT_INVALID',
      });
    }

    runEventFactory.pushEvent({
      step: 'asset-render',
      eventType: 'step.complete',
      details: {
        episodeId: segmentedEpisode.episodeId,
        coverage: assetParsed.data.coverage.ratio,
      },
    });

    runEventFactory.pushEvent({
      step: 'edit-compose',
      eventType: 'step.start',
      details: { episodeId: segmentedEpisode.episodeId },
    });

    const composeOutput = composeEpisode({
      episodeId: segmentedEpisode.episodeId,
      storyboard,
      assetOutput: assetParsed.data,
    });

    runEventFactory.pushEvent({
      step: 'edit-compose',
      eventType: 'step.complete',
      details: {
        episodeId: segmentedEpisode.episodeId,
        durationMs: composeOutput.episodeMasterVideo.durationMs,
      },
    });

    runEventFactory.pushEvent({
      step: 'qc-gate',
      eventType: 'step.start',
      details: { episodeId: segmentedEpisode.episodeId },
    });

    const qcReport = evaluateQualityGates({
      baselineSourceEventIds,
      episode: segmentedEpisode,
      screenplay,
      storyboard,
      assetOutput: assetParsed.data,
      composeOutput,
    });

    if (qcReport.status === 'REJECTED') {
      const reasonCode = qcReport.failReasonCode || VIDEOPLAY_REASON.QC_FAILED;
      runEventFactory.pushEvent({
        step: 'qc-gate',
        eventType: 'step.error',
        reasonCode,
        actionHint: actionHintByReasonCode(reasonCode),
        retryClass: 'non-retryable',
        details: { gates: qcReport.gates },
      });
      throw new VideoPlayError({
        reasonCode,
        actionHint: actionHintByReasonCode(reasonCode),
        stage: 'qc',
        message: 'VIDEOPLAY_QC_REJECTED_FAIL_CLOSE',
        details: {
          gates: qcReport.gates,
        },
      });
    }

    runEventFactory.pushEvent({
      step: 'qc-gate',
      eventType: 'step.complete',
      details: {
        episodeId: segmentedEpisode.episodeId,
        status: qcReport.status,
      },
    });

    runEventFactory.pushEvent({
      step: 'release-package',
      eventType: 'step.start',
      details: { episodeId: segmentedEpisode.episodeId },
    });

    const releaseCandidate: ReleasePackage = {
      releaseId: createUlid(),
      episodeId: segmentedEpisode.episodeId,
      qcStatus: qcReport.status,
      episodeMasterVideo: composeOutput.episodeMasterVideo,
      episodePoster: composeOutput.episodePoster,
      episodeCaptionTrack: composeOutput.episodeCaptionTrack,
      episodeMetadata: {
        storyId: input.storyId,
        sourceTurnIds: [...segmentedEpisode.sourceTurnIds],
        sourceEventIds: [...segmentedEpisode.sourceEventIds],
        durationSec: qcReport.durationSec,
        policyHash: segmentedEpisode.policyHash,
      },
      episodeTraceBundle: {
        traceId,
        runId,
        fallbackAudits: [...fallbackAudits],
        runEvents: [...runEventFactory.events],
        sourceCoverage: buildTraceCoverage({
          episode: segmentedEpisode,
          screenplay,
          storyboard,
        }),
      },
      published: false,
      publishedAt: null,
      createdAt: nowIso(),
    };

    const releaseParsed = ReleasePackageSchema.safeParse(releaseCandidate);
    if (!releaseParsed.success) {
      throw new VideoPlayError({
        reasonCode: VIDEOPLAY_REASON.RELEASE_PACKAGE_INVALID,
        actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.RELEASE_PACKAGE_INVALID),
        stage: 'package',
        message: 'VIDEOPLAY_RELEASE_CANDIDATE_INVALID',
      });
    }

    const branchId = createUlid();
    const baseVersionId = createUlid();
    const episodeRecord: EpisodeRecord = {
      episodeId: segmentedEpisode.episodeId,
      storyId: input.storyId,
      sourceTurnIds: [...segmentedEpisode.sourceTurnIds],
      sourceEventIds: [...segmentedEpisode.sourceEventIds],
      policyHash: segmentedEpisode.policyHash,
      segmentationReason: segmentedEpisode.segmentationReason,
      screenplay,
      storyboard,
      quality: qcReport,
      candidateRelease: releaseParsed.data,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      editor: {
        activeBranchId: branchId,
        branches: {
          [branchId]: {
            branchId,
            name: 'main',
            headVersionId: baseVersionId,
            createdAt: nowIso(),
          },
        },
        lineage: [
          {
            versionId: baseVersionId,
            parentVersionId: null,
            branchId,
            operationType: 'insert-shot',
            deltaSummary: 'bootstrap-lineage',
            operator: input.operator || 'system',
            timestamp: nowIso(),
          },
        ],
        conflictRecords: [],
      },
    };

    const episodeIdempotencyKey = createHash(`${runId}:${episodeRecord.episodeId}:episode-upsert`);
    const assetIdempotencyKey = createHash(`${runId}:${episodeRecord.episodeId}:asset-upsert`);

    await deps.hookClient.data.query({
      capability: VIDEOPLAY_DATA_API_EPISODE_UPSERT,
      query: {
        operation: 'upsert',
        idempotencyKey: episodeIdempotencyKey,
        episode: episodeRecord,
      },
    });

    await deps.hookClient.data.query({
      capability: VIDEOPLAY_DATA_API_ASSET_BATCH_UPSERT,
      query: {
        operation: 'upsert',
        idempotencyKey: assetIdempotencyKey,
        episodeId: episodeRecord.episodeId,
        assets: assetParsed.data.shotAssets,
      },
    });

    runEventFactory.pushEvent({
      step: 'release-package',
      eventType: 'step.complete',
      idempotencyKey: episodeIdempotencyKey,
      details: {
        episodeId: episodeRecord.episodeId,
        releaseId: releaseParsed.data.releaseId,
      },
    });

    episodes.push(episodeRecord);
    releaseCandidates.push(releaseParsed.data);
  }

  runEventFactory.pushEvent({
    step: 'release-package',
    eventType: 'run.complete',
    details: {
      episodeCount: episodes.length,
      releaseCandidateCount: releaseCandidates.length,
    },
  });

  return {
    traceId,
    runId,
    episodes,
    releaseCandidates,
    runEvents: [...runEventFactory.events],
    fallbackAudits,
  };
}
