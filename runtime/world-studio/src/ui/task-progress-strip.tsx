import React from 'react';
import type { WorldStudioStatusSlice } from '../controllers/world-studio-screen-model.js';
import { worldStudioMessage } from '../i18n/messages.js';
import { mapWorldStudioErrorMessage } from '../services/error-message-map.js';

function toTaskProgressPercent(progress: number | null | undefined): number {
  const normalized = Number(progress || 0);
  return Math.max(0, Math.min(100, Math.round(normalized * 100)));
}

export function TaskProgressStrip(props: {
  status: WorldStudioStatusSlice;
  onPauseTask: () => boolean;
  onResumeTask: () => Promise<boolean>;
  onCancelTask: () => boolean;
}): React.ReactElement | null {
  const activeTask = props.status.activeTask;
  const mappedError = mapWorldStudioErrorMessage(props.status.error || activeTask?.errorMessage || null);
  if (!activeTask && !mappedError.summary) {
    return null;
  }

  return (
    <div className="border-b border-white/70 bg-white/68 px-6 py-3 backdrop-blur-xl">
      <div className="flex w-full flex-wrap items-center gap-3 text-xs text-slate-700">
        {activeTask ? (
          <>
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200">
              <div
                className={`h-full rounded-full ${
                  activeTask.status === 'FAILED'
                    ? 'bg-red-500'
                    : activeTask.status === 'PAUSED'
                      ? 'bg-amber-500'
                      : 'bg-brand-500'
                }`}
                style={{ width: `${toTaskProgressPercent(activeTask.progress)}%` }}
              />
            </div>
            <span className="font-semibold text-slate-900">{activeTask.label}</span>
            <span>
              {activeTask.status} · {toTaskProgressPercent(activeTask.progress)}%
            </span>
            {activeTask.message ? (
              <span className="truncate text-slate-600">{activeTask.message}</span>
            ) : null}
          </>
        ) : null}

        {mappedError.summary ? (
          <span className="truncate font-medium text-red-700">
            {mappedError.summary}
          </span>
        ) : null}

        <div className="ml-auto flex flex-wrap gap-2">
          {activeTask?.canPause ? (
            <button
              type="button"
              className="rounded-2xl border border-gray-200 bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-sm"
              onClick={props.onPauseTask}
            >
              {worldStudioMessage('taskStrip.pause', 'Pause')}
            </button>
          ) : null}
          {activeTask?.canResume ? (
            <button
              type="button"
              className="rounded-2xl border border-gray-200 bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-sm"
              onClick={() => {
                void props.onResumeTask();
              }}
            >
              {worldStudioMessage('taskStrip.resume', 'Resume')}
            </button>
          ) : null}
          {activeTask?.canCancel ? (
            <button
              type="button"
              className="rounded-2xl border border-red-200 bg-white px-3 py-1.5 font-semibold text-red-700 shadow-sm"
              onClick={props.onCancelTask}
            >
              {worldStudioMessage('taskStrip.cancel', 'Cancel')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
