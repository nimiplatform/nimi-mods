import type { DailyOutfitSnapshot } from '../types.js';

const DAILY_OUTFIT_DB_NAME = 'nimi.daily-outfit.v1';
const DAILY_OUTFIT_DB_VERSION = 1;
const STORE_SNAPSHOTS = 'snapshots';
const SNAPSHOT_KEY = 'default';

type PersistedSnapshotRow = {
  key: string;
  snapshot: DailyOutfitSnapshot;
  updatedAt: string;
};

let dbPromise: Promise<IDBDatabase | null> | null = null;
let memoryRow: PersistedSnapshotRow | null = null;

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

function cloneSnapshot(snapshot: DailyOutfitSnapshot): DailyOutfitSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as DailyOutfitSnapshot;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('DAILY_OUTFIT_IDB_REQUEST_FAILED'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('DAILY_OUTFIT_IDB_TX_FAILED'));
    transaction.onabort = () => reject(transaction.error || new Error('DAILY_OUTFIT_IDB_TX_ABORTED'));
  });
}

async function openDatabase(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) {
    return null;
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      const request = indexedDB.open(DAILY_OUTFIT_DB_NAME, DAILY_OUTFIT_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
          db.createObjectStore(STORE_SNAPSHOTS, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
  }
  return dbPromise;
}

export async function loadDailyOutfitSnapshotFromIndexedDb(): Promise<DailyOutfitSnapshot | null> {
  const db = await openDatabase();
  if (!db) {
    return memoryRow ? cloneSnapshot(memoryRow.snapshot) : null;
  }
  const tx = db.transaction(STORE_SNAPSHOTS, 'readonly');
  const row = await requestToPromise(tx.objectStore(STORE_SNAPSHOTS).get(SNAPSHOT_KEY)) as PersistedSnapshotRow | undefined;
  return row?.snapshot ? cloneSnapshot(row.snapshot) : null;
}

export async function persistDailyOutfitSnapshotToIndexedDb(snapshot: DailyOutfitSnapshot): Promise<void> {
  const row: PersistedSnapshotRow = {
    key: SNAPSHOT_KEY,
    snapshot: cloneSnapshot(snapshot),
    updatedAt: new Date().toISOString(),
  };
  const db = await openDatabase();
  if (!db) {
    memoryRow = row;
    return;
  }
  const tx = db.transaction(STORE_SNAPSHOTS, 'readwrite');
  tx.objectStore(STORE_SNAPSHOTS).put(row);
  await transactionDone(tx);
}
