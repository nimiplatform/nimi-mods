import React from 'react';
import type { Phase1Result, Phase2Result } from '../../generation/pipeline.js';
import type {
  ChunkTaskResult,
  EventNodeDraft,
  QualityGateResult,
  WorldStudioAgentDraft,
  WorldStudioAssetDraft,
  WorldStudioCreateStep,
  WorldLorebookDraftRow,
  WorldStudioKnowledgeGraphDraft,
  WorldStudioParseJobState,
} from '../../contracts.js';
import { SourceInputPanel } from './source-input-panel.js';
import { Phase1Panel } from './phase1-panel.js';
import { CheckpointsPanel } from './checkpoints-panel.js';
import { Phase2Panel } from './phase2-panel.js';
import { DraftEditorPanel } from './draft-editor-panel.js';

type CreateWorkbenchProps = {
  step: WorldStudioCreateStep;
  onStepChange: (step: WorldStudioCreateStep) => void;
  sourceText: string;
  sourceRef: string;
  sourceMode: 'TEXT' | 'FILE';
  sourceEncoding: 'utf-8' | 'gb18030' | 'utf-16le';
  filePreviewText: string;
  parseJob: WorldStudioParseJobState;
  chunkTasks: ChunkTaskResult[];
  phase1: Phase1Result | null;
  qualityGate: QualityGateResult | null;
  phase2: Phase2Result | null;
  knowledgeGraph: WorldStudioKnowledgeGraphDraft;
  assets: WorldStudioAssetDraft;
  selectedStartTimeId: string;
  selectedCharacters: string[];
  selectedAgentSyncCharacters: string[];
  agentDraftsByCharacter: Record<string, WorldStudioAgentDraft>;
  worldPatch: Record<string, unknown>;
  worldviewPatch: Record<string, unknown>;
  events: {
    primary: EventNodeDraft[];
    secondary: EventNodeDraft[];
  };
  eventGraphLayout: {
    selectedEventId: string;
    expandedPrimaryIds: string[];
  };
  lorebooksDraft: WorldLorebookDraftRow[];
  futureEventsText: string;
  expertMode: boolean;
  timeFlowRatio: string;
  currentTimeNode: string;
  working: boolean;
  onSourceTextChange: (value: string) => void;
  onSourceRefChange: (value: string) => void;
  onSourceEncodingChange: (value: 'utf-8' | 'gb18030' | 'utf-16le') => void;
  onSelectSourceFile: (file: File | null) => void;
  onSelectStartTimeId: (value: string) => void;
  onToggleCharacter: (name: string, checked: boolean) => void;
  onToggleAgentSyncCharacter: (name: string, checked: boolean) => void;
  onTimeFlowRatioChange: (value: string) => void;
  onCurrentTimeNodeChange: (value: string) => void;
  onFutureEventsTextChange: (value: string) => void;
  onGenerateWorldCover: () => void;
  onGenerateCharacterPortrait: (name: string) => void;
  onWorldPatchChange: (value: Record<string, unknown>) => void;
  onWorldviewPatchChange: (value: Record<string, unknown>) => void;
  onAgentDraftChange: (name: string, patch: Partial<WorldStudioAgentDraft>) => void;
  onEventsGraphChange: (next: { primary: EventNodeDraft[]; secondary: EventNodeDraft[] }) => void;
  onEventGraphLayoutChange: (next: { selectedEventId: string; expandedPrimaryIds: string[] }) => void;
  onLorebooksChange: (value: WorldLorebookDraftRow[]) => void;
  onRunPhase1: () => void;
  onRunFailedChunks: () => void;
  onRunFailedChunksByErrorCode: (errorCode: string) => void;
  retryWithFineRoute: boolean;
  onRetryWithFineRouteChange: (value: boolean) => void;
  retryScope: 'all' | 'json' | 'coarse' | 'fine';
  onRetryScopeChange: (value: 'all' | 'json' | 'coarse' | 'fine') => void;
  retryConcurrency: number;
  onRetryConcurrencyChange: (value: number) => void;
  retryErrorCode: string | null;
  onClearRetryErrorCode: () => void;
  onRefreshQualityGate: () => void;
  onRunPhase2: () => void;
};

const STEPS: WorldStudioCreateStep[] = [
  'SOURCE',
  'INGEST',
  'EXTRACT',
  'CHECKPOINTS',
  'SYNTHESIZE',
  'DRAFT',
  'PUBLISH',
];

function shouldShowSourcePanel(step: WorldStudioCreateStep): boolean {
  return step === 'SOURCE' || step === 'INGEST' || step === 'EXTRACT';
}

function shouldShowPhase1Panel(step: WorldStudioCreateStep): boolean {
  return step !== 'SOURCE';
}

function shouldShowPhase2Panel(step: WorldStudioCreateStep): boolean {
  return step === 'SYNTHESIZE' || step === 'DRAFT' || step === 'PUBLISH';
}

