import type { HookClient } from '@nimiplatform/sdk/mod/types';
import type { ModRuntimeClient } from '@nimiplatform/sdk/mod/runtime';
import type { RuntimeCanonicalCapability, RuntimeRouteBinding } from '@nimiplatform/sdk/mod/runtime-route';
import type { NarrativeEngineModule } from '../../narrative-engine/src/index.js';
import type { VideoPlayRuntimeAiClient } from './runtime-ai-client.js';
import type {
  VideoPlayOperationType,
  VideoPlayPipelineStep,
  VideoPlayReasonCode,
  VideoPlayRetryClass,
  VideoPlayRouteStage,
  VideoPlayWorkbenchStage,
  VideoPlayWorkbenchStageStatus,
  VideoStorySourceMode,
} from './contracts.js';

export type NarrativeSpineEvent = {
  eventId: string;
  visibility: 'public' | 'internal' | 'sensory' | string;
  summary?: string;
  sourceEventIds?: string[];
  [key: string]: unknown;
};

export type NarrativeTurn = {
  turnId: string;
  turnIndex: number;
  triggerSource: string;
  userMessage: string;
  systemContext: Record<string, unknown>;
  spineEvents: NarrativeSpineEvent[];
  stateChanges: Record<string, unknown>;
  metrics: Record<string, unknown>;
};

export type NarrativeTurnWindow = {
  projectId: string;
  storyId: string;
  ingestCursorStart: string;
  turns: NarrativeTurn[];
};

export type NarrativeProjectionRenderInput = {
  events: Array<Record<string, unknown>>;
  triggerSource: string;
  userMessage: string;
  systemContext: Record<string, unknown>;
  worldStyle: Record<string, unknown>;
  agentAnchor: Record<string, unknown>;
  playerAnchor: Record<string, unknown>;
  sceneAnchor: Record<string, unknown>;
  metrics: Record<string, unknown>;
  sourceEventIds: string[];
};

export type VideoStorySummary = {
  storyId: string;
  worldId: string;
  entryEventId: string;
  title: string;
  summary: string;
  primaryAgentId: string;
  participants: string[];
  eventHorizon: 'PAST' | 'ONGOING' | 'FUTURE';
  updatedAt: string;
  playable: boolean;
  agentBindingMissing: boolean;
};

export type VideoStoryDetail = VideoStorySummary & {
  cause: string;
  process: string;
  result: string;
  timeRef: string;
  locationRefs: string[];
  characterRefs: string[];
  recommendedSceneId: string | null;
};

export type VideoStoryContextCoverage = {
  canon: boolean;
  story: boolean;
  subject: boolean;
  relation: boolean;
  scene: boolean;
};

export type VideoStorySnapshot = {
  storyId: string;
  entryEventId: string;
  primaryAgentId: string;
  version: string;
  source: string;
  loadedAt: string;
  contextCoverage: VideoStoryContextCoverage;
  gapWarnings: string[];
};

export type VideoStoryPackage = {
  storyId: string;
  worldId: string;
  entryEventId: string;
  sourceMode: VideoStorySourceMode;
  entry: {
    title: string;
    summary: string;
    cause: string;
    process: string;
    result: string;
    timeRef: string;
    locationRefs: string[];
    characterRefs: string[];
    recommendedSceneId: string | null;
  };
  cast: {
    primaryAgentId: string;
    participants: string[];
  };
  materials: {
    lorebooks: Array<{
      id: string;
      key: string;
      content: string;
      score: number;
    }>;
    memories: string[];
    scenes: Array<{
      id: string;
      name: string;
      description: string;
      score: number;
    }>;
    contexts: Array<{
      id: string;
      scope: 'CANON' | 'STORY' | 'SUBJECT' | 'RELATION';
      scopeKey: string;
      storyId: string | null;
      narrativeSetting: Record<string, unknown>;
      narrativeState: Record<string, unknown>;
    }>;
    recallSource: string;
  };
  narrativeScopes: {
    CANON: Record<string, unknown>;
    STORY: Record<string, unknown>;
    SUBJECT: Record<string, unknown>;
    RELATION: Record<string, unknown>;
  };
  turnWindow: NarrativeTurnWindow;
  projection: NarrativeProjectionRenderInput;
  recommendedEntryTurn: {
    turnId: string;
    createdAt?: string;
    triggerSource?: string;
  } | null;
  windowPolicy: {
    maxTurns: number;
    readLimit: number;
    enrichedRequiredTriggerSources: Array<'UserTurn' | 'AgentInitiative'>;
  };
  snapshot: VideoStorySnapshot;
};

