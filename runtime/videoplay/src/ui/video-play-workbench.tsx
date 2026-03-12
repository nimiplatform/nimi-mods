import React from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import type {
  EpisodeRecord,
  FallbackAuditRecord,
  ReleasePackage,
  VideoPlayRebuildImpactPreview,
  VideoPlayStageAdvancePlan,
  VideoPlayPipelineStageProgress,
  VideoPlayRunEvent,
  VideoPlayWorkbenchStageProgress,
  VideoStoryPackage,
  VideoStorySummary,
} from '../types.js';
import {
  VIDEOPLAY_PIPELINE_CHAIN,
  type VideoPlayOperationType,
  type VideoPlayPipelineStep,
  type VideoPlayWorkbenchStage,
  type VideoStorySourceMode,
} from '../contracts.js';
import {
  listManualRerunSteps,
  workbenchStageSteps,
} from '../workbench/stage-flow.js';

type RouteStatusView = {
  capability: 'chat' | 'image' | 'video' | 'tts';
  source: string;
  model: string;
  connectorId: string;
  ready: boolean;
};

type RunSummaryView = {
  runId: string;
  traceId: string;
  status: string;
  createdAt: string;
  episodeCount: number;
  releaseCandidateCount: number;
};

type VideoPlayErrorView = {
  reasonCode: string;
  actionHint: string;
  message: string;
};

export type VideoPlayWorkbenchProps = {
  title: string;
  subtitle: string;
  worldId: string;
  projectId: string;
  ingestCursorStart: string;
  stories: VideoStorySummary[];
  selectedStoryId: string;
  selectedStory: VideoStorySummary | null;
  sourceMode: VideoStorySourceMode;
  storyPackage: VideoStoryPackage | null;
  storyPackageLoading: boolean;
  storyPackageError: VideoPlayErrorView | null;
  runStatus: string;
  stageProgress: VideoPlayPipelineStageProgress[];
  workbenchStages: VideoPlayWorkbenchStageProgress[];
  selectedWorkbenchStage: VideoPlayWorkbenchStage;
  stageAdvancePlan: VideoPlayStageAdvancePlan;
  nextStep: VideoPlayPipelineStep | null;
  rerunStep: VideoPlayPipelineStep;
  rebuildPreview: VideoPlayRebuildImpactPreview | null;
  operationType: VideoPlayOperationType;
  operationPayload: string;
  selectedEpisodeId: string;
  routeStatuses: RouteStatusView[];
  routeReady: boolean;
  episodes: EpisodeRecord[];
  runs: RunSummaryView[];
  runEvents: VideoPlayRunEvent[];
  fallbackAudits: FallbackAuditRecord[];
  releases: ReleasePackage[];
  selectedEpisode: EpisodeRecord | null;
  selectedReleaseCandidate: ReleasePackage | null;
  activeBranchName: string;
  lastRebuildScope: string | null;
  loading: boolean;
  error: VideoPlayErrorView | null;
  operationOptions: Array<{ value: VideoPlayOperationType; label: string }>;
  onWorldIdChange: (value: string) => void;
  onProjectIdChange: (value: string) => void;
  onIngestCursorStartChange: (value: string) => void;
  onSelectStory: (storyId: string) => void;
  onSourceModeChange: (value: VideoStorySourceMode) => void;
  onSelectWorkbenchStage: (value: VideoPlayWorkbenchStage) => void;
  onAdvanceStage: () => void;
  onRerunStepChange: (value: VideoPlayPipelineStep) => void;
  onOperationTypeChange: (value: VideoPlayOperationType) => void;
  onOperationPayloadChange: (value: string) => void;
  onSelectEpisode: (episodeId: string) => void;
  onRunPipeline: () => void;
  onRerunStep: () => void;
  onContinueFromCheckpoint: () => void;
  onConfirmRebuildPreview: () => void;
  onCancelRun: () => void;
  onApplyOperation: () => void;
  onPublish: () => void;
  onReloadStoryPackage: () => void;
  onRefresh: () => void;
};

