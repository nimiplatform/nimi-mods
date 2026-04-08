// ---------------------------------------------------------------------------
// Document actions — import, delete, retry
// ---------------------------------------------------------------------------

import { useCallback } from 'react';
import type { KBDocument, EmbeddingClient } from '../types.js';
import type { RuntimeRouteBinding } from '@nimiplatform/sdk/mod';
import { useKnowledgeBaseStore } from '../state/knowledge-base-store.js';
import { processDocument } from '../services/document-pipeline.js';
import { guessMimeType } from '../services/document-parser.js';
import { createKBFlowId, emitKBLog } from '../logging.js';
import type { KBUiState } from './use-kb-ui-state.js';

function generateId(): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `kb_${t}${r}`;
}

export function useDocumentActions(input: {
  embeddingClient: EmbeddingClient;
  chatBinding?: RuntimeRouteBinding;
  embeddingBinding?: RuntimeRouteBinding;
  ui: KBUiState;
}) {
  const { embeddingClient, chatBinding, embeddingBinding, ui } = input;
  const store = useKnowledgeBaseStore();

  const importFile = useCallback(async (file: File) => {
    const flowId = createKBFlowId('import-file');
    ui.setIsImporting(true);
    ui.clearError();

    emitKBLog({
      level: 'info',
      message: 'action:import-file:start',
      flowId,
      source: 'useDocumentActions.importFile',
      details: { fileName: file.name, fileSize: file.size, fileType: file.type },
    });

    try {
      const mimeType = file.type || guessMimeType(file.name);
      emitKBLog({
        level: 'debug',
        message: 'action:import-file:mime-resolved',
        flowId,
        source: 'useDocumentActions.importFile',
        details: { mimeType, originalType: file.type, guessed: !file.type },
      });

      const now = new Date().toISOString();
      const doc: KBDocument = {
        id: generateId(),
        title: file.name.replace(/\.[^/.]+$/, ''),
        sourceUri: file.name,
        sourceKind: 'file',
        mimeType,
        fileSize: file.size,
        status: 'pending',
        chunkCount: 0,
        tags: [],
        createdAt: now,
        updatedAt: now,
      };

      store.addDocument(doc);
      await store.persistDocument(doc);

      const rawContent = await file.text();
      emitKBLog({
        level: 'debug',
        message: 'action:import-file:content-read',
        flowId,
        source: 'useDocumentActions.importFile',
        details: { docId: doc.id, contentLength: rawContent.length },
      });

      const settings = store.settings;
      emitKBLog({
        level: 'info',
        message: 'action:import-file:settings-snapshot',
        flowId,
        source: 'useDocumentActions.importFile',
        details: {
          docId: doc.id,
          aiConfigChatBinding: chatBinding || null,
          aiConfigEmbeddingBinding: embeddingBinding || null,
          chunkSize: settings.chunkSize,
          chunkOverlap: settings.chunkOverlap,
        },
      });

      await processDocument({
        document: doc,
        rawContent,
        settings,
        embeddingClient,
        generateId,
        callbacks: {
          onStatusChange: (docId, status, errorReason) => {
            emitKBLog({
              level: errorReason ? 'warn' : 'debug',
              message: `action:import-file:status-change:${status}`,
              flowId,
              source: 'useDocumentActions.importFile',
              details: { docId, status, errorReason },
            });
            store.updateDocumentStatus(docId, status, errorReason);
          },
          onChunksCreated: async (docId, chunks) => {
            emitKBLog({
              level: 'info',
              message: 'action:import-file:chunks-created',
              flowId,
              source: 'useDocumentActions.importFile',
              details: { docId, chunkCount: chunks.length },
            });
            await store.addChunks(chunks);
            store.updateDocument(docId, { chunkCount: chunks.length });
          },
          onVectorsCreated: async (docId, vectors) => {
            emitKBLog({
              level: 'info',
              message: 'action:import-file:vectors-created',
              flowId,
              source: 'useDocumentActions.importFile',
              details: { docId, vectorCount: vectors.length },
            });
            await store.addVectors(vectors);
          },
        },
      });

      emitKBLog({
        level: 'info',
        message: 'action:import-file:done',
        flowId,
        source: 'useDocumentActions.importFile',
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const errStack = err instanceof Error ? err.stack : undefined;
      emitKBLog({
        level: 'error',
        message: 'action:import-file:error',
        flowId,
        source: 'useDocumentActions.importFile',
        details: { error: errMsg, stack: errStack },
      });
      ui.setError(errMsg);
    } finally {
      ui.setIsImporting(false);
    }
  }, [chatBinding, embeddingBinding, embeddingClient, store, ui]);

  const importText = useCallback(async (text: string, title?: string) => {
    const flowId = createKBFlowId('import-text');
    ui.setIsImporting(true);
    ui.clearError();

    emitKBLog({
      level: 'info',
      message: 'action:import-text:start',
      flowId,
      source: 'useDocumentActions.importText',
      details: { textLength: text.length, title },
    });

    try {
      const now = new Date().toISOString();
      const doc: KBDocument = {
        id: generateId(),
        title: title || `Pasted text ${new Date().toLocaleDateString()}`,
        sourceUri: 'paste',
        sourceKind: 'paste',
        mimeType: 'text/plain',
        fileSize: new Blob([text]).size,
        status: 'pending',
        chunkCount: 0,
        tags: [],
        createdAt: now,
        updatedAt: now,
      };

      store.addDocument(doc);
      await store.persistDocument(doc);
      emitKBLog({
        level: 'info',
        message: 'action:import-text:settings-snapshot',
        flowId,
        source: 'useDocumentActions.importText',
        details: {
          docId: doc.id,
          aiConfigChatBinding: chatBinding || null,
          aiConfigEmbeddingBinding: embeddingBinding || null,
          chunkSize: store.settings.chunkSize,
          chunkOverlap: store.settings.chunkOverlap,
        },
      });

      await processDocument({
        document: doc,
        rawContent: text,
        settings: store.settings,
        embeddingClient,
        generateId,
        callbacks: {
          onStatusChange: (docId, status, errorReason) => {
            store.updateDocumentStatus(docId, status, errorReason);
          },
          onChunksCreated: async (docId, chunks) => {
            await store.addChunks(chunks);
            store.updateDocument(docId, { chunkCount: chunks.length });
          },
          onVectorsCreated: async (_docId, vectors) => {
            await store.addVectors(vectors);
          },
        },
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      emitKBLog({
        level: 'error',
        message: 'action:import-text:error',
        flowId,
        source: 'useDocumentActions.importText',
        details: { error: errMsg },
      });
      ui.setError(errMsg);
    } finally {
      ui.setIsImporting(false);
    }
  }, [chatBinding, embeddingBinding, embeddingClient, store, ui]);

  const importUrl = useCallback(async (url: string, title?: string) => {
    const flowId = createKBFlowId('import-url');
    ui.setIsImporting(true);
    ui.clearError();

    emitKBLog({
      level: 'info',
      message: 'action:import-url:start',
      flowId,
      source: 'useDocumentActions.importUrl',
      details: { url, title },
    });

    try {
      const response = await fetch(url);
      const content = await response.text();
      const contentType = response.headers.get('content-type') ?? 'text/html';
      const mimeType = contentType.split(';')[0]!.trim();

      const now = new Date().toISOString();
      const doc: KBDocument = {
        id: generateId(),
        title: title || new URL(url).hostname,
        sourceUri: url,
        sourceKind: 'url',
        mimeType,
        fileSize: new Blob([content]).size,
        status: 'pending',
        chunkCount: 0,
        tags: [],
        createdAt: now,
        updatedAt: now,
      };

      store.addDocument(doc);
      await store.persistDocument(doc);
      emitKBLog({
        level: 'info',
        message: 'action:import-url:settings-snapshot',
        flowId,
        source: 'useDocumentActions.importUrl',
        details: {
          docId: doc.id,
          aiConfigChatBinding: chatBinding || null,
          aiConfigEmbeddingBinding: embeddingBinding || null,
          chunkSize: store.settings.chunkSize,
          chunkOverlap: store.settings.chunkOverlap,
        },
      });

      await processDocument({
        document: doc,
        rawContent: content,
        settings: store.settings,
        embeddingClient,
        generateId,
        callbacks: {
          onStatusChange: (docId, status, errorReason) => {
            store.updateDocumentStatus(docId, status, errorReason);
          },
          onChunksCreated: async (docId, chunks) => {
            await store.addChunks(chunks);
            store.updateDocument(docId, { chunkCount: chunks.length });
          },
          onVectorsCreated: async (_docId, vectors) => {
            await store.addVectors(vectors);
          },
        },
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      emitKBLog({
        level: 'error',
        message: 'action:import-url:error',
        flowId,
        source: 'useDocumentActions.importUrl',
        details: { error: errMsg, url },
      });
      ui.setError(errMsg);
    } finally {
      ui.setIsImporting(false);
    }
  }, [chatBinding, embeddingBinding, embeddingClient, store, ui]);

  const deleteDocument = useCallback(async (docId: string) => {
    emitKBLog({
      level: 'info',
      message: 'action:delete-document',
      source: 'useDocumentActions.deleteDocument',
      details: { docId },
    });
    await store.removeDocument(docId);
  }, [store]);

  const retryDocument = useCallback(async (docId: string) => {
    const doc = store.documents.find((d) => d.id === docId);
    if (!doc || doc.status !== 'error') return;
    ui.setError('Please re-import the document to retry processing.');
  }, [store, ui]);

  return {
    importFile,
    importText,
    importUrl,
    deleteDocument,
    retryDocument,
  };
}