export type SegmentationPolicy = {
  targetEpisodeDurationSec: number;
  minEpisodeDurationSec: number;
  maxEpisodeDurationSec: number;
  maxTurnsPerEpisode: number;
  suspenseCutRequired: boolean;
  hardBreakOnSystemEvent: boolean;
};

export type EpisodeSourceRange = {
  startTurnId: string;
  endTurnId: string;
};

export type SegmentedEpisode = {
  episodeId: string;
  sourceTurnRange: EpisodeSourceRange;
  sourceTurnIds: string[];
  sourceEventIds: string[];
  segmentationReason: string;
  policyHash: string;
  turns: NarrativeTurn[];
  estimatedDurationSec: number;
};

export type SegmentationOutput = {
  episodes: SegmentedEpisode[];
  backlogTurnIds: string[];
  nextIngestCursor: string;
  segmentationTrace: Record<string, unknown>;
};

export type ScreenplayBeat = {
  beatId: string;
  title: string;
  summary: string;
  sourceEventIds: string[];
};

export type ScreenplayOutput = {
  episodeId: string;
  clipPlans: Array<{
    clipId: string;
    title: string;
    beatIds: string[];
    sourceEventIds: string[];
  }>;
  beats: ScreenplayBeat[];
};

// --- New types for 12-stage pipeline ---

export type CharacterAppearanceVersion = {
  appearanceIndex: number;
  description: string;
  imageUrls: string[];
  selectedIndex: number;
  changeReason: string;
  previousImageUrl: string | null;
};

export type CharacterBrief = {
  agentId: string;
  name: string;
  roleLevel: 'S' | 'A' | 'B' | 'C' | 'D';
  visualKeywords: string[];
  appearances: CharacterAppearanceVersion[];
  activeAppearanceIndex: number;
  referenceImageUri: string | null;
};

export type CharacterCastingOutput = {
  storyId: string;
  characters: CharacterBrief[];
};

export type SceneEnvironmentBrief = {
  sceneId: string;
  name: string;
  environmentDescription: string;
  referenceImageUrls: string[];
  selectedIndex: number;
};

export type ScenePlanningOutput = {
  storyId: string;
  scenes: SceneEnvironmentBrief[];
};

export type PhotographyRule = {
  composition: string;
  lighting: string;
  colorPalette: string;
  atmosphere: string;
  technicalNotes: string;
};

export type ActingDirection = {
  characters: Array<{
    characterId: string;
    actingDescription: string;
  }>;
};

export type VoiceEmotionConfig = {
  emotionPrompt: string;
  emotionStrength: number;
  referenceAudioUrl: string | null;
};

export type SelectedTimelineSegment = {
  assetId: string;
  shotId: string;
  order: number;
  trimInMs: number | null;
  trimOutMs: number | null;
};

export type CandidateSelectionOutput = {
  episodeId: string;
  selectedAssetIds: string[];
  timelineSegments: SelectedTimelineSegment[];
};

export type BgmTrack = {
  trackId: string;
  uri: string;
  durationMs: number;
  fadeInMs: number;
  fadeOutMs: number;
  volume: number;
  startOffsetMs: number;
};

export type SfxLayer = {
  sfxId: string;
  uri: string;
  startMs: number;
  endMs: number;
  volume: number;
};

export type AudioDesignOutput = {
  episodeId: string;
  bgmTrack: BgmTrack | null;
  sfxLayers: SfxLayer[];
};

