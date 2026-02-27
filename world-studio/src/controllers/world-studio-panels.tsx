import type { ReactNode } from 'react';
import { WorkspacePanel } from '../components/workspace-panel.js';
import { buildWorldStudioMainPanel } from './world-studio-main-panel-builder.js';
import { buildWorldStudioRightPanel } from './world-studio-right-panel-builder.js';
import type { WorldStudioViewModel } from './world-studio-view-model.js';

export function buildWorldStudioPanels(viewModel: WorldStudioViewModel): {
  leftPanel: ReactNode;
  mainPanel: ReactNode;
  rightPanel: ReactNode;
} {
  const bindings = viewModel.panelBindings;
  const leftPanel = (
    <WorkspacePanel
      worlds={viewModel.workspace.worlds}
      drafts={viewModel.workspace.drafts}
      primaryWorld={viewModel.workspace.primaryWorld}
      latestDraft={viewModel.workspace.latestDraft}
      selectedWorldId={viewModel.workspace.selectedWorldId}
      selectedDraftId={viewModel.workspace.selectedDraftId}
      onRefresh={bindings.workspace.onRefresh}
      onOpenMaintenance={bindings.workspace.onOpenMaintenance}
      onOpenCreate={bindings.workspace.onOpenCreate}
    />
  );

  const mainPanel = buildWorldStudioMainPanel({
    landingTarget: bindings.derived.landingTarget,
    snapshot: viewModel.workspace.snapshot,
    sourceMode: viewModel.runtime.sourceMode,
    sourceEncoding: viewModel.runtime.sourceEncoding,
    filePreviewText: viewModel.runtime.filePreviewText,
    phase1: viewModel.workspace.phase1,
    phase2: viewModel.workspace.phase2,
    eventsGraph: viewModel.workspace.eventsGraph,
    selectedAgentSyncCharacters: viewModel.workspace.selectedAgentSyncCharacters,
    agentDraftsByCharacter: viewModel.workspace.snapshot.agentSync.draftsByCharacter,
    expertMode: viewModel.workspace.expertMode,
    timeFlowRatio: viewModel.workspace.timeFlowRatio,
    currentTimeNode: viewModel.workspace.currentTimeNode,
    working: viewModel.workspace.working,
    retryWithFineRoute: viewModel.runtime.retryWithFineRoute,
    retryScope: viewModel.runtime.retryScope,
    retryConcurrency: viewModel.runtime.retryConcurrency,
    retryErrorCode: viewModel.runtime.retryErrorCode,
    eventSyncMode: viewModel.runtime.eventSyncMode,
    mutations: viewModel.runtime.mutations,
    setError: viewModel.runtime.setError,
    setCreateStep: viewModel.runtime.setCreateStep,
    patchSnapshot: viewModel.runtime.patchSnapshot,
    patchPanel: viewModel.runtime.patchPanel,
    setSourceMode: viewModel.runtime.setSourceMode,
    setSourceEncoding: viewModel.runtime.setSourceEncoding,
    setFilePreviewText: viewModel.runtime.setFilePreviewText,
    setRetryWithFineRoute: viewModel.runtime.setRetryWithFineRoute,
    setRetryScope: viewModel.runtime.setRetryScope,
    setRetryConcurrency: viewModel.runtime.setRetryConcurrency,
    setRetryErrorCode: viewModel.runtime.setRetryErrorCode,
    setEventSyncMode: viewModel.runtime.setEventSyncMode,
    sourceChunksRef: viewModel.workspace.sourceChunksRef,
    onSelectSourceFile: viewModel.actions.onSelectSourceFile,
    onRunPhase1: viewModel.actions.onRunPhase1,
    onRunPhase2: viewModel.actions.onRunPhase2,
    onRefreshPhase1QualityGate: viewModel.actions.onRefreshPhase1QualityGate,
    onGenerateWorldCover: viewModel.actions.onGenerateWorldCover,
    onGenerateCharacterPortrait: viewModel.actions.onGenerateCharacterPortrait,
    onToggleAgentSyncCharacter: viewModel.actions.onToggleAgentSyncCharacter,
    onAgentDraftChange: viewModel.actions.onAgentDraftChange,
    onTimeFlowRatioChange: viewModel.actions.onTimeFlowRatioChange,
    onCurrentTimeNodeChange: viewModel.actions.onCurrentTimeNodeChange,
    onFutureEventsTextChange: viewModel.actions.onFutureEventsTextChange,
    onSyncEvents: bindings.main.onSyncEvents,
    onDeleteFirstEvent: bindings.main.onDeleteFirstEvent,
    onSyncLorebooks: bindings.main.onSyncLorebooks,
    onDeleteFirstLorebook: bindings.main.onDeleteFirstLorebook,
  });

  const rightPanel = buildWorldStudioRightPanel({
    landingTarget: bindings.derived.landingTarget,
    snapshot: viewModel.workspace.snapshot,
    selectedDraftId: viewModel.workspace.selectedDraftId,
    phase1: viewModel.workspace.phase1,
    phase2: viewModel.workspace.phase2,
    selectedAgentSyncCharacters: viewModel.workspace.selectedAgentSyncCharacters,
    activeTask: viewModel.workspace.activeTask,
    recentTasks: viewModel.workspace.recentTasks,
    expertMode: viewModel.workspace.expertMode,
    working: viewModel.workspace.working,
    activeCoarseRouteSource: viewModel.routing.activeCoarseRouteSource,
    activeCoarseRouteConnectorId: viewModel.routing.activeCoarseRouteConnectorId,
    activeFineRouteSource: viewModel.routing.activeFineRouteSource,
    activeFineRouteConnectorId: viewModel.routing.activeFineRouteConnectorId,
    effectiveCoarseRouteBinding: bindings.derived.effectiveCoarseRouteBinding,
    effectiveFineRouteBinding: bindings.derived.effectiveFineRouteBinding,
    coarseRouteModelOptions: viewModel.routing.coarseRouteModelOptions,
    fineRouteModelOptions: viewModel.routing.fineRouteModelOptions,
    coarseRouteReadiness: viewModel.routing.coarseRouteReadiness,
    fineRouteReadiness: viewModel.routing.fineRouteReadiness,
    routeConnectors: bindings.derived.routeConnectors,
    routeConfigReady: viewModel.routing.routeConfigReady,
    routeConfigReasonCode: viewModel.routing.routeConfigReasonCode,
    routeConfigActionHint: viewModel.routing.routeConfigActionHint,
    embeddingReadiness: viewModel.routing.embeddingReadiness,
    embeddingIndexStatus: viewModel.routing.embeddingIndexStatus,
    embeddingEntryCount: viewModel.routing.embeddingEntryCount,
    embeddingIndexLastBuiltAt: viewModel.routing.embeddingIndexLastBuiltAt,
    embeddingIndexErrorMessage: viewModel.routing.embeddingIndexErrorMessage,
    effectiveCoarseRouteSummary: viewModel.routing.effectiveCoarseRouteSummary,
    effectiveFineRouteSummary: viewModel.routing.effectiveFineRouteSummary,
    primaryEventCount: viewModel.metrics.primaryEventCount,
    secondaryEventCount: viewModel.metrics.secondaryEventCount,
    missingPrimaryEvidenceCount: viewModel.metrics.missingPrimaryEvidenceCount,
    eventCharacterCoverage: viewModel.metrics.eventCharacterCoverage,
    eventLocationCoverage: viewModel.metrics.eventLocationCoverage,
    terminalChunkSuccess: viewModel.metrics.terminalChunkSuccess,
    terminalChunkTotal: viewModel.metrics.terminalChunkTotal || 0,
    terminalChunkFailed: viewModel.metrics.terminalChunkFailed,
    terminalTopFailure: viewModel.metrics.terminalTopFailure,
    conflictReloadSummary: viewModel.base.conflictReloadSummary,
    notice: viewModel.base.notice,
    error: viewModel.base.error,
    eventSyncMode: viewModel.runtime.eventSyncMode,
    selectedWorldId: viewModel.workspace.selectedWorldId,
    hasMaintenanceConflict: bindings.derived.hasMaintenanceConflict,
    remoteMaintenanceSnapshotVersion: bindings.derived.remoteMaintenanceSnapshotVersion,
    onRouteSourceChange: viewModel.routing.onRouteSourceChange,
    onRouteConnectorChange: viewModel.routing.onRouteConnectorChange,
    onRouteModelChange: viewModel.routing.onRouteModelChange,
    onClearRouteOverride: viewModel.routing.onClearRouteOverride,
    onOpenRuntimeSetup: viewModel.routing.onOpenRuntimeSetup,
    onRebuildEmbeddingIndex: viewModel.routing.onRebuildEmbeddingIndex,
    onSetExpertMode: bindings.right.onSetExpertMode,
    onSaveDraft: bindings.right.onSaveDraft,
    onPublishDraft: bindings.right.onPublishDraft,
    onResetDraft: bindings.right.onResetDraft,
    onReload: bindings.right.onReload,
    onSaveMaintenance: bindings.right.onSaveMaintenance,
    onSyncEvents: bindings.right.onSyncEvents,
    onSyncLorebooks: bindings.right.onSyncLorebooks,
    onRefreshResources: bindings.right.onRefreshResources,
    onPauseTask: bindings.right.onPauseTask,
    onResumeTask: bindings.right.onResumeTask,
    onCancelTask: bindings.right.onCancelTask,
    onReloadRemoteForConflict: bindings.right.onReloadRemoteForConflict,
    onAdoptRemoteSnapshot: bindings.right.onAdoptRemoteSnapshot,
  });

  return {
    leftPanel,
    mainPanel,
    rightPanel,
  };
}
