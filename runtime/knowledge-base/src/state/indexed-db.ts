import { createModKvStore, createModStorageClient, type ModKvStore } from '@nimiplatform/sdk/mod/storage';
import { KB_MOD_ID } from '../contracts.js';
import type { KBDocument, KBChunk, KBVector, KBConversation, KBSettings } from '../types.js';

type KnowledgeBaseSnapshot = {
  documents: KBDocument[];
  chunks: KBChunk[];
  vectors: Array<Omit<KBVector, 'embedding'> & { embedding: number[] }>;
  conversations: KBConversation[];
  settings?: KBSettings;
};

const SNAPSHOT_KEY = 'snapshot';
let kbStateStore: ModKvStore | null = null;

function getKbStateStore(): ModKvStore {
  if (!kbStateStore) {
    kbStateStore = createModKvStore({
      storage: createModStorageClient(KB_MOD_ID),
      namespace: 'knowledge-base.state',
    });
  }
  return kbStateStore;
}

async function loadSnapshot(): Promise<KnowledgeBaseSnapshot> {
  return await getKbStateStore().getJson<KnowledgeBaseSnapshot>(SNAPSHOT_KEY) || {
    documents: [],
    chunks: [],
    vectors: [],
    conversations: [],
  };
}

async function saveSnapshot(snapshot: KnowledgeBaseSnapshot): Promise<void> {
  await getKbStateStore().setJson(SNAPSHOT_KEY, snapshot);
}

export async function openDb(): Promise<null> {
  return null;
}

export async function dbPutDocument(doc: KBDocument): Promise<void> {
  const snapshot = await loadSnapshot();
  snapshot.documents = [
    ...snapshot.documents.filter((item) => item.id !== doc.id),
    doc,
  ];
  await saveSnapshot(snapshot);
}

export async function dbGetDocument(docId: string): Promise<KBDocument | undefined> {
  const snapshot = await loadSnapshot();
  return snapshot.documents.find((item) => item.id === docId);
}

export async function dbListDocuments(): Promise<KBDocument[]> {
  return (await loadSnapshot()).documents;
}

export async function dbDeleteDocument(docId: string): Promise<void> {
  const snapshot = await loadSnapshot();
  snapshot.documents = snapshot.documents.filter((item) => item.id !== docId);
  snapshot.chunks = snapshot.chunks.filter((item) => item.documentId !== docId);
  snapshot.vectors = snapshot.vectors.filter((item) => item.documentId !== docId);
  await saveSnapshot(snapshot);
}

export async function dbPutChunks(chunks: KBChunk[]): Promise<void> {
  const snapshot = await loadSnapshot();
  const removedIds = new Set(chunks.map((item) => item.id));
  snapshot.chunks = [
    ...snapshot.chunks.filter((item) => !removedIds.has(item.id)),
    ...chunks,
  ];
  await saveSnapshot(snapshot);
}

export async function dbGetChunksByDocumentId(documentId: string): Promise<KBChunk[]> {
  return (await loadSnapshot()).chunks.filter((item) => item.documentId === documentId);
}

export async function dbGetAllChunks(): Promise<KBChunk[]> {
  return (await loadSnapshot()).chunks;
}

export async function dbGetChunk(chunkId: string): Promise<KBChunk | undefined> {
  return (await loadSnapshot()).chunks.find((item) => item.id === chunkId);
}

export async function dbPutVectors(vectors: KBVector[]): Promise<void> {
  const snapshot = await loadSnapshot();
  const removedIds = new Set(vectors.map((item) => item.id));
  snapshot.vectors = [
    ...snapshot.vectors.filter((item) => !removedIds.has(item.id)),
    ...vectors.map((item) => ({
      ...item,
      embedding: Array.from(item.embedding),
    })),
  ];
  await saveSnapshot(snapshot);
}

export async function dbGetAllVectors(): Promise<KBVector[]> {
  return (await loadSnapshot()).vectors.map((item) => ({
    ...item,
    embedding: new Float32Array(item.embedding),
  }));
}

export async function dbPutConversation(conv: KBConversation): Promise<void> {
  const snapshot = await loadSnapshot();
  snapshot.conversations = [
    ...snapshot.conversations.filter((item) => item.id !== conv.id),
    conv,
  ];
  await saveSnapshot(snapshot);
}

export async function dbGetConversation(convId: string): Promise<KBConversation | undefined> {
  return (await loadSnapshot()).conversations.find((item) => item.id === convId);
}

export async function dbListConversations(): Promise<KBConversation[]> {
  return (await loadSnapshot()).conversations;
}

export async function dbDeleteConversation(convId: string): Promise<void> {
  const snapshot = await loadSnapshot();
  snapshot.conversations = snapshot.conversations.filter((item) => item.id !== convId);
  await saveSnapshot(snapshot);
}

export async function dbGetSettings(): Promise<KBSettings | undefined> {
  return (await loadSnapshot()).settings;
}

export async function dbPutSettings(settings: KBSettings): Promise<void> {
  const snapshot = await loadSnapshot();
  snapshot.settings = settings;
  await saveSnapshot(snapshot);
}