function statusTone(status: string): string {
  if (status === 'COMPLETED' || status === 'APPROVED' || status === 'ADJUSTED') return 'text-emerald-600';
  if (status === 'FAILED' || status === 'REJECTED' || status === 'CANCELED') return 'text-rose-600';
  if (status === 'RUNNING' || status === 'CANCEL_REQUESTED') return 'text-amber-600';
  return 'text-slate-500';
}

function sourceModeLabel(mode: VideoStorySourceMode): string {
  return mode === 'textplay-enriched-story' ? 'enriched' : 'canonical';
}

const STAGE_KEY_MAP: Record<string, string> = {
  'story-source': 'storySource',
  'casting': 'casting',
  'script': 'script',
  'storyboard': 'storyboard',
  'voice': 'voice',
  'selection': 'selection',
  'audio': 'audio',
  'video': 'video',
  'qc': 'qc',
  'publish': 'publish',
};

function workbenchStageLabelKey(stage: VideoPlayWorkbenchStage): string {
  return STAGE_KEY_MAP[stage] || stage;
}

function packageCoverageText(pkg: VideoStoryPackage): string {
  const c = pkg.snapshot.contextCoverage;
  return `CANON=${c.canon ? 'Y' : 'N'} STORY=${c.story ? 'Y' : 'N'} SUBJECT=${c.subject ? 'Y' : 'N'} RELATION=${c.relation ? 'Y' : 'N'} SCENE=${c.scene ? 'Y' : 'N'}`;
}

function formatStageStepList(stage: VideoPlayWorkbenchStage): string {
  return workbenchStageSteps(stage).join(' -> ');
}

function formatStageStepStatuses(stage: VideoPlayWorkbenchStageProgress): string {
  return workbenchStageSteps(stage.stage)
    .map((step) => `${step}:${stage.stepStatuses[step] || 'PENDING'}`)
    .join(' · ');
}

function pipelineStepLabel(step: VideoPlayPipelineStep): string {
  return step;
}

function isPipelineStep(step: string): step is VideoPlayPipelineStep {
  return VIDEOPLAY_PIPELINE_CHAIN.includes(step as VideoPlayPipelineStep);
}

