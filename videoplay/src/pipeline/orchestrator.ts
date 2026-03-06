import type { RuntimeRouteHealthResult } from '@nimiplatform/sdk/mod/types';
import type { RuntimeCanonicalCapability, RuntimeRouteBinding } from '@nimiplatform/sdk/mod/runtime-route';
import {
  VIDEOPLAY_DATA_API_ASSET_BATCH_UPSERT,
  VIDEOPLAY_DATA_API_CORE_AGENT_MEMORY_RECALL_FOR_ENTITY,
  VIDEOPLAY_DATA_API_EPISODE_UPSERT,
  VIDEOPLAY_PROMPT_ID,
  VIDEOPLAY_PIPELINE_CHAIN,
  VIDEOPLAY_QUALITY_RULE,
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
  AudioDesignOutputSchema,
  CandidateSelectionOutputSchema,
  CharacterCastingOutputSchema,
  EditComposeOutputSchema,
  EpisodePlanSchema,
  NarrativeProjectionRenderInputSchema,
  NarrativeTurnWindowSchema,
  QualityGateReportSchema,
  ReleasePackageSchema,
  RunEventSchema,
  ScenePlanningOutputSchema,
  ScreenplaySchema,
  StoryboardSchema,
  VideoStoryPackageSchema,
} from '../schemas.js';
import {
  AUDIO_DESIGN_POLICY,
  CANDIDATE_SELECTION_POLICY,
  CHARACTER_CASTING_POLICY,
  DEFAULT_SEGMENTATION_POLICY,
  EDIT_COMPOSE_POLICY,
  QUALITY_GATE_POLICY,
  SCENE_PLANNING_POLICY,
  SEGMENTATION_POLICY_BOUNDS,
} from '../policy.js';
import { runPromptCanaryCases } from '../prompt/canary.js';
import {
  resolvePromptLocale,
  renderPromptTemplate,
  type VideoPlayPromptLocale,
  validatePromptVariables,
} from '../prompt/registry.js';
import type {
  AssetRenderOutput,
  AudioDesignOutput,
  BgmTrack,
  CandidateSelectionOutput,
  CharacterBrief,
  CharacterCastingOutput,
  EditComposeOutput,
  EpisodeRecord,
  FallbackAuditRecord,
  NarrativeProjectionRenderInput,
  NarrativeTurn,
  NarrativeTurnWindow,
  QualityGateReport,
  RenderedAsset,
  ReleasePackage,
  RouteInvokeInput,
  ScenePlanningOutput,
  ScreenplayBeat,
  ScreenplayOutput,
  SegmentationOutput,
  SegmentedEpisode,
  SegmentationPolicy,
  SfxLayer,
  SelectedTimelineSegment,
  StoryboardOutput,
  StoryboardShot,
  VideoPlayPipelineDeps,
  VideoPlayPipelineExecutionControl,
  VideoPlayPipelineInput,
  VideoPlayPipelineLifecycleStatus,
  VideoPlayPipelineCheckpoint,
  VideoPlayPipelineResult,
  VideoPlayPipelineStageProgress,
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

type RuntimeRouteCatalog = Record<'chat' | 'image' | 'video' | 'tts', RuntimeRouteCatalogSnapshot>;

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
}): Promise<RuntimeRouteCatalog> {
  const [chatRaw, imageRaw, videoRaw, ttsRaw] = await Promise.all([
    input.deps.runtimeClient.route.listOptions({ capability: 'text.generate' }),
    input.deps.runtimeClient.route.listOptions({ capability: 'image.generate' }),
    input.deps.runtimeClient.route.listOptions({ capability: 'video.generate' }),
    input.deps.runtimeClient.route.listOptions({ capability: 'audio.synthesize' }),
  ]);

  const chat = parseRuntimeRouteCatalogSnapshot(chatRaw);
  const image = parseRuntimeRouteCatalogSnapshot(imageRaw);
  const video = parseRuntimeRouteCatalogSnapshot(videoRaw);
  const tts = parseRuntimeRouteCatalogSnapshot(ttsRaw);

  if (!chat || !image || !video || !tts) {
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
    tts,
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
  candidateSelection: CandidateSelectionOutput;
  forceMasterUri?: string;
  forcedAvDriftMs?: number;
  forcedBlackGapMs?: number;
}): EditComposeOutput {
  const videoByAssetId = new Map(
    input.assetOutput.shotAssets
      .filter((asset) => asset.assetType === 'video')
      .map((asset) => [asset.assetId, asset] as const),
  );
  const imageByShotId = new Map<string, RenderedAsset>();
  for (const asset of input.assetOutput.shotAssets) {
    if (asset.assetType === 'image' && !imageByShotId.has(asset.shotId)) {
      imageByShotId.set(asset.shotId, asset);
    }
  }

  const selectedAssetIds = new Set(
    input.candidateSelection.selectedAssetIds.map((assetId) => String(assetId || '').trim()).filter(Boolean),
  );
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
  const invalidTrimCount = input.composeOutput.episodeTimeline.filter((clip) => (
    clip.trimInMs != null
    && clip.trimOutMs != null
    && clip.trimOutMs <= clip.trimInMs
  )).length;
  let overlapCount = 0;
  for (let index = 1; index < input.composeOutput.episodeTimeline.length; index += 1) {
    if (input.composeOutput.episodeTimeline[index]!.startMs < input.composeOutput.episodeTimeline[index - 1]!.endMs) {
      overlapCount += 1;
    }
  }
  const rationalityPenalty = duplicateAssetCount + invalidTrimCount + overlapCount;
  const selectionRationalityScore = Math.max(
    0,
    Number((1 - (rationalityPenalty / Math.max(selectedTimelineCount, 1))).toFixed(6)),
  );

  gates.push(
    {
      gate: 'character_consistency',
      passed: characterConsistencyScore >= VIDEOPLAY_QUALITY_RULE.CHARACTER_CONSISTENCY_MIN,
      value: characterConsistencyScore,
      min: VIDEOPLAY_QUALITY_RULE.CHARACTER_CONSISTENCY_MIN,
      max: null,
      reasonCode: VIDEOPLAY_REASON.CHARACTER_CONSISTENCY_LOW,
    },
    {
      gate: 'photography_compliance',
      passed: photographyComplianceScore >= VIDEOPLAY_QUALITY_RULE.PHOTOGRAPHY_COMPLIANCE_MIN,
      value: photographyComplianceScore,
      min: VIDEOPLAY_QUALITY_RULE.PHOTOGRAPHY_COMPLIANCE_MIN,
      max: null,
      reasonCode: VIDEOPLAY_REASON.PHOTOGRAPHY_COMPLIANCE_LOW,
    },
    {
      gate: 'acting_quality',
      passed: actingQualityScore >= VIDEOPLAY_QUALITY_RULE.ACTING_QUALITY_MIN,
      value: actingQualityScore,
      min: VIDEOPLAY_QUALITY_RULE.ACTING_QUALITY_MIN,
      max: null,
      reasonCode: VIDEOPLAY_REASON.ACTING_QUALITY_LOW,
    },
    {
      gate: 'audio_completeness',
      passed: audioCompletenessRatio >= VIDEOPLAY_QUALITY_RULE.AUDIO_COMPLETENESS_MIN,
      value: audioCompletenessRatio,
      min: VIDEOPLAY_QUALITY_RULE.AUDIO_COMPLETENESS_MIN,
      max: null,
      reasonCode: VIDEOPLAY_REASON.AUDIO_COMPLETENESS_LOW,
    },
    {
      gate: 'selection_coverage',
      passed: selectionCoverageRatio >= VIDEOPLAY_QUALITY_RULE.SELECTION_COVERAGE_MIN,
      value: selectionCoverageRatio,
      min: VIDEOPLAY_QUALITY_RULE.SELECTION_COVERAGE_MIN,
      max: null,
      reasonCode: VIDEOPLAY_REASON.SELECTION_COVERAGE_LOW,
    },
    {
      gate: 'selection_rationality',
      passed: selectionRationalityScore >= VIDEOPLAY_QUALITY_RULE.SELECTION_RATIONALITY_MIN,
      value: selectionRationalityScore,
      min: VIDEOPLAY_QUALITY_RULE.SELECTION_RATIONALITY_MIN,
      max: null,
      reasonCode: VIDEOPLAY_REASON.SELECTION_RATIONALITY_LOW,
    },
  );

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

function toRouteBinding(source: 'local-runtime' | 'token-api'): RuntimeRouteBinding {
  return {
    source,
    connectorId: '',
    model: '',
  };
}

export async function invokeWithRouteFallback<T>(
  input: RouteInvokeInput<T> & {
    checkHealth: (capability: RuntimeCanonicalCapability, binding?: RuntimeRouteBinding) => Promise<RuntimeRouteHealthResult>;
  },
): Promise<{
  result: T;
  routeSource: 'local-runtime' | 'token-api';
  fallbackAudit: FallbackAuditRecord | null;
}> {
  let localReason = 'local-runtime-unavailable';
  try {
    const health = await input.checkHealth(input.capability, toRouteBinding('local-runtime'));
    if (isRouteHealthy(health)) {
      try {
        const result = await input.invoke(toRouteBinding('local-runtime'));
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
    tokenHealth = await input.checkHealth(input.capability, toRouteBinding('token-api'));
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
    const result = await input.invoke(toRouteBinding('token-api'));
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

type EpisodeRuntimeContext = {
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

type RuntimeSnapshot = {
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

type StageProgressMap = Record<VideoPlayPipelineStep, VideoPlayPipelineStageProgress>;

type NormalizedExecutionControl = {
  mode: 'full' | 'stepwise';
  checkpoint: VideoPlayPipelineCheckpoint | null;
  rerunStep: VideoPlayPipelineStep | null;
  stepBudget: number;
  shouldCancel: (() => boolean) | null;
};

type StepExecutionResult = {
  details?: Record<string, unknown>;
  lastCompletedUnit?: string;
};

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isPipelineStep(value: string): value is VideoPlayPipelineStep {
  return (VIDEOPLAY_PIPELINE_CHAIN as readonly string[]).includes(value);
}

function createInitialStageProgressMap(): StageProgressMap {
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

function toStageProgressMap(progress: VideoPlayPipelineStageProgress[] | undefined): StageProgressMap {
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

function toStageProgressList(progressMap: StageProgressMap): VideoPlayPipelineStageProgress[] {
  return VIDEOPLAY_PIPELINE_CHAIN.map((step) => ({ ...progressMap[step] }));
}

function createInitialRuntimeSnapshot(input: {
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

function parseRuntimeSnapshot(input: {
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

function normalizeExecutionControl(control: VideoPlayPipelineExecutionControl | undefined): NormalizedExecutionControl {
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

function findNextStepIndex(progressMap: StageProgressMap): number {
  for (let index = 0; index < VIDEOPLAY_PIPELINE_CHAIN.length; index += 1) {
    const step = VIDEOPLAY_PIPELINE_CHAIN[index]!;
    const status = progressMap[step].status;
    if (status !== 'COMPLETED') {
      return index;
    }
  }
  return VIDEOPLAY_PIPELINE_CHAIN.length;
}

function resolveNextStep(nextStepIndex: number): VideoPlayPipelineStep | null {
  return nextStepIndex < VIDEOPLAY_PIPELINE_CHAIN.length
    ? VIDEOPLAY_PIPELINE_CHAIN[nextStepIndex]!
    : null;
}

function computeStepInputHash(
  step: VideoPlayPipelineStep,
  snapshot: RuntimeSnapshot,
  input: VideoPlayPipelineInput,
): string {
  switch (step) {
    case 'narrative-ingest':
      return createHash(JSON.stringify({
        storyId: input.storyId,
        sourceMode: input.sourceMode,
        ingestCursorStart: input.ingestCursorStart,
        windowPolicy: input.windowPolicy || null,
        storyPackageVersion: snapshot.storyPackageVersion
          || String((input.storyPackage as { snapshot?: { version?: string } })?.snapshot?.version || ''),
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

function createCheckpointToken(input: {
  runId: string;
  step: VideoPlayPipelineStep;
  attempt: number;
  stepInputHash: string;
  eventCount: number;
}): string {
  return createHash(`${input.runId}:${input.step}:${input.attempt}:${input.stepInputHash}:${input.eventCount}`);
}

function markStepRunning(progressMap: StageProgressMap, input: {
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

function markStepComplete(progressMap: StageProgressMap, input: {
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

function markStepError(progressMap: StageProgressMap, input: {
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

function clearDownstreamFromStep(input: {
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

function validateResumeBoundary(input: {
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

function buildCheckpoint(input: {
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

function fallbackForStep(step: VideoPlayPipelineStep): { reasonCode: VideoPlayReasonCode; actionHint: string; stage: string } {
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

function throwIfCanceled(control: NormalizedExecutionControl, step: VideoPlayPipelineStep): void {
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

type AssetRenderModality = 'image' | 'video' | 'voice';

type AssetAnalysisShotPlan = {
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

type AssetRenderBatch = {
  batchId: string;
  modality: AssetRenderModality;
  queueItemIds: string[];
  shotIds: string[];
};

type AssetRenderQueueItem = {
  queueItemId: string;
  batchId: string;
  episodeId: string;
  shotId: string;
  clipId: string;
  modality: AssetRenderModality;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED';
  routeSource: 'local-runtime' | 'token-api' | 'unknown';
  errorMessage: string | null;
};

function normalizeLanguageTag(input: string): string {
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

function inferShotComplexity(shot: StoryboardShot): 'low' | 'medium' | 'high' {
  if (shot.durationMs >= 5000 || shot.continuityAnchors.length >= 3) {
    return 'high';
  }
  if (shot.durationMs >= 3000 || shot.continuityAnchors.length >= 1) {
    return 'medium';
  }
  return 'low';
}

function buildLipSyncAnchors(input: {
  text: string;
  durationMs: number;
}): Array<{ t: number; viseme: string }> {
  const durationMs = Math.max(300, Math.floor(input.durationMs));
  const tokenCount = Math.max(3, Math.min(24, Math.ceil(String(input.text || '').length / 4)));
  const visemes = ['A', 'E', 'I', 'O', 'U', 'M'];
  const anchors: Array<{ t: number; viseme: string }> = [];
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

function buildAssetAnalysisPlan(input: {
  storyboard: StoryboardOutput;
  screenplay: ScreenplayOutput;
  projectionLocale: string;
}): AssetAnalysisShotPlan[] {
  const beatSummaryById = new Map(
    input.screenplay.beats.map((beat) => [beat.beatId, beat.summary] as const),
  );
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

function buildAssetRenderQueue(input: {
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

type VoiceProfile = {
  voiceId: string;
  providerId?: string;
  language?: string;
};

async function resolveVoiceProfile(input: {
  deps: VideoPlayPipelineDeps;
  binding: RuntimeRouteBinding | undefined;
  preferredLanguage: string;
}): Promise<VoiceProfile> {
  const routeSource = input.binding?.source === 'token-api' ? 'token-api' : 'local-runtime';
  const binding = {
    source: routeSource,
    connectorId: '',
    model: '',
  } as const;
  const [resolved, listed] = await Promise.all([
    input.deps.runtimeClient.route.resolve({
      capability: 'audio.synthesize',
      binding,
    }),
    input.deps.runtimeClient.media.tts.listVoices({
      binding,
      model: '',
    }),
  ]);
  const voices = listed.voices.map((voice) => ({
    id: voice.voiceId,
    providerId: resolved.provider,
    lang: voice.lang,
  }));

  if (!Array.isArray(voices) || voices.length === 0) {
    throw new VideoPlayError({
      reasonCode: VIDEOPLAY_REASON.VOICE_RENDER_FAILED,
      actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.VOICE_RENDER_FAILED),
      stage: 'render',
      message: 'VIDEOPLAY_TTS_VOICE_LIST_EMPTY',
      retryClass: VIDEOPLAY_RETRY_CLASS.RETRYABLE,
      details: {
        routeSource,
      },
    });
  }

  const preferred = normalizeLanguageTag(input.preferredLanguage);
  const selected = voices.find((voice) => normalizeLanguageTag(String(voice.lang || '')) === preferred) || voices[0]!;

  return {
    voiceId: String(selected.id || '').trim(),
    ...(String(selected.providerId || '').trim()
      ? { providerId: String(selected.providerId || '').trim() }
      : {}),
    ...(String(selected.lang || '').trim()
      ? { language: normalizeLanguageTag(String(selected.lang || '').trim()) }
      : {}),
  };
}

async function executeStep(input: {
  step: VideoPlayPipelineStep;
  deps: VideoPlayPipelineDeps;
  pipelineInput: VideoPlayPipelineInput;
  snapshot: RuntimeSnapshot;
  runEventFactory: ReturnType<typeof createRunEventFactory>;
  fallbackAudits: FallbackAuditRecord[];
  attempt: number;
  stepInputHash: string;
  control: NormalizedExecutionControl;
  traceId: string;
  runId: string;
}): Promise<StepExecutionResult> {
  switch (input.step) {
    case 'narrative-ingest': {
      const storyPackageParsed = VideoStoryPackageSchema.safeParse(input.pipelineInput.storyPackage);
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
      if (storyPackage.storyId !== input.pipelineInput.storyId) {
        throw new VideoPlayError({
          reasonCode: VIDEOPLAY_REASON.STORY_PACKAGE_INVALID,
          actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.STORY_PACKAGE_INVALID),
          stage: 'story-package',
          message: 'VIDEOPLAY_STORY_PACKAGE_STORY_ID_MISMATCH',
          details: {
            packageStoryId: storyPackage.storyId,
            inputStoryId: input.pipelineInput.storyId,
          },
        });
      }
      if (storyPackage.sourceMode !== input.pipelineInput.sourceMode) {
        throw new VideoPlayError({
          reasonCode: VIDEOPLAY_REASON.STORY_PACKAGE_INVALID,
          actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.STORY_PACKAGE_INVALID),
          stage: 'story-package',
          message: 'VIDEOPLAY_STORY_PACKAGE_SOURCE_MODE_MISMATCH',
          details: {
            packageSourceMode: storyPackage.sourceMode,
            inputSourceMode: input.pipelineInput.sourceMode,
          },
        });
      }

      const maxTurns = Number.isFinite(Number(input.pipelineInput.windowPolicy?.maxTurns))
        ? Math.max(1, Math.floor(Number(input.pipelineInput.windowPolicy?.maxTurns)))
        : storyPackage.windowPolicy.maxTurns;
      const requiredTriggerSources = Array.isArray(input.pipelineInput.windowPolicy?.enrichedRequiredTriggerSources)
        ? [...new Set(input.pipelineInput.windowPolicy.enrichedRequiredTriggerSources
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
      const turnWindow = turnWindowParsed.data;

      if (input.pipelineInput.sourceMode === 'textplay-enriched-story') {
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

      input.snapshot.turnWindow = turnWindow;
      input.snapshot.projection = projectionParsed.data;
      input.snapshot.routeCatalog = await loadRuntimeRouteCatalog({
        deps: input.deps,
        modId: 'world.nimi.videoplay',
      });
      input.snapshot.storyPackageVersion = storyPackage.snapshot.version;
      input.snapshot.sourceMode = storyPackage.sourceMode;
      input.snapshot.episodes = [];
      input.snapshot.releaseCandidates = [];

      return {
        lastCompletedUnit: turnWindow.turns[turnWindow.turns.length - 1]?.turnId ?? undefined,
        details: {
          sourceMode: storyPackage.sourceMode,
          storyPackageVersion: storyPackage.snapshot.version,
          turnCount: turnWindow.turns.length,
          projectionEvents: input.snapshot.projection.events.length,
          routeSelected: {
            chat: input.snapshot.routeCatalog.chat.selected.source,
            image: input.snapshot.routeCatalog.image.selected.source,
            video: input.snapshot.routeCatalog.video.selected.source,
            tts: input.snapshot.routeCatalog.tts.selected.source,
          },
        },
      };
    }

    case 'character-casting': {
      const storyPackageParsedForCasting = VideoStoryPackageSchema.safeParse(input.pipelineInput.storyPackage);
      if (!storyPackageParsedForCasting.success) {
        throw new VideoPlayError({
          reasonCode: VIDEOPLAY_REASON.CHARACTER_CASTING_FAILED,
          actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.CHARACTER_CASTING_FAILED),
          stage: 'character-casting',
          message: 'VIDEOPLAY_CHARACTER_CASTING_STORY_PACKAGE_INVALID',
        });
      }
      const castingPackage = storyPackageParsedForCasting.data;
      const participants: string[] = Array.isArray(castingPackage.cast?.participants)
        ? castingPackage.cast.participants.map((id: unknown) => String(id || '').trim()).filter(Boolean)
        : [];

      const characters: CharacterBrief[] = [];
      for (const agentId of participants) {
        throwIfCanceled(input.control, input.step);

        let memoryRecall = '';
        try {
          const recallResult = await input.deps.hookClient.data.query({
            capability: VIDEOPLAY_DATA_API_CORE_AGENT_MEMORY_RECALL_FOR_ENTITY,
            query: {
              worldId: castingPackage.worldId,
              storyId: input.pipelineInput.storyId,
              entityType: 'AGENT',
              entityId: agentId,
              topK: 12,
            },
          });
          memoryRecall = typeof recallResult === 'string'
            ? recallResult
            : JSON.stringify(recallResult || '');
        } catch {
          memoryRecall = '';
        }

        const characterName = agentId.split('-').pop() || agentId;
        const castingTextVars = {
          agentId,
          characterName,
          visualKeywords: memoryRecall ? 'from-memory' : 'default-appearance',
          roleLevel: 'B',
          memoryRecall: memoryRecall || 'No memory available',
        };
        const castingTextValidated = validatePromptVariables('character-visual', castingTextVars);
        if (!castingTextValidated.ok) {
          throw new VideoPlayError({
            reasonCode: VIDEOPLAY_REASON.CHARACTER_CASTING_FAILED,
            actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.CHARACTER_CASTING_FAILED),
            stage: 'character-casting',
            message: castingTextValidated.issues.join(';'),
          });
        }

        const castingTextPrompt = renderPromptTemplate(
          'character-visual',
          resolvePromptLocale(
            (input.snapshot.projection?.systemContext as Record<string, unknown> | undefined)?.locale as string || '',
          ),
          castingTextValidated.data,
        );

        const castingTextResult = await invokeWithRouteFallback({
          stage: 'character-casting-text',
          capability: 'text.generate',
          traceId: input.traceId,
          checkHealth: async (capability, binding) => input.deps.aiClient.checkRouteHealth({ capability, binding }),
          invoke: async (binding) => input.deps.aiClient.generateText({
            prompt: castingTextPrompt,
            systemPrompt: 'Return JSON with agentId, name, visualKeywords, appearanceDescription.',
            capability: 'text.generate',
            binding,
            maxTokens: 512,
          }),
        });
        if (castingTextResult.fallbackAudit) {
          input.fallbackAudits.push(castingTextResult.fallbackAudit);
        }

        const castingTextParsed = parseStructuredModelOutput(castingTextResult.result.text);
        const description = String(castingTextParsed?.appearanceDescription || castingTextParsed?.description || memoryRecall || 'Default appearance');
        const visualKeywords = Array.isArray(castingTextParsed?.visualKeywords)
          ? (castingTextParsed!.visualKeywords as string[]).map((kw) => String(kw))
          : [];

        const imageUrls: string[] = [];
        const maxCandidates = CHARACTER_CASTING_POLICY.maxCandidateImages;
        for (let candidateIndex = 0; candidateIndex < maxCandidates; candidateIndex += 1) {
          try {
            const imageResult = await invokeWithRouteFallback({
              stage: 'character-casting-visual',
          capability: 'image.generate',
          traceId: input.traceId,
          checkHealth: async (capability, binding) => input.deps.aiClient.checkRouteHealth({ capability, binding }),
              invoke: async (binding) => input.deps.aiClient.generateImage({
                prompt: `Character portrait: ${description}. Keywords: ${visualKeywords.join(', ')}`,
                capability: 'image.generate',
                binding,
              }),
            });
            if (imageResult.fallbackAudit) {
              input.fallbackAudits.push(imageResult.fallbackAudit);
            }
            imageUrls.push(
              String(imageResult.result.images[0]?.uri || `videoplay://character/${agentId}/candidate-${candidateIndex}.png`),
            );
          } catch {
            imageUrls.push(`videoplay://character/${agentId}/candidate-${candidateIndex}.png`);
          }
        }

        characters.push({
          agentId,
          name: String(castingTextParsed?.name || characterName),
          roleLevel: CHARACTER_CASTING_POLICY.defaultRoleLevel,
          visualKeywords,
          appearances: [{
            appearanceIndex: 0,
            description,
            imageUrls,
            selectedIndex: 0,
            changeReason: 'initial-casting',
            previousImageUrl: null,
          }],
          activeAppearanceIndex: 0,
          referenceImageUri: imageUrls[0] || null,
        });

        input.runEventFactory.pushEvent({
          step: input.step,
          eventType: 'step.chunk',
          attempt: input.attempt,
          stepInputHash: input.stepInputHash,
          lastCompletedUnit: agentId,
          details: {
            agentId,
            candidateImages: imageUrls.length,
          },
        });
      }

      const castingOutput: CharacterCastingOutput = {
        storyId: input.pipelineInput.storyId,
        characters,
      };

      const castingParsed = CharacterCastingOutputSchema.safeParse(castingOutput);
      if (!castingParsed.success) {
        throw new VideoPlayError({
          reasonCode: VIDEOPLAY_REASON.CHARACTER_CASTING_FAILED,
          actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.CHARACTER_CASTING_FAILED),
          stage: 'character-casting',
          message: 'VIDEOPLAY_CHARACTER_CASTING_OUTPUT_INVALID',
        });
      }

      input.snapshot.characterCasting = castingParsed.data;

      return {
        lastCompletedUnit: participants[participants.length - 1] ?? undefined,
        details: {
          characterCount: characters.length,
        },
      };
    }

    case 'scene-planning': {
      const storyPackageParsedForScene = VideoStoryPackageSchema.safeParse(input.pipelineInput.storyPackage);
      if (!storyPackageParsedForScene.success) {
        throw new VideoPlayError({
          reasonCode: VIDEOPLAY_REASON.SCENE_PLANNING_FAILED,
          actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.SCENE_PLANNING_FAILED),
          stage: 'scene-planning',
          message: 'VIDEOPLAY_SCENE_PLANNING_STORY_PACKAGE_INVALID',
        });
      }
      const scenePlanningPackage = storyPackageParsedForScene.data;
      const rawScenes = Array.isArray(scenePlanningPackage.materials?.scenes)
        ? scenePlanningPackage.materials.scenes
        : [];

      const scenes: ScenePlanningOutput['scenes'] = [];
      const locale = resolvePromptLocale(
        (input.snapshot.projection?.systemContext as Record<string, unknown> | undefined)?.locale as string || '',
      );

      for (const rawScene of rawScenes) {
        throwIfCanceled(input.control, input.step);
        const sceneRecord = rawScene as Record<string, unknown>;
        const sceneId = String(sceneRecord.sceneId || sceneRecord.id || createUlid());
        const sceneName = String(sceneRecord.name || sceneRecord.sceneName || 'Unnamed Scene');
        const sceneDescription = String(sceneRecord.description || sceneRecord.environmentDescription || '');

        const sceneTextVars = { sceneId, sceneName, sceneDescription };
        const sceneTextValidated = validatePromptVariables('scene-description', sceneTextVars);
        if (!sceneTextValidated.ok) {
          throw new VideoPlayError({
            reasonCode: VIDEOPLAY_REASON.SCENE_PLANNING_FAILED,
            actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.SCENE_PLANNING_FAILED),
            stage: 'scene-planning',
            message: sceneTextValidated.issues.join(';'),
          });
        }

        const sceneTextPrompt = renderPromptTemplate('scene-description', locale, sceneTextValidated.data);

        const sceneTextResult = await invokeWithRouteFallback({
          stage: 'scene-planning-text',
          capability: 'text.generate',
          traceId: input.traceId,
          checkHealth: async (capability, binding) => input.deps.aiClient.checkRouteHealth({ capability, binding }),
          invoke: async (binding) => input.deps.aiClient.generateText({
            prompt: sceneTextPrompt,
            systemPrompt: 'Return JSON with sceneId, environmentDescription.',
            capability: 'text.generate',
            binding,
            maxTokens: 512,
          }),
        });
        if (sceneTextResult.fallbackAudit) {
          input.fallbackAudits.push(sceneTextResult.fallbackAudit);
        }

        const sceneTextParsed = parseStructuredModelOutput(sceneTextResult.result.text);
        const environmentDescription = String(
          sceneTextParsed?.environmentDescription || sceneDescription || 'A scene environment',
        );

        const referenceImageUrls: string[] = [];
        const maxSceneImages = SCENE_PLANNING_POLICY.maxCandidateImages;
        for (let candidateIndex = 0; candidateIndex < maxSceneImages; candidateIndex += 1) {
          try {
            const imageResult = await invokeWithRouteFallback({
              stage: 'scene-planning-visual',
          capability: 'image.generate',
          traceId: input.traceId,
          checkHealth: async (capability, binding) => input.deps.aiClient.checkRouteHealth({ capability, binding }),
              invoke: async (binding) => input.deps.aiClient.generateImage({
                prompt: `Scene environment: ${environmentDescription}`,
                capability: 'image.generate',
                binding,
              }),
            });
            if (imageResult.fallbackAudit) {
              input.fallbackAudits.push(imageResult.fallbackAudit);
            }
            referenceImageUrls.push(
              String(imageResult.result.images[0]?.uri || `videoplay://scene/${sceneId}/candidate-${candidateIndex}.png`),
            );
          } catch {
            referenceImageUrls.push(`videoplay://scene/${sceneId}/candidate-${candidateIndex}.png`);
          }
        }

        scenes.push({
          sceneId,
          name: sceneName,
          environmentDescription,
          referenceImageUrls,
          selectedIndex: 0,
        });

        input.runEventFactory.pushEvent({
          step: input.step,
          eventType: 'step.chunk',
          attempt: input.attempt,
          stepInputHash: input.stepInputHash,
          lastCompletedUnit: sceneId,
          details: {
            sceneId,
            candidateImages: referenceImageUrls.length,
          },
        });
      }

      const scenePlanningOutput: ScenePlanningOutput = {
        storyId: input.pipelineInput.storyId,
        scenes,
      };

      const sceneParsed = ScenePlanningOutputSchema.safeParse(scenePlanningOutput);
      if (!sceneParsed.success) {
        throw new VideoPlayError({
          reasonCode: VIDEOPLAY_REASON.SCENE_PLANNING_FAILED,
          actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.SCENE_PLANNING_FAILED),
          stage: 'scene-planning',
          message: 'VIDEOPLAY_SCENE_PLANNING_OUTPUT_INVALID',
        });
      }

      input.snapshot.scenePlanning = sceneParsed.data;

      return {
        lastCompletedUnit: scenes[scenes.length - 1]?.sceneId ?? undefined,
        details: {
          sceneCount: scenes.length,
        },
      };
    }

    case 'episode-segmentation': {
      if (!input.snapshot.turnWindow) {
        throw new VideoPlayError({
          reasonCode: VIDEOPLAY_REASON.CHECKPOINT_INVALID,
          actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.CHECKPOINT_INVALID),
          stage: 'segment',
          message: 'VIDEOPLAY_SEGMENT_REQUIRES_TURN_WINDOW',
        });
      }

      const segmentation = segmentEpisodes({
        storyId: input.pipelineInput.storyId,
        ingestCursorStart: input.pipelineInput.ingestCursorStart,
        turns: input.snapshot.turnWindow.turns,
        policy: input.snapshot.policy,
      });

      const secondPass = segmentEpisodes({
        storyId: input.pipelineInput.storyId,
        ingestCursorStart: input.pipelineInput.ingestCursorStart,
        turns: input.snapshot.turnWindow.turns,
        policy: input.snapshot.policy,
      });
      if (JSON.stringify(segmentation) !== JSON.stringify(secondPass)) {
        throw new VideoPlayError({
          reasonCode: VIDEOPLAY_REASON.SEGMENTATION_NON_DETERMINISTIC,
          actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.SEGMENTATION_NON_DETERMINISTIC),
          stage: 'segment',
          message: 'VIDEOPLAY_SEGMENT_NON_DETERMINISTIC',
        });
      }

      const projectionLocale = resolvePromptLocale(
        (input.snapshot.projection?.systemContext as Record<string, unknown> | undefined)?.locale as string
        || (input.snapshot.projection?.systemContext as Record<string, unknown> | undefined)?.language as string
        || (input.snapshot.projection?.systemContext as Record<string, unknown> | undefined)?.promptLocale as string
        || '',
      );

      input.snapshot.segmentation = segmentation;
      input.snapshot.episodeContexts = segmentation.episodes.map((episode) => ({
        segmentedEpisode: episode,
        baselineSourceEventIds: [...episode.sourceEventIds],
        projectionLocale,
        screenplay: null,
        storyboard: null,
        assetOutput: null,
        candidateSelection: null,
        audioDesign: null,
        composeOutput: null,
        qcReport: null,
        releaseCandidate: null,
        episodeRecord: null,
      }));
      input.snapshot.episodes = [];
      input.snapshot.releaseCandidates = [];

      return {
        lastCompletedUnit: segmentation.episodes[segmentation.episodes.length - 1]?.episodeId ?? undefined,
        details: {
          episodeCount: segmentation.episodes.length,
          backlogTurnCount: segmentation.backlogTurnIds.length,
          nextIngestCursor: segmentation.nextIngestCursor,
        },
      };
    }

    case 'screenplay': {
      if (!input.snapshot.projection || input.snapshot.episodeContexts.length === 0) {
        throw new VideoPlayError({
          reasonCode: VIDEOPLAY_REASON.CHECKPOINT_INVALID,
          actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.CHECKPOINT_INVALID),
          stage: 'screenplay',
          message: 'VIDEOPLAY_SCREENPLAY_CONTEXT_MISSING',
        });
      }

      for (const context of input.snapshot.episodeContexts) {
        throwIfCanceled(input.control, input.step);
        const screenplayVars = {
          storyId: input.pipelineInput.storyId,
          episodeId: context.segmentedEpisode.episodeId,
          worldStyle: JSON.stringify(input.snapshot.projection.worldStyle),
          beatsJson: JSON.stringify(context.segmentedEpisode.turns.map((turn) => ({ turnId: turn.turnId, message: turn.userMessage }))),
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

        const screenplayPrompt = renderPromptTemplate('storyboard-plan', context.projectionLocale, screenplayValidated.data);

        const screenplayInvoke = await invokeWithRouteFallback({
          stage: 'screenplay',
          capability: 'text.generate',
          traceId: input.traceId,
          checkHealth: async (capability, binding) => input.deps.aiClient.checkRouteHealth({ capability, binding }),
          invoke: async (binding) => input.deps.aiClient.generateText({
            prompt: screenplayPrompt,
            systemPrompt: 'Return concise structured planning hints in JSON.',
            capability: 'text.generate',
            binding,
            maxTokens: 1024,
          }),
        });
        if (screenplayInvoke.fallbackAudit) {
          input.fallbackAudits.push(screenplayInvoke.fallbackAudit);
        }

        const screenplayStructured = parseStructuredModelOutput(screenplayInvoke.result.text);
        let screenplay = buildDeterministicScreenplay(context.segmentedEpisode);
        if (screenplayStructured && Array.isArray(screenplayStructured.beats)) {
          const beatsPayload = screenplayStructured.beats as unknown[];
          const deterministic = buildDeterministicScreenplay(context.segmentedEpisode);
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

        context.screenplay = screenplayParsed.data;

        input.runEventFactory.pushEvent({
          step: input.step,
          eventType: 'step.chunk',
          attempt: input.attempt,
          stepInputHash: input.stepInputHash,
          lastCompletedUnit: context.segmentedEpisode.episodeId,
          details: {
            episodeId: context.segmentedEpisode.episodeId,
            routeSource: screenplayInvoke.routeSource,
          },
        });
      }

      return {
        lastCompletedUnit: input.snapshot.episodeContexts[input.snapshot.episodeContexts.length - 1]?.segmentedEpisode.episodeId ?? undefined,
        details: {
          episodeCount: input.snapshot.episodeContexts.length,
        },
      };
    }

    case 'storyboard': {
      if (input.snapshot.episodeContexts.length === 0) {
        throw new VideoPlayError({
          reasonCode: VIDEOPLAY_REASON.CHECKPOINT_INVALID,
          actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.CHECKPOINT_INVALID),
          stage: 'storyboard',
          message: 'VIDEOPLAY_STORYBOARD_CONTEXT_MISSING',
        });
      }

      for (const context of input.snapshot.episodeContexts) {
        throwIfCanceled(input.control, input.step);
        if (!context.screenplay) {
          throw new VideoPlayError({
            reasonCode: VIDEOPLAY_REASON.CHECKPOINT_INVALID,
            actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.CHECKPOINT_INVALID),
            stage: 'storyboard',
            message: 'VIDEOPLAY_STORYBOARD_REQUIRES_SCREENPLAY',
            details: { episodeId: context.segmentedEpisode.episodeId },
          });
        }
        const screenplay = context.screenplay;

        const storyboardInvoke = await invokeWithRouteFallback({
          stage: 'storyboard',
          capability: 'text.generate',
          traceId: input.traceId,
          checkHealth: async (capability, binding) => input.deps.aiClient.checkRouteHealth({ capability, binding }),
          invoke: async (binding) => input.deps.aiClient.generateText({
            prompt: renderPromptTemplate('storyboard-plan', context.projectionLocale, {
              storyId: input.pipelineInput.storyId,
              episodeId: context.segmentedEpisode.episodeId,
              worldStyle: JSON.stringify(input.snapshot.projection?.worldStyle || {}),
              beatsJson: JSON.stringify(screenplay.beats.map((beat) => ({
                beatId: beat.beatId,
                summary: beat.summary,
                sourceEventIds: beat.sourceEventIds,
              }))),
            }),
            systemPrompt: 'Return JSON with episodeId, clipPlans, shotPlans, sourceEventIds.',
            capability: 'text.generate',
            binding,
            maxTokens: 1024,
          }),
        });
        if (storyboardInvoke.fallbackAudit) {
          input.fallbackAudits.push(storyboardInvoke.fallbackAudit);
        }

        // Phase 1: Planning — build deterministic storyboard + merge LLM hints
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
              const srcRecord = src as Record<string, unknown>;
              return {
                ...shot,
                visualPrompt: String(srcRecord.visualPrompt || shot.visualPrompt),
                motionCue: String(srcRecord.motionCue || shot.motionCue),
                shotType: String(srcRecord.shotType || shot.shotType),
                cameraMove: String(srcRecord.cameraMove || shot.cameraMove),
                characterIds: Array.isArray(srcRecord.characterIds)
                  ? (srcRecord.characterIds as string[])
                  : shot.characterIds,
                locationId: srcRecord.locationId !== undefined
                  ? (srcRecord.locationId as string | null)
                  : shot.locationId,
              };
            }),
          };
        }

        // Phase 2A: Cinematography — per-shot photography rules
        const cinematographyVars = {
          episodeId: context.segmentedEpisode.episodeId,
          shotId: storyboard.shotPlans[0]?.shotId || '',
          visualPrompt: storyboard.shotPlans[0]?.visualPrompt || '',
          shotType: storyboard.shotPlans[0]?.shotType || 'medium',
          sceneAtmosphere: 'neutral',
        };
        const cinematographyValidated = validatePromptVariables('storyboard-cinematography', cinematographyVars);
        if (cinematographyValidated.ok) {
          const cinematographyPrompt = renderPromptTemplate('storyboard-cinematography', context.projectionLocale, cinematographyValidated.data);
          try {
            const cinematographyResult = await invokeWithRouteFallback({
              stage: 'storyboard-cinematography',
          capability: 'text.generate',
          traceId: input.traceId,
          checkHealth: async (capability, binding) => input.deps.aiClient.checkRouteHealth({ capability, binding }),
              invoke: async (binding) => input.deps.aiClient.generateText({
                prompt: cinematographyPrompt,
                systemPrompt: 'Return JSON array of per-shot photography rules with composition, lighting, colorPalette, atmosphere.',
                capability: 'text.generate',
                binding,
                maxTokens: 1024,
              }),
            });
            if (cinematographyResult.fallbackAudit) {
              input.fallbackAudits.push(cinematographyResult.fallbackAudit);
            }
            const cinematographyParsed = parseStructuredModelOutput(cinematographyResult.result.text);
            const rulesArray = Array.isArray(cinematographyParsed?.rules)
              ? cinematographyParsed!.rules as unknown[]
              : Array.isArray(cinematographyParsed?.shots)
                ? cinematographyParsed!.shots as unknown[]
                : [];
            storyboard = {
              ...storyboard,
              shotPlans: storyboard.shotPlans.map((shot, idx) => {
                const rule = rulesArray[idx] as Record<string, unknown> | undefined;
                if (!rule) return shot;
                return {
                  ...shot,
                  photographyRule: {
                    composition: String(rule.composition || shot.photographyRule.composition),
                    lighting: String(rule.lighting || shot.photographyRule.lighting),
                    colorPalette: String(rule.colorPalette || shot.photographyRule.colorPalette),
                    atmosphere: String(rule.atmosphere || shot.photographyRule.atmosphere),
                    technicalNotes: String(rule.technicalNotes || shot.photographyRule.technicalNotes),
                  },
                };
              }),
            };
          } catch {
            // Cinematography enrichment is best-effort; keep defaults
          }
        }

        // Phase 2B: Acting — per-shot acting direction
        const actingVars = {
          episodeId: context.segmentedEpisode.episodeId,
          shotId: storyboard.shotPlans[0]?.shotId || '',
          characterIds: storyboard.shotPlans.flatMap((s) => s.characterIds).filter(Boolean).join(',') || 'none',
          beatSummary: screenplay.beats.map((b) => b.summary).join('; '),
        };
        const actingValidated = validatePromptVariables('storyboard-acting', actingVars);
        if (actingValidated.ok) {
          const actingPrompt = renderPromptTemplate('storyboard-acting', context.projectionLocale, actingValidated.data);
          try {
            const actingResult = await invokeWithRouteFallback({
              stage: 'storyboard-acting',
          capability: 'text.generate',
          traceId: input.traceId,
          checkHealth: async (capability, binding) => input.deps.aiClient.checkRouteHealth({ capability, binding }),
              invoke: async (binding) => input.deps.aiClient.generateText({
                prompt: actingPrompt,
                systemPrompt: 'Return JSON array of per-shot acting directions with characters array.',
                capability: 'text.generate',
                binding,
                maxTokens: 1024,
              }),
            });
            if (actingResult.fallbackAudit) {
              input.fallbackAudits.push(actingResult.fallbackAudit);
            }
            const actingParsed = parseStructuredModelOutput(actingResult.result.text);
            const actingArray = Array.isArray(actingParsed?.shots)
              ? actingParsed!.shots as unknown[]
              : Array.isArray(actingParsed?.directions)
                ? actingParsed!.directions as unknown[]
                : [];
            storyboard = {
              ...storyboard,
              shotPlans: storyboard.shotPlans.map((shot, idx) => {
                const dir = actingArray[idx] as Record<string, unknown> | undefined;
                if (!dir) return shot;
                const characters = Array.isArray(dir.characters)
                  ? (dir.characters as Array<Record<string, unknown>>).map((c) => ({
                    characterId: String(c.characterId || ''),
                    actingDescription: String(c.actingDescription || ''),
                  }))
                  : shot.actingDirection.characters;
                return {
                  ...shot,
                  actingDirection: { characters },
                };
              }),
            };
          } catch {
            // Acting enrichment is best-effort; keep defaults
          }
        }

        // Phase 3: Detail merge — generate final videoPrompt per shot
        storyboard = {
          ...storyboard,
          shotPlans: storyboard.shotPlans.map((shot) => ({
            ...shot,
            videoPrompt: `${shot.visualPrompt}. ${shot.photographyRule.composition} composition, ${shot.photographyRule.lighting} lighting, ${shot.photographyRule.atmosphere} atmosphere.${shot.actingDirection.characters.length > 0 ? ` Acting: ${shot.actingDirection.characters.map((c) => `${c.characterId}: ${c.actingDescription}`).join('; ')}.` : ''}`,
          })),
        };

        const storyboardParsed = StoryboardSchema.safeParse(storyboard);
        if (!storyboardParsed.success) {
          throw new VideoPlayError({
            reasonCode: VIDEOPLAY_REASON.STORYBOARD_SCHEMA_INVALID,
            actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.STORYBOARD_SCHEMA_INVALID),
            stage: 'storyboard',
            message: 'VIDEOPLAY_STORYBOARD_SCHEMA_INVALID',
          });
        }

        ensureSourceEventTraceability({
          baseline: new Set<string>(context.baselineSourceEventIds),
          episode: context.segmentedEpisode,
          screenplay,
          storyboard: storyboardParsed.data,
        });

        context.storyboard = storyboardParsed.data;

        input.runEventFactory.pushEvent({
          step: input.step,
          eventType: 'step.chunk',
          attempt: input.attempt,
          stepInputHash: input.stepInputHash,
          lastCompletedUnit: context.segmentedEpisode.episodeId,
          details: {
            episodeId: context.segmentedEpisode.episodeId,
            routeSource: storyboardInvoke.routeSource,
            shotCount: storyboardParsed.data.shotPlans.length,
          },
        });
      }

      return {
        lastCompletedUnit: input.snapshot.episodeContexts[input.snapshot.episodeContexts.length - 1]?.segmentedEpisode.episodeId ?? undefined,
        details: {
          episodeCount: input.snapshot.episodeContexts.length,
        },
      };
    }

    case 'asset-render': {
      if (input.snapshot.episodeContexts.length === 0) {
        throw new VideoPlayError({
          reasonCode: VIDEOPLAY_REASON.CHECKPOINT_INVALID,
          actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.CHECKPOINT_INVALID),
          stage: 'render',
          message: 'VIDEOPLAY_RENDER_CONTEXT_MISSING',
        });
      }

      for (const context of input.snapshot.episodeContexts) {
        throwIfCanceled(input.control, input.step);
        if (!context.storyboard || !context.screenplay) {
          throw new VideoPlayError({
            reasonCode: VIDEOPLAY_REASON.CHECKPOINT_INVALID,
            actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.CHECKPOINT_INVALID),
            stage: 'render',
            message: 'VIDEOPLAY_RENDER_REQUIRES_STORYBOARD_AND_SCREENPLAY',
            details: { episodeId: context.segmentedEpisode.episodeId },
          });
        }

        const analysisPlans = buildAssetAnalysisPlan({
          storyboard: context.storyboard,
          screenplay: context.screenplay,
          projectionLocale: context.projectionLocale,
        });
        const queuePlan = buildAssetRenderQueue({
          episodeId: context.segmentedEpisode.episodeId,
          plans: analysisPlans,
        });
        const analysisByShotId = new Map(analysisPlans.map((plan) => [plan.shotId, plan] as const));
        const queueItems = queuePlan.queueItems.map((item) => ({ ...item }));
        const voiceProfileCache = new Map<string, VoiceProfile>();

        const shotAssets: AssetRenderOutput['shotAssets'] = [];
        const clipAssets: AssetRenderOutput['clipAssets'] = [];
        const sourceEventMap: Record<string, string[]> = {};
        const renderedShotIds = new Set<string>();
        const renderedVoiceShotIds = new Set<string>();
        const lipSyncByShotId = new Map<string, RenderedAsset>();

        for (const plan of analysisPlans) {
          sourceEventMap[plan.shotId] = [...plan.sourceEventIds];
        }
        const plannedVoiceShots = analysisPlans.filter((plan) => plan.requiredModalities.includes('voice')).length;

        input.runEventFactory.pushEvent({
          step: input.step,
          eventType: 'step.chunk',
          attempt: input.attempt,
          stepInputHash: input.stepInputHash,
          lastCompletedUnit: context.segmentedEpisode.episodeId,
          details: {
            episodeId: context.segmentedEpisode.episodeId,
            phase: 'voice-analyze',
            plannedShots: analysisPlans.length,
            plannedVoiceShots,
          },
        });

        for (const batch of queuePlan.batches) {
          let batchSucceeded = 0;
          let batchFailed = 0;
          let batchLipSyncGenerated = 0;
          for (const queueItem of queueItems.filter((item) => item.batchId === batch.batchId)) {
            throwIfCanceled(input.control, input.step);
            const plan = analysisByShotId.get(queueItem.shotId);
            if (!plan) {
              queueItem.status = 'FAILED';
              queueItem.errorMessage = 'VIDEOPLAY_RENDER_QUEUE_PLAN_MISSING';
              batchFailed += 1;
              continue;
            }
            const storyboardShot = context.storyboard.shotPlans.find((shot) => shot.shotId === plan.shotId);
            if (!storyboardShot) {
              queueItem.status = 'FAILED';
              queueItem.errorMessage = 'VIDEOPLAY_RENDER_QUEUE_SHOT_MISSING';
              batchFailed += 1;
              continue;
            }

            queueItem.status = 'RUNNING';

            try {
              if (queueItem.modality === 'image') {
                const candidateCount = CHARACTER_CASTING_POLICY.maxCandidateImages;
                for (let ci = 0; ci < candidateCount; ci += 1) {
                  const imageResult = await invokeWithRouteFallback({
                    stage: 'asset-render-image',
          capability: 'image.generate',
          traceId: input.traceId,
          checkHealth: async (capability, binding) => input.deps.aiClient.checkRouteHealth({ capability, binding }),
                    invoke: async (binding) => input.deps.aiClient.generateImage({
                      prompt: storyboardShot.visualPrompt,
                      capability: 'image.generate',
                      binding,
                    }),
                  });
                  if (imageResult.fallbackAudit) {
                    input.fallbackAudits.push(imageResult.fallbackAudit);
                  }
                  queueItem.routeSource = imageResult.routeSource;
                  shotAssets.push({
                    assetId: createUlid(),
                    episodeId: context.segmentedEpisode.episodeId,
                    shotId: storyboardShot.shotId,
                    clipId: storyboardShot.clipId,
                    assetType: 'image',
                    uri: String(imageResult.result.images[0]?.uri || `videoplay://image/${context.segmentedEpisode.episodeId}/${storyboardShot.shotId}_${ci}.png`),
                    mimeType: String(imageResult.result.images[0]?.mimeType || 'image/png'),
                    durationMs: storyboardShot.durationMs,
                    fps: 30,
                    resolution: '1920x1080',
                    sourceEventIds: [...storyboardShot.sourceEventIds],
                    routeSource: imageResult.routeSource,
                    metadata: {
                      promptId: VIDEOPLAY_PROMPT_ID.STORYBOARD_PLAN,
                      queueItemId: queueItem.queueItemId,
                      candidateIndex: ci,
                    },
                  });
                }
                queueItem.status = 'SUCCEEDED';
                batchSucceeded += 1;
                continue;
              }

              if (queueItem.modality === 'video') {
                const shotRequiresVoice = plan.requiredModalities.includes('voice');
                const lipSyncAsset = lipSyncByShotId.get(storyboardShot.shotId);
                if (shotRequiresVoice && !lipSyncAsset) {
                  throw new VideoPlayError({
                    reasonCode: VIDEOPLAY_REASON.VOICE_RENDER_FAILED,
                    actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.VOICE_RENDER_FAILED),
                    stage: 'render',
                    message: 'VIDEOPLAY_LIP_SYNC_REQUIRED_BEFORE_VIDEO',
                    details: {
                      shotId: storyboardShot.shotId,
                    },
                  });
                }
                const videoResult = await invokeWithRouteFallback({
                  stage: 'asset-render-video',
          capability: 'video.generate',
          traceId: input.traceId,
          checkHealth: async (capability, binding) => input.deps.aiClient.checkRouteHealth({ capability, binding }),
                  invoke: async (binding) => input.deps.aiClient.generateVideo({
                    mode: 't2v',
                    prompt: `${storyboardShot.visualPrompt}. motion=${storyboardShot.motionCue}${lipSyncAsset ? `. lipSyncAnchors=${JSON.stringify((lipSyncAsset.metadata as Record<string, unknown>).anchors || [])}` : ''}`,
                    content: [
                      {
                        type: 'text',
                        role: 'prompt',
                        text: storyboardShot.videoPrompt || storyboardShot.visualPrompt,
                      },
                    ],
                    capability: 'video.generate',
                    binding,
                    options: {
                      durationSec: Math.max(1, Math.round(storyboardShot.durationMs / 1000)),
                    },
                  }),
                });
                if (videoResult.fallbackAudit) {
                  input.fallbackAudits.push(videoResult.fallbackAudit);
                }
                queueItem.status = 'SUCCEEDED';
                queueItem.routeSource = videoResult.routeSource;
                shotAssets.push({
                  assetId: createUlid(),
                  episodeId: context.segmentedEpisode.episodeId,
                  shotId: storyboardShot.shotId,
                  clipId: storyboardShot.clipId,
                  assetType: 'video',
                  uri: String(videoResult.result.videos[0]?.uri || `videoplay://video/${context.segmentedEpisode.episodeId}/${storyboardShot.shotId}.mp4`),
                  mimeType: String(videoResult.result.videos[0]?.mimeType || 'video/mp4'),
                  durationMs: storyboardShot.durationMs,
                  fps: 30,
                  resolution: '1920x1080',
                  sourceEventIds: [...storyboardShot.sourceEventIds],
                  routeSource: videoResult.routeSource,
                  metadata: {
                    motionCue: storyboardShot.motionCue,
                    queueItemId: queueItem.queueItemId,
                  },
                });
                renderedShotIds.add(storyboardShot.shotId);
                batchSucceeded += 1;
                continue;
              }

              const voiceResult = await invokeWithRouteFallback({
                stage: 'asset-render-voice',
          capability: 'audio.synthesize',
          traceId: input.traceId,
          checkHealth: async (capability, binding) => input.deps.aiClient.checkRouteHealth({ capability, binding }),
                invoke: async (binding) => {
                  const routeSource = binding?.source === 'token-api' ? 'token-api' : 'local-runtime';
                  const cacheKey = `${routeSource}:${plan.language}`;
                  let profile = voiceProfileCache.get(cacheKey);
                  if (!profile) {
                    profile = await resolveVoiceProfile({
                      deps: input.deps,
                      binding,
                      preferredLanguage: plan.language,
                    });
                    voiceProfileCache.set(cacheKey, profile);
                  }
                  const speech = await input.deps.aiClient.synthesizeSpeech({
                    text: plan.voiceLineText,
                    voiceId: profile.voiceId,
                    ...(profile.providerId ? { providerId: profile.providerId } : {}),
                    language: profile.language || plan.language,
                    format: 'mp3',
                    capability: 'audio.synthesize',
                    binding,
                  });
                  return {
                    speech,
                    profile,
                  };
                },
              });
              if (voiceResult.fallbackAudit) {
                input.fallbackAudits.push(voiceResult.fallbackAudit);
              }
              queueItem.status = 'SUCCEEDED';
              queueItem.routeSource = voiceResult.routeSource;
              const voiceDurationMs = Number(voiceResult.result.speech.durationMs ?? storyboardShot.durationMs);
              const voiceAssetId = createUlid();
              shotAssets.push({
                assetId: createUlid(),
                episodeId: context.segmentedEpisode.episodeId,
                shotId: storyboardShot.shotId,
                clipId: storyboardShot.clipId,
                assetType: 'voice-script',
                uri: `videoplay://voice-script/${context.segmentedEpisode.episodeId}/${storyboardShot.shotId}.json`,
                mimeType: 'application/json',
                durationMs: voiceDurationMs,
                fps: 1,
                resolution: 'n/a',
                sourceEventIds: [...storyboardShot.sourceEventIds],
                routeSource: voiceResult.routeSource,
                metadata: {
                  queueItemId: queueItem.queueItemId,
                  language: voiceResult.result.profile.language || plan.language,
                  voiceId: voiceResult.result.profile.voiceId,
                  providerId: voiceResult.result.profile.providerId || '',
                  text: plan.voiceLineText,
                  source: 'runtime-tts',
                },
              });
              shotAssets.push({
                assetId: voiceAssetId,
                episodeId: context.segmentedEpisode.episodeId,
                shotId: storyboardShot.shotId,
                clipId: storyboardShot.clipId,
                assetType: 'voice-audio',
                uri: String(voiceResult.result.speech.audioUri || `videoplay://voice/${context.segmentedEpisode.episodeId}/${storyboardShot.shotId}.mp3`),
                mimeType: String(voiceResult.result.speech.mimeType || 'audio/mpeg'),
                durationMs: voiceDurationMs,
                fps: 1,
                resolution: 'audio-only',
                sourceEventIds: [...storyboardShot.sourceEventIds],
                routeSource: voiceResult.routeSource,
                metadata: {
                  queueItemId: queueItem.queueItemId,
                  voiceId: voiceResult.result.profile.voiceId,
                  providerId: voiceResult.result.profile.providerId || '',
                  language: voiceResult.result.profile.language || plan.language,
                  transcriptHash: createHash(plan.voiceLineText),
                },
              });
              const lipSyncAsset: RenderedAsset = {
                assetId: createUlid(),
                episodeId: context.segmentedEpisode.episodeId,
                shotId: storyboardShot.shotId,
                clipId: storyboardShot.clipId,
                assetType: 'lip-sync',
                uri: `videoplay://lip-sync/${context.segmentedEpisode.episodeId}/${storyboardShot.shotId}.json`,
                mimeType: 'application/json',
                durationMs: voiceDurationMs,
                fps: 30,
                resolution: 'n/a',
                sourceEventIds: [...storyboardShot.sourceEventIds],
                routeSource: voiceResult.routeSource,
                metadata: {
                  queueItemId: queueItem.queueItemId,
                  source: 'voice-audio-derived',
                  anchors: buildLipSyncAnchors({
                    text: plan.voiceLineText,
                    durationMs: voiceDurationMs,
                  }),
                  voiceAssetId,
                  transcriptHash: createHash(plan.voiceLineText),
                },
              };
              shotAssets.push(lipSyncAsset);
              lipSyncByShotId.set(storyboardShot.shotId, lipSyncAsset);
              renderedVoiceShotIds.add(storyboardShot.shotId);
              batchLipSyncGenerated += 1;
              batchSucceeded += 1;
            } catch (error) {
              queueItem.status = 'FAILED';
              queueItem.errorMessage = error instanceof Error ? error.message : String(error || '');
              batchFailed += 1;
              emitVideoPlayLog({
                level: 'warn',
                message: `videoplay:asset-render:${queueItem.modality}-failed`,
                details: {
                  shotId: queueItem.shotId,
                  queueItemId: queueItem.queueItemId,
                  error: queueItem.errorMessage,
                },
              });
            }
          }

          input.runEventFactory.pushEvent({
            step: input.step,
            eventType: 'step.chunk',
            attempt: input.attempt,
            stepInputHash: input.stepInputHash,
            lastCompletedUnit: context.segmentedEpisode.episodeId,
            details: {
              episodeId: context.segmentedEpisode.episodeId,
              phase: 'batch-queue-execute',
              batchId: batch.batchId,
              modality: batch.modality,
              queueItems: batch.queueItemIds.length,
              succeeded: batchSucceeded,
              failed: batchFailed,
            },
          });

          if (batch.modality === 'voice') {
            input.runEventFactory.pushEvent({
              step: input.step,
              eventType: 'step.chunk',
              attempt: input.attempt,
              stepInputHash: input.stepInputHash,
              lastCompletedUnit: context.segmentedEpisode.episodeId,
              details: {
                episodeId: context.segmentedEpisode.episodeId,
                phase: 'voice-render',
                succeeded: batchSucceeded,
                failed: batchFailed,
              },
            });
            input.runEventFactory.pushEvent({
              step: input.step,
              eventType: 'step.chunk',
              attempt: input.attempt,
              stepInputHash: input.stepInputHash,
              lastCompletedUnit: context.segmentedEpisode.episodeId,
              details: {
                episodeId: context.segmentedEpisode.episodeId,
                phase: 'lip-sync',
                generated: batchLipSyncGenerated,
              },
            });
          } else if (batch.modality === 'video') {
            input.runEventFactory.pushEvent({
              step: input.step,
              eventType: 'step.chunk',
              attempt: input.attempt,
              stepInputHash: input.stepInputHash,
              lastCompletedUnit: context.segmentedEpisode.episodeId,
              details: {
                episodeId: context.segmentedEpisode.episodeId,
                phase: 'video-render',
                succeeded: batchSucceeded,
                failed: batchFailed,
              },
            });
          }
        }

        for (const clip of context.storyboard.clipPlans) {
          const representative = shotAssets.find((asset) => asset.clipId === clip.clipId && asset.assetType === 'video');
          if (representative) {
            clipAssets.push({
              ...representative,
              assetId: createUlid(),
              shotId: representative.shotId,
            });
          }
        }

        const plannedShots = context.storyboard.shotPlans.length;
        const renderedShots = renderedShotIds.size;
        const renderedVoiceShots = renderedVoiceShotIds.size;
        const assetOutput: AssetRenderOutput = {
          episodeId: context.segmentedEpisode.episodeId,
          clipAssets,
          shotAssets,
          sourceEventMap,
          renderTrace: {
            plannedShots,
            renderedShots,
            analysis: {
              shotPlans: analysisPlans.map((plan) => ({
                shotId: plan.shotId,
                beatId: plan.beatId,
                complexity: plan.complexity,
                priority: plan.priority,
                requiredModalities: [...plan.requiredModalities],
                voiceLineHash: createHash(plan.voiceLineText),
              })),
            },
            queue: {
              batches: queuePlan.batches,
              items: queueItems,
              totalJobs: queueItems.length,
              succeededJobs: queueItems.filter((item) => item.status === 'SUCCEEDED').length,
              failedJobs: queueItems.filter((item) => item.status === 'FAILED').length,
            },
          },
          coverage: {
            plannedShots,
            renderedShots,
            ratio: plannedShots > 0
              ? Number((renderedShots / plannedShots).toFixed(6))
              : 0,
            plannedVoiceShots,
            renderedVoiceShots,
            voiceRatio: plannedVoiceShots > 0
              ? Number((renderedVoiceShots / plannedVoiceShots).toFixed(6))
              : 1,
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

        context.assetOutput = assetParsed.data;

        input.runEventFactory.pushEvent({
          step: input.step,
          eventType: 'step.chunk',
          attempt: input.attempt,
          stepInputHash: input.stepInputHash,
          lastCompletedUnit: context.segmentedEpisode.episodeId,
          details: {
            episodeId: context.segmentedEpisode.episodeId,
            coverage: assetParsed.data.coverage.ratio,
            voiceCoverage: assetParsed.data.coverage.voiceRatio,
            queueFailedJobs: queueItems.filter((item) => item.status === 'FAILED').length,
          },
        });
      }

      return {
        lastCompletedUnit: input.snapshot.episodeContexts[input.snapshot.episodeContexts.length - 1]?.segmentedEpisode.episodeId ?? undefined,
        details: {
          episodeCount: input.snapshot.episodeContexts.length,
        },
      };
    }

    case 'candidate-selection': {
      for (const context of input.snapshot.episodeContexts) {
        throwIfCanceled(input.control, input.step);
        if (!context.assetOutput || !context.storyboard) {
          throw new VideoPlayError({
            reasonCode: VIDEOPLAY_REASON.CHECKPOINT_INVALID,
            actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.CHECKPOINT_INVALID),
            stage: 'candidate-selection',
            message: 'VIDEOPLAY_CANDIDATE_SELECTION_REQUIRES_ASSETS',
            details: { episodeId: context.segmentedEpisode.episodeId },
          });
        }

        const shotOrder = new Map(
          context.storyboard.shotPlans
            .slice()
            .sort((left, right) => left.startMs - right.startMs)
            .map((shot, index) => [shot.shotId, index] as const),
        );
        const selectedSegments: SelectedTimelineSegment[] = context.assetOutput.shotAssets
          .filter((asset) => asset.assetType === 'video')
          .slice()
          .sort((left, right) => {
            const leftOrder = shotOrder.get(left.shotId) ?? Number.MAX_SAFE_INTEGER;
            const rightOrder = shotOrder.get(right.shotId) ?? Number.MAX_SAFE_INTEGER;
            if (leftOrder !== rightOrder) {
              return leftOrder - rightOrder;
            }
            return left.assetId.localeCompare(right.assetId);
          })
          .map((asset, order) => ({
            assetId: asset.assetId,
            shotId: asset.shotId,
            order,
            trimInMs: null,
            trimOutMs: null,
          }));
        if (selectedSegments.length === 0) {
          throw new VideoPlayError({
            reasonCode: VIDEOPLAY_REASON.CANDIDATE_SELECTION_FAILED,
            actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.CANDIDATE_SELECTION_FAILED),
            stage: 'candidate-selection',
            message: 'VIDEOPLAY_NO_VIDEO_SEGMENTS_FOR_SELECTION',
            details: { episodeId: context.segmentedEpisode.episodeId },
          });
        }

        const candidateOutput: CandidateSelectionOutput = {
          episodeId: context.segmentedEpisode.episodeId,
          selectedAssetIds: CANDIDATE_SELECTION_POLICY.autoSelectAllRenderedVideo
            ? selectedSegments.map((segment) => segment.assetId)
            : [],
          timelineSegments: selectedSegments,
        };

        const candidateParsed = CandidateSelectionOutputSchema.safeParse(candidateOutput);
        if (!candidateParsed.success) {
          throw new VideoPlayError({
            reasonCode: VIDEOPLAY_REASON.CANDIDATE_SELECTION_FAILED,
            actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.CANDIDATE_SELECTION_FAILED),
            stage: 'candidate-selection',
            message: 'VIDEOPLAY_CANDIDATE_SELECTION_OUTPUT_INVALID',
          });
        }

        context.candidateSelection = candidateParsed.data;

        input.runEventFactory.pushEvent({
          step: input.step,
          eventType: 'step.chunk',
          attempt: input.attempt,
          stepInputHash: input.stepInputHash,
          lastCompletedUnit: context.segmentedEpisode.episodeId,
          details: {
            episodeId: context.segmentedEpisode.episodeId,
            selectedSegmentCount: selectedSegments.length,
            selectedAssetCount: candidateOutput.selectedAssetIds.length,
          },
        });
      }

      return {
        lastCompletedUnit: input.snapshot.episodeContexts[input.snapshot.episodeContexts.length - 1]?.segmentedEpisode.episodeId ?? undefined,
        details: {
          episodeCount: input.snapshot.episodeContexts.length,
        },
      };
    }

    case 'audio-design': {
      for (const context of input.snapshot.episodeContexts) {
        throwIfCanceled(input.control, input.step);
        if (!context.storyboard || !context.screenplay) {
          throw new VideoPlayError({
            reasonCode: VIDEOPLAY_REASON.CHECKPOINT_INVALID,
            actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.CHECKPOINT_INVALID),
            stage: 'audio-design',
            message: 'VIDEOPLAY_AUDIO_DESIGN_REQUIRES_STORYBOARD',
            details: { episodeId: context.segmentedEpisode.episodeId },
          });
        }

        const totalDurationMs = context.storyboard.shotPlans.reduce((sum, shot) => sum + shot.durationMs, 0);
        const audioVars = {
          episodeId: context.segmentedEpisode.episodeId,
          beatsSummary: context.screenplay.beats.map((beat) => beat.summary).join('; '),
          shotCount: String(context.storyboard.shotPlans.length),
          totalDurationMs: String(totalDurationMs),
        };
        const audioValidated = validatePromptVariables('audio-design', audioVars);
        if (!audioValidated.ok) {
          throw new VideoPlayError({
            reasonCode: VIDEOPLAY_REASON.AUDIO_DESIGN_FAILED,
            actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.AUDIO_DESIGN_FAILED),
            stage: 'audio-design',
            message: audioValidated.issues.join(';'),
          });
        }

        const audioPrompt = renderPromptTemplate('audio-design', context.projectionLocale, audioValidated.data);

        const audioResult = await invokeWithRouteFallback({
          stage: 'audio-design-bgm',
          capability: 'text.generate',
          traceId: input.traceId,
          checkHealth: async (capability, binding) => input.deps.aiClient.checkRouteHealth({ capability, binding }),
          invoke: async (binding) => input.deps.aiClient.generateText({
            prompt: audioPrompt,
            systemPrompt: 'Return JSON with bgmRecommendation and sfxPlan.',
            capability: 'text.generate',
            binding,
            maxTokens: 512,
          }),
        });
        if (audioResult.fallbackAudit) {
          input.fallbackAudits.push(audioResult.fallbackAudit);
        }

        const audioParsed = parseStructuredModelOutput(audioResult.result.text);
        const bgmRec = audioParsed?.bgmRecommendation as Record<string, unknown> | undefined;
        const bgmTrack: BgmTrack = {
          trackId: createUlid(),
          uri: String(bgmRec?.uri || `videoplay://bgm/${context.segmentedEpisode.episodeId}.mp3`),
          durationMs: totalDurationMs,
          fadeInMs: AUDIO_DESIGN_POLICY.defaultFadeInMs,
          fadeOutMs: AUDIO_DESIGN_POLICY.defaultFadeOutMs,
          volume: AUDIO_DESIGN_POLICY.defaultBgmVolume,
          startOffsetMs: 0,
        };

        const sfxPlanRaw = Array.isArray(audioParsed?.sfxPlan) ? audioParsed!.sfxPlan : [];
        const sfxLayers: SfxLayer[] = sfxPlanRaw.map((entry: unknown, sfxIndex: number) => {
          const sfxEntry = entry as Record<string, unknown>;
          return {
            sfxId: createUlid(),
            uri: String(sfxEntry.uri || `videoplay://sfx/${context.segmentedEpisode.episodeId}/sfx-${sfxIndex}.mp3`),
            startMs: Number(sfxEntry.startMs || 0),
            endMs: Number(sfxEntry.endMs || totalDurationMs),
            volume: AUDIO_DESIGN_POLICY.defaultSfxVolume,
          };
        });

        const audioDesignOutput: AudioDesignOutput = {
          episodeId: context.segmentedEpisode.episodeId,
          bgmTrack,
          sfxLayers,
        };

        const audioDesignParsed = AudioDesignOutputSchema.safeParse(audioDesignOutput);
        if (!audioDesignParsed.success) {
          throw new VideoPlayError({
            reasonCode: VIDEOPLAY_REASON.AUDIO_DESIGN_FAILED,
            actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.AUDIO_DESIGN_FAILED),
            stage: 'audio-design',
            message: 'VIDEOPLAY_AUDIO_DESIGN_OUTPUT_INVALID',
          });
        }

        context.audioDesign = audioDesignParsed.data;

        input.runEventFactory.pushEvent({
          step: input.step,
          eventType: 'step.chunk',
          attempt: input.attempt,
          stepInputHash: input.stepInputHash,
          lastCompletedUnit: context.segmentedEpisode.episodeId,
          details: {
            episodeId: context.segmentedEpisode.episodeId,
            hasBgm: bgmTrack !== null,
            sfxLayerCount: sfxLayers.length,
            routeSource: audioResult.routeSource,
          },
        });
      }

      return {
        lastCompletedUnit: input.snapshot.episodeContexts[input.snapshot.episodeContexts.length - 1]?.segmentedEpisode.episodeId ?? undefined,
        details: {
          episodeCount: input.snapshot.episodeContexts.length,
        },
      };
    }

    case 'edit-compose': {
      for (const context of input.snapshot.episodeContexts) {
        throwIfCanceled(input.control, input.step);
        if (!context.storyboard || !context.assetOutput || !context.candidateSelection) {
          throw new VideoPlayError({
            reasonCode: VIDEOPLAY_REASON.CHECKPOINT_INVALID,
            actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.CHECKPOINT_INVALID),
            stage: 'edit',
            message: 'VIDEOPLAY_EDIT_REQUIRES_STORYBOARD_ASSET_SELECTION',
            details: { episodeId: context.segmentedEpisode.episodeId },
          });
        }

        const composeOutput = composeEpisode({
          episodeId: context.segmentedEpisode.episodeId,
          storyboard: context.storyboard,
          assetOutput: context.assetOutput,
          candidateSelection: context.candidateSelection,
        });
        if (context.audioDesign) {
          composeOutput.bgmTrack = context.audioDesign.bgmTrack;
          composeOutput.sfxLayers = [...context.audioDesign.sfxLayers];
        }

        context.composeOutput = composeOutput;

        input.runEventFactory.pushEvent({
          step: input.step,
          eventType: 'step.chunk',
          attempt: input.attempt,
          stepInputHash: input.stepInputHash,
          lastCompletedUnit: context.segmentedEpisode.episodeId,
          details: {
            episodeId: context.segmentedEpisode.episodeId,
            durationMs: composeOutput.episodeMasterVideo.durationMs,
          },
        });
      }

      return {
        lastCompletedUnit: input.snapshot.episodeContexts[input.snapshot.episodeContexts.length - 1]?.segmentedEpisode.episodeId ?? undefined,
        details: {
          episodeCount: input.snapshot.episodeContexts.length,
        },
      };
    }

    case 'qc-gate': {
      for (const context of input.snapshot.episodeContexts) {
        throwIfCanceled(input.control, input.step);
        if (!context.screenplay || !context.storyboard || !context.assetOutput || !context.composeOutput) {
          throw new VideoPlayError({
            reasonCode: VIDEOPLAY_REASON.CHECKPOINT_INVALID,
            actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.CHECKPOINT_INVALID),
            stage: 'qc',
            message: 'VIDEOPLAY_QC_REQUIRES_UPSTREAM_OUTPUTS',
            details: { episodeId: context.segmentedEpisode.episodeId },
          });
        }

        const qcReport = evaluateQualityGates({
          baselineSourceEventIds: new Set<string>(context.baselineSourceEventIds),
          episode: context.segmentedEpisode,
          screenplay: context.screenplay,
          storyboard: context.storyboard,
          assetOutput: context.assetOutput,
          composeOutput: context.composeOutput,
        });

        if (qcReport.status === 'REJECTED') {
          const reasonCode = qcReport.failReasonCode || VIDEOPLAY_REASON.QC_FAILED;
          throw new VideoPlayError({
            reasonCode,
            actionHint: actionHintByReasonCode(reasonCode),
            stage: 'qc',
            message: 'VIDEOPLAY_QC_REJECTED_FAIL_CLOSE',
            details: {
              episodeId: context.segmentedEpisode.episodeId,
              gates: qcReport.gates,
            },
          });
        }

        context.qcReport = qcReport;

        input.runEventFactory.pushEvent({
          step: input.step,
          eventType: 'step.chunk',
          attempt: input.attempt,
          stepInputHash: input.stepInputHash,
          lastCompletedUnit: context.segmentedEpisode.episodeId,
          details: {
            episodeId: context.segmentedEpisode.episodeId,
            status: qcReport.status,
          },
        });
      }

      return {
        lastCompletedUnit: input.snapshot.episodeContexts[input.snapshot.episodeContexts.length - 1]?.segmentedEpisode.episodeId ?? undefined,
        details: {
          episodeCount: input.snapshot.episodeContexts.length,
        },
      };
    }

    case 'release-package': {
      const episodes: EpisodeRecord[] = [];
      const releaseCandidates: ReleasePackage[] = [];

      for (const context of input.snapshot.episodeContexts) {
        throwIfCanceled(input.control, input.step);
        if (!context.screenplay || !context.storyboard || !context.assetOutput || !context.composeOutput || !context.qcReport) {
          throw new VideoPlayError({
            reasonCode: VIDEOPLAY_REASON.CHECKPOINT_INVALID,
            actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.CHECKPOINT_INVALID),
            stage: 'package',
            message: 'VIDEOPLAY_RELEASE_REQUIRES_UPSTREAM_OUTPUTS',
            details: { episodeId: context.segmentedEpisode.episodeId },
          });
        }
        if (!(context.qcReport.status === 'APPROVED' || context.qcReport.status === 'ADJUSTED')) {
          throw new VideoPlayError({
            reasonCode: VIDEOPLAY_REASON.RELEASE_PACKAGE_INVALID,
            actionHint: actionHintByReasonCode(VIDEOPLAY_REASON.RELEASE_PACKAGE_INVALID),
            stage: 'package',
            message: 'VIDEOPLAY_RELEASE_QC_STATUS_INVALID',
            details: { episodeId: context.segmentedEpisode.episodeId },
          });
        }

        const releaseCandidate: ReleasePackage = {
          releaseId: createUlid(),
          episodeId: context.segmentedEpisode.episodeId,
          qcStatus: context.qcReport.status,
          episodeMasterVideo: context.composeOutput.episodeMasterVideo,
          episodePoster: context.composeOutput.episodePoster,
          episodeCaptionTrack: context.composeOutput.episodeCaptionTrack,
          episodeMetadata: {
            storyId: input.pipelineInput.storyId,
            sourceTurnIds: [...context.segmentedEpisode.sourceTurnIds],
            sourceEventIds: [...context.segmentedEpisode.sourceEventIds],
            durationSec: context.qcReport.durationSec,
            policyHash: context.segmentedEpisode.policyHash,
          },
          episodeTraceBundle: {
            traceId: input.traceId,
            runId: input.runId,
            fallbackAudits: [...input.fallbackAudits],
            runEvents: [...input.runEventFactory.events],
            sourceCoverage: buildTraceCoverage({
              episode: context.segmentedEpisode,
              screenplay: context.screenplay,
              storyboard: context.storyboard,
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
          episodeId: context.segmentedEpisode.episodeId,
          storyId: input.pipelineInput.storyId,
          sourceTurnIds: [...context.segmentedEpisode.sourceTurnIds],
          sourceEventIds: [...context.segmentedEpisode.sourceEventIds],
          policyHash: context.segmentedEpisode.policyHash,
          segmentationReason: context.segmentedEpisode.segmentationReason,
          screenplay: context.screenplay,
          storyboard: context.storyboard,
          quality: context.qcReport,
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
                operator: input.pipelineInput.operator || 'system',
                timestamp: nowIso(),
              },
            ],
            conflictRecords: [],
          },
        };

        const episodeIdempotencyKey = createHash(`${input.runId}:${episodeRecord.episodeId}:episode-upsert`);
        const assetIdempotencyKey = createHash(`${input.runId}:${episodeRecord.episodeId}:asset-upsert`);

        await input.deps.hookClient.data.query({
          capability: VIDEOPLAY_DATA_API_EPISODE_UPSERT,
          query: {
            operation: 'upsert',
            idempotencyKey: episodeIdempotencyKey,
            episode: episodeRecord,
          },
        });

        await input.deps.hookClient.data.query({
          capability: VIDEOPLAY_DATA_API_ASSET_BATCH_UPSERT,
          query: {
            operation: 'upsert',
            idempotencyKey: assetIdempotencyKey,
            episodeId: episodeRecord.episodeId,
            assets: context.assetOutput.shotAssets,
          },
        });

        context.releaseCandidate = releaseParsed.data;
        context.episodeRecord = episodeRecord;

        if (context.candidateSelection) {
          await input.deps.hookClient.data.query({
            capability: VIDEOPLAY_DATA_API_EPISODE_UPSERT,
            query: {
              operation: 'upsert-candidate-selection',
              episodeId: episodeRecord.episodeId,
              candidateSelection: context.candidateSelection,
            },
          });
        }
        if (context.audioDesign) {
          await input.deps.hookClient.data.query({
            capability: VIDEOPLAY_DATA_API_EPISODE_UPSERT,
            query: {
              operation: 'upsert-audio-design',
              episodeId: episodeRecord.episodeId,
              audioDesign: context.audioDesign,
            },
          });
        }

        episodes.push(episodeRecord);
        releaseCandidates.push(releaseParsed.data);

        input.runEventFactory.pushEvent({
          step: input.step,
          eventType: 'step.chunk',
          attempt: input.attempt,
          stepInputHash: input.stepInputHash,
          lastCompletedUnit: context.segmentedEpisode.episodeId,
          idempotencyKey: episodeIdempotencyKey,
          details: {
            episodeId: context.segmentedEpisode.episodeId,
            releaseId: releaseParsed.data.releaseId,
            assetIdempotencyKey,
          },
        });
      }

      if (input.snapshot.characterCasting) {
        await input.deps.hookClient.data.query({
          capability: VIDEOPLAY_DATA_API_EPISODE_UPSERT,
          query: {
            operation: 'upsert-character-casting',
            storyId: input.pipelineInput.storyId,
            characterCasting: input.snapshot.characterCasting,
          },
        });
      }
      if (input.snapshot.scenePlanning) {
        await input.deps.hookClient.data.query({
          capability: VIDEOPLAY_DATA_API_EPISODE_UPSERT,
          query: {
            operation: 'upsert-scene-planning',
            storyId: input.pipelineInput.storyId,
            scenePlanning: input.snapshot.scenePlanning,
          },
        });
      }

      input.snapshot.episodes = episodes;
      input.snapshot.releaseCandidates = releaseCandidates;

      return {
        lastCompletedUnit: episodes[episodes.length - 1]?.episodeId ?? undefined,
        details: {
          episodeCount: episodes.length,
          releaseCandidateCount: releaseCandidates.length,
        },
      };
    }

    default:
      return {};
  }
}

export async function runVideoPlayEpisodeProduction(
  deps: VideoPlayPipelineDeps,
  input: VideoPlayPipelineInput,
): Promise<VideoPlayPipelineResult> {
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
    } catch (error) {
      const normalized = toVideoPlayError(error, fallbackForStep(step));
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
