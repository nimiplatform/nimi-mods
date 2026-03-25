import type { PromptLayerId } from '../prompt/types.js';
import type { LocalChatDefaultSettings } from '../default-settings-store.js';
import type {
  LocalChatBeatModality,
  ChatMessageKind,
  ChatMessageMedia,
  ChatMessageMeta,
  LocalChatTurnMode,
  LocalChatCachedMediaArtifact,
  LocalChatMediaArtifactShadow,
  LocalChatMediaGenerationSpec,
} from '../types.js';

export type LocalChatContextLaneId =
  | 'identity'
  | 'world'
  | 'platformWarmStart'
  | 'sessionRecall'
  | 'recentTurns'
  | 'userInput'
  | 'interactionProfile'
  | 'interactionState'
  | 'relationMemory'
  | 'turnMode';

export type VoiceConversationMode = 'off' | 'on';

export type DerivedInteractionProfile = {
  expression: {
    responseLength: 'short' | 'medium' | 'long';
    formality: 'casual' | 'formal' | 'slang';
    sentiment: 'positive' | 'neutral' | 'cynical';
    pacingBias: 'reserved' | 'balanced' | 'bursty';
    firstBeatStyle: 'gentle' | 'playful' | 'direct' | 'intimate' | 'grounded';
    infoAnswerStyle: 'concise' | 'balanced' | 'guided';
    emojiUsage: 'none' | 'occasional' | 'frequent';
  };
  relationship: {
    defaultDistance: 'formal' | 'friendly' | 'warm' | 'intimate';
    warmth: 'cool' | 'warm' | 'intimate';
    flirtAffinity: 'none' | 'light' | 'high';
    proactiveStyle: 'quiet' | 'gentle' | 'playful';
    intimacyGuard: 'strict' | 'balanced' | 'open';
  };
  voice: {
    voiceId: string | null;
    language: string | null;
    genderGuard: 'male' | 'female' | 'neutral' | 'unspecified';
    speedRange: 'slow' | 'balanced' | 'fast';
    pitchRange: 'low' | 'mid' | 'bright';
    emotionEnabled: boolean;
    voiceAffinity: 'low' | 'medium' | 'high';
  };
  visual: {
    artStyle: string | null;
    fashionStyle: string | null;
    personaCue: string | null;
    nsfwLevel: string | null;
    imageAffinity: 'low' | 'medium' | 'high';
    videoAffinity: 'low' | 'medium' | 'high';
  };
  modalityTraits: {
    textBias: 'low' | 'medium' | 'high';
    voiceBias: 'low' | 'medium' | 'high';
    imageBias: 'low' | 'medium' | 'high';
    videoBias: 'low' | 'medium' | 'high';
    latencyTolerance: 'low' | 'medium' | 'high';
  };
  signals: string[];
};

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

export type InteractionBeatMediaRequest = {
  kind: 'image' | 'video';
  prompt: string;
  confidence: number;
  nsfwIntent: 'none' | 'suggested';
};

export type InteractionBeat = {
  beatId: string;
  turnId: string;
  beatIndex: number;
  beatCount: number;
  intent: 'answer' | 'clarify' | 'checkin' | 'comfort' | 'tease' | 'invite' | 'media';
  relationMove: string;
  sceneMove: string;
  modality: LocalChatBeatModality;
  text: string;
  pauseMs: number;
  mediaRequest?: InteractionBeatMediaRequest;
  cancellationScope: 'turn' | 'tail';
  autoPlayVoice?: boolean;
};

export type InteractionTurnPlan = {
  planId: string;
  turnId: string;
  turnMode: LocalChatTurnMode;
  beats: InteractionBeat[];
  fallbackPolicy: 'first-beat-only';
  expiresAt: string;
};

export type FirstBeatResult = {
  text: string;
  transientMessageId: string;
  traceId: string | null;
  latencyMs: number;
  streamDeltaCount: number;
  streamDurationMs: number;
};

export type LocalChatTurnSendPhase =
  | 'idle'
  | 'awaiting-first-beat'
  | 'streaming-first-beat'
  | 'planning-tail'
  | 'delivering-tail';

export type InteractionSnapshot = {
  conversationId: string;
  relationshipState: 'new' | 'friendly' | 'warm' | 'intimate';
  activeScene: string[];
  emotionalTemperature: 'low' | 'steady' | 'warm' | 'heated';
  assistantCommitments: string[];
  userPrefs: string[];
  openLoops: string[];
  topicThreads: string[];
  lastResolvedTurnId: string | null;
  conversationDirective: string | null;
  conversationMomentum?: 'accelerating' | 'steady' | 'cooling';
  updatedAt: string;
};

export type RelationMemorySlotType =
  | 'preference'
  | 'boundary'
  | 'rapport'
  | 'promise'
  | 'recurringCue'
  | 'taboo';

