import React from 'react';
import type {
  RuntimeRouteBinding,
  RuntimeRouteConnectorOption,
  RuntimeRouteSource,
} from '@nimiplatform/sdk/mod/runtime-route';
import type { WorldStudioTaskRecord, WorldStudioWorkspaceSnapshot } from '../contracts.js';
import type { Phase1Result, Phase2Result } from '../generation/pipeline.js';
import { parseLooseArray } from '../services/snapshot-normalize.js';
import { CreateRightPanel } from '../components/create-right-panel.js';
import { MaintainRightPanel } from '../components/maintain-right-panel.js';

type EventSyncMode = 'merge' | 'replace';

type BuildWorldStudioRightPanelInput = {
  landingTarget: 'CREATE' | 'MAINTAIN';
  snapshot: WorldStudioWorkspaceSnapshot;
  selectedDraftId: string;
  phase1: Phase1Result | null;
  phase2: Phase2Result | null;
  selectedAgentSyncCharacters: string[];
  activeTask: WorldStudioTaskRecord | null;
  recentTasks: WorldStudioTaskRecord[];
  expertMode: boolean;
  working: boolean;
  activeCoarseRouteSource: RuntimeRouteSource;
  activeCoarseRouteConnectorId: string;
  activeFineRouteSource: RuntimeRouteSource;
  activeFineRouteConnectorId: string;
  effectiveCoarseRouteBinding: RuntimeRouteBinding | null;
  effectiveFineRouteBinding: RuntimeRouteBinding | null;
  coarseRouteModelOptions: string[];
  fineRouteModelOptions: string[];
  coarseRouteReadiness: { ready: boolean; reasonCode: string; actionHint: string; message: string };
  fineRouteReadiness: { ready: boolean; reasonCode: string; actionHint: string; message: string };
  routeConnectors: RuntimeRouteConnectorOption[];
  routeConfigReady: boolean;
  routeConfigReasonCode: string;
  routeConfigActionHint: 'none' | 'install-local-model' | 'switch-token-api' | 'select-model' | 'select-connector';
  embeddingReadiness: { healthy: boolean; reasonCode: string; actionHint: 'none' | 'install-local-model' | 'switch-token-api' | 'retry'; message: string };
  embeddingIndexStatus: 'idle' | 'building' | 'ready' | 'failed';
  embeddingEntryCount: number;
  embeddingIndexLastBuiltAt: string | null;
  embeddingIndexErrorMessage: string | null;
  effectiveCoarseRouteSummary: string;
  effectiveFineRouteSummary: string;
  primaryEventCount: number;
  secondaryEventCount: number;
  missingPrimaryEvidenceCount: number;
  eventCharacterCoverage: number;
  eventLocationCoverage: number;
  terminalChunkSuccess: number;
  terminalChunkTotal: number;
  terminalChunkFailed: number;
  terminalTopFailure: { code: string; count: number } | null;
  conflictReloadSummary: string | null;
  notice: string | null;
  error: string | null;
  eventSyncMode: EventSyncMode;
  selectedWorldId: string;
  hasMaintenanceConflict: boolean;
  remoteMaintenanceSnapshotVersion: string;
  onRouteSourceChange: (profile: 'coarse' | 'fine', source: RuntimeRouteSource) => void;
  onRouteConnectorChange: (profile: 'coarse' | 'fine', connectorId: string) => void;
  onRouteModelChange: (profile: 'coarse' | 'fine', model: string) => void;
  onClearRouteOverride: (profile: 'coarse' | 'fine' | 'all') => void;
  onOpenRuntimeSetup?: () => void;
  onRebuildEmbeddingIndex: () => Promise<void>;
  onSetExpertMode: (value: boolean) => void;
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
  onReloadRemoteForConflict: () => void;
  onAdoptRemoteSnapshot: () => void;
};

