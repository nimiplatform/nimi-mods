import type {
  EventNodeDraft,
  WorldStudioAgentDraft,
  WorldStudioMaintainDomain,
  WorldStudioMaintainSection,
  WorldStudioCreateStep,
  WorldStudioSnapshotPatch,
  WorldStudioTaskRecord,
  WorldStudioWorkspaceSnapshot,
} from '../contracts.js';
import type { Phase1Result, Phase2Result } from '../generation/pipeline.js';
import type {
  WorldDraftSummary,
  WorldMutationSummary,
  WorldStudioCreatorAgentSummary,
  WorldStudioResourceBindingSummary,
  WorldSummary,
} from '../ui/types.js';
import type { LandingState } from '../ui/types.js';
import type { RetryScope } from '../services/event-graph-map.js';
import type { SupportedEncoding } from '../engine/encoding.js';
import {
  type RuntimeRouteBinding,
  type RuntimeRouteConnectorOption,
  type RuntimeRouteOptionsSnapshot,
  type RuntimeRouteSource,
} from "@nimiplatform/sdk/mod";

export type WorldStudioCreateDisplayStage = 'IMPORT' | 'CURATE' | 'GENERATE' | 'REVIEW';
export type WorldStudioImportSubview = 'PREPARE' | 'RUNNING' | 'RESULT';
export type WorldStudioReviewSubview = 'EDIT' | 'PUBLISH_REVIEW';
export type WorldStudioCreateStageAccess = Record<WorldStudioCreateDisplayStage, {
  enabled: boolean;
  reason: string | null;
}>;

export type WorldStudioDirtySummary = {
  hasDirty: boolean;
  count: number;
  labels: string[];
  shortLabel: string;
};

export type WorldStudioLayoutSlice = {
  title: string;
  subtitle: string;
  currentObjectLabel: string;
  dirtySummary: WorldStudioDirtySummary;
  settingsDrawerOpen: boolean;
  setSettingsDrawerOpen: (value: boolean) => void;
  toggleSettingsDrawer: () => void;
};

export type WorldStudioWorkflowSlice = {
  landing: LandingState;
  landingTarget: 'CREATE' | 'MAINTAIN';
  worlds: WorldSummary[];
  drafts: WorldDraftSummary[];
  primaryWorld: WorldSummary | null;
  latestDraft: WorldDraftSummary | null;
  selectedWorldId: string;
  selectedDraftId: string;
  createDisplayStage: WorldStudioCreateDisplayStage;
  createStageAccess: WorldStudioCreateStageAccess;
  activeDomain: WorldStudioMaintainDomain;
  activeSection: WorldStudioMaintainSection;
  selectedAgentId: string;
};

export type WorldStudioMainSlice = {
  snapshot: WorldStudioWorkspaceSnapshot;
  phase1: Phase1Result | null;
  phase2: Phase2Result | null;
  sourceMode: 'TEXT' | 'FILE';
  sourceEncoding: SupportedEncoding;
  filePreviewText: string;
  retryWithFineRoute: boolean;
  retryScope: RetryScope;
  retryConcurrency: number;
  retryErrorCode: string | null;
  routeOptions: RuntimeRouteOptionsSnapshot | null;
  eventSyncMode: 'merge' | 'replace';
  selectedAgentSyncCharacters: string[];
  truthDerivedAgentDraftsByCharacter: Record<string, WorldStudioAgentDraft>;
  eventsGraph: {
    primary: EventNodeDraft[];
    secondary: EventNodeDraft[];
  };
  timeFlowRatio: string;
  importSubview: WorldStudioImportSubview;
  reviewSubview: WorldStudioReviewSubview;
  working: boolean;
  creatorAgents: WorldStudioCreatorAgentSummary[];
  selectedCreatorAgent: WorldStudioCreatorAgentSummary | null;
  resourceBindings: WorldStudioResourceBindingSummary[];
};

