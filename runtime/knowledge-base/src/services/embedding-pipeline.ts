// ---------------------------------------------------------------------------
// Embedding pipeline — batch embedding with yield (SSOT §3.5)
// ---------------------------------------------------------------------------

import type { KBChunk, KBVector, EmbeddingClient } from '../types.js';
import { createKBFlowId, emitKBLog } from '../logging.js';

const BATCH_SIZE = 32;

export type EmbeddingProgress = {
  completed: number;
  total: number;
  model?: string;
};

/**
 * Generate embeddings for a list of chunks in batches of 32.
 *
 * Yields progress callbacks between batches to avoid UI blocking.
 * On batch failure, throws with the failed range for retry support.
 */
export async function embedChunks(input: {
  chunks: KBChunk[];
  embeddingClient: EmbeddingClient;
  generateId: () => string;
  documentId: string;
  onProgress?: (progress: EmbeddingProgress) => void;
  startFromIndex?: number;
}): Promise<KBVector[]> {
  const { chunks, embeddingClient, generateId, documentId, onProgress, startFromIndex = 0 } = input;
  const vectors: KBVector[] = [];
  let model = '';
  let expectedDimensions: number | null = null;
  const flowId = createKBFlowId(`embed-${documentId.slice(-6)}`);

  emitKBLog({
    level: 'info',
    message: 'embedding:start',
    flowId,
    source: 'embedChunks',
    details: { documentId, totalChunks: chunks.length, startFromIndex, batchSize: BATCH_SIZE },
  });

  for (let i = startFromIndex; i < chunks.length; i += BATCH_SIZE) {
    const batchEnd = Math.min(i + BATCH_SIZE, chunks.length);
    const batch = chunks.slice(i, batchEnd);
    const texts = batch.map((c) => c.text);
    const batchIndex = Math.floor(i / BATCH_SIZE);

    emitKBLog({
      level: 'debug',
      message: 'embedding:batch:start',
      flowId,
      source: 'embedChunks',
      details: {
        batchIndex,
        batchRange: `${i}-${batchEnd - 1}`,
        textsCount: texts.length,
        firstTextPreview: texts[0]?.slice(0, 80),
      },
    });

    let result: { embeddings: number[][]; model?: string };
    try {
      result = await embeddingClient.generateEmbedding({ texts });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const errStack = err instanceof Error ? err.stack : undefined;
      emitKBLog({
        level: 'error',
        message: 'embedding:batch:error',
        flowId,
        source: 'embedChunks',
        details: {
          batchIndex,
          batchRange: `${i}-${batchEnd - 1}`,
          error: errMsg,
          stack: errStack,
          textsCount: texts.length,
        },
      });
      throw err; // Re-throw so document-pipeline can catch and set error status
    }

    const batchModel = String(result.model || '').trim();
    if (batchModel) {
      if (!model) {
        model = batchModel;
      } else if (model !== batchModel) {
        throw new Error(`KB_EMBEDDING_MODEL_MISMATCH:${model}:${batchModel}`);
      }
    }

    emitKBLog({
      level: 'debug',
      message: 'embedding:batch:done',
      flowId,
      source: 'embedChunks',
      details: {
        batchIndex,
        returnedEmbeddings: result.embeddings.length,
        firstDimensions: result.embeddings[0]?.length,
      },
    });

    for (let j = 0; j < batch.length; j++) {
      const chunk = batch[j]!;
      const embedding = result.embeddings[j];
      if (!embedding) {
        emitKBLog({
          level: 'warn',
          message: 'embedding:batch:missing-vector',
          flowId,
          source: 'embedChunks',
          details: { chunkId: chunk.id, batchOffset: j },
        });
        continue;
      }

      if (expectedDimensions === null) {
        expectedDimensions = embedding.length;
      } else if (expectedDimensions !== embedding.length) {
        throw new Error(`KB_EMBEDDING_DIMENSION_MISMATCH:${expectedDimensions}:${embedding.length}`);
      }

      vectors.push({
        id: generateId(),
        chunkId: chunk.id,
        documentId,
        embedding: new Float32Array(embedding),
        model,
        dimensions: embedding.length,
      });
    }

    // Yield to event loop between batches
    if (batchEnd < chunks.length) {
      await new Promise((r) => setTimeout(r, 0));
    }

    onProgress?.({
      completed: batchEnd,
      total: chunks.length,
      model: model || batchModel,
    });
  }

  emitKBLog({
    level: 'info',
    message: 'embedding:complete',
    flowId,
    source: 'embedChunks',
    details: { documentId, totalVectors: vectors.length },
  });

  return vectors;
}
