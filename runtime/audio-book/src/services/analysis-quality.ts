import type { CharacterProfile, ScriptSegment } from '../types.js';
import type { AnalysisResult } from './analysis-pipeline.js';

export type AnalysisQuality = {
  totalSegments: number;
  fallbackSegments: number;
  errorChapters: number;
  nonNarratorCharacters: number;
};

const DEFAULT_ROUTE_RETRY_ERROR_CHAPTER_THRESHOLD = 2;
const DEFAULT_ROUTE_RETRY_FALLBACK_RATIO_THRESHOLD = 0.25;

export type AnalysisRetrySeed = {
  startFromChapter: number;
  existingSegments: ScriptSegment[];
  existingCharacters: CharacterProfile[];
};

export function measureAnalysisQuality(result: AnalysisResult): AnalysisQuality {
  const totalSegments = result.segments.length;
  const fallbackSegments = result.segments.filter((segment) => segment.id.includes('-fallback-')).length;
  const errorChapters = result.chapterResults.filter((item) => Boolean(item.error)).length;
  const nonNarratorCharacters = result.characters.filter((item) => item.name !== 'narrator').length;
  return { totalSegments, fallbackSegments, errorChapters, nonNarratorCharacters };
}

export function isBetterAnalysisQuality(candidate: AnalysisQuality, baseline: AnalysisQuality): boolean {
  if (candidate.fallbackSegments !== baseline.fallbackSegments) {
    return candidate.fallbackSegments < baseline.fallbackSegments;
  }
  if (candidate.errorChapters !== baseline.errorChapters) {
    return candidate.errorChapters < baseline.errorChapters;
  }
  if (candidate.nonNarratorCharacters !== baseline.nonNarratorCharacters) {
    return candidate.nonNarratorCharacters > baseline.nonNarratorCharacters;
  }
  if (candidate.totalSegments !== baseline.totalSegments) {
    return candidate.totalSegments > baseline.totalSegments;
  }
  return false;
}

export function shouldRetryAnalysisWithDefaultRoute(quality: AnalysisQuality): boolean {
  if (quality.totalSegments <= 0) {
    return true;
  }
  if (quality.fallbackSegments >= quality.totalSegments) {
    return true;
  }
  if (quality.errorChapters >= DEFAULT_ROUTE_RETRY_ERROR_CHAPTER_THRESHOLD) {
    return true;
  }
  return (quality.fallbackSegments / quality.totalSegments) >= DEFAULT_ROUTE_RETRY_FALLBACK_RATIO_THRESHOLD;
}

export function buildAnalysisRetrySeed(result: AnalysisResult): AnalysisRetrySeed | null {
  const failedChapterIndexes = result.chapterResults
    .filter((item) => Boolean(item.error))
    .map((item) => item.chapterIndex);

  if (failedChapterIndexes.length === 0) {
    return null;
  }

  const startFromChapter = Math.min(...failedChapterIndexes);
  if (startFromChapter <= 0) {
    return null;
  }

  const existingSegments = result.segments.filter((segment) => segment.chapterIndex < startFromChapter);
  const existingSpeakerNames = new Set(existingSegments.map((segment) => segment.speaker));
  const existingCharacters = result.characters.filter(
    (character) => character.name === 'narrator' || existingSpeakerNames.has(character.name),
  );

  return {
    startFromChapter,
    existingSegments,
    existingCharacters,
  };
}
