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

export type TextplayReplicaSummary = {
  replicaId: string;
  storyId: string;
  worldId: string;
  sourceEventId: string;
  title: string;
  summary: string;
  primaryAgentId: string;
  participants: string[];
  createdAt: string;
  updatedAt: string;
  agentBindingMissing: boolean;
};

export type TextplayReplicaDetail = TextplayReplicaSummary & {
  cause: string;
  process: string;
  result: string;
  timeRef: string;
};

export type TextplayReplicaSnapshot = {
  replicaId: string;
  storyId: string;
  primaryAgentId: string;
  version: string;
  source: string;
  loadedAt: string;
};

export type TextplayStartupPackage = {
  replicaId: string;
  storyId: string;
  worldId: string;
  primaryAgentId: string;
  participants: string[];
  backgroundSummary: string;
  phase: string;
  objective: string;
  availableMaterials: {
    lorebooks: Array<{
      id: string;
      key: string;
      content: string;
      score: number;
    }>;
    memories: string[];
    recallSource: string;
  };
  recommendedEntryTurn: {
    turnId: string;
    createdAt?: string;
  } | null;
  snapshot: TextplayReplicaSnapshot;
};

export type TextplayPersistRecord = {
  id: string;
  storyId: string;
  turnId: string;
  runId: string;
  traceId: string;
  triggerSource: TextplayTriggerSource;
  playerId: string;
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
  visibility: TextplayVisibility;
  content: string;
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
  userMessage: string;
  systemPayload: Record<string, unknown> | null;
  sceneSummary: string;
  agentSummary: string;
  worldStyleSummary: string;
  events: TextplayProjectionEvent[];
  metrics: Record<string, unknown>;
};
