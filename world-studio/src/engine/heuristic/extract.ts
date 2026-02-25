import type { ChunkExtraction } from '../types.js';
import { scoreHeuristicEventSentence } from './event-score.js';
import {
  toHeuristicCharacters,
  toHeuristicLocations,
  toHeuristicTimeline,
} from './entity-extract.js';
import { buildHeuristicRelations, createHeuristicEvent } from './relations.js';
import {
  extractHeuristicCharacterNames,
  extractHeuristicLocationNames,
  extractHeuristicTimelineRefs,
  splitHeuristicSentences,
} from './tokenize.js';

export function extractChunkHeuristic(input: {
  chunk: string;
  index: number;
  total: number;
}): ChunkExtraction {
  const text = String(input.chunk || '').trim();
  const sentences = splitHeuristicSentences(text);
  const timelineRefs = extractHeuristicTimelineRefs(text);
  const locationNames = extractHeuristicLocationNames(text);
  const characterNames = extractHeuristicCharacterNames(text);

  const scored = sentences
    .map((sentence, sentenceIndex) => ({
      sentence,
      sentenceIndex,
      score: scoreHeuristicEventSentence(sentence),
    }))
    .filter((item) => item.score >= 1)
    .sort((a, b) => b.score - a.score);

  const fallbackSource = scored.length > 0
    ? scored
    : sentences.slice(0, 8).map((sentence, sentenceIndex) => ({
        sentence,
        sentenceIndex,
        score: 0.5,
      }));

  const primarySeed = fallbackSource.slice(0, 3);
  const primary = primarySeed.map((item) => createHeuristicEvent({
    chunkIndex: input.index,
    sentence: item.sentence,
    sentenceIndex: item.sentenceIndex,
    level: 'PRIMARY',
    parentEventId: null,
    timelineRefs,
    locationNames,
    characterNames,
  }));

  const secondarySeed = fallbackSource.slice(3, 8);
  const primaryAnchor = primary[0]?.id || null;
  const secondary = secondarySeed.map((item) => createHeuristicEvent({
    chunkIndex: input.index,
    sentence: item.sentence,
    sentenceIndex: item.sentenceIndex,
    level: 'SECONDARY',
    parentEventId: primaryAnchor,
    timelineRefs,
    locationNames,
    characterNames,
  }));

  return {
    worldSetting: (sentences[0] || text.slice(0, 180)).trim(),
    timeline: toHeuristicTimeline(timelineRefs),
    locations: toHeuristicLocations(locationNames),
    characters: toHeuristicCharacters(characterNames),
    events: { primary, secondary },
    characterRelations: buildHeuristicRelations(characterNames, sentences),
  };
}
