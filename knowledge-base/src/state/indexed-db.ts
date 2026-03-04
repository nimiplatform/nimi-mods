// ---------------------------------------------------------------------------
// IndexedDB wrapper for Knowledge Base persistence (SSOT §9.6)
// ---------------------------------------------------------------------------
// DB: 'knowledge-base-db' v1
// Stores:
//   'documents'     — key: id, value: KBDocument
//   'chunks'        — key: id, value: KBChunk, index: documentId
//   'vectors'       — key: id, value: KBVector (embedding as Float32Array), index: documentId
//   'conversations' — key: id, value: KBConversation
//   'settings'      — key: 'default', value: KBSettings
// ---------------------------------------------------------------------------

import type { KBDocument, KBChunk, KBVector, KBConversation, KBSettings } from '../types.js';

const DB_NAME = 'knowledge-base-db';
const DB_VERSION = 1;
const STORE_DOCUMENTS = 'documents';
const STORE_CHUNKS = 'chunks';
const STORE_VECTORS = 'vectors';
const STORE_CONVERSATIONS = 'conversations';
const STORE_SETTINGS = 'settings';

let dbInstance: IDBDatabase | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_DOCUMENTS)) {
        db.createObjectStore(STORE_DOCUMENTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_CHUNKS)) {
        const store = db.createObjectStore(STORE_CHUNKS, { keyPath: 'id' });
        store.createIndex('documentId', 'documentId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_VECTORS)) {
        const store = db.createObjectStore(STORE_VECTORS, { keyPath: 'id' });
        store.createIndex('documentId', 'documentId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_CONVERSATIONS)) {
        db.createObjectStore(STORE_CONVERSATIONS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS);
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onerror = () => reject(request.error);
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function txStore(db: IDBDatabase, store: string, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(store, mode).objectStore(store);
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txMultiStore(db: IDBDatabase, stores: string[], mode: IDBTransactionMode): IDBTransaction {
  return db.transaction(stores, mode);
}

// ---------------------------------------------------------------------------
// Document CRUD
// ---------------------------------------------------------------------------

export async function dbPutDocument(doc: KBDocument): Promise<void> {
  const db = await openDb();
  await idbRequest(txStore(db, STORE_DOCUMENTS, 'readwrite').put(doc));
}

export async function dbGetDocument(docId: string): Promise<KBDocument | undefined> {
  const db = await openDb();
  return idbRequest(txStore(db, STORE_DOCUMENTS, 'readonly').get(docId));
}

export async function dbListDocuments(): Promise<KBDocument[]> {
  const db = await openDb();
  return idbRequest(txStore(db, STORE_DOCUMENTS, 'readonly').getAll());
}

export async function dbDeleteDocument(docId: string): Promise<void> {
  const db = await openDb();
  const tx = txMultiStore(db, [STORE_DOCUMENTS, STORE_CHUNKS, STORE_VECTORS], 'readwrite');

  // Delete document
  tx.objectStore(STORE_DOCUMENTS).delete(docId);

  // Delete associated chunks
  const chunkIndex = tx.objectStore(STORE_CHUNKS).index('documentId');
  const chunkKeys = await idbRequest(chunkIndex.getAllKeys(docId));
  for (const key of chunkKeys) {
    tx.objectStore(STORE_CHUNKS).delete(key);
  }

  // Delete associated vectors
  const vectorIndex = tx.objectStore(STORE_VECTORS).index('documentId');
  const vectorKeys = await idbRequest(vectorIndex.getAllKeys(docId));
  for (const key of vectorKeys) {
    tx.objectStore(STORE_VECTORS).delete(key);
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------------------------------------------------------------------------
// Chunk CRUD
// ---------------------------------------------------------------------------

export async function dbPutChunks(chunks: KBChunk[]): Promise<void> {
  const db = await openDb();
  const store = txStore(db, STORE_CHUNKS, 'readwrite');
  for (const chunk of chunks) {
    store.put(chunk);
  }
  await new Promise<void>((resolve, reject) => {
    store.transaction.oncomplete = () => resolve();
    store.transaction.onerror = () => reject(store.transaction.error);
  });
}

export async function dbGetChunksByDocumentId(documentId: string): Promise<KBChunk[]> {
  const db = await openDb();
  const store = txStore(db, STORE_CHUNKS, 'readonly');
  const index = store.index('documentId');
  return idbRequest(index.getAll(documentId));
}

export async function dbGetAllChunks(): Promise<KBChunk[]> {
  const db = await openDb();
  return idbRequest(txStore(db, STORE_CHUNKS, 'readonly').getAll());
}

export async function dbGetChunk(chunkId: string): Promise<KBChunk | undefined> {
  const db = await openDb();
  return idbRequest(txStore(db, STORE_CHUNKS, 'readonly').get(chunkId));
}

// ---------------------------------------------------------------------------
// Vector CRUD
// ---------------------------------------------------------------------------

export async function dbPutVectors(vectors: KBVector[]): Promise<void> {
  const db = await openDb();
  const store = txStore(db, STORE_VECTORS, 'readwrite');
  for (const vector of vectors) {
    // Serialize Float32Array to regular array for IndexedDB compatibility
    const serialized = {
      ...vector,
      embedding: Array.from(vector.embedding),
    };
    store.put(serialized);
  }
  await new Promise<void>((resolve, reject) => {
    store.transaction.oncomplete = () => resolve();
    store.transaction.onerror = () => reject(store.transaction.error);
  });
}

export async function dbGetAllVectors(): Promise<KBVector[]> {
  const db = await openDb();
  const raw: unknown[] = await idbRequest(txStore(db, STORE_VECTORS, 'readonly').getAll());
  // Deserialize arrays back to Float32Array
  return raw.map((item) => {
    const record = item as Record<string, unknown>;
    return {
      ...record,
      embedding: new Float32Array(record.embedding as number[]),
    } as KBVector;
  });
}

// ---------------------------------------------------------------------------
// Conversation CRUD
// ---------------------------------------------------------------------------

export async function dbPutConversation(conv: KBConversation): Promise<void> {
  const db = await openDb();
  await idbRequest(txStore(db, STORE_CONVERSATIONS, 'readwrite').put(conv));
}

export async function dbGetConversation(convId: string): Promise<KBConversation | undefined> {
  const db = await openDb();
  return idbRequest(txStore(db, STORE_CONVERSATIONS, 'readonly').get(convId));
}

export async function dbListConversations(): Promise<KBConversation[]> {
  const db = await openDb();
  return idbRequest(txStore(db, STORE_CONVERSATIONS, 'readonly').getAll());
}

export async function dbDeleteConversation(convId: string): Promise<void> {
  const db = await openDb();
  await idbRequest(txStore(db, STORE_CONVERSATIONS, 'readwrite').delete(convId));
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function dbGetSettings(): Promise<KBSettings | undefined> {
  const db = await openDb();
  return idbRequest(txStore(db, STORE_SETTINGS, 'readonly').get('default'));
}

export async function dbPutSettings(settings: KBSettings): Promise<void> {
  const db = await openDb();
  await idbRequest(txStore(db, STORE_SETTINGS, 'readwrite').put(settings, 'default'));
}
