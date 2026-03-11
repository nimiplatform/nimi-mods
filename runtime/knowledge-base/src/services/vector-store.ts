// ---------------------------------------------------------------------------
// Vector store — cosine similarity search with IndexedDB persistence (SSOT §4.2)
// ---------------------------------------------------------------------------

import type { KBVector } from '../types.js';

export type VectorSearchResult = {
  chunkId: string;
  documentId: string;
  score: number;
};

export type VectorSearchDiagnostics = {
  scannedVectors: number;
  comparedVectors: number;
  dimensionMismatchCount: number;
  modelMismatchCount: number;
  unknownModelCount: number;
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
    return this.searchWithDiagnostics(queryEmbedding, topK, threshold, documentIds).results;
  }

  searchWithDiagnostics(
    queryEmbedding: number[],
    topK: number,
    threshold: number,
    documentIds?: string[],
    options?: {
      expectedDimensions?: number;
      expectedModel?: string;
    },
  ): {
    results: VectorSearchResult[];
    diagnostics: VectorSearchDiagnostics;
  } {
    const docIdSet = documentIds ? new Set(documentIds) : null;
    const results: VectorSearchResult[] = [];
    const expectedDimensions = options?.expectedDimensions || queryEmbedding.length;
    const expectedModel = String(options?.expectedModel || '').trim();
    const diagnostics: VectorSearchDiagnostics = {
      scannedVectors: 0,
      comparedVectors: 0,
      dimensionMismatchCount: 0,
      modelMismatchCount: 0,
      unknownModelCount: 0,
    };

    for (const vector of this.store.values()) {
      if (docIdSet && !docIdSet.has(vector.documentId)) continue;
      diagnostics.scannedVectors += 1;

      const vectorDimensions = Number.isFinite(vector.dimensions) && vector.dimensions > 0
        ? vector.dimensions
        : vector.embedding.length;
      if (vectorDimensions !== expectedDimensions) {
        diagnostics.dimensionMismatchCount += 1;
        continue;
      }

      const vectorModel = String(vector.model || '').trim();
      if (expectedModel && vectorModel && vectorModel !== expectedModel) {
        diagnostics.modelMismatchCount += 1;
        continue;
      }
      if (expectedModel && !vectorModel) {
        diagnostics.unknownModelCount += 1;
      }

      const score = cosineSimilarity(queryEmbedding, vector.embedding);
      diagnostics.comparedVectors += 1;
      if (score >= threshold) {
        results.push({
          chunkId: vector.chunkId,
          documentId: vector.documentId,
          score,
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return {
      results: results.slice(0, topK),
      diagnostics,
    };
  }

  clear(): void {
    this.store.clear();
  }
}
