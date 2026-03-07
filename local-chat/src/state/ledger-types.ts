import type { PromptLayerId } from '../prompt/types.js';
import type {
  ChatMessageKind,
  ChatMessageMedia,
  ChatMessageMeta,
  LocalChatCachedMediaAsset,
  LocalChatMediaArtifactShadow,
  LocalChatMediaGenerationSpec,
} from '../types.js';

export type LocalChatContextLaneId =
  | 'identity'
  | 'world'
  | 'platformWarmStart'
  | 'durableMemory'
  | 'runningSummary'
  | 'sessionRecall'
  | 'recentBundles'
  | 'userInput'
  | 'replyStyle';

export type LocalChatReplyStyleProfile = {
  responseLength: 'short' | 'medium' | 'long';
  formality: 'casual' | 'formal' | 'slang';
  sentiment: 'positive' | 'neutral' | 'cynical';
  relationshipMode: string;
  pacingStyle: 'reserved' | 'balanced' | 'bursty';
  followupStyle: 'rare' | 'situational' | 'eager';
  warmth: 'cool' | 'warm' | 'intimate';
  signals: string[];
};

export type LocalChatReplyPacingPlan = {
  mode: 'single' | 'burst-2' | 'answer-followup' | 'burst-3';
  maxSegments: 1 | 2 | 3;
  energy: 'low' | 'medium' | 'high';
  reason: string;
};

export type LocalChatContinuityStageHealth = {
  status: 'idle' | 'healthy' | 'degraded';
  consecutiveFailures: number;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastDurationMs: number | null;
  lastErrorCode: string | null;
};

export type LocalChatContinuityHealth = {
  runningSummary: LocalChatContinuityStageHealth;
  durableMemory: LocalChatContinuityStageHealth;
};

export type LocalChatPromptLaneBudget = {
  maxChars: number;
  usedChars: number;
  truncated: boolean;
};

export type LocalChatMemoryType =
  | 'relationship-state'
  | 'user-fact'
  | 'preference'
  | 'boundary'
  | 'assistant-commitment'
  | 'open-loop';

export type LocalChatMemoryStatus = 'active' | 'resolved' | 'superseded';

export type LocalChatContextTrace = {
  id: string;
  conversationId: string;
  routeSource: string;
  routeModel: string;
  promptChars: number;
  layerOrder: PromptLayerId[];
  appliedLayers: PromptLayerId[];
  droppedLayers: PromptLayerId[];
  laneChars: Partial<Record<LocalChatContextLaneId, number>>;
  truncationByLane: Partial<Record<LocalChatContextLaneId, boolean>>;
  memorySlices?: {
    core: number;
    e2e: number;
    worldLore: number;
    agentLore: number;
  };
  budget: {
    maxChars: number;
    usedChars: number;
    truncated: boolean;
  };
  laneBudgets: Partial<Record<LocalChatContextLaneId, LocalChatPromptLaneBudget>>;
  compilerVersion: 'v1' | 'v2' | 'v3' | 'v4' | 'v5';
  planner?: 'stream';
  planSegments?: number;
  voiceSegments?: number;
  textSegments?: number;
  schedulerTotalDelayMs?: number;
  streamDeltaCount?: number;
  streamDurationMs?: number;
  segmentParseMode?: 'explicit-delimiter' | 'double-newline' | 'single-message';
  replyStyleProfile?: LocalChatReplyStyleProfile;
  pacingPlan?: LocalChatReplyPacingPlan;
  continuityHealth?: LocalChatContinuityHealth | null;
  nsfwPolicy?: 'disabled' | 'local-runtime-only' | 'allowed';
  plannerUsed?: boolean;
  plannerKind?: 'none' | 'image' | 'video';
  plannerTrigger?: 'user-explicit' | 'assistant-offer' | 'scene-enhancement' | 'none' | 'marker-override';
  plannerConfidence?: number | null;
  plannerBlockedReason?: string | null;
  imageReady?: boolean;
  videoReady?: boolean;
  imageDependencyStatus?: 'ready' | 'missing' | 'degraded' | 'unknown' | null;
  videoDependencyStatus?: 'ready' | 'missing' | 'degraded' | 'unknown' | null;
  mediaDecisionSource?: 'tag' | 'explicit' | 'planner' | 'none';
  mediaDecisionKind?: 'none' | 'image' | 'video';
  mediaExecutionStatus?: 'none' | 'blocked' | 'pending' | 'ready' | 'failed';
  mediaExecutionRouteSource?: 'local-runtime' | 'token-api' | null;
  mediaExecutionRouteModel?: string | null;
  mediaExecutionReason?: string | null;
  selectedBundleSeqs: number[];
  runningSummaryWatermark: number;
  durableMemoryCountsByType: Partial<Record<LocalChatMemoryType, number>>;
  sessionRecallCount: number;
  createdAt: string;
};