function shouldShowDraftEditor(step: WorldStudioCreateStep): boolean {
  return step === 'DRAFT' || step === 'PUBLISH';
}

export function CreateWorkbench(props: CreateWorkbenchProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {STEPS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => props.onStepChange(item)}
              className={`ui-sync-btn rounded-md border px-2.5 py-1 text-xs font-semibold ${
                props.step === item
                  ? 'ui-sync-btn-selected border-brand-200 bg-brand-50 text-brand-700'
                  : 'ui-sync-btn-secondary border-gray-200 bg-white text-gray-500'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {shouldShowSourcePanel(props.step) ? (
          <SourceInputPanel
            sourceText={props.sourceText}
            sourceRef={props.sourceRef}
            sourceMode={props.sourceMode}
            sourceEncoding={props.sourceEncoding}
            filePreviewText={props.filePreviewText}
            parseJob={props.parseJob}
            chunkTasks={props.chunkTasks}
            onSourceTextChange={props.onSourceTextChange}
            onSourceRefChange={props.onSourceRefChange}
            onSourceEncodingChange={props.onSourceEncodingChange}
            onSelectSourceFile={props.onSelectSourceFile}
            onRunPhase1={props.onRunPhase1}
            onRunFailedChunks={props.onRunFailedChunks}
            onRunFailedChunksByErrorCode={props.onRunFailedChunksByErrorCode}
            retryWithFineRoute={props.retryWithFineRoute}
            onRetryWithFineRouteChange={props.onRetryWithFineRouteChange}
            retryScope={props.retryScope}
            onRetryScopeChange={props.onRetryScopeChange}
            retryConcurrency={props.retryConcurrency}
            onRetryConcurrencyChange={props.onRetryConcurrencyChange}
            retryErrorCode={props.retryErrorCode}
            onClearRetryErrorCode={props.onClearRetryErrorCode}
            expertMode={props.expertMode}
            working={props.working}
          />
        ) : null}

        {shouldShowPhase1Panel(props.step) ? (
          <div className="ui-sync-card-inset mt-4">
            <Phase1Panel
              phase1={props.phase1}
              qualityGate={props.qualityGate}
              knowledgeGraph={props.knowledgeGraph}
              chunkTasks={props.chunkTasks}
              expertMode={props.expertMode}
            />
          </div>
        ) : null}

        {props.step === 'CHECKPOINTS' ? (
          <div className="ui-sync-card-inset mt-4">
            <CheckpointsPanel
              phase1={props.phase1}
              sourceText={props.sourceText}
              selectedStartTimeId={props.selectedStartTimeId}
              selectedCharacters={props.selectedCharacters}
              events={props.events}
              eventGraphLayout={props.eventGraphLayout}
              onSelectStartTimeId={props.onSelectStartTimeId}
              onToggleCharacter={props.onToggleCharacter}
              onEventsChange={props.onEventsGraphChange}
              onEventGraphLayoutChange={props.onEventGraphLayoutChange}
              onRefreshQualityGate={props.onRefreshQualityGate}
              onRunPhase2={props.onRunPhase2}
              working={props.working}
            />
          </div>
        ) : null}

        {shouldShowPhase2Panel(props.step) ? (
          <div className="ui-sync-card-inset mt-4">
            <Phase2Panel
              phase2={props.phase2}
              assets={props.assets}
              selectedCharacters={props.selectedCharacters}
              selectedAgentSyncCharacters={props.selectedAgentSyncCharacters}
              agentDraftsByCharacter={props.agentDraftsByCharacter}
              timeFlowRatio={props.timeFlowRatio}
              currentTimeNode={props.currentTimeNode}
              futureEventsText={props.futureEventsText}
              onTimeFlowRatioChange={props.onTimeFlowRatioChange}
              onCurrentTimeNodeChange={props.onCurrentTimeNodeChange}
              onFutureEventsTextChange={props.onFutureEventsTextChange}
              onGenerateWorldCover={props.onGenerateWorldCover}
              onGenerateCharacterPortrait={props.onGenerateCharacterPortrait}
              onToggleAgentSyncCharacter={props.onToggleAgentSyncCharacter}
              onAgentDraftChange={props.onAgentDraftChange}
              working={props.working}
            />
          </div>
        ) : null}

        {shouldShowDraftEditor(props.step) ? (
          <div className="ui-sync-card-inset mt-4">
            <DraftEditorPanel
              sourceText={props.sourceText}
              worldPatch={props.worldPatch}
              worldviewPatch={props.worldviewPatch}
              events={props.events}
              lorebooksDraft={props.lorebooksDraft}
              onWorldPatchChange={props.onWorldPatchChange}
              onWorldviewPatchChange={props.onWorldviewPatchChange}
              onEventsChange={props.onEventsGraphChange}
              onLorebooksChange={props.onLorebooksChange}
              eventGraphLayout={props.eventGraphLayout}
              onEventGraphLayoutChange={props.onEventGraphLayoutChange}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
