import type {
  RuntimeRouteBinding,
  RuntimeRouteConnectorOption,
  RuntimeRouteOptionsSnapshot,
  RuntimeRouteSource,
} from '@nimiplatform/sdk/mod/runtime-route';
import type { SupportedEncoding } from '../engine/encoding.js';
import type {
  EventNodeDraft,
  WorldStudioCreateStep,
  WorldStudioSnapshotPatch,
  WorldStudioTaskRecord,
  WorldStudioWorkspaceSnapshot,
} from '../contracts.js';
import type {
  LandingState,
  WorldDraftSummary,
  WorldMutationSummary,
  WorldSummary,
} from '../ui/types.js';
import type { Phase1Result, Phase2Result } from '../generation/pipeline.js';
import type { RetryScope } from '../services/event-graph-map.js';

export type WorldStudioShellBaseInput = {
  landingLoading: boolean;
  loadLanding: () => Promise<void>;
  landing: LandingState;
  setLanding: (next: LandingState) => void;
  notice: string | null;
  error: string | null;
  conflictReloadSummary: string | null;
};

export type WorldStudioShellWorkspaceInput = {
  snapshot: WorldStudioWorkspaceSnapshot;
  worlds: WorldSummary[];
  drafts: WorldDraftSummary[];
  primaryWorld: WorldSummary | null;
  latestDraft: WorldDraftSummary | null;
  selectedWorldId: string;
  selectedDraftId: string;
  phase1: Phase1Result | null;
  phase2: Phase2Result | null;
  eventsGraph: { primary: EventNodeDraft[]; secondary: EventNodeDraft[] };
  selectedAgentSyncCharacters: string[];
  activeTask: WorldStudioTaskRecord | null;
  recentTasks: WorldStudioTaskRecord[];
  expertMode: boolean;
  timeFlowRatio: string;
  currentTimeNode: string;
  working: boolean;
  routeOptions: RuntimeRouteOptionsSnapshot | null;
  maintenanceEditorSnapshotVersion: string;
  sourceChunksRef: { current: string[] };
};

export type WorldStudioShellRuntimeInput = {
  sourceMode: 'TEXT' | 'FILE';
  sourceEncoding: SupportedEncoding;
  filePreviewText: string;
  retryWithFineRoute: boolean;
  retryScope: RetryScope;
  retryConcurrency: number;
  retryErrorCode: string | null;
  eventSyncMode: 'merge' | 'replace';
  mutations: WorldMutationSummary[];
  setError: (value: string | null) => void;
  setCreateStep: (step: WorldStudioCreateStep) => void;
  patchSnapshot: (patch: WorldStudioSnapshotPatch) => void;
  patchPanel: (patch: Partial<WorldStudioWorkspaceSnapshot['panel']>) => void;
  setSourceMode: (mode: 'TEXT' | 'FILE') => void;
  setSourceEncoding: (encoding: SupportedEncoding) => void;
  setFilePreviewText: (value: string) => void;
  setRetryWithFineRoute: (value: boolean) => void;
  setRetryScope: (scope: RetryScope) => void;
  setRetryConcurrency: (value: number) => void;
  setRetryErrorCode: (value: string | null) => void;
  setEventSyncMode: (mode: 'merge' | 'replace') => void;
};

export type WorldStudioShellActionInput = {
  onSelectSourceFile: (file: File | null) => Promise<void>;
  onRunPhase1: (mode?: 'all' | 'failed', forcedRetryErrorCode?: string | null) => Promise<void>;
  onRunPhase2: () => Promise<void>;
  onRefreshPhase1QualityGate: () => void;
  onRebuildEmbeddingIndex: () => Promise<void>;
  onGenerateWorldCover: () => Promise<void>;
  onGenerateCharacterPortrait: (name: string) => Promise<void>;
  onToggleAgentSyncCharacter: (name: string, checked: boolean) => void;
  onAgentDraftChange: (name: string, patch: Partial<WorldStudioWorkspaceSnapshot['agentSync']['draftsByCharacter'][string]>) => void;
  onTimeFlowRatioChange: (value: string) => void;
  onCurrentTimeNodeChange: (value: string) => void;
  onFutureEventsTextChange: (value: string) => void;
  onSyncEvents: (payload?: { force?: boolean }) => Promise<void>;
  onDeleteFirstEvent: () => Promise<void>;
  onSyncLorebooks: () => Promise<void>;
  onDeleteFirstLorebook: () => Promise<void>;
  onSaveDraft: () => Promise<void>;
  onPublishDraft: () => Promise<void>;
  onResetDraft: () => void;
  pauseTask: () => boolean;
  resumeTask: () => Promise<boolean>;
  cancelTask: () => boolean;
  setExpertMode: (value: boolean) => void;
  onReloadRemoteForConflict: () => Promise<void>;
  onAdoptRemoteSnapshot: () => void;
  refreshResources: () => Promise<void>;
  onSaveMaintenance: (payload?: { force?: boolean }) => Promise<void>;
};