export type WorldStudioRoutingSlice = {
  activeCoarseRouteSource: RuntimeRouteSource;
  activeCoarseRouteConnectorId: string;
  activeFineRouteSource: RuntimeRouteSource;
  activeFineRouteConnectorId: string;
  effectiveCoarseRouteBinding: RuntimeRouteBinding | null;
  effectiveFineRouteBinding: RuntimeRouteBinding | null;
  coarseRouteModelOptions: string[];
  fineRouteModelOptions: string[];
  routeConnectors: RuntimeRouteConnectorOption[];
  routeConfigReady: boolean;
  routeConfigReasonCode: string;
  routeConfigActionHint: 'none' | 'install-local-model' | 'switch-cloud' | 'select-model' | 'select-connector';
  coarseRouteReadiness: {
    ready: boolean;
    reasonCode: string;
    actionHint: string;
    message: string;
  };
  fineRouteReadiness: {
    ready: boolean;
    reasonCode: string;
    actionHint: string;
    message: string;
  };
  embeddingReadiness: {
    healthy: boolean;
    reasonCode: string;
    actionHint: 'none' | 'install-local-model' | 'switch-cloud' | 'retry';
    message: string;
  };
  embeddingIndexStatus: 'idle' | 'building' | 'ready' | 'failed';
  embeddingEntryCount: number;
  embeddingIndexLastBuiltAt: string | null;
  embeddingIndexErrorMessage: string | null;
  effectiveCoarseRouteSummary: string;
  effectiveFineRouteSummary: string;
};

export type WorldStudioStatusSlice = {
  landingLoading: boolean;
  activeTask: WorldStudioTaskRecord | null;
  recentTasks: WorldStudioTaskRecord[];
  expertMode: boolean;
  localWorkspaceSavedAt: string | null;
  notice: string | null;
  error: string | null;
  conflictReloadSummary: string | null;
  hasMaintenanceConflict: boolean;
  maintenanceEditorSnapshotVersion: string;
  mutations: WorldMutationSummary[];
  storyProjectionCount: number;
  storyProjectionMissingContextCount: number;
  storyProjectionLatestAt: string;
  primaryEventCount: number;
  secondaryEventCount: number;
  missingPrimaryEvidenceCount: number;
  eventCharacterCoverage: number;
  eventLocationCoverage: number;
  terminalChunkSuccess: number;
  terminalChunkTotal: number;
  terminalChunkFailed: number;
  terminalTopFailure: {
    code: string;
    count: number;
  } | null;
};