export type TimelineTransition = {
  type: 'cut' | 'dissolve' | 'fade-black' | 'fade-white';
  durationMs: number;
};

// --- Enhanced existing types ---

export type StoryboardShot = {
  shotId: string;
  clipId: string;
  beatId: string;
  visualPrompt: string;
  motionCue: string;
  continuityAnchors: string[];
  sourceEventIds: string[];
  durationMs: number;
  startMs: number;
  shotType: string;
  cameraMove: string;
  photographyRule: PhotographyRule;
  actingDirection: ActingDirection;
  videoPrompt: string;
  characterIds: string[];
  locationId: string | null;
};

export type StoryboardOutput = {
  episodeId: string;
  clipPlans: Array<{
    clipId: string;
    shotIds: string[];
    sourceEventIds: string[];
  }>;
  shotPlans: StoryboardShot[];
  sourceEventIds: string[];
};

export type RenderedAsset = {
  assetId: string;
  episodeId: string;
  shotId: string;
  clipId: string;
  assetType: 'video' | 'image' | 'voice-audio' | 'voice-script' | 'lip-sync';
  uri: string;
  mimeType: string;
  durationMs: number;
  fps: number;
  resolution: string;
  sourceEventIds: string[];
  routeSource: 'local-runtime' | 'token-api' | 'unknown';
  metadata: Record<string, unknown>;
};

export type AssetRenderOutput = {
  episodeId: string;
  clipAssets: RenderedAsset[];
  shotAssets: RenderedAsset[];
  sourceEventMap: Record<string, string[]>;
  renderTrace: Record<string, unknown>;
  coverage: {
    plannedShots: number;
    renderedShots: number;
    ratio: number;
    plannedVoiceShots: number;
    renderedVoiceShots: number;
    voiceRatio: number;
  };
};

export type TimelineClip = {
  assetId: string;
  clipId: string;
  shotId: string;
  startMs: number;
  endMs: number;
  trimInMs: number | null;
  trimOutMs: number | null;
  uri: string;
  sourceEventIds: string[];
  transitionIn: TimelineTransition | null;
  transitionOut: TimelineTransition | null;
};

export type EditComposeOutput = {
  episodeTimeline: TimelineClip[];
  episodeMasterVideo: {
    uri: string;
    mimeType: string;
    durationMs: number;
    timelineHash: string;
  };
  episodePoster: {
    uri: string;
    mimeType: string;
  };
  episodeCaptionTrack: {
    uri: string;
    mimeType: string;
    lines: Array<{ startMs: number; endMs: number; text: string }>;
  };
  composeTrace: {
    avDriftMs: number;
    blackGapMs: number;
    exportSpec: {
      videoCodec: 'H.264';
      audioCodec: 'AAC';
      container: 'mp4';
    };
  };
  bgmTrack: BgmTrack | null;
  sfxLayers: SfxLayer[];
  subtitleOverlay: { uri: string; mimeType: string } | null;
};

export type QualityGateReport = {
  status: 'APPROVED' | 'ADJUSTED' | 'REJECTED';
  gates: Array<{
    gate: string;
    passed: boolean;
    value: number;
    min: number | null;
    max: number | null;
    reasonCode: VideoPlayReasonCode;
  }>;
  groundedRatio: number;
  assetCoverageRatio: number;
  voiceCoverageRatio: number;
  visualAttractionScore: number;
  visualAttractionComponents: {
    characterConsistency: number;
    motionContinuity: number;
    compositionReadability: number;
    lightColorCoherence: number;
  };
  avDriftMs: number;
  durationSec: number;
  failReasonCode: VideoPlayReasonCode | null;
  characterConsistencyScore: number;
  photographyComplianceScore: number;
  actingQualityScore: number;
  audioCompletenessRatio: number;
};

export type FallbackAuditRecord = {
  traceId: string;
  stage: VideoPlayRouteStage;
  capability: RuntimeCanonicalCapability;
  from: 'local-runtime';
  to: 'token-api';
  reason: string;
};

