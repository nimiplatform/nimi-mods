// ---------------------------------------------------------------------------
// Regex pre-analyzer — deterministic quote segmentation + speaker attribution
// ---------------------------------------------------------------------------

import type { SegmentType } from '../types.js';
import { buildNarrationSpans, scanQuoteSpans } from './quote-span-scanner.js';
import { extractSpeakerCandidates, type AttributionCandidate } from './speaker-candidate-extractor.js';
import { scoreSpeakerAttribution } from './speaker-scorer.js';
import { PRONOUNS } from './speaker-lexicon.js';

export type SegmentConfidence = 'high' | 'medium' | 'low';

export type PreAnalyzedSegment = {
  type: SegmentType;
  speaker: string;
  text: string;
  startOffset: number;
  endOffset: number;
  confidence: SegmentConfidence;
};

export type PreAnalysisResult = {
  segments: PreAnalyzedSegment[];
  characterNames: string[];
  stats: {
    totalSegments: number;
    highConfidence: number;
    mediumConfidence: number;
    lowConfidence: number;
    highConfidenceRatio: number;
  };
  canBypassLlm: boolean;
};

/** Skip LLM when (high + medium) / total >= this threshold. */
export const BYPASS_THRESHOLD = 0.85;

/** Need at least this many segments to apply the threshold check. */
export const MIN_SEGMENTS_FOR_BYPASS = 3;

/** Chapters with fewer than this many dialogue quotes are treated as pure narration. */
export const MIN_DIALOGUE_FOR_ATTRIBUTION = 3;

/** Minimum total segments to consider dialogue demotion (avoids affecting short test snippets). */
export const MIN_SEGMENTS_FOR_DIALOGUE_DEMOTION = 6;

function stripOuterQuoteChars(text: string): string {
  const source = String(text || '').trim();
  if (source.length < 2) return source;
  return source.slice(1, -1).trim();
}

function isNarrativeQuotedPhrase(quoteText: string, candidates: AttributionCandidate[]): boolean {
  const inner = stripOuterQuoteChars(quoteText);
  if (!inner) return true;
  const hasDirectAttribution = candidates.some((candidate) => candidate.source !== 'recent_turn');
  if (hasDirectAttribution) return false;
  if (/[。！？!?；;]$/u.test(inner)) return false;
  if (/^[^，,：:]{1,16}$/u.test(inner)) return true;
  return false;
}

/**
 * Merge consecutive narration segments into single spans.
 * Narrative quoted phrases ("红色联合", "四·二八") become narration segments
 * that fragment surrounding narration. This pass stitches them back together,
 * using the source text to reconstruct the merged text (no gap loss).
 */
function mergeConsecutiveNarration(segments: PreAnalyzedSegment[], source: string): PreAnalyzedSegment[] {
  if (segments.length <= 1) return segments;
  const merged: PreAnalyzedSegment[] = [];
  for (const seg of segments) {
    const prev = merged[merged.length - 1];
    if (prev && prev.type === 'narration' && seg.type === 'narration') {
      prev.text = source.slice(prev.startOffset, seg.endOffset);
      prev.endOffset = seg.endOffset;
    } else {
      merged.push({ ...seg });
    }
  }
  return merged;
}

function resolveUnknownSpeakers(segments: PreAnalyzedSegment[]): void {
  let lastKnown = 'narrator';
  for (const seg of segments) {
    if (seg.speaker !== 'unknown' && seg.speaker !== 'narrator' && !PRONOUNS.has(seg.speaker)) {
      lastKnown = seg.speaker;
    }
    if (seg.speaker === 'unknown') {
      seg.speaker = lastKnown;
    }
  }
}

function buildCharacterNames(segments: PreAnalyzedSegment[]): string[] {
  const names = new Set<string>();
  for (const segment of segments) {
    if (
      segment.speaker &&
      segment.speaker !== 'unknown' &&
      segment.speaker !== 'narrator' &&
      !PRONOUNS.has(segment.speaker)
    ) {
      names.add(segment.speaker);
    }
  }
  return Array.from(names);
}

