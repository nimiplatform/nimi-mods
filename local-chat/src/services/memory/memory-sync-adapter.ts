import type { RelationMemorySlot } from '../../state/index.js';

export type MemorySyncScope = {
  viewerId: string;
  targetId: string;
  worldId?: string | null;
};

export type MemorySyncStatus = {
  state: 'unsupported' | 'idle' | 'syncing' | 'ready';
  detail?: string | null;
};

export type MemorySyncAdapter = {
  status(scope: MemorySyncScope): Promise<MemorySyncStatus>;
  push(scope: MemorySyncScope, slots: RelationMemorySlot[]): Promise<MemorySyncStatus>;
  pull(scope: MemorySyncScope): Promise<{
    status: MemorySyncStatus;
    slots: RelationMemorySlot[];
  }>;
};

const UNSUPPORTED_STATUS: MemorySyncStatus = {
  state: 'unsupported',
  detail: 'Local-chat is sync-ready, but cross-device memory sync is not connected in this build.',
};

export function createUnsupportedMemorySyncAdapter(): MemorySyncAdapter {
  return {
    async status() {
      return { ...UNSUPPORTED_STATUS };
    },
    async push() {
      return { ...UNSUPPORTED_STATUS };
    },
    async pull() {
      return {
        status: { ...UNSUPPORTED_STATUS },
        slots: [],
      };
    },
  };
}
