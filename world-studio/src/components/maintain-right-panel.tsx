import React, { useEffect, useState } from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import type {
  RuntimeRouteBinding,
  RuntimeRouteConnectorOption,
  RuntimeRouteSource,
} from '@nimiplatform/sdk/mod/runtime-route';
import type { WorldStudioTaskRecord } from '../contracts.js';
import { MaintenanceActionsCard } from './maintenance-actions-card.js';
import { StudioStatusCard } from './studio-status-card.js';
import { WorldStudioRouteConfigCard } from './world-studio-route-config-card.js';

type OpenSection = 'actions' | 'routing' | 'status' | null;

function sectionHeader(input: {
  title: string;
  open: boolean;
  onToggle: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={input.onToggle}
      aria-expanded={input.open}
      className="flex w-full items-center justify-between text-left text-gray-700"
    >
      <span className="text-sm font-semibold">{input.title}</span>
      <span className="text-sm font-semibold">{input.open ? '-' : '+'}</span>
    </button>
  );
}

export function MaintainRightPanel(props: {
  activeTask: WorldStudioTaskRecord | null;
  recentTasks: WorldStudioTaskRecord[];
  expertMode: boolean;
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
  onRouteSourceChange: (profile: 'coarse' | 'fine', source: RuntimeRouteSource) => void;
  onRouteConnectorChange: (profile: 'coarse' | 'fine', connectorId: string) => void;
  onRouteModelChange: (profile: 'coarse' | 'fine', model: string) => void;
  onClearRouteOverride: (profile: 'coarse' | 'fine' | 'all') => void;
  onOpenRuntimeSetup?: () => void;
  onRebuildEmbeddingIndex: () => Promise<void>;
  onSetExpertMode: (value: boolean) => void;
  effectiveCoarseRouteSummary: string;
  effectiveFineRouteSummary: string;
  selectedWorldId: string;
  editorSnapshotVersion: string;
  eventSyncMode: 'merge' | 'replace';
  working: boolean;
  hasMaintenanceConflict: boolean;
  remoteMaintenanceSnapshotVersion: string;
  onSaveMaintenance: (payload?: { force?: boolean }) => void;
  onSyncEvents: (payload?: { force?: boolean }) => void;
  onSyncLorebooks: () => void;
  onRefreshResources: () => void;
  onPauseTask: () => boolean;
  onResumeTask: () => void;
  onCancelTask: () => boolean;
  onReloadRemoteForConflict: () => void;
  onAdoptRemoteSnapshot: () => void;
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
  conflictReloadSummary: string | null;
  notice: string | null;
  error: string | null;
}): React.ReactElement {
  const { t } = useModTranslation('world-studio');
  const [openSection, setOpenSection] = useState<OpenSection>('actions');

  useEffect(() => {
    if (props.error?.includes('WORLD_STUDIO_ROUTE_CONFIG_REQUIRED')) {
      setOpenSection('routing');
    }
  }, [props.error]);

  return (
    <div className="flex h-full min-h-0 flex-col p-3">
      <div className="min-h-0 flex-1 overflow-y-auto rounded-[10px] border border-gray-200 bg-white">
        <section className="px-3 py-3 text-xs">
          {sectionHeader({
            title: t('rightPanel.maintainActions'),
            open: openSection === 'actions',
            onToggle: () => setOpenSection((prev) => (prev === 'actions' ? null : 'actions')),
          })}
          {openSection === 'actions' ? (
            <div className="mt-3">
              <MaintenanceActionsCard
                selectedWorldId={props.selectedWorldId}
                editorSnapshotVersion={props.editorSnapshotVersion || '-'}
                eventSyncMode={props.eventSyncMode}
                working={props.working}
                hasMaintenanceConflict={props.hasMaintenanceConflict}
                remoteMaintenanceSnapshotVersion={props.remoteMaintenanceSnapshotVersion || '-'}
                onSaveMaintenance={(payload) => { props.onSaveMaintenance(payload); }}
                onSyncEvents={(payload) => { props.onSyncEvents(payload); }}
                onSyncLorebooks={props.onSyncLorebooks}
                onRefreshResources={props.onRefreshResources}
                onReloadRemoteForConflict={props.onReloadRemoteForConflict}
                onAdoptRemoteSnapshot={props.onAdoptRemoteSnapshot}
                embedded
                showTitle={false}
              />
              <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Story Projection</p>
                <p className="mt-1 text-xs text-gray-700">count: {props.storyProjectionCount}</p>
                <p className="mt-1 text-xs text-gray-700">missingContext: {props.storyProjectionMissingContextCount}</p>
                <p className="mt-1 text-xs text-gray-700 break-all">
                  latestProjectedAt: {props.storyProjectionLatestAt || '-'}
                </p>
              </div>
            </div>
          ) : null}
        </section>

        <section className="border-t border-gray-200 px-3 py-3 text-xs">
          {sectionHeader({
            title: t('rightPanel.routingAndExpertMode'),
            open: openSection === 'routing',
            onToggle: () => setOpenSection((prev) => (prev === 'routing' ? null : 'routing')),
          })}
          {openSection === 'routing' ? (
            <div className="mt-3">
              <WorldStudioRouteConfigCard
                activeCoarseRouteSource={props.activeCoarseRouteSource}
                activeCoarseRouteConnectorId={props.activeCoarseRouteConnectorId}
                activeFineRouteSource={props.activeFineRouteSource}
                activeFineRouteConnectorId={props.activeFineRouteConnectorId}
                effectiveCoarseRouteBinding={props.effectiveCoarseRouteBinding}
                effectiveFineRouteBinding={props.effectiveFineRouteBinding}
                coarseRouteModelOptions={props.coarseRouteModelOptions}
                fineRouteModelOptions={props.fineRouteModelOptions}
                coarseRouteReadiness={props.coarseRouteReadiness}
                fineRouteReadiness={props.fineRouteReadiness}
                routeConnectors={props.routeConnectors}
                onRouteSourceChange={props.onRouteSourceChange}
                onRouteConnectorChange={props.onRouteConnectorChange}
                onRouteModelChange={props.onRouteModelChange}
                onClearRouteOverride={props.onClearRouteOverride}
                onOpenRuntimeSetup={props.onOpenRuntimeSetup}
                effectiveCoarseRouteSummary={props.effectiveCoarseRouteSummary}
                effectiveFineRouteSummary={props.effectiveFineRouteSummary}
                routeConfigReady={props.routeConfigReady}
                routeConfigReasonCode={props.routeConfigReasonCode}
                routeConfigActionHint={props.routeConfigActionHint}
                embeddingReadiness={props.embeddingReadiness}
                embeddingIndexStatus={props.embeddingIndexStatus}
                embeddingEntryCount={props.embeddingEntryCount}
                embeddingIndexLastBuiltAt={props.embeddingIndexLastBuiltAt}
                embeddingIndexErrorMessage={props.embeddingIndexErrorMessage}
                expertMode={props.expertMode}
                onSetExpertMode={props.onSetExpertMode}
                onRebuildEmbeddingIndex={props.onRebuildEmbeddingIndex}
              />
            </div>
          ) : null}
        </section>

        <section className="border-t border-gray-200 px-3 py-3 text-xs">
          {sectionHeader({
            title: t('rightPanel.studioStatus'),
            open: openSection === 'status',
            onToggle: () => setOpenSection((prev) => (prev === 'status' ? null : 'status')),
          })}
          {openSection === 'status' ? (
            <div className="mt-3">
              <StudioStatusCard
                mode="MAINTAIN"
                activeTask={props.activeTask}
                recentTasks={props.recentTasks}
                expertMode={props.expertMode}
                coarseRouteSummary={props.effectiveCoarseRouteSummary}
                fineRouteSummary={props.effectiveFineRouteSummary}
                primaryEventCount={props.primaryEventCount}
                secondaryEventCount={props.secondaryEventCount}
                missingPrimaryEvidenceCount={props.missingPrimaryEvidenceCount}
                eventCharacterCoverage={props.eventCharacterCoverage}
                eventLocationCoverage={props.eventLocationCoverage}
                terminalChunkSuccess={props.terminalChunkSuccess}
                terminalChunkTotal={props.terminalChunkTotal || 0}
                terminalChunkFailed={props.terminalChunkFailed}
                terminalTopFailure={props.terminalTopFailure}
                conflictReloadSummary={props.conflictReloadSummary}
                notice={props.notice}
                error={props.error}
                onPauseTask={props.onPauseTask}
                onResumeTask={props.onResumeTask}
                onCancelTask={props.onCancelTask}
                embedded
                showTitle={false}
              />
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
