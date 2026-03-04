import { z } from 'zod';
import {
  VIDEOPLAY_OPERATION_TYPE,
  VIDEOPLAY_PIPELINE_CHAIN,
  VIDEOPLAY_REASON,
  VIDEOPLAY_ROUTE_STAGES,
  VIDEOPLAY_STORY_SOURCE_MODE,
} from './contracts.js';

const VideoPlayReasonCodeSchema = z.enum([
  VIDEOPLAY_REASON.INPUT_INVALID,
  VIDEOPLAY_REASON.FACT_PROJECTION_INVALID,
  VIDEOPLAY_REASON.STORY_PACKAGE_INVALID,
  VIDEOPLAY_REASON.STORY_SOURCE_UNAVAILABLE,
  VIDEOPLAY_REASON.STAGE_PRECONDITION_BLOCKED,
  VIDEOPLAY_REASON.STAGE_ADVANCE_REQUIRED,
  VIDEOPLAY_REASON.SEGMENTATION_FAILED,
  VIDEOPLAY_REASON.SEGMENTATION_NON_DETERMINISTIC,
  VIDEOPLAY_REASON.SCREENPLAY_SCHEMA_INVALID,
  VIDEOPLAY_REASON.STORYBOARD_SCHEMA_INVALID,
  VIDEOPLAY_REASON.ROUTE_UNAVAILABLE,
  VIDEOPLAY_REASON.SHOT_RENDER_FAILED,
  VIDEOPLAY_REASON.ASSET_ANALYSIS_INVALID,
  VIDEOPLAY_REASON.BATCH_QUEUE_ORCHESTRATION_FAILED,
  VIDEOPLAY_REASON.VOICE_RENDER_FAILED,
  VIDEOPLAY_REASON.COVERAGE_LOW,
  VIDEOPLAY_REASON.TIMELINE_SCHEMA_INVALID,
  VIDEOPLAY_REASON.AV_SYNC_DRIFT,
  VIDEOPLAY_REASON.EDIT_COMPOSE_FAILED,
  VIDEOPLAY_REASON.VISUAL_ATTRACTION_LOW,
  VIDEOPLAY_REASON.QC_FAILED,
  VIDEOPLAY_REASON.RELEASE_PACKAGE_INVALID,
  VIDEOPLAY_REASON.PERSIST_WARN,
  VIDEOPLAY_REASON.RUN_CANCELED,
  VIDEOPLAY_REASON.PROMPT_CANARY_FAILED,
  VIDEOPLAY_REASON.CHECKPOINT_INVALID,
  VIDEOPLAY_REASON.STEP_RESUME_HASH_MISMATCH,
  VIDEOPLAY_REASON.CHARACTER_CASTING_FAILED,
  VIDEOPLAY_REASON.SCENE_PLANNING_FAILED,
  VIDEOPLAY_REASON.CANDIDATE_SELECTION_FAILED,
  VIDEOPLAY_REASON.AUDIO_DESIGN_FAILED,
  VIDEOPLAY_REASON.CHARACTER_CONSISTENCY_LOW,
  VIDEOPLAY_REASON.PHOTOGRAPHY_COMPLIANCE_LOW,
  VIDEOPLAY_REASON.ACTING_QUALITY_LOW,
  VIDEOPLAY_REASON.AUDIO_COMPLETENESS_LOW,
  VIDEOPLAY_REASON.SELECTION_COVERAGE_LOW,
  VIDEOPLAY_REASON.SELECTION_RATIONALITY_LOW,
  VIDEOPLAY_REASON.CASTING_VISUAL_FAILED,
  VIDEOPLAY_REASON.SCENE_VISUAL_FAILED,
]);

