import type {
  ChunkTaskResult,
  EventNodeDraft,
  Phase1Character,
  Phase1Option,
  QualityGateResult,
  WorldLorebookDraftRow,
  WorldStudioAgentSyncPlan,
  WorldStudioAssetDraft,
  FinalDraftAccumulator,
  WorldStudioKnowledgeGraphDraft,
  WorldStudioNarrativeArc,
  WorldStudioParseJobState,
} from './generation.js';

export type WorldStudioLandingMode = 'NO_ACCESS' | 'CREATE' | 'MAINTAIN';
export type WorldStudioViewMode = WorldStudioLandingMode;
export type WorldStudioDraftStatus = 'DRAFT' | 'READY' | 'PUBLISHED' | 'ARCHIVED';
export type WorldStudioGenerationCheckpoint = 'SOURCE_PARSED' | 'STRUCTURED' | 'REVIEWED';
export type WorldStudioCreateStep =
  | 'SOURCE'
  | 'INGEST'
  | 'EXTRACT'
  | 'CHECKPOINTS'
  | 'SYNTHESIZE'
  | 'DRAFT'
  | 'PUBLISH';

export type WorldStudioTaskKind =
  | 'CREATE_PHASE1'
  | 'CREATE_PHASE2'
  | 'CREATE_WORLD_COVER'
  | 'CREATE_CHARACTER_PORTRAIT'
  | 'CREATE_SAVE_DRAFT'
  | 'CREATE_PUBLISH_DRAFT'
  | 'MAINTAIN_SAVE'
  | 'MAINTAIN_SYNC_EVENTS'
  | 'MAINTAIN_SYNC_LOREBOOKS';

export type WorldStudioTaskStatus =
  | 'RUNNING'
  | 'PAUSE_REQUESTED'
  | 'PAUSED'
  | 'CANCEL_REQUESTED'
  | 'CANCELED'
  | 'FAILED'
  | 'COMPLETED';

export type WorldStudioTaskCheckpoint = {
  checkpointVersion: number;
  step: WorldStudioCreateStep | 'MAINTAIN';
  chunkTotal?: number;
  chunkCompleted?: number;
  chunkFailed?: number;
  payload?: Record<string, unknown>;
};

export type WorldStudioTaskRecord = {
  id: string;
  kind: WorldStudioTaskKind;
  status: WorldStudioTaskStatus;
  label: string;
  atomic: boolean;
  resumable: boolean;
  canPause: boolean;
  canResume: boolean;
  canCancel: boolean;
  progress: number;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  message: string | null;
  errorMessage: string | null;
  errorCode: string | null;
  checkpoint: WorldStudioTaskCheckpoint | null;
};

export type WorldStudioTaskState = {
  activeTask: WorldStudioTaskRecord | null;
  recentTasks: WorldStudioTaskRecord[];
  expertMode: boolean;
};

export type WorldStudioEmbeddingIndexEntry = {
  text: string;
  vector: number[];
  dimensions: number;
  updatedAt: string;
};

export type WorldStudioEmbeddingIndex = {
  status: 'idle' | 'building' | 'ready' | 'failed';
  lastBuiltAt: string | null;
  routeSource: 'local-runtime' | 'token-api' | null;
  routeModel: string | null;
  entries: Record<string, WorldStudioEmbeddingIndexEntry>;
  errorMessage: string | null;
};

export type WorldStudioPhase1Artifact = {
  startTimeOptions: Phase1Option[];
  characterCandidates: Phase1Character[];
  qualityGate: QualityGateResult;
  chunkTasks: ChunkTaskResult[];
  narrativeArc: WorldStudioNarrativeArc | null;
  sourceDigest: string;
  updatedAt: string;
};

export type WorldStudioPanelState = {
  searchText: string;
  selectedWorldId: string;
  selectedDraftId: string;
  activeMaintainTab: 'WORLD' | 'WORLDVIEW' | 'EVENTS' | 'LOREBOOKS' | 'MUTATIONS';
};

export type WorldStudioWorkspaceSnapshot = {
  panel: WorldStudioPanelState;
  createStep: WorldStudioCreateStep;
  sourceText: string;
  sourceRef: string;
  worldPatch: Record<string, unknown>;
  worldviewPatch: Record<string, unknown>;
  eventsDraft: {
    primary: EventNodeDraft[];
    secondary: EventNodeDraft[];
  };
  lorebooksDraft: WorldLorebookDraftRow[];
  futureEventsText: string;
  selectedStartTimeId: string;
  selectedCharacters: string[];
  worldPatchText?: string;
  worldviewPatchText?: string;
  eventsText?: string;
  lorebooksText?: string;
  parseJob: WorldStudioParseJobState;
  knowledgeGraph: WorldStudioKnowledgeGraphDraft;
  finalDraftAccumulator: FinalDraftAccumulator;
  phase1Artifact: WorldStudioPhase1Artifact | null;
  assets: WorldStudioAssetDraft;
  agentSync: WorldStudioAgentSyncPlan;
  eventGraphLayout: {
    selectedEventId: string;
    expandedPrimaryIds: string[];
  };
  embeddingIndex: WorldStudioEmbeddingIndex;
  taskState: WorldStudioTaskState;
  editorSnapshotVersion: string;
  unsavedChangesByPanel: {
    world: boolean;
    worldview: boolean;
    events: boolean;
    lorebooks: boolean;
  };
};

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Array<infer U>
    ? Array<DeepPartial<U>>
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

export type WorldStudioSnapshotPatch = DeepPartial<WorldStudioWorkspaceSnapshot>;
