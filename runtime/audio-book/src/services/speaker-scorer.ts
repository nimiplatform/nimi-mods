import type { SegmentType } from '../types.js';
import type { AttributionCandidate } from './speaker-candidate-extractor.js';
import { PRONOUNS, classifySpeakerName } from './speaker-lexicon.js';

export type AttributionConfidence = 'high' | 'medium' | 'low';

export type AttributionDecision = {
  speaker: string;
  type: SegmentType;
  confidence: AttributionConfidence;
};

function candidatePenalty(speaker: string, evidenceText: string): number {
  let penalty = 0;
  if (PRONOUNS.has(speaker)) penalty += 0.25;
  if (speaker.length === 1) penalty += 0.15;
  if (speaker.length > 6) penalty += 0.15;
  if (evidenceText.length >= 32) penalty += 0.05;
  return penalty;
}

function dedupeCandidates(candidates: AttributionCandidate[]): AttributionCandidate[] {
  const bestBySpeaker = new Map<string, AttributionCandidate>();
  for (const candidate of candidates) {
    const existing = bestBySpeaker.get(candidate.speaker);
    if (!existing || candidate.baseScore > existing.baseScore) {
      bestBySpeaker.set(candidate.speaker, candidate);
    }
  }
  return Array.from(bestBySpeaker.values());
}

export function scoreSpeakerAttribution(input: {
  candidates: AttributionCandidate[];
}): AttributionDecision {
  const candidates = dedupeCandidates(input.candidates);
  if (candidates.length === 0) {
    return { speaker: 'unknown', type: 'dialogue', confidence: 'low' };
  }

  let bestCandidate = candidates[0]!;
  let bestScore = -1;

  for (const candidate of candidates) {
    const confidenceClass = classifySpeakerName(candidate.speaker);
    let score = candidate.baseScore - candidatePenalty(candidate.speaker, candidate.evidenceText);
    if (confidenceClass === 'medium') score -= 0.05;
    if (confidenceClass === 'low') score -= 0.15;
    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  }

  const type: SegmentType = bestCandidate.source === 'before_thought_verb'
    ? 'inner_thought'
    : 'dialogue';

  let confidence: AttributionConfidence = 'low';
  if (bestScore >= 0.85) {
    confidence = 'high';
  } else if (bestScore >= 0.6) {
    confidence = 'medium';
  }

  return {
    speaker: bestCandidate.speaker,
    type,
    confidence,
  };
}