export function regexPreAnalyze(chapterText: string): PreAnalysisResult {
  const source = String(chapterText || '');
  if (!source.trim()) {
    return {
      segments: [],
      characterNames: [],
      stats: {
        totalSegments: 0,
        highConfidence: 0,
        mediumConfidence: 0,
        lowConfidence: 0,
        highConfidenceRatio: 0,
      },
      canBypassLlm: false,
    };
  }

  const quoteSpans = scanQuoteSpans(source);
  const narrationSpans = buildNarrationSpans(source, quoteSpans);
  const recentSpeakers: string[] = [];
  const segments: PreAnalyzedSegment[] = [];

  let quoteIndex = 0;
  let narrationIndex = 0;

  while (quoteIndex < quoteSpans.length || narrationIndex < narrationSpans.length) {
    const nextQuote = quoteSpans[quoteIndex];
    const nextNarration = narrationSpans[narrationIndex];

    if (nextNarration && (!nextQuote || nextNarration.startOffset < nextQuote.startOffset)) {
      segments.push({
        type: 'narration',
        speaker: 'narrator',
        text: nextNarration.text,
        startOffset: nextNarration.startOffset,
        endOffset: nextNarration.endOffset,
        confidence: 'high',
      });
      narrationIndex += 1;
      continue;
    }

    if (!nextQuote) {
      break;
    }

    const candidates = extractSpeakerCandidates({
      chapterText: source,
      quoteStart: nextQuote.startOffset,
      quoteEnd: nextQuote.endOffset,
      recentSpeakers,
    });
    const decision = isNarrativeQuotedPhrase(nextQuote.text, candidates)
      ? { type: 'narration' as const, speaker: 'narrator', confidence: 'high' as const }
      : scoreSpeakerAttribution({ candidates });

    segments.push({
      type: decision.type,
      speaker: decision.speaker,
      text: nextQuote.text,
      startOffset: nextQuote.startOffset,
      endOffset: nextQuote.endOffset,
      confidence: decision.confidence,
    });

    // Only track real dialogue speakers for turn-taking, not narrative quotes
    if (decision.type !== 'narration') {
      recentSpeakers.push(decision.speaker);
      if (recentSpeakers.length > 4) {
        recentSpeakers.shift();
      }
    }
    quoteIndex += 1;
  }

  const mergedSegments = mergeConsecutiveNarration(segments, source);

  // Chapters with fewer than 3 dialogue quotes are treated as pure narration —
  // isolated quotes in narrative text are usually proper nouns or slogans, not dialogue.
  // Only apply to substantial chapters (MIN_SEGMENTS_FOR_BYPASS+ segments) to avoid
  // demoting short text snippets that are legitimately dialogue-only.
  const dialogueCount = mergedSegments.filter((seg) => seg.type !== 'narration').length;
  if (dialogueCount < MIN_DIALOGUE_FOR_ATTRIBUTION && mergedSegments.length >= MIN_SEGMENTS_FOR_DIALOGUE_DEMOTION) {
    for (const seg of mergedSegments) {
      if (seg.type !== 'narration') {
        seg.type = 'narration';
        seg.speaker = 'narrator';
        seg.confidence = 'high';
      }
    }
  }

  const shouldDemoteDialogue = dialogueCount < MIN_DIALOGUE_FOR_ATTRIBUTION && mergedSegments.length >= MIN_SEGMENTS_FOR_DIALOGUE_DEMOTION;
  const remergedSegments = shouldDemoteDialogue
    ? mergeConsecutiveNarration(mergedSegments, source)
    : mergedSegments;

  resolveUnknownSpeakers(remergedSegments);

  const total = remergedSegments.length;
  const high = remergedSegments.filter((segment) => segment.confidence === 'high').length;
  const medium = remergedSegments.filter((segment) => segment.confidence === 'medium').length;
  const low = remergedSegments.filter((segment) => segment.confidence === 'low').length;
  const ratio = total > 0 ? (high + medium) / total : 0;

  return {
    segments: remergedSegments,
    characterNames: buildCharacterNames(remergedSegments),
    stats: {
      totalSegments: total,
      highConfidence: high,
      mediumConfidence: medium,
      lowConfidence: low,
      highConfidenceRatio: ratio,
    },
    canBypassLlm: total >= MIN_SEGMENTS_FOR_BYPASS && ratio >= BYPASS_THRESHOLD,
  };
}