export function buildWorldStudioRightPanel(input: BuildWorldStudioRightPanelInput): React.ReactNode {
  if (input.landingTarget === 'CREATE') {
    return (
      <CreateRightPanel
        createStep={input.snapshot.createStep}
        draftId={input.selectedDraftId}
        hasPhase1={Boolean(input.phase1)}
        hasPhase2={Boolean(input.phase2)}
        parseJob={input.snapshot.parseJob}
        selectedAgentSyncCount={input.selectedAgentSyncCharacters.length}
        worldCoverStatus={input.snapshot.assets.worldCover.status}
        working={input.working}
        activeCoarseRouteSource={input.activeCoarseRouteSource}
        activeCoarseRouteConnectorId={input.activeCoarseRouteConnectorId}
        activeFineRouteSource={input.activeFineRouteSource}
        activeFineRouteConnectorId={input.activeFineRouteConnectorId}
        effectiveCoarseRouteBinding={input.effectiveCoarseRouteBinding}
        effectiveFineRouteBinding={input.effectiveFineRouteBinding}
        coarseRouteModelOptions={input.coarseRouteModelOptions}
        fineRouteModelOptions={input.fineRouteModelOptions}
        coarseRouteReadiness={input.coarseRouteReadiness}
        fineRouteReadiness={input.fineRouteReadiness}
        routeConnectors={input.routeConnectors}
        routeConfigReady={input.routeConfigReady}
        routeConfigReasonCode={input.routeConfigReasonCode}
        routeConfigActionHint={input.routeConfigActionHint}
        embeddingReadiness={input.embeddingReadiness}
        embeddingIndexStatus={input.embeddingIndexStatus}
        embeddingEntryCount={input.embeddingEntryCount}
        embeddingIndexLastBuiltAt={input.embeddingIndexLastBuiltAt}
        embeddingIndexErrorMessage={input.embeddingIndexErrorMessage}
        onRouteSourceChange={input.onRouteSourceChange}
        onRouteConnectorChange={input.onRouteConnectorChange}
        onRouteModelChange={input.onRouteModelChange}
        onClearRouteOverride={input.onClearRouteOverride}
        onOpenRuntimeSetup={input.onOpenRuntimeSetup}
        onRebuildEmbeddingIndex={input.onRebuildEmbeddingIndex}
        onSetExpertMode={input.onSetExpertMode}
        onSaveDraft={input.onSaveDraft}
        onPublishDraft={input.onPublishDraft}
        activeTask={input.activeTask}
        recentTasks={input.recentTasks}
        expertMode={input.expertMode}
        effectiveCoarseRouteSummary={input.effectiveCoarseRouteSummary}
        effectiveFineRouteSummary={input.effectiveFineRouteSummary}
        futureEventsCount={parseLooseArray(input.snapshot.futureEventsText).length}
        primaryEventCount={input.primaryEventCount}
        secondaryEventCount={input.secondaryEventCount}
        missingPrimaryEvidenceCount={input.missingPrimaryEvidenceCount}
        eventCharacterCoverage={input.eventCharacterCoverage}
        eventLocationCoverage={input.eventLocationCoverage}
        terminalChunkSuccess={input.terminalChunkSuccess}
        terminalChunkTotal={input.terminalChunkTotal}
        terminalChunkFailed={input.terminalChunkFailed}
        terminalTopFailure={input.terminalTopFailure}
        conflictReloadSummary={input.conflictReloadSummary}
        notice={input.notice}
        error={input.error}
        onResetDraft={input.onResetDraft}
        onReload={input.onReload}
        onPauseTask={input.onPauseTask}
        onResumeTask={input.onResumeTask}
        onCancelTask={input.onCancelTask}
      />
    );
  }

  return (
    <MaintainRightPanel
      activeTask={input.activeTask}
      recentTasks={input.recentTasks}
      expertMode={input.expertMode}
      activeCoarseRouteSource={input.activeCoarseRouteSource}
      activeCoarseRouteConnectorId={input.activeCoarseRouteConnectorId}
      activeFineRouteSource={input.activeFineRouteSource}
      activeFineRouteConnectorId={input.activeFineRouteConnectorId}
      effectiveCoarseRouteBinding={input.effectiveCoarseRouteBinding}
      effectiveFineRouteBinding={input.effectiveFineRouteBinding}
      coarseRouteModelOptions={input.coarseRouteModelOptions}
      fineRouteModelOptions={input.fineRouteModelOptions}
      coarseRouteReadiness={input.coarseRouteReadiness}
      fineRouteReadiness={input.fineRouteReadiness}
      routeConnectors={input.routeConnectors}
      routeConfigReady={input.routeConfigReady}
      routeConfigReasonCode={input.routeConfigReasonCode}
      routeConfigActionHint={input.routeConfigActionHint}
      embeddingReadiness={input.embeddingReadiness}
      embeddingIndexStatus={input.embeddingIndexStatus}
      embeddingEntryCount={input.embeddingEntryCount}
      embeddingIndexLastBuiltAt={input.embeddingIndexLastBuiltAt}
      embeddingIndexErrorMessage={input.embeddingIndexErrorMessage}
      onRouteSourceChange={input.onRouteSourceChange}
      onRouteConnectorChange={input.onRouteConnectorChange}
      onRouteModelChange={input.onRouteModelChange}
      onClearRouteOverride={input.onClearRouteOverride}
      onOpenRuntimeSetup={input.onOpenRuntimeSetup}
      onRebuildEmbeddingIndex={input.onRebuildEmbeddingIndex}
      onSetExpertMode={input.onSetExpertMode}
      effectiveCoarseRouteSummary={input.effectiveCoarseRouteSummary}
      effectiveFineRouteSummary={input.effectiveFineRouteSummary}
      selectedWorldId={input.selectedWorldId}
      editorSnapshotVersion={input.snapshot.editorSnapshotVersion || '-'}
      eventSyncMode={input.eventSyncMode}
      working={input.working}
      hasMaintenanceConflict={input.hasMaintenanceConflict}
      remoteMaintenanceSnapshotVersion={input.remoteMaintenanceSnapshotVersion || '-'}
      onSaveMaintenance={input.onSaveMaintenance}
      onSyncEvents={input.onSyncEvents}
      onSyncLorebooks={input.onSyncLorebooks}
      onRefreshResources={input.onRefreshResources}
      onPauseTask={input.onPauseTask}
      onResumeTask={input.onResumeTask}
      onCancelTask={input.onCancelTask}
      onReloadRemoteForConflict={input.onReloadRemoteForConflict}
      onAdoptRemoteSnapshot={input.onAdoptRemoteSnapshot}
      primaryEventCount={input.primaryEventCount}
      secondaryEventCount={input.secondaryEventCount}
      missingPrimaryEvidenceCount={input.missingPrimaryEvidenceCount}
      eventCharacterCoverage={input.eventCharacterCoverage}
      eventLocationCoverage={input.eventLocationCoverage}
      terminalChunkSuccess={input.terminalChunkSuccess}
      terminalChunkTotal={input.terminalChunkTotal}
      terminalChunkFailed={input.terminalChunkFailed}
      terminalTopFailure={input.terminalTopFailure}
      conflictReloadSummary={input.conflictReloadSummary}
      notice={input.notice}
      error={input.error}
    />
  );
}
