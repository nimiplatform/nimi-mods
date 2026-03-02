// ---------------------------------------------------------------------------
// Synthesis step — progress + chapter breakdown + pause/resume/cancel
// ---------------------------------------------------------------------------

import React from 'react';
import type { SynthProgress } from '../../controllers/use-voice-studio-ui-state.js';
import type { SynthesisJob } from '../../types.js';

type SynthesisStepProps = {
  synthRunning: boolean;
  progress: SynthProgress | null;
  synthesisJob: SynthesisJob | null;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
};

function formatTime(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
}

export function SynthesisStep(props: SynthesisStepProps) {
  const { synthRunning, progress, synthesisJob, onStart, onPause, onResume, onCancel } = props;
  const isPaused = synthesisJob?.status === 'paused';
  const isDone = synthesisJob?.status === 'done' || synthesisJob?.status === 'done_with_errors';

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h3 className="mb-4 text-base font-semibold text-gray-900">Audio Synthesis</h3>

      {/* Start button */}
      {!synthRunning && !isDone && (
        <button
          type="button"
          onClick={onStart}
          className="mb-4 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          {synthesisJob ? 'Resume Synthesis' : 'Start Synthesis'}
        </button>
      )}

      {/* Progress */}
      {synthRunning && progress && (
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-gray-600">
              {progress.completed} / {progress.total} segments
            </span>
            <span className="text-xs text-gray-400">
              ~{formatTime(progress.estimatedRemainingMs)} remaining
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-blue-600 transition-all"
              style={{ width: `${(progress.completed / progress.total) * 100}%` }}
            />
          </div>
          {progress.failed > 0 && (
            <p className="mt-1 text-[10px] text-red-500">
              {progress.failed} segment{progress.failed !== 1 ? 's' : ''} failed
            </p>
          )}

          {/* Controls */}
          <div className="mt-3 flex gap-2">
            {isPaused ? (
              <button
                type="button"
                onClick={onResume}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Resume
              </button>
            ) : (
              <button
                type="button"
                onClick={onPause}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Pause
              </button>
            )}
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {synthRunning && !progress && (
        <div className="mb-4 text-center text-xs text-gray-500">
          Starting synthesis...
        </div>
      )}

      {/* Job results */}
      {synthesisJob && isDone && (
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-3 py-2">
            <p className="text-xs font-medium text-gray-700">
              Synthesis {synthesisJob.status === 'done' ? 'Complete' : 'Complete (with errors)'}
            </p>
            <p className="text-[10px] text-gray-500">
              {synthesisJob.segmentJobs.filter((sj) => sj.status === 'done').length} done
              {synthesisJob.segmentJobs.some((sj) => sj.status === 'failed') &&
                ` / ${synthesisJob.segmentJobs.filter((sj) => sj.status === 'failed').length} failed`
              }
            </p>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {synthesisJob.segmentJobs
              .filter((sj) => sj.status === 'failed')
              .map((sj) => (
                <div key={sj.segmentId} className="border-b border-gray-50 px-3 py-1.5 last:border-b-0">
                  <span className="text-[10px] font-medium text-red-600">{sj.segmentId}</span>
                  <p className="text-[10px] text-red-500">{sj.error}</p>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
