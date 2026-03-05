// ---------------------------------------------------------------------------
// Analyze step — start analysis + progress bar + character list + segment preview (matches Pencil)
// ---------------------------------------------------------------------------

import React from 'react';
import type { AnalysisProgress } from '../../controllers/use-audio-book-ui-state.js';
import type { TtsRouteState } from '../../controllers/use-tts-route.js';
import type { CharacterProfile, SourceChapter, ScriptSegment } from '../../types.js';
import { Button } from '../ui/button.js';
import { Progress } from '../ui/progress.js';
import { Select } from '../ui/select.js';
import { TierBadge, SegmentTypeBadge } from '../ui/badge.js';

type AnalyzeStepProps = {
  chapters: SourceChapter[];
  analysisRunning: boolean;
  progress: AnalysisProgress | null;
  characters: CharacterProfile[];
  segments: ScriptSegment[];
  ttsRoute: TtsRouteState;
  onStart: () => void;
  onCancel: () => void;
};

export function AnalyzeStep(props: AnalyzeStepProps) {
  const { chapters, analysisRunning, progress, characters, segments, ttsRoute, onStart, onCancel } = props;
  const hasResults = characters.length > 0;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Left: main content area */}
      <div className="flex min-h-0 flex-1 gap-0">
        {/* Left panel — analysis controls & progress */}
        <div className="flex w-80 shrink-0 flex-col border-r border-gray-100 px-6 py-6">
          <h3 className="mb-1 text-lg font-semibold text-gray-900">Script Analysis</h3>
          <p className="mb-5 text-xs text-gray-500">
            Analyze your text to detect characters and segment the script.
          </p>

          {/* Chat LLM connector selector */}
          <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <label className="mb-1.5 block text-xs font-medium text-gray-600">LLM Provider</label>
            {ttsRoute.loading ? (
              <p className="text-xs text-gray-400">Loading providers...</p>
            ) : ttsRoute.error ? (
              <p className="text-xs text-red-500">{ttsRoute.error}</p>
            ) : ttsRoute.chatConnectors.length === 0 ? (
              <p className="text-xs text-gray-500">No LLM connectors available. Configure one in Settings.</p>
            ) : (
              <Select
                value={ttsRoute.chatSelection.connectorId}
                onValueChange={(v) => ttsRoute.selectChatConnector(v)}
                options={ttsRoute.chatConnectors.map((c) => ({
                  value: c.id,
                  label: c.label || c.id,
                  description: c.vendor ? `(${c.vendor})` : undefined,
                }))}
                placeholder="Select provider..."
              />
            )}
          </div>

          {/* Chapter summary */}
          <div className="mb-4 rounded-lg border border-gray-200 bg-white px-3 py-2.5">
            <p className="text-xs text-gray-600">
              {chapters.length} chapter{chapters.length !== 1 ? 's' : ''} loaded
            </p>
          </div>

          {/* Start / progress */}
          {!analysisRunning && !hasResults && (
            <button
              type="button"
              onClick={onStart}
              className="mb-4 flex w-full items-center justify-center gap-2 rounded-md bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
              </svg>
              Start Analysis
            </button>
          )}

          {analysisRunning && progress && (
            <div className="mb-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-gray-600">
                  Chapter {progress.currentChapterIndex + 1} / {progress.totalChapters}
                </span>
                <Button variant="destructive" size="sm" onClick={onCancel}>
                  Cancel
                </Button>
              </div>
              <Progress
                value={progress.completedChapters}
                max={progress.totalChapters}
              />
              <p className="mt-2 text-[11px] text-gray-500">
                {progress.segmentsSoFar} segments &middot; {progress.charactersSoFar} characters detected
              </p>
            </div>
          )}

          {analysisRunning && !progress && (
            <div className="mb-4 flex items-center justify-center gap-2 py-6">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
              <span className="text-sm text-gray-500">Starting analysis...</span>
            </div>
          )}

          {/* Character chips */}
          {hasResults && (
            <div className="mb-4">
              <h4 className="mb-2 text-xs font-semibold text-gray-700">Characters ({characters.length})</h4>
              <div className="flex flex-wrap gap-1.5">
                {characters.map((ch) => (
                  <span
                    key={ch.name}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                      ch.tier === 'major'
                        ? 'bg-indigo-50 text-indigo-700'
                        : ch.tier === 'supporting'
                          ? 'bg-green-50 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {ch.name}
                    <TierBadge tier={ch.tier} />
                    <span className="text-[10px] opacity-60">{ch.segmentCount}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Re-analyze button */}
          {hasResults && !analysisRunning && (
            <button
              type="button"
              onClick={onStart}
              className="mt-auto flex w-full items-center justify-center gap-1.5 rounded-md border border-gray-200 px-4 py-2 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50"
            >
              Re-analyze
            </button>
          )}
        </div>

        {/* Right panel — segment preview */}
        <div className="flex min-w-0 flex-1 flex-col">
          {segments.length > 0 ? (
            <>
              <div className="border-b border-gray-100 px-6 py-3">
                <h4 className="text-xs font-semibold text-gray-700">
                  Segments Preview ({segments.length} total)
                </h4>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-2">
                {segments.slice(0, 50).map((seg) => (
                  <div key={seg.id} className="border-b border-gray-50 py-2 last:border-b-0">
                    <div className="flex items-center gap-2">
                      <SegmentTypeBadge type={seg.type} showIcon />
                      <span className="text-[11px] font-medium text-gray-500">{seg.speaker}</span>
                      {seg.emotion && (
                        <span className="text-[10px] italic text-gray-400">{seg.emotion}</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-gray-700">{seg.text}</p>
                  </div>
                ))}
                {segments.length > 50 && (
                  <p className="py-3 text-center text-xs text-gray-400">
                    ...and {segments.length - 50} more segments
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-sm text-gray-400">
                {analysisRunning ? 'Analyzing...' : 'Run analysis to see segments here.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