const VideoPlayOperationTypeSchema = z.enum([
  VIDEOPLAY_OPERATION_TYPE.INSERT_SHOT,
  VIDEOPLAY_OPERATION_TYPE.UPDATE_SHOT,
  VIDEOPLAY_OPERATION_TYPE.DELETE_SHOT,
  VIDEOPLAY_OPERATION_TYPE.REGENERATE_SHOT,
  VIDEOPLAY_OPERATION_TYPE.CREATE_SHOT_VARIANT,
  VIDEOPLAY_OPERATION_TYPE.UNDO_LAST_REGENERATION,
  VIDEOPLAY_OPERATION_TYPE.LINK_SHOT_TRANSITION,
  VIDEOPLAY_OPERATION_TYPE.GENERATE_FIRST_LAST_FRAME,
  VIDEOPLAY_OPERATION_TYPE.GENERATE_VOICE_LINE,
  VIDEOPLAY_OPERATION_TYPE.APPLY_LIP_SYNC,
  VIDEOPLAY_OPERATION_TYPE.CREATE_BRANCH,
  VIDEOPLAY_OPERATION_TYPE.SWITCH_BRANCH,
  VIDEOPLAY_OPERATION_TYPE.REDO,
  VIDEOPLAY_OPERATION_TYPE.MERGE_BRANCH,
  VIDEOPLAY_OPERATION_TYPE.SELECT_CANDIDATE,
  VIDEOPLAY_OPERATION_TYPE.REGENERATE_CANDIDATE,
  VIDEOPLAY_OPERATION_TYPE.UPDATE_CHARACTER_APPEARANCE,
  VIDEOPLAY_OPERATION_TYPE.SELECT_BGM_TRACK,
  VIDEOPLAY_OPERATION_TYPE.UPDATE_SFX_LAYER,
]);

export const SourceEventIdsSchema = z.array(z.string().min(1)).min(1);

export const NarrativeSpineEventSchema = z.object({
  eventId: z.string().min(1),
  visibility: z.string().min(1),
  summary: z.string().optional(),
  sourceEventIds: z.array(z.string().min(1)).optional(),
}).passthrough();

export const NarrativeTurnSchema = z.object({
  turnId: z.string().min(1),
  turnIndex: z.number().int().nonnegative(),
  triggerSource: z.string().min(1),
  userMessage: z.string(),
  systemContext: z.record(z.string(), z.unknown()),
  spineEvents: z.array(NarrativeSpineEventSchema).min(1),
  stateChanges: z.record(z.string(), z.unknown()),
  metrics: z.record(z.string(), z.unknown()),
}).passthrough();

