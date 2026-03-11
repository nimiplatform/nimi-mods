// ---------------------------------------------------------------------------
// Text chunker — splits text at paragraph boundaries (SSOT §3.4)
// ---------------------------------------------------------------------------

import type { KBChunk } from '../types.js';

export type ChunkOptions = {
  chunkSize?: number;
  chunkOverlap?: number;
  documentId: string;
  generateId: () => string;
};

const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Split text into chunks at paragraph boundaries.
 *
 * Strategy:
 * 1. Split into paragraphs (double newline).
 * 2. Greedily accumulate until adding next would exceed chunkSize.
 * 3. Emit chunk with overlap from tail paragraphs.
 * 4. Skip empty/whitespace-only chunks.
 */
export function splitIntoChunks(text: string, options: ChunkOptions): KBChunk[] {
  const chunkSize = options.chunkSize ?? 512;
  const chunkOverlap = options.chunkOverlap ?? 64;
  const { documentId, generateId } = options;

  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (paragraphs.length === 0) return [];

  const chunks: KBChunk[] = [];
  let currentParagraphs: string[] = [];
  let currentTokens = 0;

  function emitChunk() {
    const chunkText = currentParagraphs.join('\n\n');
    if (chunkText.trim().length === 0) return;

    chunks.push({
      id: generateId(),
      documentId,
      text: chunkText,
      chunkIndex: chunks.length,
      tokenCount: estimateTokens(chunkText),
      metadata: {},
    });
  }

  function computeOverlapParagraphs(): string[] {
    const overlap: string[] = [];
    let overlapTokens = 0;
    for (let i = currentParagraphs.length - 1; i >= 0; i--) {
      const pTokens = estimateTokens(currentParagraphs[i]!);
      if (overlapTokens + pTokens > chunkOverlap && overlap.length > 0) break;
      overlap.unshift(currentParagraphs[i]!);
      overlapTokens += pTokens;
    }
    return overlap;
  }

  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para);

    // Single paragraph exceeds chunk size → emit as its own chunk
    if (paraTokens >= chunkSize) {
      if (currentParagraphs.length > 0) {
        emitChunk();
        currentParagraphs = [];
        currentTokens = 0;
      }
      currentParagraphs = [para];
      currentTokens = paraTokens;
      emitChunk();
      currentParagraphs = [];
      currentTokens = 0;
      continue;
    }

    if (currentTokens + paraTokens > chunkSize && currentParagraphs.length > 0) {
      const overlapParas = computeOverlapParagraphs();
      emitChunk();
      currentParagraphs = [...overlapParas];
      currentTokens = overlapParas.reduce((sum, p) => sum + estimateTokens(p), 0);
    }

    currentParagraphs.push(para);
    currentTokens += paraTokens;
  }

  if (currentParagraphs.length > 0) {
    emitChunk();
  }

  return chunks;
}