export type ReleasePackage = {
  releaseId: string;
  episodeId: string;
  qcStatus: 'APPROVED' | 'ADJUSTED';
  episodeMasterVideo: EditComposeOutput['episodeMasterVideo'];
  episodePoster: EditComposeOutput['episodePoster'];
  episodeCaptionTrack: EditComposeOutput['episodeCaptionTrack'];
  episodeMetadata: {
    storyId: string;
    sourceTurnIds: string[];
    sourceEventIds: string[];
    durationSec: number;
    policyHash: string;
  };
  episodeTraceBundle: {
    traceId: string;
    runId: string;
    fallbackAudits: FallbackAuditRecord[];
    runEvents: VideoPlayRunEvent[];
    sourceCoverage: {
      episode: string[];
      clip: Record<string, string[]>;
      beat: Record<string, string[]>;
      shot: Record<string, string[]>;
    };
  };
  published: boolean;
  publishedAt: string | null;
  createdAt: string;
};

export type VideoPlayRunEventType =
  | 'run.start'
  | 'step.start'
  | 'step.chunk'
  | 'step.complete'
  | 'step.error'
  | 'run.complete'
  | 'run.error'
  | 'run.canceled';

export type VideoPlayRunEvent = {
  traceId: string;
  runId: string;
  parentRunId: string | null;
  stage: 'videoplay';
  step: VideoPlayPipelineStep;
  eventType: VideoPlayRunEventType;
  seq: number;
  attempt: number;
  timestamp: string;
  idempotencyKey?: string;
  checkpointToken?: string;
  stepInputHash?: string;
  lastCompletedUnit?: string;
  reasonCode?: VideoPlayReasonCode;
  actionHint?: string;
  retryClass?: VideoPlayRetryClass;
  taskId?: string;
  details?: Record<string, unknown>;
};

export type VideoPlayPipelineLifecycleStatus =
  | 'RUNNING'
  | 'PAUSED'
  | 'FAILED'
  | 'CANCELED'
  | 'COMPLETED';

export type VideoPlayPipelineStageStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELED';

export type VideoPlayPipelineStageProgress = {
  step: VideoPlayPipelineStep;
  status: VideoPlayPipelineStageStatus;
  attempt: number;
  checkpointToken: string | null;
  stepInputHash: string | null;
  lastCompletedUnit: string | null;
  reasonCode: VideoPlayReasonCode | null;
  actionHint: string | null;
  updatedAt: string;
};

export type VideoPlayWorkbenchStageProgress = {
  stage: VideoPlayWorkbenchStage;
  status: VideoPlayWorkbenchStageStatus;
  reasonCode: VideoPlayReasonCode | null;
  actionHint: string | null;
  stepStatuses: Partial<Record<VideoPlayPipelineStep, VideoPlayPipelineStageStatus>>;
};

export type VideoPlayStageAdvancePlan = {
  stage: VideoPlayWorkbenchStage;
  allowed: boolean;
  stepBudget: number;
  reasonCode: VideoPlayReasonCode | null;
  actionHint: string | null;
};

export type VideoPlayRebuildImpactPreview = {
  operationType: VideoPlayOperationType;
  scope: 'shot' | 'adjacent-shots-plus-compose' | 'clip-plus-compose' | 'post-segmentation-full-chain';
  recommendedRerunStep: VideoPlayPipelineStep;
  stage: VideoPlayWorkbenchStage;
  confirmed: boolean;
  createdAt: string;
};

export type VideoPlayPipelineCheckpoint = {
  traceId: string;
  runId: string;
  status: VideoPlayPipelineLifecycleStatus;
  nextStepIndex: number;
  stageProgress: VideoPlayPipelineStageProgress[];
  runEvents: VideoPlayRunEvent[];
  fallbackAudits: FallbackAuditRecord[];
  snapshot: Record<string, unknown>;
};

export type VideoPlayPipelineExecutionControl = {
  mode?: 'full' | 'stepwise';
  checkpoint?: VideoPlayPipelineCheckpoint | null;
  rerunStep?: VideoPlayPipelineStep;
  stepBudget?: number;
  shouldCancel?: () => boolean;
};

