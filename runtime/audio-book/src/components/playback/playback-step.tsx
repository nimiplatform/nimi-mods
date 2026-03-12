// ---------------------------------------------------------------------------
// Playback step — chapter tabs + text-follow + bottom player bar (matches Pencil)
// ---------------------------------------------------------------------------

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
import type { PlaybackState } from '../../controllers/use-audio-book-ui-state.js';
import type { ScriptSegment, SourceChapter, SynthesisJob } from '../../types.js';
import { Button } from '../ui/button.js';

type PlaybackStepProps = {
  chapters: SourceChapter[];
  segments: ScriptSegment[];
  synthesisJob: SynthesisJob | null;
  playbackState: PlaybackState | null;
  playbackSpeed: number;
  playbackChapter: number;
  synthRunning: boolean;
  onPlaySegment: (segmentId: string, continuous?: boolean) => void;
  onStopPlayback: () => void;
  onRetryFailed: () => void;
  onSetSpeed: (speed: number) => void;
  onSetChapter: (chapter: number) => void;
};

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

export function PlaybackStep(props: PlaybackStepProps) {
  const {
    chapters, segments, synthesisJob, playbackState,
    playbackSpeed, playbackChapter, synthRunning,
    onPlaySegment, onStopPlayback, onRetryFailed,
    onSetSpeed, onSetChapter,
  } = props;
  const { t } = useModTranslation('audio-book');

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeSegmentRef = useRef<HTMLDivElement>(null);

  const chapterSegments = useMemo(
    () => segments.filter((s) => s.chapterIndex === playbackChapter),
    [segments, playbackChapter],
  );

  const doneSegmentIds = useMemo(() => {
    if (!synthesisJob) return new Set<string>();
    return new Set(
      synthesisJob.segmentJobs
        .filter((sj) => sj.status === 'done')
        .map((sj) => sj.segmentId),
    );
  }, [synthesisJob]);

  const failedJobs = useMemo(
    () => synthesisJob?.segmentJobs.filter((sj) => sj.status === 'failed') ?? [],
    [synthesisJob],
  );
  const failedBySegmentId = useMemo(
    () => new Map(failedJobs.map((job) => [job.segmentId, job])),
    [failedJobs],
  );

  const doneCount = synthesisJob?.segmentJobs.filter((sj) => sj.status === 'done').length ?? 0;

  // Auto-scroll to active segment
  useEffect(() => {
    if (activeSegmentRef.current && scrollContainerRef.current) {
      activeSegmentRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [playbackState?.currentSegmentId]);

  const firstPlayableId = useMemo(() => {
    for (const seg of chapterSegments) {
      if (doneSegmentIds.has(seg.id)) return seg.id;
    }
    return null;
  }, [chapterSegments, doneSegmentIds]);

  const isPlaying = Boolean(playbackState?.playing);
  const currentSegmentId = playbackState?.currentSegmentId;

  const handlePlayAll = useCallback(() => {
    if (firstPlayableId) {
      onPlaySegment(firstPlayableId, true);
    }
  }, [firstPlayableId, onPlaySegment]);

  const handlePrevSegment = useCallback(() => {
    if (!currentSegmentId) return;
    const idx = chapterSegments.findIndex((s) => s.id === currentSegmentId);
    for (let i = idx - 1; i >= 0; i--) {
      if (doneSegmentIds.has(chapterSegments[i]!.id)) {
        onPlaySegment(chapterSegments[i]!.id, true);
        return;
      }
    }
  }, [currentSegmentId, chapterSegments, doneSegmentIds, onPlaySegment]);

  const handleNextSegment = useCallback(() => {
    if (!currentSegmentId) return;
    const idx = chapterSegments.findIndex((s) => s.id === currentSegmentId);
    for (let i = idx + 1; i < chapterSegments.length; i++) {
      if (doneSegmentIds.has(chapterSegments[i]!.id)) {
        onPlaySegment(chapterSegments[i]!.id, true);
        return;
      }
    }
  }, [currentSegmentId, chapterSegments, doneSegmentIds, onPlaySegment]);

  const handleCycleSpeed = useCallback(() => {
    const idx = SPEED_OPTIONS.indexOf(playbackSpeed);
    const next = SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length]!;
    onSetSpeed(next);
  }, [playbackSpeed, onSetSpeed]);

  const seekPercent = playbackState && playbackState.duration > 0
    ? (playbackState.currentTime / playbackState.duration) * 100
    : 0;

  return (
    <div className="flex h-full flex-col">
      {/* Chapter tabs */}
      {chapters.length > 1 && (
        <div className="flex gap-1 border-b border-gray-100 bg-gray-50 px-6 py-3">
          {chapters.map((ch, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                if (isPlaying) onStopPlayback();
                onSetChapter(i);
              }}
              className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
                playbackChapter === i
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {ch.title || t('playback.chapterFallback', { index: i + 1 })}
            </button>
          ))}
        </div>
      )}

      {/* Failed segments warning */}
      {failedJobs.length > 0 && (
        <div className="flex items-center justify-between bg-red-50 px-6 py-2">
          <p className="text-xs text-red-600">
            {t('playback.failedSegments', { count: failedJobs.length })}
          </p>
          <Button variant="secondary" size="sm" onClick={onRetryFailed} disabled={synthRunning}>
            {synthRunning ? t('playback.retrying') : t('playback.retry')}
          </Button>
        </div>
      )}

      {/* Segment list with text-follow */}
      <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        <div className="space-y-0.5">
          {chapterSegments.map((seg) => {
            const hasAudio = doneSegmentIds.has(seg.id);
            const isCurrentSeg = currentSegmentId === seg.id;
            const isSegPlaying = isPlaying && isCurrentSeg;
            const hasFailed = failedBySegmentId.has(seg.id);

            return (
              <div
                key={seg.id}
                ref={isCurrentSeg ? activeSegmentRef : undefined}
                onClick={() => hasAudio && onPlaySegment(seg.id, true)}
                className={`flex gap-3 rounded-md px-3 py-2.5 transition-colors ${
                  isCurrentSeg
                    ? 'border border-indigo-200 bg-indigo-50'
                    : hasAudio ? 'cursor-pointer hover:bg-gray-50' : ''
                } ${!hasAudio && !hasFailed ? 'opacity-40' : ''}`}
              >
                {/* Left accent bar for current segment */}
                {isCurrentSeg && (
                  <div className="w-0.5 shrink-0 self-stretch rounded-full bg-indigo-600" />
                )}

                <div className="min-w-0 flex-1">
                  <p className={`text-[11px] font-medium ${
                    isCurrentSeg ? 'text-indigo-600' : 'text-gray-400'
                  }`}>
                    {seg.speaker}
                    {seg.type === 'dialogue' && ` ${t('playback.dialogue')}`}
                    {seg.type === 'inner_thought' && ` ${t('playback.thought')}`}
                  </p>
                  <p className={`mt-0.5 text-[13px] leading-relaxed ${
                    isCurrentSeg ? 'text-gray-900' : 'text-gray-500'
                  }`}>
                    {seg.text}
                  </p>
                  {hasFailed && (
                    <p className="mt-1 text-[10px] text-red-600">
                      {t('playback.failedPrefix', { error: failedBySegmentId.get(seg.id)?.error || t('playback.unknownError') })}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {chapterSegments.length === 0 && (
          <p className="py-12 text-center text-sm text-gray-400">
            {t('playback.noSegments')}
          </p>
        )}
      </div>

      {/* Bottom player bar */}
      <div className="shrink-0 border-t border-gray-200 bg-gray-50">
        {/* Seek bar */}
        <div className="h-1 bg-gray-200">
          <div
            className="h-full bg-indigo-600 transition-all duration-200"
            style={{ width: `${seekPercent}%` }}
          />
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-10 px-6 py-2.5">
          {/* Transport */}
          <div className="flex items-center gap-5">
            {/* Prev */}
            <button
              type="button"
              onClick={handlePrevSegment}
              disabled={!isPlaying}
              className="text-gray-400 transition-colors hover:text-gray-600 disabled:opacity-30"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="19 20 9 12 19 4 19 20" />
                <line x1="5" y1="19" x2="5" y2="5" />
              </svg>
            </button>

            {/* Play / Pause */}
            {isPlaying ? (
              <button
                type="button"
                onClick={onStopPlayback}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-white transition-colors hover:bg-indigo-700"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePlayAll}
                disabled={!firstPlayableId}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              </button>
            )}

            {/* Next */}
            <button
              type="button"
              onClick={handleNextSegment}
              disabled={!isPlaying}
              className="text-gray-400 transition-colors hover:text-gray-600 disabled:opacity-30"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 4 15 12 5 20 5 4" />
                <line x1="19" y1="5" x2="19" y2="19" />
              </svg>
            </button>

            {/* Time */}
            {playbackState && (
              <span className="text-xs text-gray-400">
                {formatMs(playbackState.currentTime)} / {formatMs(playbackState.duration)}
              </span>
            )}
          </div>

          {/* Speed */}
          <button
            type="button"
            onClick={handleCycleSpeed}
            className="rounded border border-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-500 transition-colors hover:bg-gray-100"
          >
            {playbackSpeed.toFixed(1)}x
          </button>
        </div>
      </div>
    </div>
  );
}