export type WorldStudioActionsSlice = {
  workflow: {
    loadLanding: () => Promise<void>;
    openMaintenance: (worldId: string) => void;
    openCreate: (draftId: string | null) => void;
    selectCreateDisplayStage: (stage: WorldStudioCreateDisplayStage) => void;
    selectMaintainDomain: (domain: WorldStudioMaintainDomain) => void;
    selectMaintainSection: (section: WorldStudioMaintainSection) => void;
    selectMaintainAgent: (agentId: string) => void;
    refreshWorkspace: () => Promise<void>;
    openRuntimeSetup?: () => void;
  };
  source: {
    onSourceTextChange: (value: string) => void;
    onSourceRefChange: (value: string) => void;
    onSourceEncodingChange: (value: SupportedEncoding) => void;
    onSelectSourceFile: (file: File | null) => Promise<void>;
    startExtraction: () => Promise<void>;
    retryFailed: () => Promise<void>;
    retryFailedByErrorCode: (errorCode: string) => Promise<void>;
    clearRetryErrorCode: () => void;
    setRetryWithFineRoute: (value: boolean) => void;
    setRetryScope: (value: RetryScope) => void;
    setRetryConcurrency: (value: number) => void;
  };
  curate: {
    onSelectStartTimeId: (id: string) => void;
    onToggleCharacter: (name: string, checked: boolean) => void;
    onEventsGraphChange: (next: { primary: EventNodeDraft[]; secondary: EventNodeDraft[] }) => void;
    onEventGraphLayoutChange: (next: { selectedEventId: string; expandedPrimaryIds: string[] }) => void;
    refreshQualityGate: () => void;
    continueToGenerate: () => void;
  };
  generate: {
    onTimeFlowRatioChange: (value: string) => void;
    onFutureEventsTextChange: (value: string) => void;
    onGenerateWorldCover: () => Promise<void>;
    onGenerateCharacterPortrait: (name: string) => Promise<void>;
    onToggleAgentSyncCharacter: (name: string, checked: boolean) => void;
    onAgentDraftChange: (name: string, patch: Partial<WorldStudioWorkspaceSnapshot['agentSync']['draftsByCharacter'][string]>) => void;
    runPhase2: () => Promise<void>;
  };
  review: {
    onWorldPatchChange: (value: Record<string, unknown>) => void;
    onWorldviewPatchChange: (value: Record<string, unknown>) => void;
    onRuleTruthDraftChange: (value: WorldStudioWorkspaceSnapshot['ruleTruthDraft']) => void;
    onEventsChange: (value: { primary: EventNodeDraft[]; secondary: EventNodeDraft[] }) => void;
    onLorebooksChange: (value: WorldStudioWorkspaceSnapshot['lorebooksDraft']) => void;
    onEventGraphLayoutChange: (next: { selectedEventId: string; expandedPrimaryIds: string[] }) => void;
    saveDraft: () => Promise<void>;
    publishDraft: () => Promise<void>;
    backToEdit: () => void;
  };
  maintain: {
    onWorldPatchChange: (value: Record<string, unknown>) => void;
    onWorldviewPatchChange: (value: Record<string, unknown>) => void;
    onEventsChange: (value: { primary: EventNodeDraft[]; secondary: EventNodeDraft[] }) => void;
    onLorebooksChange: (value: WorldStudioWorkspaceSnapshot['lorebooksDraft']) => void;
    onEventGraphLayoutChange: (next: { selectedEventId: string; expandedPrimaryIds: string[] }) => void;
    onEventSyncModeChange: (mode: 'merge' | 'replace') => void;
    saveLocalWorkspace: () => Promise<void>;
    syncToRemote: (payload?: { force?: boolean }) => Promise<void>;
    syncWorkspaceToRemote: () => Promise<void>;
    saveMaintenance: (payload?: { force?: boolean }) => Promise<void>;
    syncEvents: (payload?: { force?: boolean }) => Promise<void>;
    syncLorebooks: () => Promise<void>;
    deleteFirstEvent: () => Promise<void>;
    deleteFirstLorebook: () => Promise<void>;
    createAgentsFromDrafts: (characterNames?: string[]) => Promise<void>;
    updateCreatorAgentMetadata: (agentId: string, patch: Record<string, unknown>) => Promise<void>;
    setSectionDirty: (section: keyof WorldStudioWorkspaceSnapshot['unsavedChangesByPanel'], dirty: boolean) => void;
    syncResourceBindings: (scope: 'WORLD_ASSETS' | 'AGENT_ASSETS') => Promise<void>;
    refreshResources: () => Promise<void>;
    reloadRemote: () => Promise<void>;
    reloadFromRemote: () => Promise<void>;
    adoptRemoteSnapshot: () => void;
  };
  routing: {
    onRouteSourceChange: (profile: 'coarse' | 'fine', source: RuntimeRouteSource) => void;
    onRouteConnectorChange: (profile: 'coarse' | 'fine', connectorId: string) => void;
    onRouteModelChange: (profile: 'coarse' | 'fine', model: string) => void;
    onClearRouteBinding: (profile: 'coarse' | 'fine' | 'all') => void;
    onRebuildEmbeddingIndex: () => Promise<void>;
    onSetExpertMode: (value: boolean) => void;
  };
  task: {
    pauseTask: () => boolean;
    resumeTask: () => Promise<boolean>;
    cancelTask: () => boolean;
  };
};

export type WorldStudioScreenModel = {
  layout: WorldStudioLayoutSlice;
  workflow: WorldStudioWorkflowSlice;
  main: WorldStudioMainSlice;
  routing: WorldStudioRoutingSlice;
  status: WorldStudioStatusSlice;
  actions: WorldStudioActionsSlice;
};

export type WorldStudioScreenModelBuildArgs = {
  title: string;
  subtitle: string;
  currentObjectLabel: string;
  dirtySummary: WorldStudioDirtySummary;
  layoutState: Pick<
    WorldStudioLayoutSlice,
    'settingsDrawerOpen'
    | 'setSettingsDrawerOpen'
    | 'toggleSettingsDrawer'
  >;
  workflow: Omit<WorldStudioWorkflowSlice, 'landingTarget'>;
  main: WorldStudioMainSlice;
  routing: WorldStudioRoutingSlice;
  status: Omit<WorldStudioStatusSlice, 'landingLoading'> & { landingLoading: boolean };
  actions: WorldStudioActionsSlice;
};