export type EpisodeRecord = {
  episodeId: string;
  storyId: string;
  sourceTurnIds: string[];
  sourceEventIds: string[];
  policyHash: string;
  segmentationReason: string;
  screenplay: ScreenplayOutput;
  storyboard: StoryboardOutput;
  quality: QualityGateReport;
  candidateRelease: ReleasePackage | null;
  createdAt: string;
  updatedAt: string;
  editor: VideoPlayEditorState;
};

export type VersionLineageNode = {
  versionId: string;
  parentVersionId: string | null;
  branchId: string;
  operationType: VideoPlayOperationType;
  deltaSummary: string;
  operator: string;
  timestamp: string;
};

export type VideoPlayEditorBranch = {
  branchId: string;
  name: string;
  headVersionId: string;
  createdAt: string;
};

export type VideoPlayEditorState = {
  activeBranchId: string;
  branches: Record<string, VideoPlayEditorBranch>;
  lineage: VersionLineageNode[];
  conflictRecords: Array<Record<string, unknown>>;
};

export type VideoPlayStorageState = {
  version: number;
  episodesById: Record<string, EpisodeRecord>;
  assetsByEpisodeId: Record<string, RenderedAsset[]>;
  releasesById: Record<string, ReleasePackage>;
  releaseIdsByEpisodeId: Record<string, string[]>;
  idempotency: Record<string, unknown>;
  operationAudit: Array<VersionLineageNode>;
  characterCastingByStoryId: Record<string, CharacterCastingOutput>;
  scenePlanningByStoryId: Record<string, ScenePlanningOutput>;
  candidateSelectionByEpisodeId: Record<string, CandidateSelectionOutput>;
  audioDesignByEpisodeId: Record<string, AudioDesignOutput>;
};

export type VideoPlayDataOperation =
  | {
      operation: 'upsert';
      idempotencyKey: string;
      episode: EpisodeRecord;
    }
  | {
      operation: 'get';
      episodeId: string;
    }
  | {
      operation: 'list';
      storyId?: string;
    }
  | {
      operation: 'asset-upsert';
      idempotencyKey: string;
      episodeId: string;
      assets: RenderedAsset[];
    }
  | {
      operation: 'asset-list';
      episodeId: string;
    }
  | {
      operation: 'publish';
      idempotencyKey: string;
      episodeId: string;
      releasePackage: ReleasePackage;
    }
  | {
      operation: 'release-get';
      releaseId: string;
    }
  | {
      operation: 'release-list';
      episodeId?: string;
    };

export type VideoPlayPipelineInput = {
  projectId: string;
  storyId: string;
  ingestCursorStart: string;
  sourceMode: VideoStorySourceMode;
  storyPackage: VideoStoryPackage;
  windowPolicy?: Partial<VideoStoryPackage['windowPolicy']>;
  policy?: Partial<SegmentationPolicy>;
  taskId?: string;
  operator?: string;
  execution?: VideoPlayPipelineExecutionControl;
};

export type VideoPlayPipelineResult = {
  traceId: string;
  runId: string;
  status: VideoPlayPipelineLifecycleStatus;
  nextStep: VideoPlayPipelineStep | null;
  episodes: EpisodeRecord[];
  releaseCandidates: ReleasePackage[];
  stageProgress: VideoPlayPipelineStageProgress[];
  checkpoint: VideoPlayPipelineCheckpoint;
  runEvents: VideoPlayRunEvent[];
  fallbackAudits: FallbackAuditRecord[];
};

export type VideoPlayPipelineDeps = {
  hookClient: HookClient;
  aiClient: VideoPlayRuntimeAiClient;
  runtimeClient: ModRuntimeClient;
  narrativeEngine: NarrativeEngineModule;
};

export type RouteInvokeInput<T> = {
  stage: VideoPlayRouteStage;
  capability: RuntimeCanonicalCapability;
  traceId: string;
  invoke: (binding: RuntimeRouteBinding | undefined) => Promise<T>;
};
