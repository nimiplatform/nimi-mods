// ---------------------------------------------------------------------------
// Synthesis step — test mode + progress + pause/resume/cancel (matches Pencil)
// ---------------------------------------------------------------------------

import React from 'react';
import type { SynthProgress } from '../../controllers/use-audio-book-ui-state.js';
import type { ScriptSegment, SynthesisJob } from '../../types.js';
import { Button } from '../ui/button.js';
import { Progress } from '../ui/progress.js';

type SynthesisStepProps = {
  synthRunning: boolean;
  progress: SynthProgress | null;
  synthesisJob: SynthesisJob | null;
  segments: ScriptSegment[];
  testMode: boolean;
  testSegmentIds: string[];
  onStart: () => void;
  onStartTest: () => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onPlaySegment: (segmentId: string) => void;
  onGoToPlayer?: () => void;
};

function formatTime(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
}

export function SynthesisStep(props: SynthesisStepProps) {
  const {
    synthRunning, progress, synthesisJob, segments,
    testMode, testSegmentIds,
    onStart, onStartTest, onPause, onResume, onCancel, onPlaySegment, onGoToPlayer,
  } = props;
  const isPaused = synthesisJob?.status === 'paused';
  const isDone = synthesisJob?.status === 'done' || synthesisJob?.status === 'done_with_errors';

  const doneCount = synthesisJob?.segmentJobs.filter((sj) => sj.status === 'done').length ?? 0;
  const failedCount = synthesisJob?.segmentJobs.filter((sj) => sj.status === 'failed').length ?? 0;

  // For test mode: find matching segments for preview
  const testDoneSegments = testMode && synthesisJob
    ? testSegmentIds.filter((id) =>
        synthesisJob.segmentJobs.some((sj) => sj.segmentId === id && sj.status === 'done'),
      )
    : [];

  return (
    <div className="flex h-full flex-col items-center overflow-y-auto px-6 py-10">
      {/* Title section */}
      <div className="mb-8 text-center">
        <h2 className="text-2xl font-semibold text-gray-900">Audio Synthesis</h2>
        <p className="mt-2 text-sm text-gray-500">
          {testMode
            ? 'Test synthesis with a few segments before full synthesis'
            : 'Convert your script segments into audio'}
        </p>
      </div>

      <div className="w-full max-w-lg">
        {/* Action buttons — shown when not running and not done (or test mode not active) */}
        {!synthRunning && !isDone && !testMode && (
          <div className="mb-6 flex gap-3">
            <button
              type="button"
              onClick={onStart}
              className="flex flex-1 items-center justify-center gap-2 rounded-md bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              {synthesisJob ? 'Resume Synthesis' : 'Start Synthesis'}
            </button>
            <button
              type="button"
              onClick={onStartTest}
              className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-100"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 3h6l3 7-6 11-6-11z" />
              </svg>
              Test Synthesis
            </button>
          </div>
        )}

        {/* Progress card */}
        {synthRunning && progress && (
          <div className="mb-6 rounded-lg border border-gray-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">
                {progress.completed} / {progress.total} segments
              </span>
              <span className="text-xs text-gray-400">
                ~{formatTime(progress.estimatedRemainingMs)} remaining
              </span>
            </div>
            <Progress value={progress.completed} max={progress.total} />
            {progress.failed > 0 && (
              <p className="mt-2 text-xs text-red-500">
                {progress.failed} segment{progress.failed !== 1 ? 's' : ''} failed
              </p>
            )}

            {/* Controls */}
            <div className="mt-4 flex gap-2">
              {isPaused ? (
                <Button variant="secondary" size="sm" onClick={onResume}>
                  Resume
                </Button>
              ) : (
                <Button variant="secondary" size="sm" onClick={onPause}>
                  Pause
                </Button>
              )}
              <Button variant="destructive" size="sm" onClick={onCancel}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {synthRunning && !progress && (
          <div className="mb-6 flex items-center justify-center gap-2 py-8">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
            <span className="text-sm text-gray-500">Starting synthesis...</span>
          </div>
        )}

        {/* Test mode results */}
        {testMode && !synthRunning && (
          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-5">
            <div className="mb-3 flex items-center gap-2">
              <svg className="h-5 w-5 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 3h6l3 7-6 11-6-11z" />
              </svg>
              <h3 className="text-sm font-semibold text-amber-900">Test Synthesis Complete</h3>
            </div>
            <p className="mb-4 text-xs text-amber-700">
              {testDoneSegments.length} of {testSegmentIds.length} test segments synthesized successfully.
            </p>

            {/* Test segment playback */}
            <div className="space-y-2">
              {testSegmentIds.map((segId) => {
                const seg = segments.find((s) => s.id === segId);
                const job = synthesisJob?.segmentJobs.find((sj) => sj.segmentId === segId);
                const hasDone = job?.status === 'done';
                const hasFailed = job?.status === 'failed';

                return (
                  <div key={segId} className="flex items-center gap-3 rounded-md border border-amber-100 bg-white px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-gray-700">
                        {seg?.speaker ?? 'Unknown'}
                      </p>
                      <p className="truncate text-[11px] text-gray-500">
                        {seg?.text ?? segId}
                      </p>
                      {hasFailed && (
                        <p className="mt-0.5 text-[10px] text-red-600">
                          {job?.error ?? 'Synthesis failed'}
                        </p>
                      )}
                    </div>
                    {hasDone && (
                      <button
                        type="button"
                        onClick={() => onPlaySegment(segId)}
                        className="flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
                      >
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                        Play
                      </button>
                    )}
                    {hasFailed && (
                      <span className="text-[10px] font-medium text-red-500">Failed</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Continue to full synthesis */}
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={onStart}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
              >
                Start Full Synthesis
              </button>
              <div className="flex gap-2">
                {testDoneSegments.length > 0 && onGoToPlayer && (
                  <button
                    type="button"
                    onClick={onGoToPlayer}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-gray-200 px-4 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
                  >
                    Preview in Player
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                    </svg>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onStartTest}
                  className="rounded-md border border-amber-200 px-4 py-2 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-50"
                >
                  Re-test
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Job results (full synthesis done) */}
        {synthesisJob && isDone && !testMode && (
          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-5 py-4">
              <div className="flex items-center gap-3">
                {synthesisJob.status === 'done' ? (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
                    <svg className="h-4 w-4 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100">
                    <svg className="h-4 w-4 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    Synthesis {synthesisJob.status === 'done' ? 'Complete' : 'Complete (with errors)'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {doneCount} done
                    {failedCount > 0 && ` / ${failedCount} failed`}
                    {' / '}
                    {synthesisJob.segmentJobs.length} total
                  </p>
                </div>
              </div>
            </div>

            {/* Failed segments detail */}
            {failedCount > 0 && (
              <div className="max-h-48 overflow-y-auto">
                {synthesisJob.segmentJobs
                  .filter((sj) => sj.status === 'failed')
                  .map((sj) => {
                    const seg = segments.find((s) => s.id === sj.segmentId);
                    return (
                      <div key={sj.segmentId} className="border-b border-gray-50 px-5 py-2.5 last:border-b-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-red-600">
                            {seg?.speaker ?? sj.segmentId}
                          </span>
                          {seg && (
                            <span className="truncate text-xs text-gray-400">
                              {seg.text.slice(0, 60)}...
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[11px] text-red-500">{sj.error}</p>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
