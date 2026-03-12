// ---------------------------------------------------------------------------
// Analyze step — start analysis + progress bar + character list + segment preview (matches Pencil)
// ---------------------------------------------------------------------------

import React from 'react';
import { useModTranslation } from '@nimiplatform/sdk/mod/i18n';
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
  const { t } = useModTranslation('audio-book');
  const hasResults = characters.length > 0;
  const selectedChatConnector = ttsRoute.chatConnectors.find((connector) => connector.id === ttsRoute.chatSelection.connectorId) || null;
  const availableChatModels = selectedChatConnector
    ? selectedChatConnector.models.filter((model, index, models) => {
      const normalized = String(model || '').trim();
      const lower = normalized.toLowerCase();
      if (!normalized || normalized === 'cloud/default' || lower === 'local-model' || lower.endsWith('/local-model')) return false;
      if (['tts', 'speech', 'audio', 'voice', 'embedding', 'embed', 'rerank'].some((hint) => lower.includes(hint))) return false;
      return models.indexOf(model) === index;
    })
    : [];

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Left: main content area */}
      <div className="flex min-h-0 flex-1 gap-0">
        {/* Left panel — analysis controls & progress */}
        <div className="flex w-80 shrink-0 flex-col border-r border-gray-100 px-6 py-6">
          <h3 className="mb-1 text-lg font-semibold text-gray-900">{t('analyze.title')}</h3>
          <p className="mb-5 text-xs text-gray-500">
            {t('analyze.subtitle')}
          </p>

          {/* Chat LLM connector selector */}
          <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <label className="mb-1.5 block text-xs font-medium text-gray-600">{t('analyze.llmProviderLabel')}</label>
            {ttsRoute.loading ? (
              <p className="text-xs text-gray-400">{t('analyze.loadingProviders')}</p>
            ) : ttsRoute.error ? (
              <p className="text-xs text-red-500">{ttsRoute.error}</p>
            ) : ttsRoute.chatConnectors.length === 0 ? (
              <p className="text-xs text-gray-500">{t('analyze.noLlmConnectors')}</p>
            ) : (
              <Select
                value={ttsRoute.chatSelection.connectorId}
                onValueChange={(v) => ttsRoute.selectChatConnector(v)}
                options={ttsRoute.chatConnectors.map((c) => ({
                  value: c.id,
                  label: c.label || c.id,
                  description: c.vendor ? `(${c.vendor})` : undefined,
                }))}
                placeholder={t('analyze.selectProvider')}
              />
            )}
          </div>

          <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <label className="mb-1.5 block text-xs font-medium text-gray-600">{t('analyze.llmModelLabel')}</label>
            {ttsRoute.loading ? (
              <p className="text-xs text-gray-400">{t('analyze.loadingModels')}</p>
            ) : ttsRoute.error ? (
              <p className="text-xs text-red-500">{ttsRoute.error}</p>
            ) : !selectedChatConnector ? (
              <p className="text-xs text-gray-500">{t('analyze.selectProviderFirst')}</p>
            ) : availableChatModels.length === 0 ? (
              <p className="text-xs text-gray-500">{t('analyze.noSelectableModels')}</p>
            ) : (
              <Select
                value={ttsRoute.chatSelection.model || availableChatModels[0] || ''}
                onValueChange={(value) => ttsRoute.selectChatModel(value)}
                options={availableChatModels.map((model) => ({
                  value: model,
                  label: model,
                }))}
                placeholder={t('analyze.selectModel')}
              />
            )}
          </div>

          {/* Chapter summary */}
          <div className="mb-4 rounded-lg border border-gray-200 bg-white px-3 py-2.5">
            <p className="text-xs text-gray-600">
              {t('analyze.chaptersLoaded', { count: chapters.length })}
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
              {t('analyze.startAnalysis')}
            </button>
          )}

          {analysisRunning && progress && (
            <div className="mb-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-gray-600">
                  {t('analyze.chapterProgress', { current: progress.currentChapterIndex + 1, total: progress.totalChapters })}
                </span>
                <Button variant="destructive" size="sm" onClick={onCancel}>
                  {t('analyze.cancel')}
                </Button>
              </div>
              <Progress
                value={progress.completedChapters}
                max={progress.totalChapters}
              />
              <p className="mt-2 text-[11px] text-gray-500">
                {t('analyze.segmentsDetected', { segments: progress.segmentsSoFar, characters: progress.charactersSoFar })}
              </p>
            </div>
          )}

          {analysisRunning && !progress && (
            <div className="mb-4 flex items-center justify-center gap-2 py-6">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
              <span className="text-sm text-gray-500">{t('analyze.startingAnalysis')}</span>
            </div>
          )}

          {/* Character chips */}
          {hasResults && (
            <div className="mb-4">
              <h4 className="mb-2 text-xs font-semibold text-gray-700">{t('analyze.charactersHeader', { count: characters.length })}</h4>
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
              {t('analyze.reAnalyze')}
            </button>
          )}
        </div>

        {/* Right panel — segment preview */}
        <div className="flex min-w-0 flex-1 flex-col">
          {segments.length > 0 ? (
            <>
              <div className="border-b border-gray-100 px-6 py-3">
                <h4 className="text-xs font-semibold text-gray-700">
                  {t('analyze.segmentsPreview', { count: segments.length })}
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
                    {t('analyze.moreSegments', { count: segments.length - 50 })}
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-sm text-gray-400">
                {analysisRunning ? t('analyze.analyzing') : t('analyze.emptySegments')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
