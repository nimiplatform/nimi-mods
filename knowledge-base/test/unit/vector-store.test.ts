import { describe, expect, it } from 'vitest';
import { VectorStore, cosineSimilarity } from '../../src/services/vector-store.js';
import type { KBVector } from '../../src/types.js';

function buildVector(id: string, documentId: string, chunkId: string, embedding: number[]): KBVector {
  return {
    id,
    documentId,
    chunkId,
    embedding,
    dimension: embedding.length,
    createdAt: '2026-03-06T00:00:00.000Z',
  };
}

describe('vector-store', () => {
  it('computes cosine similarity deterministically', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });

  it('returns top-k search results sorted by score', () => {
    const store = new VectorStore();
    store.loadAll([
      buildVector('v1', 'doc-1', 'chunk-1', [1, 0]),
      buildVector('v2', 'doc-1', 'chunk-2', [0.9, 0.1]),
      buildVector('v3', 'doc-2', 'chunk-3', [0, 1]),
    ]);

    const results = store.search([1, 0], 2, 0.1);

    expect(results).toHaveLength(2);
    expect(results[0]?.chunkId).toBe('chunk-1');
    expect(results[1]?.chunkId).toBe('chunk-2');
    expect(results[0]!.score).toBeGreaterThanOrEqual(results[1]!.score);
  });

  it('filters by document scope and supports deletion by document', () => {
    const store = new VectorStore();
    store.addBatch([
      buildVector('v1', 'doc-1', 'chunk-1', [1, 0]),
      buildVector('v2', 'doc-2', 'chunk-2', [1, 0]),
    ]);

    const scoped = store.search([1, 0], 10, 0.1, ['doc-2']);
    expect(scoped).toHaveLength(1);
    expect(scoped[0]?.documentId).toBe('doc-2');

    store.removeByDocumentId('doc-2');
    expect(store.size).toBe(1);
    expect(store.search([1, 0], 10, 0.1, ['doc-2'])).toHaveLength(0);
  });
});
