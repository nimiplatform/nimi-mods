import type { AnalysisChapterOutput } from '../types.js';

type SegmentInput = AnalysisChapterOutput['segments'][number];

export type RebasedSegment = SegmentInput & {
  startOffset: number;
  endOffset: number;
};

export type RebasedSegmentResult = {
  segments: RebasedSegment[];
  diagnostics: {
    anchorHits: number;
    currentMatchHits: number;
    fallbackCount: number;
    lowSimilarityCount: number;
    chapterNormalizedLength: number;
    recoveredNormalizedLength: number;
  };
};

const ANCHOR_LENGTHS = [32, 24, 20, 16, 12, 8] as const;
const MIN_SIMILARITY = 0.45;

function normalizeChar(ch: string): string {
  if (!ch || /\s/.test(ch)) return '';
  if (ch === ',') return '，';
  if (ch === '.') return '。';
  if (ch === '!') return '！';
  if (ch === '?') return '？';
  if (ch === ':') return '：';
  if (ch === ';') return '；';
  if (ch === '(') return '（';
  if (ch === ')') return '）';
  if (ch === '“' || ch === '”') return '"';
  if (ch === '‘' || ch === '’') return '\'';
  if (ch === '—') return '-';
  return ch;
}

function normalizeTextWithMap(input: string): {
  normalized: string;
  originalIndexByNormalized: number[];
} {
  const text = String(input || '');
  let normalized = '';
  const originalIndexByNormalized: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const mapped = normalizeChar(text[i] || '');
    if (!mapped) continue;
    normalized += mapped;
    originalIndexByNormalized.push(i);
  }
  return { normalized, originalIndexByNormalized };
}

function normalizeText(input: string): string {
  return normalizeTextWithMap(input).normalized;
}

function lcsLength(a: string, b: string): number {
  if (!a || !b) return 0;
  const m = b.length;
  const prev = new Uint32Array(m + 1);
  const curr = new Uint32Array(m + 1);
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      curr[j] = a[i - 1] === b[j - 1]
        ? (prev[j - 1] || 0) + 1
        : Math.max(prev[j] || 0, curr[j - 1] || 0);
    }
    prev.set(curr);
    curr.fill(0);
  }
  return prev[m] || 0;
}

function similarityScore(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const lcs = lcsLength(a, b);
  return lcs / Math.max(a.length, b.length);
}

function findBoundaryByNextAnchor(
  sourceNormalized: string,
  nextSegmentNormalized: string,
  fromIndex: number,
): number {
  const text = String(nextSegmentNormalized || '');
  if (!text) return -1;
  const start = Math.max(0, fromIndex);
  for (const len of ANCHOR_LENGTHS) {
    if (text.length < len) continue;
    const anchor = text.slice(0, len);
    const pos = sourceNormalized.indexOf(anchor, start);
    if (pos >= start) return pos;
  }
  const shortPos = sourceNormalized.indexOf(text, start);
  return shortPos >= start ? shortPos : -1;
}

function findBoundaryByCurrentMatch(
  sourceNormalized: string,
  currentSegmentNormalized: string,
  fromIndex: number,
): number {
  const text = String(currentSegmentNormalized || '');
  if (!text) return -1;
  const start = Math.max(0, fromIndex);
  const pos = sourceNormalized.indexOf(text, start);
  if (pos < start) return -1;
  return pos + text.length;
}

function estimateFallbackBoundary(
  sourceNormalizedLength: number,
  cursor: number,
  segmentNormalizedLength: number,
  remainingNormalizedLength: number,
  remainingSegments: number,
): number {
  const remainingSource = Math.max(1, sourceNormalizedLength - cursor);
  const currentWeight = Math.max(1, segmentNormalizedLength);
  const allWeight = Math.max(currentWeight, remainingNormalizedLength);
  const estDelta = Math.max(1, Math.round((remainingSource * currentWeight) / allWeight));
  const minBoundary = cursor + 1;
  const maxBoundary = Math.max(minBoundary, sourceNormalizedLength - remainingSegments);
  return Math.min(Math.max(minBoundary, cursor + estDelta), maxBoundary);
}