export const NarrativeTurnWindowSchema = z.object({
  projectId: z.string().min(1),
  storyId: z.string().min(1),
  ingestCursorStart: z.string().min(1),
  turns: z.array(NarrativeTurnSchema).min(1),
}).superRefine((value, ctx) => {
  for (let i = 1; i < value.turns.length; i += 1) {
    if (value.turns[i]!.turnIndex <= value.turns[i - 1]!.turnIndex) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${VIDEOPLAY_REASON.SEGMENTATION_FAILED}:turnIndex_not_strictly_increasing`,
        path: ['turns', i, 'turnIndex'],
      });
      break;
    }
  }
});

export const NarrativeProjectionRenderInputSchema = z.object({
  events: z.array(z.record(z.string(), z.unknown())).min(1),
  triggerSource: z.string().min(1),
  userMessage: z.string(),
  systemContext: z.record(z.string(), z.unknown()),
  worldStyle: z.record(z.string(), z.unknown()),
  agentAnchor: z.record(z.string(), z.unknown()),
  playerAnchor: z.record(z.string(), z.unknown()),
  sceneAnchor: z.record(z.string(), z.unknown()),
  metrics: z.record(z.string(), z.unknown()),
  sourceEventIds: SourceEventIdsSchema,
}).passthrough();

export const VideoStorySourceModeSchema = z.enum([
  VIDEOPLAY_STORY_SOURCE_MODE.CANONICAL,
  VIDEOPLAY_STORY_SOURCE_MODE.ENRICHED,
]);

export const VideoStorySummarySchema = z.object({
  storyId: z.string().min(1),
  worldId: z.string().min(1),
  entryEventId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  primaryAgentId: z.string(),
  participants: z.array(z.string().min(1)),
  eventHorizon: z.enum(['PAST', 'ONGOING', 'FUTURE']),
  updatedAt: z.string().min(1),
  playable: z.boolean(),
  agentBindingMissing: z.boolean(),
});

export const VideoStoryDetailSchema = VideoStorySummarySchema.extend({
  cause: z.string(),
  process: z.string(),
  result: z.string(),
  timeRef: z.string(),
  locationRefs: z.array(z.string()),
  characterRefs: z.array(z.string()),
  recommendedSceneId: z.string().nullable(),
});

export const VideoStoryContextCoverageSchema = z.object({
  canon: z.boolean(),
  story: z.boolean(),
  subject: z.boolean(),
  relation: z.boolean(),
  scene: z.boolean(),
});

export const VideoStorySnapshotSchema = z.object({
  storyId: z.string().min(1),
  entryEventId: z.string().min(1),
  primaryAgentId: z.string(),
  version: z.string().min(1),
  source: z.string().min(1),
  loadedAt: z.string().min(1),
  contextCoverage: VideoStoryContextCoverageSchema,
  gapWarnings: z.array(z.string()),
});

const VideoStoryMaterialContextSchema = z.object({
  id: z.string().min(1),
  scope: z.enum(['CANON', 'STORY', 'SUBJECT', 'RELATION']),
  scopeKey: z.string().min(1),
  storyId: z.string().nullable(),
  narrativeSetting: z.record(z.string(), z.unknown()),
  narrativeState: z.record(z.string(), z.unknown()),
});

export const VideoStoryPackageSchema = z.object({
  storyId: z.string().min(1),
  worldId: z.string().min(1),
  entryEventId: z.string().min(1),
  sourceMode: VideoStorySourceModeSchema,
  entry: z.object({
    title: z.string().min(1),
    summary: z.string().min(1),
    cause: z.string(),
    process: z.string(),
    result: z.string(),
    timeRef: z.string(),
    locationRefs: z.array(z.string()),
    characterRefs: z.array(z.string()),
    recommendedSceneId: z.string().nullable(),
  }),
  cast: z.object({
    primaryAgentId: z.string(),
    participants: z.array(z.string().min(1)),
  }),
  materials: z.object({
    lorebooks: z.array(z.object({
      id: z.string().min(1),
      key: z.string(),
      content: z.string(),
      score: z.number(),
    })),
    memories: z.array(z.string()),
    scenes: z.array(z.object({
      id: z.string().min(1),
      name: z.string(),
      description: z.string(),
      score: z.number(),
    })),
    contexts: z.array(VideoStoryMaterialContextSchema),
    recallSource: z.string(),
  }),
  narrativeScopes: z.object({
    CANON: z.record(z.string(), z.unknown()),
    STORY: z.record(z.string(), z.unknown()),
    SUBJECT: z.record(z.string(), z.unknown()),
    RELATION: z.record(z.string(), z.unknown()),
  }),
  turnWindow: NarrativeTurnWindowSchema,
  projection: NarrativeProjectionRenderInputSchema,
  recommendedEntryTurn: z.object({
    turnId: z.string().min(1),
    createdAt: z.string().optional(),
    triggerSource: z.string().optional(),
  }).nullable(),
  windowPolicy: z.object({
    maxTurns: z.number().int().positive(),
    readLimit: z.number().int().positive(),
    enrichedRequiredTriggerSources: z.array(z.enum(['UserTurn', 'AgentInitiative'])).min(1),
  }),
  snapshot: VideoStorySnapshotSchema,
});

export const EpisodePlanSchema = z.object({
  episodeId: z.string().min(1),
  sourceTurnRange: z.object({
    startTurnId: z.string().min(1),
    endTurnId: z.string().min(1),
  }),
  sourceTurnIds: z.array(z.string().min(1)).min(1),
  sourceEventIds: SourceEventIdsSchema,
  segmentationReason: z.string().min(1),
  policyHash: z.string().min(1),
  turns: z.array(NarrativeTurnSchema).min(1),
  estimatedDurationSec: z.number().positive(),
});

export const ScreenplayBeatSchema = z.object({
  beatId: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  sourceEventIds: SourceEventIdsSchema,
});

export const ScreenplaySchema = z.object({
  episodeId: z.string().min(1),
  clipPlans: z.array(z.object({
    clipId: z.string().min(1),
    title: z.string().min(1),
    beatIds: z.array(z.string().min(1)).min(1),
    sourceEventIds: SourceEventIdsSchema,
  })).min(1),
  beats: z.array(ScreenplayBeatSchema).min(1),
});

// --- New schemas for 12-stage pipeline ---

export const PhotographyRuleSchema = z.object({
  composition: z.string(),
  lighting: z.string(),
  colorPalette: z.string(),
  atmosphere: z.string(),
  technicalNotes: z.string(),
});

export const ActingDirectionSchema = z.object({
  characters: z.array(z.object({
    characterId: z.string().min(1),
    actingDescription: z.string(),
  })),
});

export const CharacterAppearanceVersionSchema = z.object({
  appearanceIndex: z.number().int().nonnegative(),
  description: z.string(),
  imageUrls: z.array(z.string()),
  selectedIndex: z.number().int().nonnegative(),
  changeReason: z.string(),
  previousImageUrl: z.string().nullable(),
});

export const CharacterBriefSchema = z.object({
  agentId: z.string().min(1),
  name: z.string().min(1),
  roleLevel: z.enum(['S', 'A', 'B', 'C', 'D']),
  visualKeywords: z.array(z.string()),
  appearances: z.array(CharacterAppearanceVersionSchema),
  activeAppearanceIndex: z.number().int().nonnegative(),
  referenceImageUri: z.string().nullable(),
});

export const CharacterCastingOutputSchema = z.object({
  storyId: z.string().min(1),
  characters: z.array(CharacterBriefSchema),
});

export const SceneEnvironmentBriefSchema = z.object({
  sceneId: z.string().min(1),
  name: z.string().min(1),
  environmentDescription: z.string(),
  referenceImageUrls: z.array(z.string()),
  selectedIndex: z.number().int().nonnegative(),
});

export const ScenePlanningOutputSchema = z.object({
  storyId: z.string().min(1),
  scenes: z.array(SceneEnvironmentBriefSchema),
});

export const VoiceEmotionConfigSchema = z.object({
  emotionPrompt: z.string(),
  emotionStrength: z.number().min(0).max(1),
  referenceAudioUrl: z.string().nullable(),
});

export const SelectedTimelineSegmentSchema = z.object({
  assetId: z.string().min(1),
  shotId: z.string().min(1),
  order: z.number().int().nonnegative(),
  trimInMs: z.number().int().nonnegative().nullable(),
  trimOutMs: z.number().int().nonnegative().nullable(),
}).refine((value) => {
  if (value.trimInMs == null || value.trimOutMs == null) {
    return true;
  }
  return value.trimOutMs > value.trimInMs;
}, {
  message: 'timeline_segment_trim_out_must_be_greater_than_trim_in',
});

export const CandidateSelectionOutputSchema = z.object({
  episodeId: z.string().min(1),
  selectedAssetIds: z.array(z.string().min(1)),
  timelineSegments: z.array(SelectedTimelineSegmentSchema),
});

export const BgmTrackSchema = z.object({
  trackId: z.string().min(1),
  uri: z.string().min(1),
  durationMs: z.number().int().nonnegative(),
  fadeInMs: z.number().int().nonnegative(),
  fadeOutMs: z.number().int().nonnegative(),
  volume: z.number().min(0).max(1),
  startOffsetMs: z.number().int().nonnegative(),
});

export const SfxLayerSchema = z.object({
  sfxId: z.string().min(1),
  uri: z.string().min(1),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  volume: z.number().min(0).max(1),
});

export const AudioDesignOutputSchema = z.object({
  episodeId: z.string().min(1),
  bgmTrack: BgmTrackSchema.nullable(),
  sfxLayers: z.array(SfxLayerSchema),
});

export const TimelineTransitionSchema = z.object({
  type: z.enum(['cut', 'dissolve', 'fade-black', 'fade-white']),
  durationMs: z.number().int().nonnegative(),
});

// --- Enhanced existing schemas ---

export const StoryboardShotSchema = z.object({
  shotId: z.string().min(1),
  clipId: z.string().min(1),
  beatId: z.string().min(1),
  visualPrompt: z.string().min(1),
  motionCue: z.string().min(1),
  continuityAnchors: z.array(z.string().min(1)),
  sourceEventIds: SourceEventIdsSchema,
  durationMs: z.number().int().positive(),
  startMs: z.number().int().nonnegative(),
  shotType: z.string().min(1),
  cameraMove: z.string().min(1),
  photographyRule: PhotographyRuleSchema,
  actingDirection: ActingDirectionSchema,
  videoPrompt: z.string().min(1),
  characterIds: z.array(z.string()),
  locationId: z.string().nullable(),
});

export const StoryboardSchema = z.object({
  episodeId: z.string().min(1),
  clipPlans: z.array(z.object({
    clipId: z.string().min(1),
    shotIds: z.array(z.string().min(1)).min(1),
    sourceEventIds: SourceEventIdsSchema,
  })).min(1),
  shotPlans: z.array(StoryboardShotSchema).min(1),
  sourceEventIds: SourceEventIdsSchema,
});

export const RenderedAssetSchema = z.object({
  assetId: z.string().min(1),
  episodeId: z.string().min(1),
  shotId: z.string().min(1),
  clipId: z.string().min(1),
  assetType: z.enum(['video', 'image', 'voice-audio', 'voice-script', 'lip-sync']),
  uri: z.string().min(1),
  mimeType: z.string().min(1),
  durationMs: z.number().int().nonnegative(),
  fps: z.number().int().positive(),
  resolution: z.string().min(1),
  sourceEventIds: SourceEventIdsSchema,
  routeSource: z.enum(['local-runtime', 'token-api', 'unknown']),
  metadata: z.record(z.string(), z.unknown()),
});

export const AssetRenderOutputSchema = z.object({
  episodeId: z.string().min(1),
  clipAssets: z.array(RenderedAssetSchema),
  shotAssets: z.array(RenderedAssetSchema),
  sourceEventMap: z.record(z.string(), z.array(z.string().min(1))),
  renderTrace: z.record(z.string(), z.unknown()),
  coverage: z.object({
    plannedShots: z.number().int().nonnegative(),
    renderedShots: z.number().int().nonnegative(),
    ratio: z.number().min(0).max(1),
    plannedVoiceShots: z.number().int().nonnegative(),
    renderedVoiceShots: z.number().int().nonnegative(),
    voiceRatio: z.number().min(0).max(1),
  }),
});

export const TimelineClipSchema = z.object({
  assetId: z.string().min(1),
  clipId: z.string().min(1),
  shotId: z.string().min(1),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  trimInMs: z.number().int().nonnegative().nullable(),
  trimOutMs: z.number().int().nonnegative().nullable(),
  uri: z.string().min(1),
  sourceEventIds: SourceEventIdsSchema,
  transitionIn: TimelineTransitionSchema.nullable(),
  transitionOut: TimelineTransitionSchema.nullable(),
}).refine((value) => value.endMs > value.startMs, {
  message: 'timeline_clip_end_must_be_greater_than_start',
});

export const EditComposeOutputSchema = z.object({
  episodeTimeline: z.array(TimelineClipSchema).min(1),
  episodeMasterVideo: z.object({
    uri: z.string().min(1),
    mimeType: z.string().min(1),
    durationMs: z.number().int().positive(),
    timelineHash: z.string().min(1),
  }),
  episodePoster: z.object({
    uri: z.string().min(1),
    mimeType: z.string().min(1),
  }),
  episodeCaptionTrack: z.object({
    uri: z.string().min(1),
    mimeType: z.string().min(1),
    lines: z.array(z.object({
      startMs: z.number().int().nonnegative(),
      endMs: z.number().int().nonnegative(),
      text: z.string().min(1),
    })).min(1),
  }),
  composeTrace: z.object({
    avDriftMs: z.number().nonnegative(),
    blackGapMs: z.number().nonnegative(),
    exportSpec: z.object({
      videoCodec: z.literal('H.264'),
      audioCodec: z.literal('AAC'),
      container: z.literal('mp4'),
    }),
  }),
  bgmTrack: BgmTrackSchema.nullable(),
  sfxLayers: z.array(SfxLayerSchema),
  subtitleOverlay: z.object({
    uri: z.string().min(1),
    mimeType: z.string().min(1),
  }).nullable(),
});

export const QualityGateReportSchema = z.object({
  status: z.enum(['APPROVED', 'ADJUSTED', 'REJECTED']),
  gates: z.array(z.object({
    gate: z.string().min(1),
    passed: z.boolean(),
    value: z.number(),
    min: z.number().nullable(),
    max: z.number().nullable(),
    reasonCode: VideoPlayReasonCodeSchema,
  })),
  groundedRatio: z.number().min(0).max(1),
  assetCoverageRatio: z.number().min(0).max(1),
  voiceCoverageRatio: z.number().min(0).max(1),
  visualAttractionScore: z.number().min(0).max(1),
  visualAttractionComponents: z.object({
    characterConsistency: z.number().min(0).max(1),
    motionContinuity: z.number().min(0).max(1),
    compositionReadability: z.number().min(0).max(1),
    lightColorCoherence: z.number().min(0).max(1),
  }),
  avDriftMs: z.number().nonnegative(),
  durationSec: z.number().nonnegative(),
  failReasonCode: VideoPlayReasonCodeSchema.nullable(),
  characterConsistencyScore: z.number().min(0).max(1),
  photographyComplianceScore: z.number().min(0).max(1),
  actingQualityScore: z.number().min(0).max(1),
  audioCompletenessRatio: z.number().min(0).max(1),
});

export const RunEventSchema = z.object({
  traceId: z.string().min(1),
  runId: z.string().min(1),
  parentRunId: z.string().nullable(),
  stage: z.literal('videoplay'),
  step: z.enum(VIDEOPLAY_PIPELINE_CHAIN),
  eventType: z.enum([
    'run.start',
    'step.start',
    'step.chunk',
    'step.complete',
    'step.error',
    'run.complete',
    'run.error',
    'run.canceled',
  ]),
  seq: z.number().int().nonnegative(),
  attempt: z.number().int().positive(),
  timestamp: z.string().min(1),
  idempotencyKey: z.string().optional(),
  checkpointToken: z.string().optional(),
  stepInputHash: z.string().optional(),
  lastCompletedUnit: z.string().optional(),
  reasonCode: VideoPlayReasonCodeSchema.optional(),
  actionHint: z.string().optional(),
  retryClass: z.enum(['retryable', 'non-retryable']).optional(),
  taskId: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const ReleasePackageSchema = z.object({
  releaseId: z.string().min(1),
  episodeId: z.string().min(1),
  qcStatus: z.enum(['APPROVED', 'ADJUSTED']),
  episodeMasterVideo: EditComposeOutputSchema.shape.episodeMasterVideo,
  episodePoster: EditComposeOutputSchema.shape.episodePoster,
  episodeCaptionTrack: EditComposeOutputSchema.shape.episodeCaptionTrack,
  episodeMetadata: z.object({
    storyId: z.string().min(1),
    sourceTurnIds: z.array(z.string().min(1)).min(1),
    sourceEventIds: SourceEventIdsSchema,
    durationSec: z.number().positive(),
    policyHash: z.string().min(1),
  }),
  episodeTraceBundle: z.object({
    traceId: z.string().min(1),
    runId: z.string().min(1),
    fallbackAudits: z.array(z.object({
      traceId: z.string().min(1),
      stage: z.enum(VIDEOPLAY_ROUTE_STAGES),
      capability: z.string().min(1),
      from: z.literal('local-runtime'),
      to: z.literal('token-api'),
      reason: z.string().min(1),
    })),
    runEvents: z.array(RunEventSchema),
    sourceCoverage: z.object({
      episode: z.array(z.string().min(1)),
      clip: z.record(z.string(), z.array(z.string().min(1))),
      beat: z.record(z.string(), z.array(z.string().min(1))),
      shot: z.record(z.string(), z.array(z.string().min(1))),
    }),
  }),
  published: z.boolean(),
  publishedAt: z.string().nullable(),
  createdAt: z.string().min(1),
});

export const VersionLineageNodeSchema = z.object({
  versionId: z.string().min(1),
  parentVersionId: z.string().nullable(),
  branchId: z.string().min(1),
  operationType: VideoPlayOperationTypeSchema,
  deltaSummary: z.string().min(1),
  operator: z.string().min(1),
  timestamp: z.string().min(1),
});

export const EpisodeRecordSchema = z.object({
  episodeId: z.string().min(1),
  storyId: z.string().min(1),
  sourceTurnIds: z.array(z.string().min(1)).min(1),
  sourceEventIds: SourceEventIdsSchema,
  policyHash: z.string().min(1),
  segmentationReason: z.string().min(1),
  screenplay: ScreenplaySchema,
  storyboard: StoryboardSchema,
  quality: QualityGateReportSchema,
  candidateRelease: ReleasePackageSchema.nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  editor: z.object({
    activeBranchId: z.string().min(1),
    branches: z.record(z.string(), z.object({
      branchId: z.string().min(1),
      name: z.string().min(1),
      headVersionId: z.string().min(1),
      createdAt: z.string().min(1),
    })),
    lineage: z.array(VersionLineageNodeSchema),
    conflictRecords: z.array(z.record(z.string(), z.unknown())),
  }),
});

export const VideoPlayStorageStateSchema = z.object({
  version: z.number().int().positive(),
  episodesById: z.record(z.string(), EpisodeRecordSchema),
  assetsByEpisodeId: z.record(z.string(), z.array(RenderedAssetSchema)),
  releasesById: z.record(z.string(), ReleasePackageSchema),
  releaseIdsByEpisodeId: z.record(z.string(), z.array(z.string().min(1))),
  idempotency: z.record(z.string(), z.unknown()),
  operationAudit: z.array(VersionLineageNodeSchema),
  characterCastingByStoryId: z.record(z.string(), CharacterCastingOutputSchema),
  scenePlanningByStoryId: z.record(z.string(), ScenePlanningOutputSchema),
  candidateSelectionByEpisodeId: z.record(z.string(), CandidateSelectionOutputSchema),
  audioDesignByEpisodeId: z.record(z.string(), AudioDesignOutputSchema),
});
