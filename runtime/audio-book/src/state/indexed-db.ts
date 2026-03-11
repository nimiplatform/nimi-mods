// ---------------------------------------------------------------------------
// IndexedDB wrapper for Audio Book persistence
// ---------------------------------------------------------------------------
// DB: 'audio-book' v1
// Stores:
//   'projects' — key: projectId, value: VoiceProject JSON
//   'audio'    — key: '{projectId}:{segmentId}', value: Blob
// ---------------------------------------------------------------------------

import type { VoiceProject } from '../types.js';

const DB_NAME = 'audio-book';
const DB_VERSION = 1;
const STORE_PROJECTS = 'projects';
const STORE_AUDIO = 'audio';

let dbInstance: IDBDatabase | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_AUDIO)) {
        db.createObjectStore(STORE_AUDIO);
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
// Project CRUD
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

export async function dbPutProject(project: VoiceProject): Promise<void> {
  const db = await openDb();
  await idbRequest(txStore(db, STORE_PROJECTS, 'readwrite').put(project));
}

export async function dbGetProject(projectId: string): Promise<VoiceProject | undefined> {
  const db = await openDb();
  return idbRequest(txStore(db, STORE_PROJECTS, 'readonly').get(projectId));
}

export async function dbDeleteProject(projectId: string): Promise<void> {
  const db = await openDb();
  await idbRequest(txStore(db, STORE_PROJECTS, 'readwrite').delete(projectId));
}

export async function dbListProjects(): Promise<VoiceProject[]> {
  const db = await openDb();
  return idbRequest(txStore(db, STORE_PROJECTS, 'readonly').getAll());
}

// ---------------------------------------------------------------------------
// Audio blob storage
// ---------------------------------------------------------------------------

function audioKey(projectId: string, segmentId: string): string {
  return `${projectId}:${segmentId}`;
}

export async function dbPutAudio(projectId: string, segmentId: string, blob: Blob): Promise<void> {
  const db = await openDb();
  await idbRequest(
    txStore(db, STORE_AUDIO, 'readwrite').put(blob, audioKey(projectId, segmentId)),
  );
}

export async function dbGetAudio(projectId: string, segmentId: string): Promise<Blob | undefined> {
  const db = await openDb();
  return idbRequest(
    txStore(db, STORE_AUDIO, 'readonly').get(audioKey(projectId, segmentId)),
  );
}

export async function dbDeleteProjectAudio(projectId: string): Promise<void> {
  const db = await openDb();
  const store = txStore(db, STORE_AUDIO, 'readwrite');
  const allKeys: IDBValidKey[] = await idbRequest(store.getAllKeys());
  const prefix = `${projectId}:`;
  for (const key of allKeys) {
    if (typeof key === 'string' && key.startsWith(prefix)) {
      store.delete(key);
    }
  }
}
