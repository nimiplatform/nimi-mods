// ---------------------------------------------------------------------------
// Playback step — chapter select + text-follow + play controls
// ---------------------------------------------------------------------------

import React, { useMemo, useState } from 'react';
import type { PlaybackState } from '../../controllers/use-voice-studio-ui-state.js';
import type { ScriptSegment, SourceChapter, SynthesisJob } from '../../types.js';

type PlaybackStepProps = {
  chapters: SourceChapter[];
  segments: ScriptSegment[];
  synthesisJob: SynthesisJob | null;
  playbackState: PlaybackState | null;
  onPlaySegment: (segmentId: string) => void;
};

export function PlaybackStep(props: PlaybackStepProps) {
  const { chapters, segments, synthesisJob, playbackState, onPlaySegment } = props;
  const [selectedChapter, setSelectedChapter] = useState(0);

  const chapterSegments = useMemo(
    () => segments.filter((s) => s.chapterIndex === selectedChapter),
    [segments, selectedChapter],
  );

  const doneSegmentIds = useMemo(() => {
    if (!synthesisJob) return new Set<string>();
    return new Set(
      synthesisJob.segmentJobs
        .filter((sj) => sj.status === 'done')
        .map((sj) => sj.segmentId),
    );
  }, [synthesisJob]);

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h3 className="mb-4 text-base font-semibold text-gray-900">Playback</h3>

      {/* Chapter selector */}
      {chapters.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1">
          {chapters.map((ch, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setSelectedChapter(i)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                selectedChapter === i
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {ch.title || `Chapter ${i + 1}`}
            </button>
          ))}
        </div>
      )}

      {/* Segment list with text-follow */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="max-h-96 overflow-y-auto">
          {chapterSegments.map((seg, i) => {
            const hasAudio = doneSegmentIds.has(seg.id);
            const isPlaying = playbackState?.playing && playbackState.currentSegmentIndex === i;

            return (
              <div
                key={seg.id}
                className={`flex items-start gap-2 border-b border-gray-50 px-3 py-2 last:border-b-0 ${
                  isPlaying ? 'bg-blue-50' : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`rounded px-1 py-0.5 text-[10px] font-medium ${
                      seg.type === 'dialogue' ? 'bg-blue-50 text-blue-700'
                        : seg.type === 'narration' ? 'bg-gray-50 text-gray-600'
                          : seg.type === 'inner_thought' ? 'bg-purple-50 text-purple-700'
                            : 'bg-amber-50 text-amber-700'
                    }`}>
                      {seg.speaker}
                    </span>
                    {seg.emotion && (
                      <span className="text-[10px] italic text-gray-400">{seg.emotion}</span>
                    )}
                  </div>
                  <p className={`mt-0.5 text-xs leading-relaxed ${
                    isPlaying ? 'font-medium text-blue-900' : 'text-gray-700'
                  }`}>
                    {seg.text}
                  </p>
                </div>
                {hasAudio && (
                  <button
                    type="button"
                    onClick={() => onPlaySegment(seg.id)}
                    disabled={isPlaying}
                    className={`shrink-0 rounded-full p-1.5 ${
                      isPlaying
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                    title="Play"
                  >
                    <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
                      {isPlaying ? (
                        <>
                          <rect x="3" y="3" width="4" height="10" rx="1" />
                          <rect x="9" y="3" width="4" height="10" rx="1" />
                        </>
                      ) : (
                        <path d="M4 2.5a.5.5 0 0 1 .77-.42l8 5a.5.5 0 0 1 0 .84l-8 5A.5.5 0 0 1 4 12.5v-10z" />
                      )}
                    </svg>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {chapterSegments.length === 0 && (
        <p className="mt-4 text-center text-xs text-gray-400">
          No segments in this chapter.
        </p>
      )}
    </div>
  );
}
