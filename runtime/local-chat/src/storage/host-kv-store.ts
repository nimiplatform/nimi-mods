import {
  createModKvStore,
  createModStorageClient,
  type ModKvStore,
} from '@nimiplatform/sdk/mod';
import { LOCAL_CHAT_MOD_ID } from '../contracts.js';

const inMemoryNamespaces = new Map<string, Map<string, string>>();

function getInMemoryNamespace(namespace: string): Map<string, string> {
  const normalizedNamespace = String(namespace || '').trim();
  if (!inMemoryNamespaces.has(normalizedNamespace)) {
    inMemoryNamespaces.set(normalizedNamespace, new Map());
  }
  return inMemoryNamespaces.get(normalizedNamespace)!;
}

function createInMemoryModKvStore(namespace: string): ModKvStore {
  const entries = getInMemoryNamespace(namespace);
  return {
    get: async (key) => entries.get(String(key || '').trim()) ?? null,
    set: async (key, value) => {
      entries.set(String(key || '').trim(), String(value || ''));
    },
    delete: async (key) => {
      entries.delete(String(key || '').trim());
    },
    has: async (key) => entries.has(String(key || '').trim()),
    clear: async () => {
      entries.clear();
    },
    getJson: async <T>(key: string) => {
      const raw = entries.get(String(key || '').trim());
      if (!raw) {
        return null;
      }
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },
    setJson: async (key, value) => {
      entries.set(String(key || '').trim(), JSON.stringify(value));
    },
  };
}

function isHostMissingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const record = error as Record<string, unknown>;
  return record.reasonCode === 'SDK_MOD_HOST_MISSING'
    || String(record.message || '').includes('mod SDK host is not ready');
}

function shouldFallbackToInMemoryStore(error: unknown): boolean {
  if (isHostMissingError(error)) {
    return true;
  }
  const message = String((error as { message?: unknown } | null)?.message || '');
  return message.includes("Cannot read properties of undefined (reading 'getRuntimeHookRuntime')");
}

export function createLocalChatHostKvStore(namespace: string): ModKvStore {
  try {
    return createModKvStore({
      storage: createModStorageClient(LOCAL_CHAT_MOD_ID),
      namespace,
    });
  } catch (error) {
    if (!shouldFallbackToInMemoryStore(error)) {
      throw error;
    }
    return createInMemoryModKvStore(namespace);
  }
}
