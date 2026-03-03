export type TextplayTriggerSource = 'UserTurn' | 'AgentInitiative' | 'SystemEvent';
export type TextplayVisibility = 'public' | 'internal' | 'sensory';

export type TextplayPresenceState = 'composing' | 'paused' | 'active' | 'idle' | 'away';

export type TextplayRunStatus =
  | 'RUNNING'
  | 'PAUSE_REQUESTED'
  | 'PAUSED'
  | 'CANCEL_REQUESTED'
  | 'CANCELED'
  | 'FAILED'
  | 'COMPLETED';

export type TextplayRetryClass = 'retryable' | 'non-retryable';

export type TextplayRunEventType =
  | 'run.start'
  | 'step.start'
  | 'step.chunk'
  | 'step.complete'
  | 'step.error'
  | 'run.complete'
  | 'run.error'
  | 'run.canceled';

export type TextplayRunEvent = {
  traceId: string;
  runId: string;
  parentRunId?: string | null;
  taskId?: string;
  stage: 'textplay';
  step: string;
  eventType: TextplayRunEventType;
  seq: number;
  attempt: number;
  timestamp: string;
  reasonCode?: string;
  actionHint?: string;
  retryClass?: TextplayRetryClass;
  idempotencyKey?: string;
  checkpointToken?: string;
  stepInputHash?: string;
  lastCompletedUnit?: string;
};

export type TextplayRunSnapshot = {
  status: TextplayRunStatus;
  lastSeq: number;
  lastCompletedStep: string;
  checkpointToken: string;
  stepInputHash: string;
  lastCompletedUnit: string;
  gapRefillApplied: boolean;
  terminalEventType?: TextplayRunEventType;
};

export type TextplayPresenceReport = {
  id: string;
  at: string;
  fromState: TextplayPresenceState;
  toState: TextplayPresenceState;
  event: string;
};

export type TextplayWarning = {
  code: string;
  stage: string;
  actionHint: string;
  message: string;
  at: string;
};

export type TextplayRouteInfo = {
  source: string;
  connectorId: string;
  model: string;
  provider: string;
  endpoint: string;
};

export type TextplayRenderMeta = {
  storyId: string;
  turnId: string;
  runId: string;
  traceId: string;
  promptTraceId: string;
  route: TextplayRouteInfo;
  sourceEventIds: string[];
  warnings: TextplayWarning[];
  presenceReports: TextplayPresenceReport[];
  runSnapshot: TextplayRunSnapshot;
  chainReasonCode?: string;
};

export type TextplayRenderSuccess = {
  ok: true;
  text: string;
  meta: TextplayRenderMeta;
  runEvents: TextplayRunEvent[];
};

export type TextplayRenderFailure = {
  ok: false;
  reasonCode: string;
  actionHint: string;
  stage: 'renderer';
  chainReasonCode: string;
  traceId: string;
  runId: string;
  runEvents: TextplayRunEvent[];
  runSnapshot: TextplayRunSnapshot;
  warnings: TextplayWarning[];
};

export type TextplayRenderResult = TextplayRenderSuccess | TextplayRenderFailure;

export type TextplayWorldSummary = {
  id: string;
  name: string;
  status: string;
  description: string | null;
  updatedAt: string;
};

export type TextplayStorySummary = {
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

export type TextplayStoryDetail = TextplayStorySummary & {
  cause: string;
  process: string;
  result: string;
  timeRef: string;
  locationRefs: string[];
  characterRefs: string[];
  recommendedSceneId: string | null;
};

export type TextplayStorySnapshot = {
  storyId: string;
  entryEventId: string;
  primaryAgentId: string;
  version: string;
  source: string;
  loadedAt: string;
  contextCoverage: {
    canon: boolean;
    story: boolean;
    subject: boolean;
    relation: boolean;
    scene: boolean;
  };
  gapWarnings: string[];
};

export type TextplayStartupPolicy = {
  initiative: {
    enabled: boolean;
    tickSeconds: number;
    cooldownSeconds: number;
    maxConsecutive: number;
    blockedPresenceStates: TextplayPresenceState[];
  };
  pacing: {
    targetTension: number;
    tensionBand: [number, number];
    beatDensity: number;
    curve: string;
  };
};

export type TextplayStartupPackage = {
  storyId: string;
  worldId: string;
  entryEventId: string;
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
  background: {
    summary: string;
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
  recommendedEntryTurn: {
    turnId: string;
    createdAt?: string;
  } | null;
  startupPolicy: TextplayStartupPolicy;
  snapshot: TextplayStorySnapshot;
};

export type TextplayPersistRecord = {
  id: string;
  storyId: string;
  worldId: string;
  agentId: string;
  turnId: string;
  runId: string;
  traceId: string;
  triggerSource: TextplayTriggerSource;
  playerId: string;
  playerIdentity?: string;
  userMessage: string;
  systemPayload: Record<string, unknown> | null;
  text: string;
  meta: TextplayRenderMeta;
  runEvents: TextplayRunEvent[];
  runSnapshot: TextplayRunSnapshot;
  warnings: TextplayWarning[];
  presenceReports: TextplayPresenceReport[];
  createdAt: string;
  updatedAt: string;
};

export type TextplayProjectionEvent = {
  eventId: string;
  type: string;
  visibility: TextplayVisibility;
  content: string;
  payload: Record<string, unknown>;
  thinker: string;
  decider: string;
  experiencer: string;
  owner: string;
  sourceEventIds: string[];
};

export type TextplayNormalizedRenderInput = {
  storyId: string;
  worldId: string;
  agentId: string;
  turnId: string;
  runId: string;
  traceId: string;
  triggerSource: TextplayTriggerSource;
  playerId: string;
  playerName: string;
  playerIdentity: string;
  userMessage: string;
  systemPayload: Record<string, unknown> | null;
  sceneSummary: string;
  agentSummary: string;
  worldStyleSummary: string;
  events: TextplayProjectionEvent[];
  metrics: Record<string, unknown>;
  pacingContext: {
    currentTension: number;
    tensionBand: 'HIGH' | 'MODERATE' | 'LOW';
  };
};

export type TextplayStoryBrief = {
  mode: 'opening' | 'recap';
  text: string;
  generatedAt: string;
};

export type TextplayHistorySession = {
  runId: string;
  storyId: string;
  worldId: string;
  agentId: string;
  storyTitle: string;
  updatedAt: string;
  triggerSource: TextplayTriggerSource;
  preview: string;
};
