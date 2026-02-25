import React, { useEffect, useState } from 'react';
import { useModTranslation } from '@nimiplatform/mod-sdk/i18n';
import type {
  RuntimeRouteBinding,
  RuntimeRouteConnectorOption,
  RuntimeRouteSource,
} from '@nimiplatform/mod-sdk/runtime-route';
import type { WorldStudioParseJobState, WorldStudioTaskRecord } from '../contracts.js';
import { resolveParseJobProcessed, resolveParseJobVisibleProgress } from '../services/parse-job-progress.js';
import { PublishPanel } from '../ui/create/publish-panel.js';
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

export function CreateRightPanel(props: {
  createStep: string;
  draftId: string;
  hasPhase1: boolean;
  hasPhase2: boolean;
  parseJob: WorldStudioParseJobState;
  selectedAgentSyncCount: number;
  worldCoverStatus: string;
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
  onRouteSourceChange: (profile: 'coarse' | 'fine', source: RuntimeRouteSource) => void;
  onRouteConnectorChange: (profile: 'coarse' | 'fine', connectorId: string) => void;
  onRouteModelChange: (profile: 'coarse' | 'fine', model: string) => void;
  onClearRouteOverride: (profile: 'coarse' | 'fine' | 'all') => void;
  onOpenRuntimeSetup?: () => void;
  onRebuildEmbeddingIndex: () => Promise<void>;
  onSetExpertMode: (value: boolean) => void;
  onSaveDraft: () => void;
  onPublishDraft: () => void;
  activeTask: WorldStudioTaskRecord | null;
  recentTasks: WorldStudioTaskRecord[];
  expertMode: boolean;
  effectiveCoarseRouteSummary: string;
  effectiveFineRouteSummary: string;
  futureEventsCount: number;
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
  onResetDraft: () => void;
  onReload: () => void;
  onPauseTask: () => boolean;
  onResumeTask: () => void;
  onCancelTask: () => boolean;
}): React.ReactElement {
  const { t } = useModTranslation('world-studio');
  const parseVisibleProgress = resolveParseJobVisibleProgress(props.parseJob);
  const parseChunkProcessed = resolveParseJobProcessed(props.parseJob);
  const [openSection, setOpenSection] = useState<OpenSection>(
    props.createStep === 'EXTRACT' ? 'status' : 'actions',
  );

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
            title: t('rightPanel.createActions'),
            open: openSection === 'actions',
            onToggle: () => setOpenSection((prev) => (prev === 'actions' ? null : 'actions')),
          })}
          {openSection === 'actions' ? (
            <div className="mt-3">
              <PublishPanel
                step={props.createStep as never}
                draftId={props.draftId}
                hasPhase1={props.hasPhase1}
                hasPhase2={props.hasPhase2}
                parseJob={props.parseJob as never}
                selectedAgentSyncCount={props.selectedAgentSyncCount}
                worldCoverStatus={props.worldCoverStatus as never}
                working={props.working}
                onSaveDraft={props.onSaveDraft}
                onPublishDraft={props.onPublishDraft}
                embedded
                showTitle={false}
              />
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
                mode="CREATE"
                activeTask={props.activeTask}
                recentTasks={props.recentTasks}
                expertMode={props.expertMode}
                coarseRouteSummary={props.effectiveCoarseRouteSummary}
                fineRouteSummary={props.effectiveFineRouteSummary}
                parsePhase={props.parseJob.phase}
                parseProgressPercent={parseVisibleProgress * 100}
                parseChunkProcessed={parseChunkProcessed}
                parseChunkTotal={props.parseJob.chunkTotal}
                futureEventsCount={props.futureEventsCount}
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
                onResetDraft={props.onResetDraft}
                onReload={props.onReload}
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
