import { createModKvStore, createModStorageClient, type ModKvStore } from '@nimiplatform/sdk/mod';
import { PRODUCT_STUDIO_MOD_ID } from '../contracts.js';
import type { ProductStudioSnapshot } from '../types.js';

const SNAPSHOT_KEY = 'default';

type PersistedSnapshotRow = {
  key: string;
  snapshot: ProductStudioSnapshot;
  updatedAt: string;
};

let snapshotStore: ModKvStore | null = null;

function getSnapshotStore(): ModKvStore {
  if (!snapshotStore) {
    snapshotStore = createModKvStore({
      storage: createModStorageClient(PRODUCT_STUDIO_MOD_ID),
      namespace: 'product-studio.snapshot',
    });
  }
  return snapshotStore;
}

function cloneSnapshot(snapshot: ProductStudioSnapshot): ProductStudioSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as ProductStudioSnapshot;
}

export async function loadProductStudioSnapshot(): Promise<ProductStudioSnapshot | null> {
  const row = await getSnapshotStore().getJson<PersistedSnapshotRow>(SNAPSHOT_KEY);
  if (!row?.snapshot) {
    return null;
  }
  return cloneSnapshot(row.snapshot);
}

export async function persistProductStudioSnapshot(snapshot: ProductStudioSnapshot): Promise<void> {
  const row: PersistedSnapshotRow = {
    key: SNAPSHOT_KEY,
    snapshot: cloneSnapshot(snapshot),
    updatedAt: new Date().toISOString(),
  };
  await getSnapshotStore().setJson(SNAPSHOT_KEY, row);
}