export function VideoPlayWorkbench(props: VideoPlayWorkbenchProps) {
  const { t } = useModTranslation('videoplay');
  const canPublish = Boolean(
    props.selectedReleaseCandidate
    && (props.selectedReleaseCandidate.qcStatus === 'APPROVED' || props.selectedReleaseCandidate.qcStatus === 'ADJUSTED'),
  );
  const canAdvance = Boolean(!props.loading && props.stageAdvancePlan.allowed);
  const rerunBlockedByPreview = Boolean(props.rebuildPreview && !props.rebuildPreview.confirmed);
  const canRun = Boolean(
    !props.loading
    && props.routeReady
    && props.selectedStory
    && props.storyPackage
    && !props.storyPackageLoading,
  );
  const canRerun = Boolean(!props.loading && props.stageProgress.length > 0 && !rerunBlockedByPreview);
  const renderQueueEvents = props.runEvents.filter(
    (event) => event.step === 'asset-render' && event.details?.phase === 'batch-queue-execute',
  );
  const manualRerunSteps = listManualRerunSteps();
  const selectedStageRow = props.workbenchStages.find(
    (stage) => stage.stage === props.selectedWorkbenchStage,
  ) || null;
  const renderCoverageEvent = [...props.runEvents]
    .reverse()
    .find((event) => event.step === 'asset-render' && typeof event.details?.coverage === 'number');

  return (
    <div className="ui-sync-root flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="ui-sync-shell-header flex shrink-0 flex-col gap-3 border-b border-gray-200 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="ui-sync-shell-title text-xl font-semibold text-gray-900">{props.title}</h2>
          <p className="ui-sync-shell-subtitle text-xs text-gray-500">{props.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={props.onRunPipeline}
            disabled={!canRun}
            className="ui-sync-btn ui-sync-btn-primary rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('action.runPipeline')}
          </button>
          <button
            type="button"
            onClick={props.onRerunStep}
            disabled={!canRerun}
            className="ui-sync-btn ui-sync-btn-secondary rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('action.rerunStep')}
          </button>
          <button
            type="button"
            onClick={props.onAdvanceStage}
            disabled={!canAdvance}
            className="ui-sync-btn ui-sync-btn-secondary rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('action.advanceStage')}
          </button>
          <button
            type="button"
            onClick={props.onCancelRun}
            className="ui-sync-btn rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
          >
            {t('action.cancelRun')}
          </button>
        </div>
      </header>
      <div className="ui-sync-shell-main videoplay-shell-main flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-3 lg:grid lg:grid-cols-[minmax(240px,280px)_minmax(0,1fr)_minmax(260px,320px)] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden xl:grid-cols-[minmax(280px,320px)_minmax(0,1fr)_minmax(300px,360px)]">
        <aside className="ui-sync-pane ui-sync-pane-side videoplay-shell-side min-h-[220px] overflow-y-auto rounded-xl border border-gray-200 bg-white p-3 lg:min-h-0">
          <section className="space-y-2 rounded-lg border border-gray-200 p-3">
            <h3 className="text-sm font-semibold text-gray-900">{t('label.storySource')}</h3>
            <label className="block text-xs text-gray-600">
              {t('label.worldId')}
              <input
                value={props.worldId}
                onChange={(event) => props.onWorldIdChange(event.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
              />
            </label>
            <label className="block text-xs text-gray-600">
              {t('label.projectId')}
              <input
                value={props.projectId}
                onChange={(event) => props.onProjectIdChange(event.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
              />
            </label>
            <label className="block text-xs text-gray-600">
              {t('label.story')}
              <select
                value={props.selectedStoryId}
                onChange={(event) => props.onSelectStory(event.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
              >
                {props.stories.map((story) => (
                  <option key={story.storyId} value={story.storyId}>
                    {story.title} ({story.storyId})
                  </option>
                ))}
                {props.stories.length === 0 ? <option value="">{t('empty.noPlayableStories')}</option> : null}
              </select>
            </label>
            <label className="block text-xs text-gray-600">
              {t('label.sourceMode')}
              <select
                value={props.sourceMode}
                onChange={(event) => props.onSourceModeChange(event.target.value as VideoStorySourceMode)}
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
              >
                <option value="canonical-story">{t('sourceMode.canonical')}</option>
                <option value="textplay-enriched-story">{t('sourceMode.enriched')}</option>
              </select>
            </label>
            <label className="block text-xs text-gray-600">
              {t('label.ingestCursorStart')}
              <input
                value={props.ingestCursorStart}
                onChange={(event) => props.onIngestCursorStartChange(event.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
              />
            </label>
            <p className="text-[11px] text-gray-500">
              {t('label.storyId')}: <span className="font-medium text-gray-700">{props.selectedStory?.storyId || '-'}</span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={props.onReloadStoryPackage}
                className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
              >
                {t('action.reloadPackage')}
              </button>
              <button
                type="button"
                onClick={props.onRefresh}
                className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
              >
                {t('action.refresh')}
              </button>
            </div>
          </section>

          <section className="mt-3 space-y-2 rounded-lg border border-gray-200 p-3">
            <h3 className="text-sm font-semibold text-gray-900">{t('label.storyPackage')}</h3>
            <p className={`text-xs font-medium ${props.storyPackageLoading ? 'text-amber-600' : 'text-slate-600'}`}>
              {props.storyPackageLoading ? t('state.loading') : props.storyPackage ? t('state.ready') : t('state.notReady')}
            </p>
            {props.storyPackage ? (
              <>
                <p className="text-xs text-gray-600">{t('label.sourceModeValue')}: {t(`sourceMode.${sourceModeLabel(props.storyPackage.sourceMode)}`)}</p>
                <p className="text-xs text-gray-600">{t('label.version')}: {props.storyPackage.snapshot.version}</p>
                <p className="text-xs text-gray-600">{t('label.contextCoverage')}: {packageCoverageText(props.storyPackage)}</p>
                <p className="text-xs text-gray-600">
                  {t('label.gapWarnings')}: {props.storyPackage.snapshot.gapWarnings.length > 0 ? props.storyPackage.snapshot.gapWarnings.join(', ') : t('state.none')}
                </p>
                <p className="text-xs text-gray-600">
                  {t('label.turns')}: {props.storyPackage.turnWindow.turns.length} (max={props.storyPackage.windowPolicy.maxTurns})
                </p>
              </>
            ) : null}
            {props.storyPackageError ? (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">
                <p className="font-semibold">{props.storyPackageError.reasonCode}</p>
                <p>{props.storyPackageError.message}</p>
                <p>{props.storyPackageError.actionHint}</p>
              </div>
            ) : null}
          </section>

          <section className="mt-3 space-y-2 rounded-lg border border-gray-200 p-3">
            <h3 className="text-sm font-semibold text-gray-900">{t('label.episodes')}</h3>
            <div className="max-h-52 space-y-1 overflow-y-auto">
              {props.episodes.map((episode) => (
                <button
                  key={episode.episodeId}
                  type="button"
                  onClick={() => props.onSelectEpisode(episode.episodeId)}
                  className={`w-full rounded-md border px-2 py-1 text-left text-xs ${props.selectedEpisodeId === episode.episodeId ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                >
                  <p className="font-medium text-gray-900">{episode.episodeId}</p>
                  <p className={`text-[11px] ${statusTone(episode.quality.status)}`}>{episode.quality.status}</p>
                </button>
              ))}
              {props.episodes.length === 0 ? <p className="text-xs text-gray-500">{t('empty.noEpisodes')}</p> : null}
            </div>
          </section>

          <section className="mt-3 space-y-2 rounded-lg border border-gray-200 p-3">
            <h3 className="text-sm font-semibold text-gray-900">{t('label.runs')}</h3>
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {props.runs.map((run) => (
                <div key={run.runId} className="rounded-md border border-gray-200 px-2 py-1 text-xs">
                  <p className="font-medium text-gray-900">{run.runId}</p>
                  <p className={statusTone(run.status)}>{run.status}</p>
                  <p className="text-[11px] text-gray-500">episodes={run.episodeCount} release={run.releaseCandidateCount}</p>
                </div>
              ))}
              {props.runs.length === 0 ? <p className="text-xs text-gray-500">{t('empty.noRuns')}</p> : null}
            </div>
          </section>
        </aside>

        <main className="ui-sync-pane ui-sync-pane-main videoplay-shell-center min-h-[320px] min-w-0 overflow-y-auto rounded-xl border border-gray-200 bg-white p-3 lg:min-h-0">
          <section className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">{t('label.pipelineFlow')}</h3>
              <p className={`text-xs font-medium ${statusTone(props.runStatus)}`}>{props.runStatus}</p>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {t('pipeline.nextStep', { step: props.nextStep || t('state.none') })}
              {props.lastRebuildScope ? t('pipeline.lastRebuildScope', { scope: props.lastRebuildScope }) : ''}
            </p>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {props.workbenchStages.map((stage) => (
                <button
                  key={stage.stage}
                  type="button"
                  onClick={() => props.onSelectWorkbenchStage(stage.stage)}
                  className={`ui-sync-btn rounded-md border px-2 py-1 text-left text-xs ${
                    props.selectedWorkbenchStage === stage.stage
                      ? 'border-blue-400 bg-blue-50'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <p className="font-medium text-gray-900">{t(`stages.${workbenchStageLabelKey(stage.stage)}`)}</p>
                  <p className={stage.status === 'ready' ? 'text-emerald-600' : stage.status === 'blocked' ? 'text-rose-600' : 'text-slate-500'}>
                    {stage.status}
                  </p>
                  <p className="mt-1 text-[11px] text-gray-500">{formatStageStepList(stage.stage)}</p>
                </button>
              ))}
            </div>
            <div className="mt-2 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700">
              <p>{t('pipeline.selectedStage', { stage: t(`stages.${workbenchStageLabelKey(props.selectedWorkbenchStage)}`) })}</p>
              <p>{t('pipeline.mappedSteps', { steps: formatStageStepList(props.selectedWorkbenchStage) })}</p>
              <p>
                {props.stageAdvancePlan.allowed
                  ? t('pipeline.advanceAllowed', { budget: props.stageAdvancePlan.stepBudget })
                  : t('pipeline.advanceBlocked')}
              </p>
              {selectedStageRow ? <p className="text-gray-500">{formatStageStepStatuses(selectedStageRow)}</p> : null}
              {!props.stageAdvancePlan.allowed && props.stageAdvancePlan.actionHint ? (
                <p className="text-rose-600">
                  {props.stageAdvancePlan.reasonCode}: {props.stageAdvancePlan.actionHint}
                </p>
              ) : null}
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2">
              {props.stageProgress.map((stage) => (
                <div key={stage.step} className="rounded-md border border-gray-200 px-2 py-1 text-xs">
                  <p className="font-medium text-gray-900">{stage.step}</p>
                  <p className={statusTone(stage.status)}>{stage.status}</p>
                  <p className="text-gray-500">attempt={stage.attempt}</p>
                  <p className="text-gray-500">unit={stage.lastCompletedUnit || '-'}</p>
                  {stage.reasonCode ? <p className="text-rose-600">{stage.reasonCode}</p> : null}
                  {stage.actionHint ? <p className="text-gray-500">{stage.actionHint}</p> : null}
                </div>
              ))}
              {props.stageProgress.length === 0 ? <p className="text-xs text-gray-500">{t('empty.noStageProgress')}</p> : null}
            </div>
          </section>

          <section className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">{t('label.shotWorkbench')}</h3>
              <p className="text-xs text-gray-500">
                {t('label.activeBranch')}: <span className="font-medium text-gray-700">{props.activeBranchName}</span>
              </p>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {t('workbench.editHint')}
            </p>
            {props.rebuildPreview ? (
              <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                <p className="font-medium">{t('workbench.rebuildImpactPreview')}</p>
                <p>{t('workbench.rebuildOperation', { operation: props.rebuildPreview.operationType })}</p>
                <p>{t('workbench.rebuildScope', { scope: props.rebuildPreview.scope })}</p>
                <p>{t('workbench.rebuildRecommendedRerun', { step: props.rebuildPreview.recommendedRerunStep })}</p>
                {isPipelineStep(props.rebuildPreview.recommendedRerunStep) ? (
                  <p>{t('workbench.rebuildChainStepAvailable')}</p>
                ) : null}
                <p>{t('workbench.rebuildConfirmed', { value: props.rebuildPreview.confirmed ? t('workbench.rebuildConfirmedYes') : t('workbench.rebuildConfirmedNo') })}</p>
                {!props.rebuildPreview.confirmed ? (
                  <button
                    type="button"
                    onClick={props.onConfirmRebuildPreview}
                    className="mt-1 rounded-md border border-amber-300 bg-white px-2 py-1 text-[11px] font-medium text-amber-800 hover:bg-amber-100"
                  >
                    {t('workbench.confirmRebuildScope')}
                  </button>
                ) : null}
              </div>
            ) : null}
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <label className="text-xs text-gray-600">
                {t('workbench.rerunStepLabel')}
                <select
                  value={props.rerunStep}
                  onChange={(event) => props.onRerunStepChange(event.target.value as VideoPlayPipelineStep)}
                  className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
                >
                  {manualRerunSteps.map((step) => (
                    <option key={step} value={step}>{pipelineStepLabel(step)}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-gray-600">
                {t('label.operation')}
                <select
                  value={props.operationType}
                  onChange={(event) => props.onOperationTypeChange(event.target.value as VideoPlayOperationType)}
                  className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
                >
                  {props.operationOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={props.onApplyOperation}
                  disabled={!props.selectedEpisode}
                  className="w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t('action.applyOperation')}
                </button>
              </div>
            </div>
            <label className="mt-2 block text-xs text-gray-600">
              {t('label.operationPayload')}
              <textarea
                value={props.operationPayload}
                onChange={(event) => props.onOperationPayloadChange(event.target.value)}
                rows={4}
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
              />
            </label>
          </section>

          <section className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
            <h3 className="text-sm font-semibold text-gray-900">{t('label.shots')}</h3>
            <div className="mt-2 max-h-[360px] space-y-1 overflow-y-auto">
              {props.selectedEpisode?.storyboard.shotPlans.map((shot) => (
                <div key={shot.shotId} className="rounded-md border border-gray-200 px-2 py-1 text-xs">
                  <p className="font-medium text-gray-900">{shot.shotId}</p>
                  <p className="text-gray-600">clip={shot.clipId} beat={shot.beatId} duration={shot.durationMs}ms</p>
                  <p className="text-gray-500">{t('label.sourceEventIds')}: {shot.sourceEventIds.join(', ')}</p>
                </div>
              ))}
              {!props.selectedEpisode ? <p className="text-xs text-gray-500">{t('empty.noEpisodeSelected')}</p> : null}
            </div>
          </section>
        </main>

        <aside className="ui-sync-pane ui-sync-pane-right videoplay-shell-right min-h-[220px] overflow-y-auto rounded-xl border border-gray-200 bg-white p-3 lg:min-h-0">
          <section className="space-y-2 rounded-lg border border-gray-200 p-3">
            <h3 className="text-sm font-semibold text-gray-900">{t('label.routeStatus')}</h3>
            <p className={`text-xs font-medium ${props.routeReady ? 'text-emerald-600' : 'text-rose-600'}`}>
              {props.routeReady ? t('state.allReady') : t('state.missingRoute')}
            </p>
            {props.routeStatuses.map((route) => (
              <div key={route.capability} className="rounded-md border border-gray-200 px-2 py-1 text-xs">
                <p className="font-medium text-gray-900">{route.capability}</p>
                <p className={route.ready ? 'text-emerald-600' : 'text-rose-600'}>{route.ready ? t('state.ready') : t('state.unavailable')}</p>
                <p className="text-gray-500">{route.source} / {route.connectorId || '-'} / {route.model || '-'}</p>
              </div>
            ))}
          </section>

          <section className="mt-3 space-y-2 rounded-lg border border-gray-200 p-3">
            <h3 className="text-sm font-semibold text-gray-900">{t('label.storyPackageDiagnostics')}</h3>
            {props.storyPackage ? (
              <>
                <p className="text-xs text-gray-600">{t('diagnostics.story', { storyId: props.storyPackage.storyId })}</p>
                <p className="text-xs text-gray-600">{t('diagnostics.sourceMode', { mode: sourceModeLabel(props.storyPackage.sourceMode) })}</p>
                <p className="text-xs text-gray-600">{t('diagnostics.loadedAt', { time: props.storyPackage.snapshot.loadedAt })}</p>
                <p className="text-xs text-gray-600">{t('diagnostics.contextCoverage', { coverage: packageCoverageText(props.storyPackage) })}</p>
                <p className="text-xs text-gray-600">{t('diagnostics.gapWarnings', { warnings: props.storyPackage.snapshot.gapWarnings.join(', ') || t('state.none') })}</p>
                {props.storyPackage.sourceMode === 'textplay-enriched-story' ? (
                  <p className="text-xs text-amber-700">
                    {t('diagnostics.enrichedGateNote')}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-xs text-gray-500">{t('empty.noStoryPackage')}</p>
            )}
          </section>

          <section className="mt-3 space-y-2 rounded-lg border border-gray-200 p-3">
            <h3 className="text-sm font-semibold text-gray-900">{t('gate.qualityGates')}</h3>
            {props.selectedEpisode?.quality.gates.map((gate) => (
              <div key={gate.gate} className="rounded-md border border-gray-200 px-2 py-1 text-xs">
                <p className="font-medium text-gray-900">{gate.gate}</p>
                <p className={gate.passed ? 'text-emerald-600' : 'text-rose-600'}>{gate.passed ? t('gate.passed') : t('gate.failed')}</p>
                <p className="text-gray-500">{t('gate.value', { value: gate.value, min: gate.min ?? '-', max: gate.max ?? '-' })}</p>
                <p className="text-gray-500">{gate.reasonCode}</p>
              </div>
            ))}
            {!props.selectedEpisode ? <p className="text-xs text-gray-500">{t('empty.noQualityReport')}</p> : null}
          </section>

          <section className="mt-3 space-y-2 rounded-lg border border-gray-200 p-3">
            <h3 className="text-sm font-semibold text-gray-900">{t('label.assetAnalysisQueue')}</h3>
            {renderCoverageEvent ? (
              <p className="text-xs text-gray-600">
                coverage={Number(renderCoverageEvent.details?.coverage ?? 0).toFixed(3)}
                {' '}voiceCoverage={Number(renderCoverageEvent.details?.voiceCoverage ?? 0).toFixed(3)}
              </p>
            ) : (
              <p className="text-xs text-gray-500">{t('empty.noRenderCoverage')}</p>
            )}
            <div className="max-h-32 space-y-1 overflow-y-auto">
              {renderQueueEvents.map((event) => (
                <div key={`${event.runId}:${event.seq}`} className="rounded-md border border-gray-200 px-2 py-1 text-xs">
                  <p className="font-medium text-gray-900">
                    batch={String(event.details?.batchId || '-')}
                  </p>
                  <p className="text-gray-500">
                    modality={String(event.details?.modality || '-')}
                    {' '}jobs={Number(event.details?.queueItems || 0)}
                  </p>
                  <p className="text-gray-500">
                    succeeded={Number(event.details?.succeeded || 0)}
                    {' '}failed={Number(event.details?.failed || 0)}
                  </p>
                </div>
              ))}
              {renderQueueEvents.length === 0 ? <p className="text-xs text-gray-500">{t('empty.noBatchRecords')}</p> : null}
            </div>
          </section>

          <section className="mt-3 space-y-2 rounded-lg border border-gray-200 p-3">
            <h3 className="text-sm font-semibold text-gray-900">{t('label.publishPanel')}</h3>
            <p className="text-xs text-gray-600">{t('label.candidateQcStatus')}: {props.selectedReleaseCandidate?.qcStatus || '-'}</p>
            <button
              type="button"
              onClick={props.onPublish}
              disabled={!canPublish}
              className="w-full rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('action.publish')}
            </button>
            <div className="max-h-24 space-y-1 overflow-y-auto">
              {props.releases.map((release) => (
                <div key={release.releaseId} className="rounded-md border border-gray-200 px-2 py-1 text-xs">
                  <p className="font-medium text-gray-900">{release.releaseId}</p>
                  <p className="text-gray-500">published={String(release.published)} qc={release.qcStatus}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-3 space-y-2 rounded-lg border border-gray-200 p-3">
            <h3 className="text-sm font-semibold text-gray-900">{t('label.fallbackAudit')}</h3>
            <div className="max-h-24 space-y-1 overflow-y-auto">
              {props.fallbackAudits.map((audit, index) => (
                <div key={`${audit.stage}:${index}`} className="rounded-md border border-gray-200 px-2 py-1 text-xs">
                  <p className="font-medium text-gray-900">{audit.stage}</p>
                  <p className="text-gray-500">{audit.from} → {audit.to}</p>
                  <p className="text-gray-500">{audit.reason}</p>
                </div>
              ))}
              {props.fallbackAudits.length === 0 ? <p className="text-xs text-gray-500">{t('empty.noFallback')}</p> : null}
            </div>
          </section>

          <section className="mt-3 space-y-2 rounded-lg border border-gray-200 p-3">
            <h3 className="text-sm font-semibold text-gray-900">{t('label.runEvents')}</h3>
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {props.runEvents.map((event) => (
                <div key={`${event.runId}:${event.seq}`} className="rounded-md border border-gray-200 px-2 py-1 text-xs">
                  <p className="font-medium text-gray-900">#{event.seq} {event.step} {event.eventType}</p>
                  {event.reasonCode ? <p className="text-rose-600">{event.reasonCode}</p> : null}
                  {event.actionHint ? <p className="text-gray-500">{event.actionHint}</p> : null}
                </div>
              ))}
              {props.runEvents.length === 0 ? <p className="text-xs text-gray-500">{t('empty.noEvents')}</p> : null}
            </div>
          </section>

          {props.error ? (
            <section className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
              <p className="font-semibold">{props.error.reasonCode}</p>
              <p>{props.error.message}</p>
              <p>{props.error.actionHint}</p>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