export type WorldStudioShellRoutingInput = {
  activeCoarseRouteSource: RuntimeRouteSource;
  activeCoarseRouteConnectorId: string;
  activeFineRouteSource: RuntimeRouteSource;
  activeFineRouteConnectorId: string;
  effectiveCoarseRouteBinding: RuntimeRouteBinding | null;
  effectiveFineRouteBinding: RuntimeRouteBinding | null;
  coarseRouteModelOptions: string[];
  fineRouteModelOptions: string[];
  onRouteSourceChange: (profile: 'coarse' | 'fine', source: RuntimeRouteSource) => void;
  onRouteConnectorChange: (profile: 'coarse' | 'fine', connectorId: string) => void;
  onRouteModelChange: (profile: 'coarse' | 'fine', model: string) => void;
  onClearRouteBinding: (profile: 'coarse' | 'fine' | 'all') => void;
  onOpenRuntimeSetup?: () => void;
  onRebuildEmbeddingIndex: () => Promise<void>;
  routeConfigReady: boolean;
  routeConfigReasonCode: string;
  routeConfigActionHint: 'none' | 'install-local-model' | 'switch-token-api' | 'select-model' | 'select-connector';
  coarseRouteReadiness: { ready: boolean; reasonCode: string; actionHint: string; message: string };
  fineRouteReadiness: { ready: boolean; reasonCode: string; actionHint: string; message: string };
  embeddingReadiness: {
    healthy: boolean;
    reasonCode: string;
    actionHint: 'none' | 'install-local-model' | 'switch-token-api' | 'retry';
    message: string;
  };
  embeddingIndexStatus: 'idle' | 'building' | 'ready' | 'failed';
  embeddingEntryCount: number;
  embeddingIndexLastBuiltAt: string | null;
  embeddingIndexErrorMessage: string | null;
  effectiveCoarseRouteSummary: string;
  effectiveFineRouteSummary: string;
};

export type WorldStudioShellMetricsInput = {
  primaryEventCount: number;
  secondaryEventCount: number;
  missingPrimaryEvidenceCount: number;
  eventCharacterCoverage: number;
  eventLocationCoverage: number;
  storyProjectionCount: number;
  storyProjectionMissingContextCount: number;
  storyProjectionLatestAt: string;
  terminalChunkSuccess: number;
  terminalChunkTotal: number;
  terminalChunkFailed: number;
  terminalTopFailure: { code: string; count: number } | null;
};

type LandingTarget = 'CREATE' | 'MAINTAIN';

type WorldStudioWorkspacePanelBindings = {
  onRefresh: () => void;
  onOpenMaintenance: (worldId: string) => void;
  onOpenCreate: (draftId: string | null) => void;
};

type WorldStudioMainPanelBindings = {
  onSyncEvents: () => Promise<void>;
  onDeleteFirstEvent: () => Promise<void>;
  onSyncLorebooks: () => Promise<void>;
  onDeleteFirstLorebook: () => Promise<void>;
};

type WorldStudioRightPanelBindings = {
  onSaveDraft: () => void;
  onPublishDraft: () => void;
  onResetDraft: () => void;
  onReload: () => void;
  onSaveMaintenance: (payload?: { force?: boolean }) => void;
  onSyncEvents: (payload?: { force?: boolean }) => void;
  onSyncLorebooks: () => void;
  onRefreshResources: () => void;
  onPauseTask: () => boolean;
  onResumeTask: () => void;
  onCancelTask: () => boolean;
  onSetExpertMode: (value: boolean) => void;
  onReloadRemoteForConflict: () => void;
  onAdoptRemoteSnapshot: () => void;
};

export type WorldStudioPanelBindings = {
  workspace: WorldStudioWorkspacePanelBindings;
  main: WorldStudioMainPanelBindings;
  right: WorldStudioRightPanelBindings;
  derived: {
    landingTarget: LandingTarget;
    hasMaintenanceConflict: boolean;
    remoteMaintenanceSnapshotVersion: string;
    routeConnectors: RuntimeRouteConnectorOption[];
    effectiveCoarseRouteBinding: RuntimeRouteBinding | null;
    effectiveFineRouteBinding: RuntimeRouteBinding | null;
  };
};

export type WorldStudioViewModel = {
  base: WorldStudioShellBaseInput;
  workspace: WorldStudioShellWorkspaceInput;
  runtime: WorldStudioShellRuntimeInput;
  actions: WorldStudioShellActionInput;
  routing: WorldStudioShellRoutingInput;
  metrics: WorldStudioShellMetricsInput;
  panelBindings: WorldStudioPanelBindings;
};
