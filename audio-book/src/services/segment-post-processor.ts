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

/** Max chars per segment before we attempt splitting. */
const MAX_SEGMENT_CHARS = 600;

/** Max chars for a narration sub-piece before sentence-level split. */
const MAX_NARRATION_CHARS = 800;

// ---------------------------------------------------------------------------
// Speaker detection from attribution patterns
// ---------------------------------------------------------------------------

// Common Chinese speech verbs
const SPEECH_VERBS =
  '说|道|问|答|说道|问道|喊道|叫道|吼道|嚷道|笑道|冷笑道|怒道|大声说|大声喊|大声叫|' +
  '质问|反驳|解释|提示|回答|喊|叫|嚷|命令|大叫|大喊|接着说|继续说';

const BEFORE_PATTERN = new RegExp(
  `([\\u4e00-\\u9fff\\w]{1,8})\\s*(?:${SPEECH_VERBS})\\s*[：:，,]?\\s*$`,
);
const AFTER_PATTERN = new RegExp(
  `^\\s*(?:${SPEECH_VERBS})\\s*([\\u4e00-\\u9fff\\w]{1,8})`,
);

function detectSpeakerFromContext(
  fullText: string,
  dialogueStart: number,
  dialogueEnd: number,
  fallback: string,
): string {
  // Look backwards for "XXX说" style attribution
  const beforeText = fullText.slice(Math.max(0, dialogueStart - 40), dialogueStart);
  const beforeMatch = beforeText.match(BEFORE_PATTERN);
  if (beforeMatch?.[1]) return beforeMatch[1];

  // Look forwards for "说XXX" style (rare but exists)
  const afterText = fullText.slice(dialogueEnd, Math.min(fullText.length, dialogueEnd + 40));
  const afterMatch = afterText.match(AFTER_PATTERN);
  if (afterMatch?.[1]) return afterMatch[1];

  return fallback;
}

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

/**
 * Split a segment's text into alternating narration/dialogue pieces
 * by detecting Chinese quotation marks.
 */
function splitAtDialogueBoundaries(
  segmentText: string,
  defaultSpeaker: string,
): TextPiece[] {
  const pieces: TextPiece[] = [];

  // Match Chinese dialogue: \u201c...\u201d or "..."
  // Use a simple scan approach to handle nested/unmatched quotes gracefully
  let cursor = 0;
  const len = segmentText.length;

  while (cursor < len) {
    // Find next opening quote
    const openIdx = findNextOpenQuote(segmentText, cursor);
    if (openIdx < 0) {
      // No more dialogue — rest is narration
      if (cursor < len) {
        const text = segmentText.slice(cursor);
        if (text.trim()) {
          pieces.push({
            type: 'narration',
            speaker: 'narrator',
            text,
            relStart: cursor,
            relEnd: len,
          });
        }
      }
      break;
    }

    // Narration before dialogue
    if (openIdx > cursor) {
      const narrationText = segmentText.slice(cursor, openIdx);
      if (narrationText.trim()) {
        pieces.push({
          type: 'narration',
          speaker: 'narrator',
          text: narrationText,
          relStart: cursor,
          relEnd: openIdx,
        });
      }
    }

    // Find matching close quote
    const closeIdx = findMatchingCloseQuote(segmentText, openIdx);
    const dialogueEnd = closeIdx + 1;
    const dialogueText = segmentText.slice(openIdx, dialogueEnd);

    // Detect speaker from surrounding context
    const speaker = detectSpeakerFromContext(
      segmentText,
      openIdx,
      dialogueEnd,
      defaultSpeaker,
    );

    if (dialogueText.trim()) {
      pieces.push({
        type: 'dialogue',
        speaker,
        text: dialogueText,
        relStart: openIdx,
        relEnd: dialogueEnd,
      });
    }

    cursor = dialogueEnd;
  }

  return pieces.length > 0 ? pieces : [{
    type: 'narration',
    speaker: defaultSpeaker,
    text: segmentText,
    relStart: 0,
    relEnd: len,
  }];
}

function findNextOpenQuote(text: string, from: number): number {
  for (let i = from; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\u201c' || ch === '\u300c') return i;
  }
  return -1;
}

function findMatchingCloseQuote(text: string, openIdx: number): number {
  const openCh = text[openIdx];
  const closeCh = openCh === '\u201c' ? '\u201d' : '\u300d';
  // Simple: find the next close quote (not handling nesting for now)
  for (let i = openIdx + 1; i < text.length; i++) {
    if (text[i] === closeCh) return i;
  }
  // No close found — treat rest of text as the dialogue
  return text.length - 1;
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
