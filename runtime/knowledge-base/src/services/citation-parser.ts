// ---------------------------------------------------------------------------
// Citation parser — extracts [N] references from assistant reply text (SSOT §4.5)
// ---------------------------------------------------------------------------

import type { KBCitation, KBChunk, KBDocument } from '../types.js';
import type { VectorSearchResult } from './vector-store.js';

/**
 * Parse `[N]` citation markers from text and map them to search results.
 *
 * The refIndex in search results corresponds to the injection order (1-based).
 * Returns deduplicated citations preserving first occurrence order.
 */
export function parseCitations(input: {
  text: string;
  searchResults: VectorSearchResult[];
  chunks: Map<string, KBChunk>;
  documents: Map<string, KBDocument>;
}): KBCitation[] {
  const { text, searchResults, chunks, documents } = input;

  // Extract all [N] references from text
  const refPattern = /\[(\d+)\]/g;
  const referencedIndices = new Set<number>();
  let match: RegExpExecArray | null;
  while ((match = refPattern.exec(text)) !== null) {
    referencedIndices.add(Number(match[1]));
  }

  if (referencedIndices.size === 0) return [];

  const citations: KBCitation[] = [];
  const seen = new Set<number>();

  for (const refIndex of referencedIndices) {
    if (seen.has(refIndex)) continue;
    seen.add(refIndex);

    // refIndex is 1-based, array is 0-based
    const resultIndex = refIndex - 1;
    if (resultIndex < 0 || resultIndex >= searchResults.length) continue;

    const result = searchResults[resultIndex]!;
    const chunk = chunks.get(result.chunkId);
    const doc = documents.get(result.documentId);

    if (!chunk || !doc) continue;

    citations.push({
      chunkId: result.chunkId,
      documentId: result.documentId,
      documentTitle: doc.title,
      snippet: chunk.text.slice(0, 200),
      score: result.score,
      refIndex,
    });
  }

  citations.sort((a, b) => a.refIndex - b.refIndex);
  return citations;
}
