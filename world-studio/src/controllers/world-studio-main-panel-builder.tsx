import type { ReactNode } from 'react';
import { CreateWorkbench } from '../ui/create/create-workbench.js';
import { MaintainWorkbench } from '../ui/maintain/maintain-workbench.js';
import { deriveCharacterCandidates, deriveStartTimeOptions } from '../generation/phase1/derived-options.js';
import { toUniqueStringArray } from '../services/snapshot-normalize.js';
import { projectEventsForSelectedStartTime } from '../services/start-time-projection.js';
import type {
  EventNodeDraft,
  WorldStudioCreateStep,
  WorldStudioSnapshotPatch,
  WorldStudioWorkspaceSnapshot,
} from '../contracts.js';
import type { Phase1Result, Phase2Result } from '../generation/pipeline.js';
import type { RetryScope } from '../services/event-graph-map.js';
import type { SupportedEncoding } from '../engine/encoding.js';
import type { WorldMutationSummary } from '../ui/types.js';

type BuildWorldStudioMainPanelInput = {
  landingTarget: 'CREATE' | 'MAINTAIN';
  snapshot: WorldStudioWorkspaceSnapshot;
  sourceMode: 'TEXT' | 'FILE';
  sourceEncoding: SupportedEncoding;
  filePreviewText: string;
  phase1: Phase1Result | null;
  phase2: Phase2Result | null;
  eventsGraph: { primary: EventNodeDraft[]; secondary: EventNodeDraft[] };
  selectedAgentSyncCharacters: string[];
  agentDraftsByCharacter: WorldStudioWorkspaceSnapshot['agentSync']['draftsByCharacter'];
  expertMode: boolean;
  timeFlowRatio: string;
  currentTimeNode: string;
  working: boolean;
  retryWithFineRoute: boolean;
  retryScope: RetryScope;
  retryConcurrency: number;
  retryErrorCode: string | null;
  eventSyncMode: 'merge' | 'replace';
  mutations: WorldMutationSummary[];
  setCreateStep: (step: WorldStudioCreateStep) => void;
  setError: (value: string | null) => void;
  patchSnapshot: (patch: WorldStudioSnapshotPatch) => void;
  patchPanel: (patch: Partial<WorldStudioWorkspaceSnapshot['panel']>) => void;
  setSourceMode: (mode: 'TEXT' | 'FILE') => void;
  setSourceEncoding: (encoding: SupportedEncoding) => void;
  setFilePreviewText: (text: string) => void;
  setRetryWithFineRoute: (value: boolean) => void;
  setRetryScope: (scope: RetryScope) => void;
  setRetryConcurrency: (value: number) => void;
  setRetryErrorCode: (value: string | null) => void;
  setEventSyncMode: (mode: 'merge' | 'replace') => void;
  sourceChunksRef: { current: string[] };
  onSelectSourceFile: (file: File | null) => Promise<void>;
  onRunPhase1: (mode?: 'all' | 'failed', forcedRetryErrorCode?: string | null) => Promise<void>;
  onRunPhase2: () => Promise<void>;
  onRefreshPhase1QualityGate: () => void;
  onGenerateWorldCover: () => Promise<void>;
  onGenerateCharacterPortrait: (name: string) => Promise<void>;
  onToggleAgentSyncCharacter: (name: string, checked: boolean) => void;
  onAgentDraftChange: (name: string, patch: Partial<WorldStudioWorkspaceSnapshot['agentSync']['draftsByCharacter'][string]>) => void;
  onTimeFlowRatioChange: (value: string) => void;
  onCurrentTimeNodeChange: (value: string) => void;
  onFutureEventsTextChange: (value: string) => void;
  onSyncEvents: () => Promise<void>;
  onDeleteFirstEvent: () => Promise<void>;
  onSyncLorebooks: () => Promise<void>;
  onDeleteFirstLorebook: () => Promise<void>;
};

