import React from 'react';
import type {
  EpisodeRecord,
  FallbackAuditRecord,
  ReleasePackage,
  VideoPlayRunEvent,
} from '../types.js';
import type { VideoPlayOperationType, VideoPlayPipelineStep } from '../contracts.js';

type RouteStatusView = {
  capability: 'chat' | 'image' | 'video';
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
  projectId: string;
  storyId: string;
  ingestCursorStart: string;
  runStatus: string;
  rerunStep: VideoPlayPipelineStep;
  operationType: VideoPlayOperationType;
  operationPayload: string;
  selectedEpisodeId: string;
  routeStatuses: RouteStatusView[];
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
  onProjectIdChange: (value: string) => void;
  onStoryIdChange: (value: string) => void;
  onIngestCursorStartChange: (value: string) => void;
  onRerunStepChange: (value: VideoPlayPipelineStep) => void;
  onOperationTypeChange: (value: VideoPlayOperationType) => void;
  onOperationPayloadChange: (value: string) => void;
  onSelectEpisode: (episodeId: string) => void;
  onRunPipeline: () => void;
  onRerunStep: () => void;
  onContinueFromCheckpoint: () => void;
  onCancelRun: () => void;
  onApplyOperation: () => void;
  onPublish: () => void;
  onRefresh: () => void;
};

function statusTone(status: string): string {
  if (status === 'COMPLETED' || status === 'APPROVED' || status === 'ADJUSTED') return 'text-emerald-600';
  if (status === 'FAILED' || status === 'REJECTED' || status === 'CANCELED') return 'text-rose-600';
  if (status === 'RUNNING' || status === 'CANCEL_REQUESTED') return 'text-amber-600';
  return 'text-slate-500';
}