export function rebaseChapterSegmentsToSource(input: {
  chapterText: string;
  chapterIndex: number;
  segments: SegmentInput[];
}): RebasedSegmentResult {
  const chapterText = String(input.chapterText || '');
  const normalizedSource = normalizeTextWithMap(chapterText);
  if (normalizedSource.normalized.length === 0) {
    if (input.segments.length === 0) {
      return {
        segments: [],
        diagnostics: {
          anchorHits: 0,
          currentMatchHits: 0,
          fallbackCount: 0,
          lowSimilarityCount: 0,
          chapterNormalizedLength: 0,
          recoveredNormalizedLength: 0,
        },
      };
    }
    throw new Error(`VS_TEXT_FIDELITY_MISMATCH: chapter ${input.chapterIndex + 1} has empty source text`);
  }

  if (input.segments.length === 0) {
    throw new Error(`VS_TEXT_FIDELITY_MISMATCH: chapter ${input.chapterIndex + 1} has no segments`);
  }

  const segmentNormalized = input.segments.map((segment) => normalizeText(segment.text));
  const boundaries: number[] = new Array(input.segments.length + 1).fill(0);
  boundaries[0] = 0;

  let cursor = 0;
  let anchorHits = 0;
  let currentMatchHits = 0;
  let fallbackCount = 0;

  for (let i = 0; i < input.segments.length - 1; i += 1) {
    let boundary = findBoundaryByNextAnchor(
      normalizedSource.normalized,
      segmentNormalized[i + 1] || '',
      cursor + 1,
    );
    if (boundary > cursor) {
      anchorHits += 1;
    }

    if (boundary <= cursor) {
      const currentBoundary = findBoundaryByCurrentMatch(
        normalizedSource.normalized,
        segmentNormalized[i] || '',
        cursor,
      );
      if (currentBoundary > cursor) {
        boundary = currentBoundary;
        currentMatchHits += 1;
      }
    }

    if (boundary <= cursor) {
      const remainingNormalizedLength = segmentNormalized
        .slice(i)
        .reduce((sum, text) => sum + Math.max(1, text.length), 0);
      const remainingSegments = input.segments.length - (i + 1);
      boundary = estimateFallbackBoundary(
        normalizedSource.normalized.length,
        cursor,
        segmentNormalized[i]?.length ?? 0,
        remainingNormalizedLength,
        remainingSegments,
      );
      fallbackCount += 1;
    }

    boundaries[i + 1] = boundary;
    cursor = boundary;
  }
  boundaries[input.segments.length] = normalizedSource.normalized.length;

  let lowSimilarityCount = 0;
  const rebasedSegments: RebasedSegment[] = [];

  for (let i = 0; i < input.segments.length; i += 1) {
    const startNorm = boundaries[i] || 0;
    const endNorm = boundaries[i + 1] || 0;
    if (endNorm <= startNorm) {
      throw new Error(`VS_TEXT_FIDELITY_MISMATCH: chapter ${input.chapterIndex + 1} segment ${i} has invalid boundaries`);
    }

    const startOffset = normalizedSource.originalIndexByNormalized[startNorm];
    const endOffset = (normalizedSource.originalIndexByNormalized[endNorm - 1] || 0) + 1;
    if (!Number.isFinite(startOffset) || !Number.isFinite(endOffset) || endOffset <= startOffset) {
      throw new Error(`VS_TEXT_FIDELITY_MISMATCH: chapter ${input.chapterIndex + 1} segment ${i} offset mapping failed`);
    }

    const sourceSlice = chapterText.slice(startOffset, endOffset);
    const sourceSliceNormalized = normalizeText(sourceSlice);
    const similarity = similarityScore(segmentNormalized[i] || '', sourceSliceNormalized);
    if (segmentNormalized[i] && similarity < MIN_SIMILARITY) {
      lowSimilarityCount += 1;
    }

    rebasedSegments.push({
      ...input.segments[i]!,
      text: sourceSlice,
      startOffset,
      endOffset,
    });
  }

  const recoveredNormalized = rebasedSegments.map((segment) => normalizeText(segment.text)).join('');
  if (recoveredNormalized !== normalizedSource.normalized) {
    throw new Error(
      `VS_TEXT_FIDELITY_MISMATCH: chapter ${input.chapterIndex + 1} source/recovered mismatch ` +
      `(source=${normalizedSource.normalized.length}, recovered=${recoveredNormalized.length})`,
    );
  }

  const maxLowSimilarity = Math.max(1, Math.floor(input.segments.length * 0.2));
  if (lowSimilarityCount > maxLowSimilarity) {
    throw new Error(
      `VS_TEXT_FIDELITY_MISMATCH: chapter ${input.chapterIndex + 1} ` +
      `low-similarity segments ${lowSimilarityCount}/${input.segments.length}`,
    );
  }

  return {
    segments: rebasedSegments,
    diagnostics: {
      anchorHits,
      currentMatchHits,
      fallbackCount,
      lowSimilarityCount,
      chapterNormalizedLength: normalizedSource.normalized.length,
      recoveredNormalizedLength: recoveredNormalized.length,
    },
  };
}
