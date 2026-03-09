import type { EventNodeDraft } from '../types.js';

function refsInSentence(sentence: string, candidates: string[]): string[] {
  return candidates.filter((name) => sentence.includes(name)).slice(0, 4);
}

export function createHeuristicEvent(input: {
  chunkIndex: number;
  sentence: string;
  sentenceIndex: number;
  level: 'PRIMARY' | 'SECONDARY';
  parentEventId: string | null;
  timelineRefs: string[];
  locationNames: string[];
  characterNames: string[];
}): EventNodeDraft {
  const clipped = input.sentence.slice(0, 160);
  const eventId = `${input.level === 'PRIMARY' ? 'evt-p' : 'evt-s'}-${input.chunkIndex + 1}-${input.sentenceIndex + 1}`;
  const locationRefs = refsInSentence(input.sentence, input.locationNames);
  const characterRefs = refsInSentence(input.sentence, input.characterNames);
  const matchedTime = input.sentence.match(/(?:18|19|20)\d{2}年?/);
  const timeRef = (matchedTime ? matchedTime[0] : (input.timelineRefs[0] || '')) || '';
  return {
    id: eventId,
    level: input.level,
    eventHorizon: 'PAST',
    parentEventId: input.parentEventId,
    title: clipped.slice(0, 24) || `Event ${input.sentenceIndex + 1}`,
    summary: clipped,
    cause: '',
    process: clipped,
    result: '',
    timeRef,
    locationRefs: locationRefs.length > 0 ? locationRefs : (input.locationNames[0] ? [input.locationNames[0]] : []),
    characterRefs: characterRefs.length > 0 ? characterRefs : (input.characterNames[0] ? [input.characterNames[0]] : []),
    dependsOnEventIds: input.parentEventId ? [input.parentEventId] : [],
    evidenceRefs: [{
      segmentId: `chunk-${input.chunkIndex + 1}`,
      offsetStart: 0,
      offsetEnd: clipped.length,
      excerpt: clipped,
      confidence: 0.4,
      sourceType: 'chunk',
    }],
    confidence: 0.35,
    needsEvidence: false,
  };
}

export function buildHeuristicRelations(
  characterNames: string[],
  sentences: string[],
): Array<Record<string, unknown>> {
  const relations: Array<Record<string, unknown>> = [];
  for (const sentence of sentences.slice(0, 30)) {
    const linked = refsInSentence(sentence, characterNames);
    if (linked.length < 2) continue;
    relations.push({
      source: linked[0],
      target: linked[1],
      relation: '关联',
      reason: sentence.slice(0, 120),
      strength: 0.35,
    });
    if (relations.length >= 20) break;
  }
  return relations;
}