export function VideoPlayWorkbench(props: VideoPlayWorkbenchProps) {
  const canPublish = Boolean(
    props.selectedReleaseCandidate
    && (props.selectedReleaseCandidate.qcStatus === 'APPROVED' || props.selectedReleaseCandidate.qcStatus === 'ADJUSTED'),
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-gray-50">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">{props.title}</h2>
          <p className="text-xs text-gray-500">{props.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={props.onRunPipeline}
            disabled={props.loading}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Run Pipeline
          </button>
          <button
            type="button"
            onClick={props.onRerunStep}
            disabled={props.loading}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Rerun Step
          </button>
          <button
            type="button"
            onClick={props.onContinueFromCheckpoint}
            disabled={props.loading}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Continue from Checkpoint
          </button>
          <button
            type="button"
            onClick={props.onCancelRun}
            className="rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
          >
            Cancel Run
          </button>
        </div>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)_360px]">
        <aside className="min-h-0 overflow-y-auto border-r border-gray-200 bg-white p-3">
          <section className="space-y-2 rounded-lg border border-gray-200 p-3">
            <h3 className="text-sm font-semibold text-gray-900">Narrative Window</h3>
            <label className="block text-xs text-gray-600">
              Project ID
              <input
                value={props.projectId}
                onChange={(event) => props.onProjectIdChange(event.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
              />
            </label>
            <label className="block text-xs text-gray-600">
              Story ID
              <input
                value={props.storyId}
                onChange={(event) => props.onStoryIdChange(event.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
              />
            </label>
            <label className="block text-xs text-gray-600">
              Ingest Cursor Start
              <input
                value={props.ingestCursorStart}
                onChange={(event) => props.onIngestCursorStartChange(event.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
              />
            </label>
            <button
              type="button"
              onClick={props.onRefresh}
              className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
            >
              Refresh
            </button>
          </section>

          <section className="mt-3 space-y-2 rounded-lg border border-gray-200 p-3">
            <h3 className="text-sm font-semibold text-gray-900">Episodes</h3>
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
              {props.episodes.length === 0 ? <p className="text-xs text-gray-500">No episodes yet.</p> : null}
            </div>
          </section>

          <section className="mt-3 space-y-2 rounded-lg border border-gray-200 p-3">
            <h3 className="text-sm font-semibold text-gray-900">Runs</h3>
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {props.runs.map((run) => (
                <div key={run.runId} className="rounded-md border border-gray-200 px-2 py-1 text-xs">
                  <p className="font-medium text-gray-900">{run.runId}</p>
                  <p className={statusTone(run.status)}>{run.status}</p>
                  <p className="text-[11px] text-gray-500">episodes={run.episodeCount} release={run.releaseCandidateCount}</p>
                </div>
              ))}
              {props.runs.length === 0 ? <p className="text-xs text-gray-500">No runs yet.</p> : null}
            </div>
          </section>
        </aside>

        <main className="min-h-0 overflow-y-auto p-3">
          <section className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Shot/Clip Workbench</h3>
              <p className={`text-xs font-medium ${statusTone(props.runStatus)}`}>{props.runStatus}</p>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Active branch: <span className="font-medium text-gray-700">{props.activeBranchName}</span>
              {props.lastRebuildScope ? ` · rebuild scope: ${props.lastRebuildScope}` : ''}
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <label className="text-xs text-gray-600">
                Rerun Step
                <select
                  value={props.rerunStep}
                  onChange={(event) => props.onRerunStepChange(event.target.value as VideoPlayPipelineStep)}
                  className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
                >
                  <option value="narrative-ingest">narrative-ingest</option>
                  <option value="episode-segmentation">episode-segmentation</option>
                  <option value="screenplay">screenplay</option>
                  <option value="storyboard">storyboard</option>
                  <option value="asset-render">asset-render</option>
                  <option value="edit-compose">edit-compose</option>
                  <option value="qc-gate">qc-gate</option>
                  <option value="release-package">release-package</option>
                </select>
              </label>
              <label className="text-xs text-gray-600">
                Operation
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
                  Apply Operation
                </button>
              </div>
            </div>
            <label className="mt-2 block text-xs text-gray-600">
              Operation Payload (JSON)
              <textarea
                value={props.operationPayload}
                onChange={(event) => props.onOperationPayloadChange(event.target.value)}
                rows={4}
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
              />
            </label>
          </section>

          <section className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
            <h3 className="text-sm font-semibold text-gray-900">Shots</h3>
            <div className="mt-2 max-h-[360px] space-y-1 overflow-y-auto">
              {props.selectedEpisode?.storyboard.shotPlans.map((shot) => (
                <div key={shot.shotId} className="rounded-md border border-gray-200 px-2 py-1 text-xs">
                  <p className="font-medium text-gray-900">{shot.shotId}</p>
                  <p className="text-gray-600">clip={shot.clipId} beat={shot.beatId} duration={shot.durationMs}ms</p>
                  <p className="text-gray-500">sourceEventIds: {shot.sourceEventIds.join(', ')}</p>
                </div>
              ))}
              {!props.selectedEpisode ? <p className="text-xs text-gray-500">Select an episode to inspect shots.</p> : null}
            </div>
          </section>
        </main>

        <aside className="min-h-0 overflow-y-auto border-l border-gray-200 bg-white p-3">
          <section className="space-y-2 rounded-lg border border-gray-200 p-3">
            <h3 className="text-sm font-semibold text-gray-900">Route Status</h3>
            {props.routeStatuses.map((route) => (
              <div key={route.capability} className="rounded-md border border-gray-200 px-2 py-1 text-xs">
                <p className="font-medium text-gray-900">{route.capability}</p>
                <p className={route.ready ? 'text-emerald-600' : 'text-rose-600'}>{route.ready ? 'ready' : 'unavailable'}</p>
                <p className="text-gray-500">{route.source} / {route.connectorId || '-'} / {route.model || '-'}</p>
              </div>
            ))}
          </section>

          <section className="mt-3 space-y-2 rounded-lg border border-gray-200 p-3">
            <h3 className="text-sm font-semibold text-gray-900">Quality Gates</h3>
            {props.selectedEpisode?.quality.gates.map((gate) => (
              <div key={gate.gate} className="rounded-md border border-gray-200 px-2 py-1 text-xs">
                <p className="font-medium text-gray-900">{gate.gate}</p>
                <p className={gate.passed ? 'text-emerald-600' : 'text-rose-600'}>{gate.passed ? 'passed' : 'failed'}</p>
                <p className="text-gray-500">value={gate.value} min={gate.min ?? '-'} max={gate.max ?? '-'}</p>
                <p className="text-gray-500">{gate.reasonCode}</p>
              </div>
            ))}
            {!props.selectedEpisode ? <p className="text-xs text-gray-500">No quality report selected.</p> : null}
          </section>

          <section className="mt-3 space-y-2 rounded-lg border border-gray-200 p-3">
            <h3 className="text-sm font-semibold text-gray-900">Publish Panel</h3>
            <p className="text-xs text-gray-600">Candidate QC status: {props.selectedReleaseCandidate?.qcStatus || '-'}</p>
            <button
              type="button"
              onClick={props.onPublish}
              disabled={!canPublish}
              className="w-full rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Publish
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
            <h3 className="text-sm font-semibold text-gray-900">Fallback Audit</h3>
            <div className="max-h-24 space-y-1 overflow-y-auto">
              {props.fallbackAudits.map((audit, index) => (
                <div key={`${audit.stage}:${index}`} className="rounded-md border border-gray-200 px-2 py-1 text-xs">
                  <p className="font-medium text-gray-900">{audit.stage}</p>
                  <p className="text-gray-500">{audit.from} → {audit.to}</p>
                  <p className="text-gray-500">{audit.reason}</p>
                </div>
              ))}
              {props.fallbackAudits.length === 0 ? <p className="text-xs text-gray-500">No fallback used.</p> : null}
            </div>
          </section>

          <section className="mt-3 space-y-2 rounded-lg border border-gray-200 p-3">
            <h3 className="text-sm font-semibold text-gray-900">Run Events</h3>
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {props.runEvents.map((event) => (
                <div key={`${event.runId}:${event.seq}`} className="rounded-md border border-gray-200 px-2 py-1 text-xs">
                  <p className="font-medium text-gray-900">#{event.seq} {event.step} {event.eventType}</p>
                  {event.reasonCode ? <p className="text-rose-600">{event.reasonCode}</p> : null}
                  {event.actionHint ? <p className="text-gray-500">{event.actionHint}</p> : null}
                </div>
              ))}
              {props.runEvents.length === 0 ? <p className="text-xs text-gray-500">No events yet.</p> : null}
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
