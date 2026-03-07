import { describe, expect, it } from 'vitest';
import {
  buildAnalysisRetrySeed,
  isBetterAnalysisQuality,
  measureAnalysisQuality,
  shouldRetryAnalysisWithDefaultRoute,
} from '../../src/services/analysis-quality.js';
import type { AnalysisResult } from '../../src/services/analysis-pipeline.js';

function createResult(): AnalysisResult {
  return {
    segments: [
      {
        id: 'seg-0-0',
        chapterIndex: 0,
        index: 0,
        type: 'dialogue',
        speaker: 'Alice',
        text: '第一章',
        startOffset: 0,
        endOffset: 3,
      },
      {
        id: 'seg-1-fallback-0',
        chapterIndex: 1,
        index: 1,
        type: 'narration',
        speaker: 'narrator',
        text: '第二章',
        startOffset: 0,
        endOffset: 3,
      },
      {
        id: 'seg-2-0',
        chapterIndex: 2,
        index: 2,
        type: 'dialogue',
        speaker: 'Bob',
        text: '第三章',
        startOffset: 0,
        endOffset: 3,
      },
    ],
    characters: [
      { name: 'narrator', gender: 'neutral', ageGroup: 'adult', traits: [], segmentCount: 1, tier: 'major' },
      { name: 'Alice', gender: 'female', ageGroup: 'adult', traits: ['calm'], segmentCount: 1, tier: 'supporting' },
      { name: 'Bob', gender: 'male', ageGroup: 'adult', traits: ['bold'], segmentCount: 1, tier: 'supporting' },
    ],
    chapterResults: [
      { chapterIndex: 0, segmentCount: 1, newCharacters: 1, retryCount: 0 },
      { chapterIndex: 1, segmentCount: 1, newCharacters: 0, retryCount: 2, error: 'analysis_failed_fallback_used: bad json' },
      { chapterIndex: 2, segmentCount: 1, newCharacters: 1, retryCount: 0 },
    ],
    lastProcessedChapter: 2,
  };
}

describe('analysis-quality', () => {
  it('measures fallback and error counts from analysis results', () => {
    expect(measureAnalysisQuality(createResult())).toEqual({
      totalSegments: 3,
      fallbackSegments: 1,
      errorChapters: 1,
      nonNarratorCharacters: 2,
    });
  });

  it('builds a retry seed from the earliest failed chapter onward', () => {
    expect(buildAnalysisRetrySeed(createResult())).toEqual({
      startFromChapter: 1,
      existingSegments: [
        {
          id: 'seg-0-0',
          chapterIndex: 0,
          index: 0,
          type: 'dialogue',
          speaker: 'Alice',
          text: '第一章',
          startOffset: 0,
          endOffset: 3,
        },
      ],
      existingCharacters: [
        { name: 'narrator', gender: 'neutral', ageGroup: 'adult', traits: [], segmentCount: 1, tier: 'major' },
        { name: 'Alice', gender: 'female', ageGroup: 'adult', traits: ['calm'], segmentCount: 1, tier: 'supporting' },
      ],
    });
  });

  it('prefers fewer fallback segments and errors when comparing quality', () => {
    expect(isBetterAnalysisQuality(
      { totalSegments: 12, fallbackSegments: 0, errorChapters: 0, nonNarratorCharacters: 4 },
      { totalSegments: 16, fallbackSegments: 2, errorChapters: 1, nonNarratorCharacters: 5 },
    )).toBe(true);
  });

  it('retries default route only for materially degraded analysis quality', () => {
    expect(shouldRetryAnalysisWithDefaultRoute({
      totalSegments: 20,
      fallbackSegments: 1,
      errorChapters: 1,
      nonNarratorCharacters: 4,
    })).toBe(false);

    expect(shouldRetryAnalysisWithDefaultRoute({
      totalSegments: 20,
      fallbackSegments: 5,
      errorChapters: 1,
      nonNarratorCharacters: 4,
    })).toBe(true);

    expect(shouldRetryAnalysisWithDefaultRoute({
      totalSegments: 20,
      fallbackSegments: 0,
      errorChapters: 2,
      nonNarratorCharacters: 4,
    })).toBe(true);
  });
});