export function buildWorldStudioMainPanel(input: BuildWorldStudioMainPanelInput): ReactNode {
  if (input.landingTarget === 'CREATE') {
    const graphForCheckpoints = {
      ...input.snapshot.knowledgeGraph,
      events: input.snapshot.eventsDraft,
    };
    const derivedStartTimeOptions = deriveStartTimeOptions(graphForCheckpoints);
    const derivedCharacterCandidates = deriveCharacterCandidates(graphForCheckpoints);
    const phase1ForWorkbench = input.phase1
      ? {
        ...input.phase1,
        startTimeOptions: derivedStartTimeOptions,
        characterCandidates: derivedCharacterCandidates,
        knowledgeGraph: graphForCheckpoints,
      }
      : (input.snapshot.phase1Artifact
        ? {
          startTimeOptions: derivedStartTimeOptions,
          characterCandidates: derivedCharacterCandidates,
          knowledgeGraph: graphForCheckpoints,
          finalDraftAccumulator: input.snapshot.finalDraftAccumulator,
          qualityGate: input.snapshot.phase1Artifact.qualityGate,
          chunkTasks: input.snapshot.phase1Artifact.chunkTasks,
          rawText: JSON.stringify({
            restoredFromArtifact: true,
            updatedAt: input.snapshot.phase1Artifact.updatedAt,
          }),
        }
        : null);
    const startTimeOptions = phase1ForWorkbench?.startTimeOptions || [];
    const effectiveSelectedStartTimeId = startTimeOptions.some((item) => item.id === input.snapshot.selectedStartTimeId)
      ? input.snapshot.selectedStartTimeId
      : (startTimeOptions[0]?.id || '');
    const buildStartTimeProjectionPatch = (
      selectedStartTimeId: string,
      events: { primary: EventNodeDraft[]; secondary: EventNodeDraft[] },
    ): Pick<WorldStudioWorkspaceSnapshot, 'selectedStartTimeId' | 'eventsDraft' | 'futureEventsText' | 'knowledgeGraph'> => {
      const projection = projectEventsForSelectedStartTime({
        selectedStartTimeId,
        startTimeOptions,
        events,
        futureHistoricalEvents: input.snapshot.knowledgeGraph.futureHistoricalEvents,
      });
      if (!projection.applied) {
        input.setError(`WORLD_STUDIO_START_TIME_PROJECTION_FAILED: ${projection.reasonCode || 'WORLD_STUDIO_START_TIME_PROJECTION_FAILED'}`);
      }
      return {
        selectedStartTimeId,
        eventsDraft: projection.events,
        futureEventsText: JSON.stringify(projection.futureHistoricalEvents || [], null, 2),
        knowledgeGraph: {
          ...input.snapshot.knowledgeGraph,
          events: projection.events,
          futureHistoricalEvents: projection.futureHistoricalEvents,
        },
      };
    };

    return (
      <CreateWorkbench
        step={input.snapshot.createStep}
        onStepChange={input.setCreateStep}
        sourceText={input.snapshot.sourceText}
        sourceRef={input.snapshot.sourceRef}
        sourceMode={input.sourceMode}
        sourceEncoding={input.sourceEncoding}
        filePreviewText={input.filePreviewText}
        parseJob={input.snapshot.parseJob}
        chunkTasks={phase1ForWorkbench?.chunkTasks || input.snapshot.phase1Artifact?.chunkTasks || []}
        phase1={phase1ForWorkbench}
        qualityGate={phase1ForWorkbench?.qualityGate || input.snapshot.phase1Artifact?.qualityGate || null}
        phase2={input.phase2}
        knowledgeGraph={input.snapshot.knowledgeGraph}
        assets={input.snapshot.assets}
        selectedStartTimeId={effectiveSelectedStartTimeId}
        selectedCharacters={input.snapshot.selectedCharacters}
        selectedAgentSyncCharacters={input.selectedAgentSyncCharacters}
        agentDraftsByCharacter={input.agentDraftsByCharacter}
        expertMode={input.expertMode}
        worldPatch={input.snapshot.worldPatch}
        worldviewPatch={input.snapshot.worldviewPatch}
        events={input.eventsGraph}
        eventGraphLayout={input.snapshot.eventGraphLayout}
        lorebooksDraft={input.snapshot.lorebooksDraft}
        futureEventsText={input.snapshot.futureEventsText}
        timeFlowRatio={input.timeFlowRatio}
        currentTimeNode={input.currentTimeNode}
        working={input.working}
        retryWithFineRoute={input.retryWithFineRoute}
        retryScope={input.retryScope}
        retryConcurrency={input.retryConcurrency}
        retryErrorCode={input.retryErrorCode}
        onSourceTextChange={(value) => {
          input.setSourceMode('TEXT');
          input.setFilePreviewText('');
          input.sourceChunksRef.current = [];
          input.patchSnapshot({ sourceText: value });
        }}
        onSourceRefChange={(value) => input.patchSnapshot({ sourceRef: value })}
        onSourceEncodingChange={(value) => input.setSourceEncoding(value)}
        onSelectSourceFile={(file) => { void input.onSelectSourceFile(file); }}
        onSelectStartTimeId={(value) => input.patchSnapshot({
          ...buildStartTimeProjectionPatch(value, input.snapshot.eventsDraft),
          unsavedChangesByPanel: { ...input.snapshot.unsavedChangesByPanel, events: true },
        })}
        onToggleCharacter={(name, checked) => {
          const current = input.snapshot.selectedCharacters;
          const currentSync = input.snapshot.agentSync.selectedCharacterIds;
          input.patchSnapshot({
            selectedCharacters: checked
              ? toUniqueStringArray([...current, name])
              : current.filter((item) => item !== name),
            agentSync: {
              ...input.snapshot.agentSync,
              selectedCharacterIds: checked
                ? toUniqueStringArray([...currentSync, name])
                : currentSync.filter((item) => item !== name),
            },
          });
        }}
        onToggleAgentSyncCharacter={input.onToggleAgentSyncCharacter}
        onTimeFlowRatioChange={input.onTimeFlowRatioChange}
        onCurrentTimeNodeChange={input.onCurrentTimeNodeChange}
        onFutureEventsTextChange={input.onFutureEventsTextChange}
        onGenerateWorldCover={() => { void input.onGenerateWorldCover(); }}
        onGenerateCharacterPortrait={(name) => { void input.onGenerateCharacterPortrait(name); }}
        onAgentDraftChange={input.onAgentDraftChange}
        onWorldPatchChange={(value) => input.patchSnapshot({
          worldPatch: value,
          unsavedChangesByPanel: { ...input.snapshot.unsavedChangesByPanel, world: true },
        })}
        onWorldviewPatchChange={(value) => input.patchSnapshot({
          worldviewPatch: value,
          unsavedChangesByPanel: { ...input.snapshot.unsavedChangesByPanel, worldview: true },
        })}
        onEventsGraphChange={(next) => input.patchSnapshot({
          ...buildStartTimeProjectionPatch(effectiveSelectedStartTimeId, next),
          unsavedChangesByPanel: { ...input.snapshot.unsavedChangesByPanel, events: true },
        })}
        onEventGraphLayoutChange={(next) => input.patchSnapshot({
          eventGraphLayout: {
            selectedEventId: String(next.selectedEventId || ''),
            expandedPrimaryIds: Array.isArray(next.expandedPrimaryIds)
              ? next.expandedPrimaryIds.map((item) => String(item || '')).filter((item) => Boolean(item))
              : [],
          },
        })}
        onLorebooksChange={(value) => input.patchSnapshot({
          lorebooksDraft: value,
          unsavedChangesByPanel: { ...input.snapshot.unsavedChangesByPanel, lorebooks: true },
        })}
        onRunPhase1={() => { void input.onRunPhase1(); }}
        onRunFailedChunks={() => { void input.onRunPhase1('failed'); }}
        onRunFailedChunksByErrorCode={(errorCode) => {
          input.setRetryErrorCode(errorCode);
          void input.onRunPhase1('failed', errorCode);
        }}
        onRetryWithFineRouteChange={input.setRetryWithFineRoute}
        onRetryScopeChange={(value) => {
          input.setRetryScope(value);
          input.setRetryErrorCode(null);
        }}
        onRetryConcurrencyChange={input.setRetryConcurrency}
        onClearRetryErrorCode={() => input.setRetryErrorCode(null)}
        onRefreshQualityGate={input.onRefreshPhase1QualityGate}
        onRunPhase2={() => { void input.onRunPhase2(); }}
      />
    );
  }

  return (
    <MaintainWorkbench
      activeTab={input.snapshot.panel.activeMaintainTab}
      onTabChange={(tab) => input.patchPanel({ activeMaintainTab: tab })}
      worldPatch={input.snapshot.worldPatch}
      worldviewPatch={input.snapshot.worldviewPatch}
      events={input.eventsGraph}
      eventsSyncMode={input.eventSyncMode}
      editorSnapshotVersion={input.snapshot.editorSnapshotVersion}
      eventGraphLayout={input.snapshot.eventGraphLayout}
      lorebooksDraft={input.snapshot.lorebooksDraft}
      mutations={input.mutations}
      working={input.working}
      onWorldPatchChange={(value) => input.patchSnapshot({
        worldPatch: value,
        unsavedChangesByPanel: { ...input.snapshot.unsavedChangesByPanel, world: true },
      })}
      onWorldviewPatchChange={(value) => input.patchSnapshot({
        worldviewPatch: value,
        unsavedChangesByPanel: { ...input.snapshot.unsavedChangesByPanel, worldview: true },
      })}
      onEventsChange={(value) => input.patchSnapshot({
        eventsDraft: value,
        knowledgeGraph: {
          ...input.snapshot.knowledgeGraph,
          events: value,
        },
        unsavedChangesByPanel: { ...input.snapshot.unsavedChangesByPanel, events: true },
      })}
      onEventGraphLayoutChange={(next) => input.patchSnapshot({
        eventGraphLayout: {
          selectedEventId: String(next.selectedEventId || ''),
          expandedPrimaryIds: Array.isArray(next.expandedPrimaryIds)
            ? next.expandedPrimaryIds.map((item) => String(item || '')).filter((item) => Boolean(item))
            : [],
        },
      })}
      onEventsSyncModeChange={input.setEventSyncMode}
      onLorebooksChange={(value) => input.patchSnapshot({
        lorebooksDraft: value,
        unsavedChangesByPanel: { ...input.snapshot.unsavedChangesByPanel, lorebooks: true },
      })}
      onSyncEvents={() => { void input.onSyncEvents(); }}
      onDeleteFirstEvent={() => { void input.onDeleteFirstEvent(); }}
      onSyncLorebooks={() => { void input.onSyncLorebooks(); }}
      onDeleteFirstLorebook={() => { void input.onDeleteFirstLorebook(); }}
    />
  );
}
