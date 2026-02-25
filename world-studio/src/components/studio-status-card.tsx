import React from 'react';
import { useModTranslation } from '@nimiplatform/mod-sdk/i18n';
import type { WorldStudioTaskRecord } from '../contracts.js';
import { mapWorldStudioErrorMessage } from '../services/error-message-map.js';

type StudioStatusCardProps = {
  mode: 'CREATE' | 'MAINTAIN';
  activeTask: WorldStudioTaskRecord | null;
  recentTasks: WorldStudioTaskRecord[];
  expertMode: boolean;
  coarseRouteSummary: string;
  fineRouteSummary: string;
  parsePhase?: string;
  parseProgressPercent?: number;
  parseChunkProcessed?: number;
  parseChunkTotal?: number;
  futureEventsCount?: number;
  primaryEventCount: number;
  secondaryEventCount: number;
  missingPrimaryEvidenceCount: number;
  eventCharacterCoverage: number;
  eventLocationCoverage: number;
  terminalChunkSuccess: number;
  terminalChunkTotal: number;
  terminalChunkFailed: number;
  terminalTopFailure: { code: string; count: number } | null;
  conflictReloadSummary?: string | null;
  notice?: string | null;
  error?: string | null;
  onResetDraft?: () => void;
  onReload?: () => void;
  onPauseTask?: () => boolean;
  onResumeTask?: () => void;
  onCancelTask?: () => boolean;
  embedded?: boolean;
  showTitle?: boolean;
};