export type LocalChatPromptTrace = LocalChatContextTrace;

export type LocalChatTurnAudit = {
  id: string;
  targetId: string;
  worldId: string | null;
  latencyMs: number;
  error: string | null;
  createdAt: string;
};

export type LocalChatTurnSegment = {
  id: string;
  bundleId: string;
  role: 'user' | 'assistant';
  kind: Exclude<ChatMessageKind, 'streaming' | 'image-pending' | 'video-pending'>;
  deliveryStatus: 'ready' | 'blocked' | 'failed';
  content: string;
  contextText: string;
  semanticSummary: string | null;
  mediaSpec?: LocalChatMediaGenerationSpec;
  mediaShadow?: LocalChatMediaArtifactShadow;
  media?: ChatMessageMedia;
  timestamp: string;
  latencyMs?: number;
  meta?: ChatMessageMeta;
  promptTrace?: LocalChatContextTrace;
  audit?: LocalChatTurnAudit;
};

export type LocalChatTurnBundle = {
  id: string;
  conversationId: string;
  seq: number;
  role: 'user' | 'assistant';
  turnTxnId: string | null;
  createdAt: string;
  updatedAt: string;
  segments: LocalChatTurnSegment[];
};

export type LocalChatConversationRecord = {
  id: string;
  targetId: string;
  viewerId: string;
  worldId: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastBundleSeq: number;
};

export type LocalChatMediaCacheEntry = LocalChatCachedMediaAsset;

export type LocalChatRunningSummary = {
  conversationId: string;
  relationshipState: string[];
  userFactsEstablished: string[];
  assistantCommitments: string[];
  openLoops: string[];
  sceneState: string[];
  updatedAt: string;
  lastSummarizedBundleSeq: number;
};

export type LocalChatSessionRecallDoc = {
  id: string;
  conversationId: string;
  sourceKind: 'bundle' | 'running-summary';
  sourceBundleSeq: number | null;
  text: string;
  createdAt: string;
  updatedAt: string;
};

export type LocalChatDurableMemoryEntry = {
  id: string;
  targetId: string;
  viewerId: string;
  type: LocalChatMemoryType;
  subject: 'viewer' | 'agent' | 'relationship';
  slotKey: string;
  content: string;
  confidence: number;
  importance: number;
  status: LocalChatMemoryStatus;
  sourceBundleSeqs: number[];
  supersedesIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type LocalChatPlatformWarmStartMemory = {
  core: string[];
  e2e: string[];
  recallSource: 'local-index-only' | 'local-index+remote-backfill' | 'remote-only';
  entityId: string | null;
};

export type LocalChatTurn = {
  id: string;
  role: 'user' | 'assistant';
  kind: Exclude<ChatMessageKind, 'streaming' | 'image-pending' | 'video-pending'>;
  content: string;
  contextText: string;
  semanticSummary?: string | null;
  mediaSpec?: LocalChatMediaGenerationSpec;
  mediaShadow?: LocalChatMediaArtifactShadow;
  media?: ChatMessageMedia;
  timestamp: string;
  latencyMs?: number;
  meta?: ChatMessageMeta;
  promptTrace?: LocalChatContextTrace;
  audit?: LocalChatTurnAudit;
  bundleId: string;
  bundleSeq: number;
};

export type LocalChatSession = {
  id: string;
  targetId: string;
  viewerId: string;
  worldId: string | null;
  title: string;
  turns: LocalChatTurn[];
  bundleCount: number;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
};

export type LocalChatContextPacket = {
  conversationId: string;
  viewer: {
    id: string;
    displayName: string;
  };
  target: {
    id: string;
    handle: string;
    displayName: string;
    bio: string | null;
    identityLines: string[];
    rulesLines: string[];
    replyStyleLines: string[];
    replyStyleProfile: LocalChatReplyStyleProfile;
  };
  world: {
    worldId: string | null;
    lines: string[];
  };
  platformWarmStart: LocalChatPlatformWarmStartMemory | null;
  runningSummary: LocalChatRunningSummary | null;
  durableMemory: LocalChatDurableMemoryEntry[];
  sessionRecall: Array<{
    id: string;
    text: string;
    sourceKind: 'bundle' | 'running-summary';
    sourceBundleSeq: number | null;
  }>;
  recentBundles: Array<{
    id: string;
    seq: number;
    role: 'user' | 'assistant';
    lines: string[];
  }>;
  pacingPlan: LocalChatReplyPacingPlan;
  userInput: string;
  diagnostics: {
    selectedBundleSeqs: number[];
    runningSummaryWatermark: number;
    sessionRecallCount: number;
    durableMemoryCountsByType: Partial<Record<LocalChatMemoryType, number>>;
    continuityHealth: LocalChatContinuityHealth | null;
  };
};
