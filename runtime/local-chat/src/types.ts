export type LocalChatMediaKind = 'image' | 'video';
export type LocalChatMediaIntentSource = 'tag' | 'explicit' | 'planner';
export type LocalChatMediaPlannerTrigger =
  | 'user-explicit'
  | 'assistant-offer'
  | 'scene-enhancement'
  | 'none'
  | 'marker-override';
export type LocalChatMediaRouteSource = 'local' | 'cloud';
export type LocalChatResolvedMediaRouteSource = LocalChatMediaRouteSource;
export type LocalChatResolvedMediaRouteResolvedBy = 'resolved-default' | 'selected' | 'preflight';
export type LocalChatMediaCacheStatus = 'none' | 'hit' | 'miss';
export type LocalChatMediaArtifactStatus = 'ready' | 'blocked' | 'failed';
export type LocalChatBeatModality = 'text' | 'voice' | 'image' | 'video';
export type LocalChatTurnMode =
  | 'information'
  | 'emotional'
  | 'playful'
  | 'intimate'
  | 'checkin'
  | 'explicit-media'
  | 'explicit-voice';

export type LocalChatMediaHints = {
  composition?: string;
  negativeCues?: string[];
  continuityRefs?: string[];
};

export type LocalChatMediaGenerationSpec = {
  kind: LocalChatMediaKind;
  intentSource: LocalChatMediaIntentSource;
  plannerTrigger: LocalChatMediaPlannerTrigger;
  confidence: number | null;
  nsfwIntent: 'none' | 'suggested';
  targetId: string;
  worldId: string | null;
  subject: string;
  scene: string;
  styleIntent: string;
  mood: string;
  requestedSize?: string;
  requestedCount?: number;
  requestedDurationSeconds?: number;
  hints?: LocalChatMediaHints;
};

export type LocalChatCompiledMediaExecution = {
  compiledPromptText: string;
  runtimePayload: {
    prompt: string;
    model?: string;
    negativePrompt?: string;
    size?: string;
    aspectRatio?: string;
    quality?: string;
    style?: string;
    n?: number;
    durationSeconds?: number;
    cameraMotion?: string;
  };
  compilerRevision: string;
};

export type LocalChatResolvedMediaRoute = {
  source: LocalChatResolvedMediaRouteSource;
  connectorId?: string;
  model: string;
  localModelId?: string;
  goRuntimeLocalModelId?: string;
  goRuntimeStatus?: string;
  provider?: string;
  resolvedBy: LocalChatResolvedMediaRouteResolvedBy;
  resolvedAt: string;
  settingsRevision: string;
  routeOptionsRevision: number;
};

export type LocalChatMediaArtifactShadow = {
  kind: LocalChatMediaKind;
  status: LocalChatMediaArtifactStatus;
  subject: string;
  scene: string;
  styleIntent: string;
  mood: string;
  routeSource: LocalChatMediaRouteSource;
  routeModel: string | null;
  assetOrigin: 'generated' | 'cache-hit';
  shadowText: string;
};

export type LocalChatCachedMediaAsset = {
  executionCacheKey: string;
  specHash: string;
  kind: LocalChatMediaKind;
  renderUri: string;
  mimeType: string;
  routeSource: LocalChatMediaRouteSource;
  connectorId?: string;
  model?: string;
  createdAt: string;
  lastHitAt: string;
};

export type ChatMessageMeta = {
  interactionPlanId?: string;
  turnId?: string;
  beatId?: string;
  beatIndex?: number;
  beatCount?: number;
  beatModality?: LocalChatBeatModality;
  pauseMs?: number;
  relationMove?: string;
  sceneMove?: string;
  turnMode?: LocalChatTurnMode;
  voiceConversationMode?: 'off' | 'on';
  autoPlayVoice?: boolean;
  planId?: string;
  segmentId?: string;
  segmentIndex?: number;
  segmentCount?: number;
  intent?: string;
  scheduledDelayMs?: number;
  channelDecision?: 'text' | 'voice';
  routeSource?: 'local' | 'cloud';
  routeModel?: string;
  audioUri?: string;
  audioBytes?: Uint8Array;
  audioMimeType?: string;
  streamId?: string;
  streamChunkCount?: number;
  nsfwPolicy?: 'disabled' | 'local-only' | 'allowed';
  segmentParseMode?: 'explicit-delimiter' | 'double-newline' | 'single-message';
  mediaType?: 'image' | 'video';
  mediaStatus?: 'pending' | 'ready' | 'failed' | 'blocked';
  mediaPrompt?: string;
  mediaIntentSource?: 'tag' | 'explicit' | 'planner';
  mediaError?: string;
  mediaPlannerTrigger?: 'user-explicit' | 'assistant-offer' | 'scene-enhancement' | 'none' | 'marker-override';
  mediaPlannerConfidence?: number;
  mediaPlannerBlockedReason?: string;
  mediaSpec?: LocalChatMediaGenerationSpec;
  mediaSpecHash?: string;
  mediaShadow?: LocalChatMediaArtifactShadow;
  mediaCacheStatus?: LocalChatMediaCacheStatus;
  mediaExecutionCacheKey?: string;
  mediaResolvedRoute?: LocalChatResolvedMediaRoute;
  mediaCompilerRevision?: string;
};

export type ChatMessageKind =
  | 'text'
  | 'voice'
  | 'image'
  | 'video'
  | 'image-pending'
  | 'video-pending'
  | 'streaming';

export type ChatMessageMedia = {
  uri?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  previewUri?: string;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  kind: ChatMessageKind;
  content: string;
  media?: ChatMessageMedia;
  timestamp: Date;
  latencyMs?: number;
  meta?: ChatMessageMeta;
};

export type HealthStatus = 'idle' | 'checking' | 'healthy' | 'unreachable';
