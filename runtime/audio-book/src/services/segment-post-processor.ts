// ---------------------------------------------------------------------------
// Post-processor: split overly long segments at dialogue boundaries
// ---------------------------------------------------------------------------
//
// After LLM analysis + text-fidelity rebase, some segments may still be too
// long (2000+ chars) because the LLM merged narration + multiple dialogues
// into one segment. This module deterministically splits them by detecting
// Chinese dialogue markers ("") and speaker attribution patterns.
// ---------------------------------------------------------------------------

import type { ScriptSegment, SegmentType } from '../types.js';
import { buildNarrationSpans, scanQuoteSpans } from './quote-span-scanner.js';
import { extractSpeakerCandidates } from './speaker-candidate-extractor.js';
import { scoreSpeakerAttribution } from './speaker-scorer.js';

/** Max chars per segment before we attempt splitting. */
const MAX_SEGMENT_CHARS = 600;

/** Max chars for a narration sub-piece before sentence-level split. */
const MAX_NARRATION_CHARS = 800;

// ---------------------------------------------------------------------------
// Dialogue boundary splitting
// ---------------------------------------------------------------------------

type TextPiece = {
  type: SegmentType;
  speaker: string;
  text: string;
  relStart: number; // offset relative to segment start
  relEnd: number;
};

function stripOuterQuoteChars(text: string): string {
  const source = String(text || '').trim();
  if (source.length < 2) return source;
  return source.slice(1, -1).trim();
}

function isNarrativeQuotedPhrase(text: string, hasDirectAttribution: boolean): boolean {
  const inner = stripOuterQuoteChars(text);
  if (!inner) return true;
  if (hasDirectAttribution) return false;
  if (/[。！？!?；;]$/u.test(inner)) return false;
  return /^[^，,：:]{1,16}$/u.test(inner);
}

/**
 * Split a segment's text into alternating narration/dialogue pieces
 * by detecting Chinese quotation marks.
 */
function splitAtDialogueBoundaries(
  segmentText: string,
  defaultSpeaker: string,
): TextPiece[] {
  const quoteSpans = scanQuoteSpans(segmentText);
  if (quoteSpans.length === 0) {
    return [{
      type: 'narration',
      speaker: defaultSpeaker,
      text: segmentText,
      relStart: 0,
      relEnd: segmentText.length,
    }];
  }

  const narrationSpans = buildNarrationSpans(segmentText, quoteSpans);
  const pieces: TextPiece[] = [];
  const recentSpeakers: string[] = [];
  let quoteIndex = 0;
  let narrationIndex = 0;

  while (quoteIndex < quoteSpans.length || narrationIndex < narrationSpans.length) {
    const nextQuote = quoteSpans[quoteIndex];
    const nextNarration = narrationSpans[narrationIndex];

    if (nextNarration && (!nextQuote || nextNarration.startOffset < nextQuote.startOffset)) {
      pieces.push({
        type: 'narration',
        speaker: 'narrator',
        text: nextNarration.text,
        relStart: nextNarration.startOffset,
        relEnd: nextNarration.endOffset,
      });
      narrationIndex += 1;
      continue;
    }

    if (!nextQuote) break;

    const candidates = extractSpeakerCandidates({
      chapterText: segmentText,
      quoteStart: nextQuote.startOffset,
      quoteEnd: nextQuote.endOffset,
      recentSpeakers,
    });
    const hasDirectAttribution = candidates.some((candidate) => candidate.source !== 'recent_turn');
    const decision = isNarrativeQuotedPhrase(nextQuote.text, hasDirectAttribution)
      ? { type: 'narration' as const, speaker: 'narrator', confidence: 'high' as const }
      : scoreSpeakerAttribution({ candidates });
    const speaker = decision.speaker === 'unknown' ? defaultSpeaker : decision.speaker;

    pieces.push({
      type: decision.type,
      speaker,
      text: nextQuote.text,
      relStart: nextQuote.startOffset,
      relEnd: nextQuote.endOffset,
    });

    recentSpeakers.push(speaker);
    if (recentSpeakers.length > 4) {
      recentSpeakers.shift();
    }
    quoteIndex += 1;
  }

  return pieces.length > 0 ? pieces : [{
    type: 'narration',
    speaker: defaultSpeaker,
    text: segmentText,
    relStart: 0,
    relEnd: segmentText.length,
  }];
}

