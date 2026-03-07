import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/logging.js', () => ({
  createKBFlowId: () => 'kb-flow-test',
  emitKBLog: () => undefined,
}));

import { embedChunks } from '../../src/services/embedding-pipeline.js';
import type { EmbeddingClient, KBChunk } from '../../src/types.js';

function buildChunk(index: number): KBChunk {
  return {
    id: `chunk-${index}`,
    documentId: 'doc-1',
    text: `Chunk ${index} content`,
    chunkIndex: index,
    tokenCount: 4,
    metadata: {},
  };
}

function createEmbeddingClient(
  generateEmbedding: EmbeddingClient['generateEmbedding'],
): EmbeddingClient {
  return {
    generateEmbedding,
  };
}

describe('embedding-pipeline', () => {
  it('stores the resolved embedding model on vectors', async () => {
    const client = createEmbeddingClient(vi.fn<EmbeddingClient['generateEmbedding']>().mockResolvedValue({
      embeddings: [
        [1, 0],
        [0, 1],
      ],
      model: 'openai/text-embedding-3-small',
    }));

    const vectors = await embedChunks({
      chunks: [buildChunk(0), buildChunk(1)],
      embeddingClient: client,
      generateId: () => 'vector-id',
      documentId: 'doc-1',
    });

    expect(vectors).toHaveLength(2);
    expect(vectors[0]?.model).toBe('openai/text-embedding-3-small');
    expect(vectors[0]?.dimensions).toBe(2);
  });

  it('fails closed when embedding batches resolve to different models', async () => {
    const chunks = Array.from({ length: 33 }, (_, index) => buildChunk(index));
    const generateEmbedding = vi.fn<EmbeddingClient['generateEmbedding']>()
      .mockResolvedValueOnce({
        embeddings: Array.from({ length: 32 }, () => [1, 0]),
        model: 'openai/text-embedding-3-small',
      })
      .mockResolvedValueOnce({
        embeddings: [[1, 0]],
        model: 'openai/text-embedding-3-large',
      });

    await expect(embedChunks({
      chunks,
      embeddingClient: createEmbeddingClient(generateEmbedding),
      generateId: () => 'vector-id',
      documentId: 'doc-1',
    })).rejects.toThrow('KB_EMBEDDING_MODEL_MISMATCH');
  });
});
