// ---------------------------------------------------------------------------
// Analyze step — start analysis + progress bar + character list + segment preview
// ---------------------------------------------------------------------------

import React from 'react';
import type { AnalysisProgress } from '../../controllers/use-audio-book-ui-state.js';
import type { CharacterProfile, SourceChapter, ScriptSegment } from '../../types.js';

type AnalyzeStepProps = {
  chapters: SourceChapter[];
  analysisRunning: boolean;
  progress: AnalysisProgress | null;
  characters: CharacterProfile[];
  segments: ScriptSegment[];
  onStart: () => void;
  onCancel: () => void;
};

export function AnalyzeStep(props: AnalyzeStepProps) {
  const { chapters, analysisRunning, progress, characters, segments, onStart, onCancel } = props;
  const hasResults = characters.length > 0;

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h3 className="mb-4 text-base font-semibold text-gray-900">Script Analysis</h3>

      {/* Chapter summary */}
      <div className="mb-4 rounded-lg border border-gray-200 bg-white p-3">
        <p className="text-xs text-gray-600">
          {chapters.length} chapter{chapters.length !== 1 ? 's' : ''} loaded
        </p>
      </div>

      {/* Start / progress */}
      {!analysisRunning && !hasResults && (
        <button
          type="button"
          onClick={onStart}
          className="mb-4 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Start Analysis
        </button>
      )}

      {analysisRunning && progress && (
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-gray-600">
              Chapter {progress.currentChapterIndex + 1} / {progress.totalChapters}
            </span>
            <button
              type="button"
              onClick={onCancel}
              className="text-xs text-red-500 hover:text-red-700"
            >
              Cancel
            </button>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-blue-600 transition-all"
              style={{ width: `${(progress.completedChapters / progress.totalChapters) * 100}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] text-gray-500">
            {progress.segmentsSoFar} segments &middot; {progress.charactersSoFar} characters detected
          </p>
        </div>
      )}

      {analysisRunning && !progress && (
        <div className="mb-4 text-center text-xs text-gray-500">
          Starting analysis...
        </div>
      )}

      {/* Character chips */}
      {hasResults && (
        <div className="mb-4">
          <h4 className="mb-2 text-sm font-medium text-gray-700">Characters ({characters.length})</h4>
          <div className="flex flex-wrap gap-2">
            {characters.map((ch) => (
              <span
                key={ch.name}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                  ch.tier === 'major'
                    ? 'bg-blue-100 text-blue-800'
                    : ch.tier === 'supporting'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-600'
                }`}
              >
                {ch.name}
                <span className="text-[10px] opacity-70">
                  {ch.tier[0]!.toUpperCase()}&middot;{ch.segmentCount}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Segment preview */}
      {segments.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white">
          <h4 className="border-b border-gray-100 px-3 py-2 text-xs font-medium text-gray-700">
            Segments Preview ({segments.length} total)
          </h4>
          <div className="max-h-64 overflow-y-auto">
            {segments.slice(0, 50).map((seg) => (
              <div key={seg.id} className="border-b border-gray-50 px-3 py-1.5 last:border-b-0">
                <div className="flex items-center gap-2">
                  <span className={`rounded px-1 py-0.5 text-[10px] font-medium ${
                    seg.type === 'dialogue' ? 'bg-blue-50 text-blue-700'
                      : seg.type === 'narration' ? 'bg-gray-50 text-gray-600'
                        : seg.type === 'inner_thought' ? 'bg-purple-50 text-purple-700'
                          : 'bg-amber-50 text-amber-700'
                  }`}>
                    {seg.type}
                  </span>
                  <span className="text-[10px] font-medium text-gray-500">{seg.speaker}</span>
                  {seg.emotion && (
                    <span className="text-[10px] italic text-gray-400">{seg.emotion}</span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-gray-700">{seg.text}</p>
              </div>
            ))}
            {segments.length > 50 && (
              <p className="px-3 py-2 text-center text-[10px] text-gray-400">
                ...and {segments.length - 50} more segments
              </p>
            )}
          </div>
        </div>
      )}

      {/* Re-analyze button */}
      {hasResults && !analysisRunning && (
        <button
          type="button"
          onClick={onStart}
          className="mt-4 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Re-analyze
        </button>
      )}
    </div>
  );
}