// ---------------------------------------------------------------------------
// Sentence-level splitting for long narration pieces
// ---------------------------------------------------------------------------

function splitAtSentenceBoundaries(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const sentences = text.split(/(?<=[。！？!?；;])/u).filter(Boolean);
  if (sentences.length <= 1) {
    // Hard split
    const parts: string[] = [];
    for (let i = 0; i < text.length; i += maxChars) {
      parts.push(text.slice(i, i + maxChars));
    }
    return parts.filter(Boolean);
  }

  const chunks: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (current.length + sentence.length > maxChars && current) {
      chunks.push(current);
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current) chunks.push(current);
  return chunks.filter(Boolean);
}

// ---------------------------------------------------------------------------
// Merge adjacent same-speaker short pieces
// ---------------------------------------------------------------------------

function mergePieces(pieces: TextPiece[]): TextPiece[] {
  if (pieces.length <= 1) return pieces;

  const merged: TextPiece[] = [pieces[0]!];
  for (let i = 1; i < pieces.length; i++) {
    const prev = merged[merged.length - 1]!;
    const curr = pieces[i]!;
    // Merge if same speaker, same type, and combined length is reasonable
    if (
      prev.speaker === curr.speaker &&
      prev.type === curr.type &&
      prev.text.length + curr.text.length <= MAX_SEGMENT_CHARS
    ) {
      merged[merged.length - 1] = {
        ...prev,
        text: prev.text + curr.text,
        relEnd: curr.relEnd,
      };
    } else {
      merged.push(curr);
    }
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Post-process segments: split any segment longer than MAX_SEGMENT_CHARS
 * at dialogue boundaries with speaker detection.
 *
 * Returns a new array with potentially more segments, each within size limits.
 * Segment IDs are regenerated as `seg-{chapter}-{index}`.
 */
export function splitLongSegments(
  segments: ScriptSegment[],
  maxChars = MAX_SEGMENT_CHARS,
): ScriptSegment[] {
  const result: ScriptSegment[] = [];

  for (const segment of segments) {
    if (segment.text.length <= maxChars) {
      result.push(segment);
      continue;
    }

    // Step 1: split at dialogue boundaries
    let pieces = splitAtDialogueBoundaries(segment.text, segment.speaker);

    // Step 2: further split any narration piece that's still too long
    const expandedPieces: TextPiece[] = [];
    for (const piece of pieces) {
      if (piece.text.length > MAX_NARRATION_CHARS && piece.type === 'narration') {
        const subTexts = splitAtSentenceBoundaries(piece.text, maxChars);
        let offset = piece.relStart;
        for (const sub of subTexts) {
          expandedPieces.push({
            type: piece.type,
            speaker: piece.speaker,
            text: sub,
            relStart: offset,
            relEnd: offset + sub.length,
          });
          offset += sub.length;
        }
      } else if (piece.text.length > maxChars && piece.type === 'dialogue') {
        // Long dialogue — split at sentence boundaries but keep speaker
        const subTexts = splitAtSentenceBoundaries(piece.text, maxChars);
        let offset = piece.relStart;
        for (const sub of subTexts) {
          expandedPieces.push({
            type: piece.type,
            speaker: piece.speaker,
            text: sub,
            relStart: offset,
            relEnd: offset + sub.length,
          });
          offset += sub.length;
        }
      } else {
        expandedPieces.push(piece);
      }
    }

    // Step 3: merge adjacent same-speaker short pieces
    pieces = mergePieces(expandedPieces);

    // Step 4: convert pieces to ScriptSegments
    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i]!;
      result.push({
        ...segment,
        id: `${segment.id}-${i}`,
        type: piece.type,
        speaker: piece.speaker,
        text: piece.text,
        startOffset: segment.startOffset + piece.relStart,
        endOffset: segment.startOffset + piece.relEnd,
      });
    }
  }

  // Renumber indices and regenerate IDs
  return result.map((seg, idx) => ({
    ...seg,
    id: `seg-${seg.chapterIndex}-${idx}`,
    index: idx,
  }));
}
