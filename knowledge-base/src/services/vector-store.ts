// ---------------------------------------------------------------------------
// Vector store — cosine similarity search with IndexedDB persistence (SSOT §4.2)
// ---------------------------------------------------------------------------

import type { KBVector } from '../types.js';

export type VectorSearchResult = {
  chunkId: string;
  documentId: string;
  score: number;
};

/**
 * Cosine similarity between two vectors.
 * Returns value in [-1, 1]; 1 = identical direction.
 */
export function cosineSimilarity(a: number[] | Float32Array, b: number[] | Float32Array): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    dotProduct += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;
  return dotProduct / denominator;
}

/**
 * In-memory vector store backed by a Map.
 * Vectors are loaded from IndexedDB on init and kept in memory for fast search.
 */
export class VectorStore {
  private store = new Map<string, KBVector>();

  /** Load vectors into memory. */
  loadAll(vectors: KBVector[]): void {
    this.store.clear();
    for (const v of vectors) {
      this.store.set(v.id, v);
    }
  }

  /** Add a single vector. */
  add(vector: KBVector): void {
    this.store.set(vector.id, vector);
  }

  /** Add multiple vectors. */
  addBatch(vectors: KBVector[]): void {
    for (const v of vectors) {
      this.store.set(v.id, v);
    }
  }

  /** Remove all vectors for a given document. */
  removeByDocumentId(documentId: string): void {
    for (const [id, v] of this.store) {
      if (v.documentId === documentId) {
        this.store.delete(id);
      }
    }
  }

  get size(): number {
    return this.store.size;
  }

  /**
   * Search for top-K most similar vectors.
   *
   * @param queryEmbedding - query vector (number[])
   * @param topK - max results
   * @param threshold - minimum cosine similarity
   * @param documentIds - optional filter to specific documents
   */
  search(
    queryEmbedding: number[],
    topK: number,
    threshold: number,
    documentIds?: string[],
  ): VectorSearchResult[] {
    const docIdSet = documentIds ? new Set(documentIds) : null;
    const results: VectorSearchResult[] = [];

    for (const vector of this.store.values()) {
      if (docIdSet && !docIdSet.has(vector.documentId)) continue;

      const score = cosineSimilarity(queryEmbedding, vector.embedding);
      if (score >= threshold) {
        results.push({
          chunkId: vector.chunkId,
          documentId: vector.documentId,
          score,
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  clear(): void {
    this.store.clear();
  }
}
