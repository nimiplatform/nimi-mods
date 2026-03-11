import React from 'react';
import {
  asString,
  localizedJobEvent,
  localizedJobStatus,
  useTestAiLocale,
} from './core.js';
import { RunButton } from './components.js';

type ImageJobPanelProps = {
  busy: boolean;
  busyLabel?: string;
  watchJobId: string;
  onWatchJobIdChange: (value: string) => void;
  onWatchExistingJob: () => void;
  onCancelJob: () => void;
  onSubmitJob: () => void;
  jobTimeline: Array<Record<string, unknown>>;
};

export function ImageJobPanel(props: ImageJobPanelProps) {
  const locale = useTestAiLocale();

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-3">
      <div className="text-xs font-semibold text-gray-700">{locale.image.asyncJob}</div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto]">
        <input
          className="rounded-md border border-gray-300 bg-white px-2 py-1 font-mono text-xs"
          value={props.watchJobId}
          onChange={(event) => props.onWatchJobIdChange(event.target.value)}
          placeholder={locale.image.jobIdPlaceholder}
        />
        <button
          type="button"
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs"
          disabled={props.busy}
          onClick={props.onWatchExistingJob}
        >
          {locale.common.watchJob}
        </button>
        <button
          type="button"
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs"
          disabled={!asString(props.watchJobId)}
          onClick={props.onCancelJob}
        >
          {locale.common.cancelJob}
        </button>
      </div>
      <RunButton busy={props.busy} busyLabel={props.busyLabel} label={locale.image.submitJob} onClick={props.onSubmitJob} />
      {props.jobTimeline.length > 0 ? (
        <div className="rounded-md bg-gray-50 p-2 text-xs">
          <div className="mb-1 font-semibold text-gray-600">{locale.image.jobTimeline}</div>
          <div className="flex flex-col gap-1">
            {props.jobTimeline.map((event, index) => (
              <div key={`${String(event.sequence || index)}`} className="grid grid-cols-[80px_1fr] gap-x-2">
                <span className="font-mono text-gray-400">{String(event.sequence || index + 1)}</span>
                <span className="text-gray-700">
                  {localizedJobEvent(event.label, locale)} · {localizedJobStatus(event.status, locale)}
                  {event.reasonDetail ? ` · ${String(event.reasonDetail)}` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
