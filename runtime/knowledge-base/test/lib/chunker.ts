// ---------------------------------------------------------------------------
// Text Chunker for Knowledge-Base test scripts
//
// Splits text into chunks at paragraph boundaries.
// Uses rough token estimation (4 chars ~ 1 token) per SSOT §3.3.
// ---------------------------------------------------------------------------

export interface KBChunk {
  id: string;
  text: string;
  chunkIndex: number;
  tokenCount: number;
}

export interface ChunkOptions {
  /** Target chunk size in tokens. Default: 512 */
  chunkSize?: number;
  /** Overlap in tokens carried from previous chunk. Default: 64 */
  chunkOverlap?: number;
}

const CHARS_PER_TOKEN = 4;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Split text into chunks at paragraph boundaries.
 *
 * Strategy:
 * 1. Split text into paragraphs (double newline).
 * 2. Greedily accumulate paragraphs until adding the next would exceed chunkSize.
 * 3. Emit chunk, then start the next chunk with overlap from the tail paragraphs.
 * 4. Skip empty/whitespace-only chunks.
 */
export function splitIntoChunks(
  text: string,
  options?: ChunkOptions,
): KBChunk[] {
  const chunkSize = options?.chunkSize ?? 512;
  const chunkOverlap = options?.chunkOverlap ?? 64;

  // Split into paragraphs, preserving non-empty ones
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
      id: `chunk-${chunks.length}`,
      text: chunkText,
      chunkIndex: chunks.length,
      tokenCount: estimateTokens(chunkText),
    });
  }

  function computeOverlapParagraphs(): string[] {
    // Walk backwards from current paragraphs to collect ~chunkOverlap tokens
    const overlap: string[] = [];
    let overlapTokens = 0;
    for (let i = currentParagraphs.length - 1; i >= 0; i--) {
      const pTokens = estimateTokens(currentParagraphs[i]);
      if (overlapTokens + pTokens > chunkOverlap && overlap.length > 0) break;
      overlap.unshift(currentParagraphs[i]);
      overlapTokens += pTokens;
    }
    return overlap;
  }

  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para);

    // If a single paragraph exceeds chunk size, emit it as its own chunk
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
      // Emit current chunk and carry overlap
      const overlapParas = computeOverlapParagraphs();
      emitChunk();
      currentParagraphs = [...overlapParas];
      currentTokens = overlapParas.reduce(
        (sum, p) => sum + estimateTokens(p),
        0,
      );
    }

    currentParagraphs.push(para);
    currentTokens += paraTokens;
  }

  // Emit remaining
  if (currentParagraphs.length > 0) {
    emitChunk();
  }

  return chunks;
}
