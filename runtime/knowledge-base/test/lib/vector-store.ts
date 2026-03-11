// ---------------------------------------------------------------------------
// In-Memory Vector Store for Knowledge-Base test scripts
//
// Pure in-memory cosine similarity search. No IndexedDB or external deps.
// ---------------------------------------------------------------------------

export interface SearchResult {
  chunkId: string;
  score: number;
}

/**
 * Compute cosine similarity between two vectors.
 * Returns a value in [-1, 1], where 1 = identical direction.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * In-memory vector store backed by a simple Map.
 */
export class InMemoryVectorStore {
  private store = new Map<string, number[]>();

  /** Add an embedding for a chunk ID. */
  add(chunkId: string, embedding: number[]): void {
    this.store.set(chunkId, embedding);
  }

  /** Number of stored vectors. */
  get size(): number {
    return this.store.size;
  }

  /**
   * Search for the top-K most similar vectors to the query embedding.
   *
   * @param queryEmbedding - The query vector
   * @param topK - Maximum number of results (default: 5)
   * @param threshold - Minimum similarity score (default: 0.0)
   * @returns Sorted results (highest score first)
   */
  search(
    queryEmbedding: number[],
    topK = 5,
    threshold = 0.0,
  ): SearchResult[] {
    const results: SearchResult[] = [];

    for (const [chunkId, embedding] of this.store) {
      const score = cosineSimilarity(queryEmbedding, embedding);
      if (score >= threshold) {
        results.push({ chunkId, score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  /** Clear all stored vectors. */
  clear(): void {
    this.store.clear();
  }
}