export type RelationMemorySlot = {
  id: string;
  targetId: string;
  viewerId: string;
  slotType: RelationMemorySlotType;
  key: string;
  value: string;
  confidence: number;
  portability: 'portable' | 'local-only' | 'blocked';
  sensitivity: 'safe' | 'personal' | 'intimate';
  userOverride: 'inherit' | 'never-sync' | 'force-portable';
  updatedAt: string;
};

export type InteractionRecallDoc = {
  id: string;
  conversationId: string;
  sourceTurnId: string | null;
  text: string;
  createdAt: string;
  updatedAt: string;
};

export type LocalChatPromptLaneBudget = {
  maxChars: number;
  usedChars: number;
  truncated: boolean;
};

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
  compilerVersion: 'v1' | 'v2' | 'v3' | 'v4' | 'v5' | 'v6' | 'v7';
  planner?: 'stream';
  turnMode?: LocalChatTurnMode;
  interactionProfile?: DerivedInteractionProfile;
  voiceConversationMode?: VoiceConversationMode;
  planSegments?: number;
  voiceSegments?: number;
  textSegments?: number;
  schedulerTotalDelayMs?: number;
  streamDeltaCount?: number;
  streamDurationMs?: number;
  segmentParseMode?: 'explicit-delimiter' | 'double-newline' | 'single-message';
  pacingPlan?: LocalChatReplyPacingPlan;
  nsfwPolicy?: 'disabled' | 'local-only' | 'allowed';
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
  mediaExecutionRouteSource?: 'local' | 'cloud' | null;
  mediaExecutionRouteModel?: string | null;
  mediaExecutionReason?: string | null;
  selectedTurnSeqs: number[];
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

export type LocalChatStoredBeat = {
  id: string;
  turnId: string;
  turnSeq: number;
  conversationId: string;
  role: 'user' | 'assistant';
  beatIndex: number;
  beatCount: number;
  kind: Exclude<ChatMessageKind, 'streaming' | 'image-pending' | 'video-pending'>;
  deliveryStatus: 'pending' | 'ready' | 'blocked' | 'failed';
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

export type LocalChatTurnRecord = {
  id: string;
  conversationId: string;
  seq: number;
  role: 'user' | 'assistant';
  turnTxnId: string | null;
  createdAt: string;
  updatedAt: string;
  beatCount: number;
};

export type LocalChatTurnWithBeats = LocalChatTurnRecord & {
  beats: LocalChatStoredBeat[];
};

export type LocalChatConversationRecord = {
  id: string;
  targetId: string;
  viewerId: string;
  worldId: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastTurnSeq: number;
};

export type LocalChatMediaArtifactRecord = LocalChatCachedMediaArtifact & {
  id: string;
  conversationId: string | null;
  turnId: string | null;
  beatId: string | null;
};

export type LocalChatPlatformWarmStartMemory = {
  core: string[];
  e2e: string[];
  recallSource: 'local-index-only' | 'local-index+remote-backfill' | 'remote-only';
  entityId: string | null;
};

export type LocalChatTurn = {
  id: string;
  turnId: string;
  turnSeq: number;
  beatIndex: number;
  beatCount: number;
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
};

export type LocalChatSession = {
  id: string;
  targetId: string;
  viewerId: string;
  worldId: string | null;
  title: string;
  turns: LocalChatTurn[];
  turnCount: number;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
};

export type LocalChatContextRecentTurn = {
  id: string;
  seq: number;
  role: 'user' | 'assistant';
  lines: string[];
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
    interactionProfileLines?: string[];
    interactionProfile: DerivedInteractionProfile;
  };
  world: {
    worldId: string | null;
    lines: string[];
  };
  platformWarmStart: LocalChatPlatformWarmStartMemory | null;
  sessionRecall: Array<{
    id: string;
    text: string;
    sourceKind: 'turn' | 'recall-index';
    sourceTurnId: string | null;
  }>;
  recentTurns: LocalChatContextRecentTurn[];
  interactionSnapshot?: InteractionSnapshot | null;
  relationMemorySlots?: RelationMemorySlot[];
  recallIndex?: InteractionRecallDoc[];
  turnMode?: LocalChatTurnMode;
  voiceConversationMode?: VoiceConversationMode;
  contentBoundaryHint?: {
    visualComfortLevel: LocalChatDefaultSettings['visualComfortLevel'];
    relationshipBoundaryPreset: LocalChatDefaultSettings['relationshipBoundaryPreset'];
  };
  pacingPlan: LocalChatReplyPacingPlan;
  perceptionOverlay?: {
    refinedTurnMode: LocalChatTurnMode;
    emotionalState: string;
    emotionalCause: string;
    suggestedApproach: string;
    directive: string;
    intimacyCeiling: string;
  };
  promptLocale: 'en' | 'zh';
  userInput: string;
  diagnostics: {
    selectedTurnSeqs: number[];
    sessionRecallCount: number;
  };
};
