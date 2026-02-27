import type {
  WorldStudioCreateStep,
  WorldStudioSnapshotPatch,
  WorldStudioWorkspaceSnapshot,
} from '../contracts.js';
import type { WorldMutationSummary } from '../ui/types.js';
import type { WorldStudioViewModel } from './world-studio-view-model.js';
import type { useWorldStudioControllerContext } from './world-studio-controller-context.js';
import type { useWorldStudioPageUiState } from './use-world-studio-page-ui-state.js';

type ControllerContext = ReturnType<typeof useWorldStudioControllerContext>;
type PageUiState = ReturnType<typeof useWorldStudioPageUiState>;

type BuildWorldStudioViewModelArgs = {
  ui: PageUiState;
  context: ControllerContext;
  loadLanding: () => Promise<void>;
  actions: WorldStudioViewModel['actions'];
  snapshot: WorldStudioWorkspaceSnapshot;
  patchSnapshot: (patch: WorldStudioSnapshotPatch) => void;
  patchPanel: (patch: Partial<WorldStudioWorkspaceSnapshot['panel']>) => void;
  setCreateStep: (step: WorldStudioCreateStep) => void;
  sourceChunksRef: { current: string[] };
  onOpenRuntimeSetup?: () => void;
};

export function buildWorldStudioViewModel(args: BuildWorldStudioViewModelArgs): WorldStudioViewModel {
  const maintenanceEditorSnapshotVersion = String(
    args.context.maintenanceEditorSnapshotVersion
    || args.snapshot.editorSnapshotVersion
    || '',
  );
  const landingTarget = args.ui.landing.target === 'MAINTAIN' ? 'MAINTAIN' : 'CREATE';
  const hasMaintenanceConflict = Boolean(
    args.ui.error && args.ui.error.includes('WORLD_STUDIO_MAINTENANCE_CONFLICT'),
  );
  const routeConnectors = args.ui.routeOptions?.connectors || [];

  const panelBindings: WorldStudioViewModel['panelBindings'] = {
    workspace: {
      onRefresh: () => {
        void args.actions.refreshResources();
      },
      onOpenMaintenance: (worldId) => {
        args.patchPanel({ selectedWorldId: worldId });
        args.ui.setLanding({ target: 'MAINTAIN', worldId, reason: null });
      },
      onOpenCreate: (draftId) => {
        args.ui.setLanding({ target: 'CREATE', worldId: null, reason: null });
        if (draftId) {
          args.patchPanel({ selectedDraftId: draftId });
          args.setCreateStep('DRAFT');
          return;
        }
        // "Start Draft" must enter a clean workspace, not reuse current draft data.
        args.actions.onResetDraft();
      },
    },
    main: {
      onSyncEvents: () => args.actions.onSyncEvents(),
      onDeleteFirstEvent: () => args.actions.onDeleteFirstEvent(),
      onSyncLorebooks: () => args.actions.onSyncLorebooks(),
      onDeleteFirstLorebook: () => args.actions.onDeleteFirstLorebook(),
    },
    right: {
      onSaveDraft: () => {
        void args.actions.onSaveDraft();
      },
      onPublishDraft: () => {
        void args.actions.onPublishDraft();
      },
      onResetDraft: () => {
        args.actions.onResetDraft();
      },
      onReload: () => {
        void args.actions.refreshResources();
      },
      onSaveMaintenance: (payload) => {
        void args.actions.onSaveMaintenance(payload);
      },
      onSyncEvents: (payload) => {
        void args.actions.onSyncEvents(payload);
      },
      onSyncLorebooks: () => {
        void args.actions.onSyncLorebooks();
      },
      onRefreshResources: () => {
        void args.actions.refreshResources();
      },
      onPauseTask: () => args.actions.pauseTask(),
      onResumeTask: () => {
        void args.actions.resumeTask();
      },
      onCancelTask: () => args.actions.cancelTask(),
      onSetExpertMode: (value) => {
        args.actions.setExpertMode(value);
      },
      onReloadRemoteForConflict: () => {
        void args.actions.onReloadRemoteForConflict();
      },
      onAdoptRemoteSnapshot: () => {
        args.actions.onAdoptRemoteSnapshot();
      },
    },
    derived: {
      landingTarget,
      hasMaintenanceConflict,
      remoteMaintenanceSnapshotVersion: maintenanceEditorSnapshotVersion,
      routeConnectors,
      effectiveCoarseRouteBinding: args.context.effectiveCoarseRouteBinding,
      effectiveFineRouteBinding: args.context.effectiveFineRouteBinding,
    },
  };

  return {
    base: {
      landingLoading: args.ui.landingLoading,
      loadLanding: args.loadLanding,
      landing: args.ui.landing,
      setLanding: args.ui.setLanding,
      notice: args.ui.notice,
      error: args.ui.error,
      conflictReloadSummary: args.ui.conflictReloadSummary,
    },
    workspace: {
      snapshot: args.snapshot,
      worlds: args.context.worlds,
      drafts: args.context.drafts,
      primaryWorld: args.context.primaryWorld,
      latestDraft: args.context.latestDraft,
      selectedWorldId: args.context.selectedWorldId,
      selectedDraftId: args.context.selectedDraftId,
      phase1: args.ui.phase1,
      phase2: args.ui.phase2,
      eventsGraph: args.context.eventsGraph,
      selectedAgentSyncCharacters: args.context.selectedAgentSyncCharacters,
      activeTask: args.context.activeTask,
      recentTasks: args.context.recentTasks,
      expertMode: args.context.expertMode,
      timeFlowRatio: args.context.timeFlowRatio,
      currentTimeNode: args.context.currentTimeNode,
      working: args.context.working,
      routeOptions: args.ui.routeOptions,
      maintenanceEditorSnapshotVersion,
      sourceChunksRef: args.sourceChunksRef,
    },
    runtime: {
      sourceMode: args.ui.sourceMode,
      sourceEncoding: args.ui.sourceEncoding,
      filePreviewText: args.ui.filePreviewText,
      retryWithFineRoute: args.ui.retryWithFineRoute,
      retryScope: args.ui.retryScope,
      retryConcurrency: args.ui.retryConcurrency,
      retryErrorCode: args.ui.retryErrorCode,
      eventSyncMode: args.ui.eventSyncMode,
      mutations: (args.context.queries.mutationsQuery.data || []) as WorldMutationSummary[],
      setError: args.ui.setError,
      setCreateStep: args.setCreateStep,
      patchSnapshot: args.patchSnapshot,
      patchPanel: args.patchPanel,
      setSourceMode: args.ui.setSourceMode,
      setSourceEncoding: args.ui.setSourceEncoding,
      setFilePreviewText: args.ui.setFilePreviewText,
      setRetryWithFineRoute: args.ui.setRetryWithFineRoute,
      setRetryScope: args.ui.setRetryScope,
      setRetryConcurrency: args.ui.setRetryConcurrency,
      setRetryErrorCode: args.ui.setRetryErrorCode,
      setEventSyncMode: args.ui.setEventSyncMode,
    },
    actions: args.actions,
    routing: {
      activeCoarseRouteSource: args.context.activeCoarseRouteSource,
      activeCoarseRouteConnectorId: args.context.activeCoarseRouteConnectorId,
      activeFineRouteSource: args.context.activeFineRouteSource,
      activeFineRouteConnectorId: args.context.activeFineRouteConnectorId,
      effectiveCoarseRouteBinding: args.context.effectiveCoarseRouteBinding,
      effectiveFineRouteBinding: args.context.effectiveFineRouteBinding,
      coarseRouteModelOptions: args.context.coarseRouteModelOptions,
      fineRouteModelOptions: args.context.fineRouteModelOptions,
      onRouteSourceChange: args.context.onRouteSourceChange,
      onRouteConnectorChange: args.context.onRouteConnectorChange,
      onRouteModelChange: args.context.onRouteModelChange,
      onClearRouteOverride: args.context.onClearRouteOverride,
      onOpenRuntimeSetup: args.onOpenRuntimeSetup,
      onRebuildEmbeddingIndex: args.actions.onRebuildEmbeddingIndex,
      routeConfigReady: args.context.routeConfigReady,
      routeConfigReasonCode: args.context.routeConfigReasonCode,
      routeConfigActionHint: args.context.routeConfigActionHint,
      coarseRouteReadiness: args.context.coarseRouteReadiness,
      fineRouteReadiness: args.context.fineRouteReadiness,
      embeddingReadiness: args.context.embeddingReadiness,
      embeddingIndexStatus: args.snapshot.embeddingIndex.status,
      embeddingEntryCount: Object.keys(args.snapshot.embeddingIndex.entries || {}).length,
      embeddingIndexLastBuiltAt: args.snapshot.embeddingIndex.lastBuiltAt,
      embeddingIndexErrorMessage: args.snapshot.embeddingIndex.errorMessage,
      effectiveCoarseRouteSummary: args.context.effectiveCoarseRouteSummary,
      effectiveFineRouteSummary: args.context.effectiveFineRouteSummary,
    },
    metrics: {
      primaryEventCount: args.context.primaryEventCount,
      secondaryEventCount: args.context.secondaryEventCount,
      missingPrimaryEvidenceCount: args.context.missingPrimaryEvidenceCount,
      eventCharacterCoverage: args.context.eventCharacterCoverage,
      eventLocationCoverage: args.context.eventLocationCoverage,
      terminalChunkSuccess: args.context.terminalChunkSuccess,
      terminalChunkTotal: args.context.terminalChunkTotal,
      terminalChunkFailed: args.context.terminalChunkFailed,
      terminalTopFailure: args.context.terminalTopFailure,
    },
    panelBindings,
  };
}
