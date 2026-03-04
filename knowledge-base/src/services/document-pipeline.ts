// ---------------------------------------------------------------------------
// Document pipeline — orchestrates pending → parsing → chunking → embedding → ready
// (SSOT §3.2, §9.1)
// ---------------------------------------------------------------------------

import type { KBDocument, KBDocumentStatus, KBChunk, KBVector, KBSettings, EmbeddingClient } from '../types.js';
import { parseDocument, isSupportedMimeType } from './document-parser.js';
import { splitIntoChunks } from './chunker.js';
import { embedChunks, type EmbeddingProgress } from './embedding-pipeline.js';
import { KB_ERROR_CODES } from '../contracts.js';
import { createKBFlowId, emitKBLog } from '../logging.js';

function resolveEmbeddingErrorReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || '');
  if (message.includes('AI_CONNECTOR_ID_REQUIRED')) {
    return KB_ERROR_CODES.EMBEDDING_ROUTE_UNAVAILABLE;
  }
  return KB_ERROR_CODES.EMBEDDING_FAILED;
}

export type DocumentPipelineCallbacks = {
  onStatusChange: (documentId: string, status: KBDocumentStatus, errorReason?: string) => void;
  onChunksCreated: (documentId: string, chunks: KBChunk[]) => Promise<void>;
  onVectorsCreated: (documentId: string, vectors: KBVector[]) => Promise<void>;
  onEmbeddingProgress?: (documentId: string, progress: EmbeddingProgress) => void;
};

/**
 * Run the full document processing pipeline.
 * State transitions: pending → parsing → chunking → embedding → ready
 * Any failure → error with reasonCode.
 */
export async function processDocument(input: {
  document: KBDocument;
  rawContent: string;
  settings: KBSettings;
  embeddingClient: EmbeddingClient;
  generateId: () => string;
  callbacks: DocumentPipelineCallbacks;
}): Promise<void> {
  const { document, rawContent, settings, embeddingClient, generateId, callbacks } = input;
  const docId = document.id;
  const flowId = createKBFlowId(`doc-pipeline-${docId.slice(-6)}`);

  emitKBLog({
    level: 'info',
    message: 'pipeline:start',
    flowId,
    source: 'processDocument',
    details: {
      docId,
      title: document.title,
      mimeType: document.mimeType,
      fileSize: document.fileSize,
      contentLength: rawContent.length,
    },
  });

  try {
    // Phase 1: Parsing
    callbacks.onStatusChange(docId, 'parsing');
    emitKBLog({ level: 'debug', message: 'pipeline:phase:parsing', flowId, source: 'processDocument' });

    if (!isSupportedMimeType(document.mimeType)) {
      emitKBLog({
        level: 'warn',
        message: 'pipeline:parsing:unsupported-mime',
        flowId,
        source: 'processDocument',
        details: { mimeType: document.mimeType },
      });
      callbacks.onStatusChange(docId, 'error', KB_ERROR_CODES.FORMAT_UNSUPPORTED);
      return;
    }

    let parsedText: string;
    try {
      const result = await parseDocument({
        content: rawContent,
        mimeType: document.mimeType,
      });
      parsedText = result.text;
      emitKBLog({
        level: 'debug',
        message: 'pipeline:parsing:done',
        flowId,
        source: 'processDocument',
        details: { parsedLength: parsedText.length },
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      emitKBLog({
        level: 'error',
        message: 'pipeline:parsing:error',
        flowId,
        source: 'processDocument',
        details: { error: errMsg, mimeType: document.mimeType },
      });
      const reason = errMsg === KB_ERROR_CODES.FORMAT_UNSUPPORTED
        ? KB_ERROR_CODES.FORMAT_UNSUPPORTED
        : KB_ERROR_CODES.PARSING_FAILED;
      callbacks.onStatusChange(docId, 'error', reason);
      return;
    }

    if (!parsedText.trim()) {
      emitKBLog({ level: 'warn', message: 'pipeline:parsing:empty-text', flowId, source: 'processDocument' });
      callbacks.onStatusChange(docId, 'error', KB_ERROR_CODES.PARSING_FAILED);
      return;
    }

    // Phase 2: Chunking
    callbacks.onStatusChange(docId, 'chunking');
    emitKBLog({
      level: 'debug',
      message: 'pipeline:phase:chunking',
      flowId,
      source: 'processDocument',
      details: { chunkSize: settings.chunkSize, chunkOverlap: settings.chunkOverlap },
    });

    let chunks: KBChunk[];
    try {
      chunks = splitIntoChunks(parsedText, {
        chunkSize: settings.chunkSize,
        chunkOverlap: settings.chunkOverlap,
        documentId: docId,
        generateId,
      });
      emitKBLog({
        level: 'info',
        message: 'pipeline:chunking:done',
        flowId,
        source: 'processDocument',
        details: { chunkCount: chunks.length },
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      emitKBLog({
        level: 'error',
        message: 'pipeline:chunking:error',
        flowId,
        source: 'processDocument',
        details: { error: errMsg },
      });
      callbacks.onStatusChange(docId, 'error', KB_ERROR_CODES.CHUNKING_FAILED);
      return;
    }

    if (chunks.length === 0) {
      emitKBLog({ level: 'warn', message: 'pipeline:chunking:zero-chunks', flowId, source: 'processDocument' });
      callbacks.onStatusChange(docId, 'error', KB_ERROR_CODES.CHUNKING_FAILED);
      return;
    }

    await callbacks.onChunksCreated(docId, chunks);

    // Phase 3: Embedding
    callbacks.onStatusChange(docId, 'embedding');
    emitKBLog({
      level: 'info',
      message: 'pipeline:phase:embedding',
      flowId,
      source: 'processDocument',
      details: { chunkCount: chunks.length, batchSize: 32 },
    });

    let vectors: KBVector[];
    try {
      vectors = await embedChunks({
        chunks,
        embeddingClient,
        generateId,
        documentId: docId,
        onProgress: (progress) => {
          emitKBLog({
            level: 'debug',
            message: 'pipeline:embedding:progress',
            flowId,
            source: 'processDocument',
            details: { completed: progress.completed, total: progress.total },
          });
          callbacks.onEmbeddingProgress?.(docId, progress);
        },
      });
      emitKBLog({
        level: 'info',
        message: 'pipeline:embedding:done',
        flowId,
        source: 'processDocument',
        details: { vectorCount: vectors.length, dimensions: vectors[0]?.dimensions },
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const errStack = err instanceof Error ? err.stack : undefined;
      const reason = resolveEmbeddingErrorReason(err);
      emitKBLog({
        level: 'error',
        message: 'pipeline:embedding:error',
        flowId,
        source: 'processDocument',
        details: { error: errMsg, stack: errStack, chunkCount: chunks.length, reason },
      });
      callbacks.onStatusChange(docId, 'error', reason);
      return;
    }

    await callbacks.onVectorsCreated(docId, vectors);

    // Phase 4: Ready
    callbacks.onStatusChange(docId, 'ready');
    emitKBLog({
      level: 'info',
      message: 'pipeline:complete',
      flowId,
      source: 'processDocument',
      details: { docId, chunkCount: chunks.length, vectorCount: vectors.length },
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errStack = err instanceof Error ? err.stack : undefined;
    const reason = resolveEmbeddingErrorReason(err);
    emitKBLog({
      level: 'error',
      message: 'pipeline:unexpected-error',
      flowId,
      source: 'processDocument',
      details: { error: errMsg, stack: errStack, docId, reason },
    });
    callbacks.onStatusChange(docId, 'error', reason);
  }
}
