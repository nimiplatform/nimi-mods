import React from 'react';
import { SourceInputPanel } from './source-input-panel.js';
import { CheckpointsPanel } from './checkpoints-panel.js';
import { Phase2Panel } from './phase2-panel.js';
import { DraftEditorPanel } from './draft-editor-panel.js';
import { PublishPanel } from './publish-panel.js';
import { StickyActionBar } from '../sticky-action-bar.js';
import type {
  WorldStudioActionsSlice,
  WorldStudioCreateDisplayStage,
  WorldStudioRoutingSlice,
  WorldStudioStatusSlice,
  WorldStudioWorkflowSlice,
  WorldStudioMainSlice,
} from '../../controllers/world-studio-screen-model.js';
import { useModTranslation } from "@nimiplatform/sdk/mod";

type CreateWorkbenchProps = {
  workflow: WorldStudioWorkflowSlice;
  main: WorldStudioMainSlice;
  routing: WorldStudioRoutingSlice;
  status: WorldStudioStatusSlice;
  actions: WorldStudioActionsSlice;
};

function StageCard(props: {
  label: string;
  summary: string;
  active: boolean;
}): React.ReactElement {
  return (
    <div
      className={`rounded-[28px] border p-4 shadow-sm transition-colors ${
        props.active
          ? 'border-teal-200 bg-gradient-to-br from-[#ecfaf6] via-[#f7fcfb] to-[#f3fbff] shadow-[0_16px_40px_rgba(20,184,166,0.12)]'
          : 'border-white/80 bg-white/88 shadow-[0_8px_24px_rgba(15,23,42,0.05)]'
      }`}
    >
      <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${props.active ? 'text-teal-600' : 'text-slate-400'}`}>
        {props.label}
      </p>
      <p className={`mt-3 text-xl font-semibold ${props.active ? 'text-slate-950' : 'text-slate-900'}`}>
        {props.summary}
      </p>
    </div>
  );
}

function Banner(props: {
  tone: 'danger' | 'warning' | 'info';
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}): React.ReactElement {
  const toneClass = props.tone === 'danger'
    ? 'border-red-200 bg-red-50 text-red-800'
    : props.tone === 'warning'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-sky-200 bg-sky-50 text-sky-800';
  return (
    <div className={`rounded-xl border p-3 ${toneClass}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{props.title}</p>
          <p className="mt-1 text-xs">{props.body}</p>
        </div>
        {props.actionLabel && props.onAction ? (
          <button
            type="button"
            className="rounded-md border border-current bg-white px-3 py-1.5 text-xs font-semibold"
            onClick={props.onAction}
          >
            {props.actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function createStageSummary(
  t: ReturnType<typeof useModTranslation>['t'],
  stage: WorldStudioCreateDisplayStage,
  props: CreateWorkbenchProps,
): string {
  const { snapshot, phase1, phase2 } = props.main;
  if (stage === 'IMPORT') {
    const chunkTasks = phase1?.chunkTasks || snapshot.phase1Artifact?.chunkTasks || [];
    if (props.main.importSubview === 'PREPARE') {
      return t('create.stage.import.prepare', 'Prepare source and routes');
    }
    if (props.main.importSubview === 'RUNNING') {
      return t('create.stage.import.running', '{{count}} chunks in flight', { count: Math.max(chunkTasks.length, snapshot.parseJob.chunkTotal) });
    }
    return t('create.stage.import.result', '{{events}} events extracted', {
      events: snapshot.eventsDraft.primary.length + snapshot.eventsDraft.secondary.length,
    });
  }
  if (stage === 'CURATE') {
    return t('create.stage.curate.summary', '{{characters}} characters · {{events}} primary events', {
      characters: snapshot.selectedCharacters.length,
      events: snapshot.eventsDraft.primary.length,
    });
  }
  if (stage === 'GENERATE') {
    return t('create.stage.generate.summary', '{{agents}} synced agents · {{stories}} story drafts', {
      agents: props.main.selectedAgentSyncCharacters.length,
      stories: Array.isArray(phase2?.worldEvents) ? phase2?.worldEvents.length : 0,
    });
  }
  return props.main.reviewSubview === 'PUBLISH_REVIEW'
    ? t('create.stage.review.publish', 'Ready to publish')
    : t('create.stage.review.edit', 'Draft editing');
}

function PublishReviewPanel(props: {
  selectedDraftId: string;
  hasPhase1: boolean;
  hasPhase2: boolean;
  parseJob: CreateWorkbenchProps['main']['snapshot']['parseJob'];
  selectedAgentSyncCount: number;
  worldCoverStatus: CreateWorkbenchProps['main']['snapshot']['assets']['worldCover']['status'];
  primaryEventCount: number;
  secondaryEventCount: number;
  lorebookCount: number;
}): React.ReactElement {
  const { t } = useModTranslation('world-studio');
  return (
    <div className="space-y-4">
      <section className="ui-sync-card ui-sync-card-inset p-4">
        <h3 className="text-sm font-semibold text-gray-900">{t('review.publishReviewTitle', 'Publish review')}</h3>
        <p className="mt-1 text-xs text-gray-500">
          {t('review.publishReviewDescription', 'Freeze the draft, validate the publish checklist, then push the world into maintenance mode.')}
        </p>
      </section>

      <PublishPanel
        step="PUBLISH"
        draftId={props.selectedDraftId}
        hasPhase1={props.hasPhase1}
        hasPhase2={props.hasPhase2}
        parseJob={props.parseJob}
        selectedAgentSyncCount={props.selectedAgentSyncCount}
        worldCoverStatus={props.worldCoverStatus}
        working={false}
        onSaveDraft={() => undefined}
        onPublishDraft={() => undefined}
        embedded={false}
        showActions={false}
      />

      <section className="ui-sync-card ui-sync-card-inset p-4">
        <h3 className="text-sm font-semibold text-gray-900">{t('review.finalChecklistTitle', 'Final checklist')}</h3>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
            {t('review.finalChecklistPrimaryEvents', 'Primary events: {{count}}', { count: props.primaryEventCount })}
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
            {t('review.finalChecklistSecondaryEvents', 'Secondary events: {{count}}', { count: props.secondaryEventCount })}
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
            {t('review.finalChecklistLorebooks', 'Lorebooks: {{count}}', { count: props.lorebookCount })}
          </div>
        </div>
      </section>
    </div>
  );
}

function TaskButtons(props: {
  t: ReturnType<typeof useModTranslation>['t'];
  status: WorldStudioStatusSlice;
  actions: WorldStudioActionsSlice['task'];
}): React.ReactElement {
  return (
    <>
      {props.status.activeTask?.canPause ? (
        <button
          type="button"
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700"
          onClick={props.actions.pauseTask}
        >
          {props.t('task.pause', 'Pause')}
        </button>
      ) : null}
      {props.status.activeTask?.canResume ? (
        <button
          type="button"
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700"
          onClick={() => {
            void props.actions.resumeTask();
          }}
        >
          {props.t('task.resume', 'Resume')}
        </button>
      ) : null}
      {props.status.activeTask?.canCancel ? (
        <button
          type="button"
          className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700"
          onClick={props.actions.cancelTask}
        >
          {props.t('task.cancel', 'Cancel')}
        </button>
      ) : null}
    </>
  );
}

function renderSourceInputPanel(
  props: CreateWorkbenchProps,
  expertModeOverride?: boolean,
): React.ReactElement {
  const { snapshot, phase1 } = props.main;
  return (
    <SourceInputPanel
      sourceText={snapshot.sourceText}
      sourceRef={snapshot.sourceRef}
      sourceMode={props.main.sourceMode}
      sourceEncoding={props.main.sourceEncoding}
      filePreviewText={props.main.filePreviewText}
      parseJob={snapshot.parseJob}
      chunkTasks={phase1?.chunkTasks || snapshot.phase1Artifact?.chunkTasks || []}
      onSourceTextChange={props.actions.source.onSourceTextChange}
      onSourceRefChange={props.actions.source.onSourceRefChange}
      onSourceEncodingChange={props.actions.source.onSourceEncodingChange}
      onSelectSourceFile={(file) => {
        void props.actions.source.onSelectSourceFile(file);
      }}
      onRunPhase1={() => {
        void props.actions.source.startExtraction();
      }}
      onRunFailedChunks={() => {
        void props.actions.source.retryFailed();
      }}
      onRunFailedChunksByErrorCode={(errorCode) => {
        void props.actions.source.retryFailedByErrorCode(errorCode);
      }}
      retryWithFineRoute={props.main.retryWithFineRoute}
      onRetryWithFineRouteChange={props.actions.source.setRetryWithFineRoute}
      retryScope={props.main.retryScope}
      onRetryScopeChange={props.actions.source.setRetryScope}
      retryConcurrency={props.main.retryConcurrency}
      onRetryConcurrencyChange={props.actions.source.setRetryConcurrency}
      retryErrorCode={props.main.retryErrorCode}
      onClearRetryErrorCode={props.actions.source.clearRetryErrorCode}
      expertMode={expertModeOverride ?? props.status.expertMode}
      showInlineActions={false}
      working={props.main.working}
    />
  );
}

function renderActionBar(
  props: CreateWorkbenchProps,
  routeBlocked: boolean,
  t: ReturnType<typeof useModTranslation>['t'],
): React.ReactElement {
  const { workflow, main, actions, status } = props;
  const qualityGate = main.phase1?.qualityGate || main.snapshot.phase1Artifact?.qualityGate || null;
  const hasDirty = Object.values(main.snapshot.unsavedChangesByPanel).some(Boolean);
  const hasDraft = Boolean(workflow.selectedDraftId);
  const hasPhase1 = Boolean(main.phase1 || main.snapshot.phase1Artifact);

  if (workflow.createDisplayStage === 'IMPORT') {
    if (main.importSubview === 'RUNNING') {
      return <TaskButtons t={t} status={status} actions={actions.task} />;
    }
    if (main.importSubview === 'RESULT') {
      return (
        <>
          <button
            type="button"
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 disabled:opacity-60"
            onClick={() => {
              void actions.source.retryFailed();
            }}
            disabled={main.working}
          >
            {t('create.retryFailed', 'Retry Failed')}
          </button>
          <button
            type="button"
            className="ui-sync-btn ui-sync-btn-primary rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
            onClick={() => actions.workflow.selectCreateDisplayStage('CURATE')}
            disabled={main.working || !hasPhase1}
          >
            {t('create.continueToCurate', 'Continue to Curate')}
          </button>
        </>
      );
    }
    return (
      <button
        type="button"
        className="ui-sync-btn ui-sync-btn-primary rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
        onClick={() => {
          void actions.source.startExtraction();
        }}
        disabled={main.working || routeBlocked}
      >
        {t('create.startExtraction', 'Start Extraction')}
      </button>
    );
  }

  if (workflow.createDisplayStage === 'CURATE') {
    return (
      <>
        <button
          type="button"
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 disabled:opacity-60"
          onClick={actions.curate.refreshQualityGate}
          disabled={main.working}
        >
          {t('create.refreshQualityGate', 'Refresh Quality Gate')}
        </button>
        <button
          type="button"
          className="ui-sync-btn ui-sync-btn-primary rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          onClick={actions.curate.continueToGenerate}
          disabled={main.working || qualityGate?.status === 'BLOCK'}
        >
          {t('create.continueToGenerate', 'Continue to Generate')}
        </button>
      </>
    );
  }

  if (workflow.createDisplayStage === 'GENERATE') {
    return (
      <button
        type="button"
        className="ui-sync-btn ui-sync-btn-primary rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
        onClick={() => {
          void actions.generate.runPhase2();
        }}
        disabled={main.working}
      >
        {t('create.generateDraft', 'Generate Draft')}
      </button>
    );
  }

  if (main.reviewSubview === 'PUBLISH_REVIEW') {
    return (
      <>
        <button
          type="button"
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 disabled:opacity-60"
          onClick={actions.review.backToEdit}
          disabled={main.working}
        >
          {t('review.backToEdit', 'Back to Edit')}
        </button>
        <button
          type="button"
          className="ui-sync-btn ui-sync-btn-primary rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          onClick={() => {
            void actions.review.publishDraft();
          }}
          disabled={main.working || !hasDraft || hasDirty}
        >
          {t('review.publish', 'Publish')}
        </button>
      </>
    );
  }

  return (
    <button
      type="button"
      className="ui-sync-btn ui-sync-btn-primary rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
      onClick={() => {
        void actions.review.saveDraft();
      }}
      disabled={main.working}
    >
      {t('review.saveDraft', 'Save Draft')}
    </button>
  );
}

export function CreateWorkbench(props: CreateWorkbenchProps) {
  const { t } = useModTranslation('world-studio');
  const { snapshot, phase1, phase2 } = props.main;
  const routeBlocked = props.workflow.createDisplayStage === 'IMPORT' && !props.routing.routeConfigReady;
  const qualityGate = phase1?.qualityGate || snapshot.phase1Artifact?.qualityGate || null;
  const hasPhase1 = Boolean(phase1 || snapshot.phase1Artifact);
  const hasPhase2 = Boolean(phase2);
  const selectedStartTimeId = snapshot.selectedStartTimeId
    || phase1?.startTimeOptions[phase1.startTimeOptions.length - 1]?.id
    || snapshot.phase1Artifact?.startTimeOptions[snapshot.phase1Artifact.startTimeOptions.length - 1]?.id
    || '';
  const draftQuality = snapshot.draftQuality;
  const draftQualityIncomplete = draftQuality.worldCutStatus === 'ready' && draftQuality.enrichStatus === 'incomplete';
  const draftQualityReason = String(draftQuality.enrichFailureReason || '').trim();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-auto px-5 py-5">
        <div className="space-y-4">
          <section className="grid gap-4 xl:grid-cols-4">
            {(['IMPORT', 'CURATE', 'GENERATE', 'REVIEW'] as WorldStudioCreateDisplayStage[]).map((stage) => (
              <StageCard
                key={stage}
                label={t(`stage.${stage.toLowerCase()}`, stage)}
                summary={createStageSummary(t, stage, props)}
                active={props.workflow.createDisplayStage === stage}
              />
            ))}
          </section>

          {routeBlocked ? (
            <Banner
              tone="warning"
              title={t('create.routeBlockerTitle', 'Routing not ready')}
              body={props.routing.routeConfigReasonCode || t('create.routeBlockerBody', 'Configure coarse and fine routes before extraction can start.')}
              actionLabel={t('create.routeBlockerAction', 'Open Route Setup')}
              onAction={() => props.actions.workflow.openRuntimeSetup?.()}
            />
          ) : null}

          {props.workflow.createDisplayStage === 'CURATE' && qualityGate?.status === 'BLOCK' ? (
            <Banner
              tone="danger"
              title={t('create.qualityGateBlockTitle', 'Quality gate blocked')}
              body={(qualityGate.reasons || []).join(' · ') || t('create.qualityGateBlockBody', 'Resolve coverage and evidence issues before synthesis.')}
            />
          ) : null}

          {(props.workflow.createDisplayStage === 'GENERATE' || props.workflow.createDisplayStage === 'REVIEW') && draftQualityIncomplete ? (
            <Banner
              tone="info"
              title={t('create.draftQualityEnrichIncompleteTitle', 'Draft quality status: detail enrichment incomplete')}
              body={draftQualityReason
                ? t('create.draftQualityEnrichIncompleteBodyWithReason', 'The initial world cut succeeded, but detail enrichment did not complete successfully ({{reason}}). Review and adjust the draft before deciding whether to continue creating the world.', {
                  reason: draftQualityReason,
                })
                : t('create.draftQualityEnrichIncompleteBody', 'The initial world cut succeeded, but detail enrichment is incomplete. Review and adjust the draft before deciding whether to continue creating the world.')}
            />
          ) : null}

          {props.workflow.createDisplayStage === 'IMPORT' ? (
            props.main.importSubview === 'PREPARE' ? (
              renderSourceInputPanel(props)
            ) : props.main.importSubview === 'RUNNING' ? (
              <div className="space-y-4">
                {renderSourceInputPanel(props, true)}
              </div>
            ) : (
              <div className="space-y-4">
                {renderSourceInputPanel(props)}
              </div>
            )
          ) : null}

          {props.workflow.createDisplayStage === 'CURATE' ? (
            <CheckpointsPanel
              phase1={phase1}
              sourceText={snapshot.sourceText}
              selectedStartTimeId={selectedStartTimeId}
              selectedCharacters={snapshot.selectedCharacters}
              events={props.main.eventsGraph}
              eventGraphLayout={snapshot.eventGraphLayout}
              onSelectStartTimeId={props.actions.curate.onSelectStartTimeId}
              onToggleCharacter={props.actions.curate.onToggleCharacter}
              onEventsChange={props.actions.curate.onEventsGraphChange}
              onEventGraphLayoutChange={props.actions.curate.onEventGraphLayoutChange}
              onRefreshQualityGate={props.actions.curate.refreshQualityGate}
              onRunPhase2={() => {
                void props.actions.generate.runPhase2();
              }}
              showInlineActions={false}
              working={props.main.working}
            />
          ) : null}

          {props.workflow.createDisplayStage === 'GENERATE' ? (
            <Phase2Panel
              phase2={phase2}
              assets={snapshot.assets}
              selectedCharacters={snapshot.selectedCharacters}
              selectedAgentSyncCharacters={props.main.selectedAgentSyncCharacters}
              agentDraftsByCharacter={props.main.truthDerivedAgentDraftsByCharacter}
              timeFlowRatio={props.main.timeFlowRatio}
              futureEventsText={snapshot.futureEventsText}
              onTimeFlowRatioChange={props.actions.generate.onTimeFlowRatioChange}
              onFutureEventsTextChange={props.actions.generate.onFutureEventsTextChange}
              onGenerateWorldCover={() => {
                void props.actions.generate.onGenerateWorldCover();
              }}
              onGenerateCharacterPortrait={(name) => {
                void props.actions.generate.onGenerateCharacterPortrait(name);
              }}
              onToggleAgentSyncCharacter={props.actions.generate.onToggleAgentSyncCharacter}
              onAgentDraftChange={props.actions.generate.onAgentDraftChange}
              working={props.main.working}
            />
          ) : null}

          {props.workflow.createDisplayStage === 'REVIEW' ? (
            props.main.reviewSubview === 'EDIT' ? (
              <DraftEditorPanel
                sourceText={snapshot.sourceText}
                worldPatch={snapshot.worldPatch}
                worldviewPatch={snapshot.worldviewPatch}
                ruleTruthDraft={snapshot.ruleTruthDraft}
                events={props.main.eventsGraph}
                lorebooksDraft={snapshot.lorebooksDraft}
                onWorldPatchChange={props.actions.review.onWorldPatchChange}
                onWorldviewPatchChange={props.actions.review.onWorldviewPatchChange}
                onRuleTruthDraftChange={props.actions.review.onRuleTruthDraftChange}
                onEventsChange={props.actions.review.onEventsChange}
                onLorebooksChange={props.actions.review.onLorebooksChange}
                eventGraphLayout={snapshot.eventGraphLayout}
                onEventGraphLayoutChange={props.actions.review.onEventGraphLayoutChange}
              />
            ) : (
              <PublishReviewPanel
                selectedDraftId={props.workflow.selectedDraftId}
                hasPhase1={hasPhase1}
                hasPhase2={hasPhase2}
                parseJob={snapshot.parseJob}
                selectedAgentSyncCount={props.main.selectedAgentSyncCharacters.length}
                worldCoverStatus={snapshot.assets.worldCover.status}
                primaryEventCount={snapshot.eventsDraft.primary.length}
                secondaryEventCount={snapshot.eventsDraft.secondary.length}
                lorebookCount={snapshot.lorebooksDraft.length}
              />
            )
          ) : null}
        </div>
      </div>

      <StickyActionBar>
        {renderActionBar(props, routeBlocked, t)}
      </StickyActionBar>
    </div>
  );
}