export function StudioStatusCard(props: StudioStatusCardProps) {
  const { t } = useModTranslation('world-studio');
  const toTaskStatusLabel = (status: WorldStudioTaskRecord['status']): string => {
    if (status === 'RUNNING') return t('studioStatus.taskRunning');
    if (status === 'PAUSE_REQUESTED') return t('studioStatus.taskPauseRequested');
    if (status === 'PAUSED') return t('studioStatus.taskPaused');
    if (status === 'CANCEL_REQUESTED') return t('studioStatus.taskCancelRequested');
    if (status === 'CANCELED') return t('studioStatus.taskCanceled');
    if (status === 'FAILED') return t('studioStatus.taskFailed');
    return t('studioStatus.taskCompleted');
  };
  const mappedError = mapWorldStudioErrorMessage(props.error || props.activeTask?.errorMessage || null);
  const embedded = Boolean(props.embedded);
  const showTitle = props.showTitle !== false;
  return (
    <section className={embedded ? '' : 'rounded-xl border border-gray-200 bg-white p-3'}>
      {showTitle ? <h4 className="text-sm font-semibold text-gray-900">{t('studioStatus.title')}</h4> : null}
      <p className={`${showTitle ? 'mt-1 ' : ''}text-xs text-gray-600`}>{t('studioStatus.mode')}: {props.mode}</p>

      {props.activeTask ? (
        <div className="mt-2 rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5">
          <p className="text-xs font-semibold text-gray-800">{props.activeTask.label}</p>
          <p className="mt-1 text-xs text-gray-600">
            {toTaskStatusLabel(props.activeTask.status)} · {Math.max(0, Math.min(100, Math.round(props.activeTask.progress * 100)))}%
          </p>
          {props.activeTask.message ? (
            <p className="mt-1 text-xs text-gray-600">{props.activeTask.message}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2">
            {props.activeTask.canPause && props.onPauseTask ? (
              <button
                type="button"
                className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700"
                onClick={() => { props.onPauseTask?.(); }}
              >
                {t('studioStatus.pause')}
              </button>
            ) : null}
            {props.activeTask.canResume && props.onResumeTask ? (
              <button
                type="button"
                className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700"
                onClick={() => { props.onResumeTask?.(); }}
              >
                {t('studioStatus.resume')}
              </button>
            ) : null}
            {props.activeTask.canCancel && props.onCancelTask ? (
              <button
                type="button"
                className="rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-700"
                onClick={() => { props.onCancelTask?.(); }}
              >
                {t('studioStatus.cancel')}
              </button>
            ) : null}
          </div>
          {props.activeTask.atomic ? (
            <p className="mt-2 text-[11px] text-gray-500">{t('studioStatus.atomicHint')}</p>
          ) : null}
          {props.expertMode && props.activeTask.checkpoint ? (
            <p className="mt-2 text-[11px] text-gray-500">
              checkpoint v{props.activeTask.checkpoint.checkpointVersion}
              {' · '}
              {props.activeTask.checkpoint.step}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-xs text-gray-600">{t('studioStatus.noActiveTask')}</p>
      )}

      <div className="mt-2 rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-600">
        <p>{t('studioStatus.events')}: {t('studioStatus.primary')} {props.primaryEventCount} / {t('studioStatus.secondary')} {props.secondaryEventCount}</p>
        <p>{t('studioStatus.missingPrimaryEvidence')}: {props.missingPrimaryEvidenceCount}</p>
        {typeof props.futureEventsCount === 'number' ? (
          <p>{t('studioStatus.futureEvents')}: {props.futureEventsCount}</p>
        ) : null}
      </div>

      {props.expertMode ? (
        <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700">
          <p>{t('studioStatus.coarseRoute')}: {props.coarseRouteSummary}</p>
          <p>{t('studioStatus.fineRoute')}: {props.fineRouteSummary}</p>
          {props.parsePhase ? (
            <p>
              {t('studioStatus.parse')}: {props.parsePhase}
              {' · '}
              {Math.max(0, Math.min(100, Math.round(props.parseProgressPercent || 0)))}%
              {typeof props.parseChunkProcessed === 'number' && typeof props.parseChunkTotal === 'number' ? (
                ` · ${props.parseChunkProcessed}/${props.parseChunkTotal} ${t('studioStatus.chunks')}`
              ) : ''}
            </p>
          ) : null}
          <p>{t('studioStatus.coverage')}: {t('studioStatus.character')} {props.eventCharacterCoverage}% · {t('studioStatus.location')} {props.eventLocationCoverage}%</p>
          <p>
            {t('studioStatus.chunkResult')}: {props.terminalChunkSuccess}/{props.terminalChunkTotal || 0}
            {' '}{t('studioStatus.success')} · {t('studioStatus.failed')} {props.terminalChunkFailed}
          </p>
          {props.terminalTopFailure ? (
            <p>{t('studioStatus.topFailure')}: {props.terminalTopFailure.code} × {props.terminalTopFailure.count}</p>
          ) : null}
        </div>
      ) : null}

      {props.recentTasks.length > 0 ? (
        <details className="mt-2 rounded-md border border-gray-200 bg-white px-2 py-1.5">
          <summary className="cursor-pointer text-xs font-semibold text-gray-700">{t('studioStatus.recentTasks')}</summary>
          <div className="mt-2 space-y-1 text-xs text-gray-600">
            {props.recentTasks.slice(0, 5).map((task) => (
              <p key={task.id}>
                {task.label}
                {' · '}
                {toTaskStatusLabel(task.status)}
              </p>
            ))}
          </div>
        </details>
      ) : null}

      {props.conflictReloadSummary ? (
        <div className="mt-2 rounded-md border border-sky-200 bg-sky-50 px-2 py-1.5 text-xs text-sky-700">
          <p className="font-semibold">{t('studioStatus.recentReloadSummary')}</p>
          <p className="mt-1">{props.conflictReloadSummary}</p>
        </div>
      ) : null}
      {props.notice ? (
        <p className="mt-2 rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-700">{props.notice}</p>
      ) : null}
      {mappedError.summary ? (
        <div className="mt-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">
          <p>{mappedError.summary}</p>
          {mappedError.detail ? (
            <details className="mt-1">
              <summary className="cursor-pointer text-[11px] font-semibold">{t('studioStatus.technicalDetail')}</summary>
              <p className="mt-1 break-all text-[11px]">
                {mappedError.code ? `[${mappedError.code}] ` : ''}
                {mappedError.detail}
              </p>
            </details>
          ) : null}
        </div>
      ) : null}
      {(props.onResetDraft || props.onReload) ? (
        <div className="mt-3 flex gap-2">
          {props.onResetDraft ? (
            <button
              type="button"
              className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-semibold text-gray-700"
              onClick={props.onResetDraft}
            >
              {t('studioStatus.resetDraft')}
            </button>
          ) : null}
          {props.onReload ? (
            <button
              type="button"
              className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-semibold text-gray-700"
              onClick={props.onReload}
            >
              {t('studioStatus.reload')}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
