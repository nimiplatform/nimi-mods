import { createModKvStore, createModStorageClient, type ModKvStore } from '@nimiplatform/sdk/mod/storage';
import { DAILY_OUTFIT_MOD_ID } from '../contracts.js';
import type { DailyOutfitSnapshot } from '../types.js';

const SNAPSHOT_KEY = 'default';

type PersistedSnapshotRow = {
  key: string;
  snapshot: DailyOutfitSnapshot;
  updatedAt: string;
};

let memoryRow: PersistedSnapshotRow | null = null;
let outfitSnapshotStore: ModKvStore | null = null;

function getOutfitSnapshotStore(): ModKvStore {
  if (!outfitSnapshotStore) {
    outfitSnapshotStore = createModKvStore({
      storage: createModStorageClient(DAILY_OUTFIT_MOD_ID),
      namespace: 'daily-outfit.snapshot',
    });
  }
  return outfitSnapshotStore;
}

function cloneSnapshot(snapshot: DailyOutfitSnapshot): DailyOutfitSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as DailyOutfitSnapshot;
}

export async function loadDailyOutfitSnapshotFromIndexedDb(): Promise<DailyOutfitSnapshot | null> {
  const row = await getOutfitSnapshotStore().getJson<PersistedSnapshotRow>(SNAPSHOT_KEY);
  if (!row) {
    return memoryRow ? cloneSnapshot(memoryRow.snapshot) : null;
  }
  return row?.snapshot ? cloneSnapshot(row.snapshot) : null;
}

export async function persistDailyOutfitSnapshotToIndexedDb(snapshot: DailyOutfitSnapshot): Promise<void> {
  const row: PersistedSnapshotRow = {
    key: SNAPSHOT_KEY,
    snapshot: cloneSnapshot(snapshot),
    updatedAt: new Date().toISOString(),
  };
  memoryRow = row;
  await getOutfitSnapshotStore().setJson(SNAPSHOT_KEY, row);
}
