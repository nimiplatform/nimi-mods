import test from 'node:test';
import assert from 'node:assert/strict';
import { clearModSdkHost, setModSdkHost } from '../../../shared/testing/mod-sdk-host.js';
import {
  loadTextplayRouteBinding,
  persistTextplayRouteBinding,
} from '../src/route-override-store.ts';

function installRuntimeStorageHostMock() {
  const storage = new Map();
  setModSdkHost({
    runtime: {
      getRuntimeHookRuntime: () => ({
        storage: {
          files: {
            readText: async () => {
              throw new Error('UNEXPECTED_STORAGE_FILE_READ_TEXT');
            },
            writeText: async () => {
              throw new Error('UNEXPECTED_STORAGE_FILE_WRITE_TEXT');
            },
            readBytes: async () => {
              throw new Error('UNEXPECTED_STORAGE_FILE_READ_BYTES');
            },
            writeBytes: async () => {
              throw new Error('UNEXPECTED_STORAGE_FILE_WRITE_BYTES');
            },
            delete: async () => false,
            list: async () => [],
            stat: async () => null,
          },
          sqlite: {
            query: async (input) => {
              const namespace = String(input.params?.[0] || '');
              const key = String(input.params?.[1] || '');
              const stored = storage.get(`${namespace}:${key}`);
              return stored == null ? [] : [{ value: stored }];
            },
            execute: async (input) => {
              const sql = String(input.sql || '').toLowerCase();
              const namespace = String(input.params?.[0] || '');
              const key = String(input.params?.[1] || '');
              if (sql.includes('create table if not exists mod_state_kv')) {
                return { rowsAffected: 0, lastInsertRowid: 0 };
              }
              if (sql.includes('insert into mod_state_kv')) {
                storage.set(`${namespace}:${key}`, String(input.params?.[2] || ''));
                return { rowsAffected: 1, lastInsertRowid: 0 };
              }
              if (sql.includes('delete from mod_state_kv') && sql.includes('where namespace = ?1 and key = ?2')) {
                storage.delete(`${namespace}:${key}`);
                return { rowsAffected: 1, lastInsertRowid: 0 };
              }
              throw new Error(`UNEXPECTED_STORAGE_SQL_EXECUTE:${input.sql}`);
            },
            transaction: async () => ({ rowsAffected: 0, lastInsertRowid: 0 }),
          },
        },
      }),
    },
  });

  return {
    storage,
    restore() {
      clearModSdkHost();
    },
  };
}

const runtimeStorageEnv = installRuntimeStorageHostMock();
test.after(() => {
  runtimeStorageEnv.restore();
});

test('textplay route override store persists and reloads cloud binding', async () => {
  runtimeStorageEnv.storage.clear();
  await persistTextplayRouteBinding({
    source: 'cloud',
    connectorId: 'connector-gemini',
    model: 'gemini-3-flash-preview',
    provider: 'google',
  });

  const restored = await loadTextplayRouteBinding();
  assert.equal(restored?.source, 'cloud');
  assert.equal(restored?.connectorId, 'connector-gemini');
  assert.equal(restored?.model, 'gemini-3-flash-preview');
  assert.equal(restored?.localModelId, undefined);
  assert.equal(restored?.engine, undefined);
});

test('textplay route override store clears persisted binding on null', async () => {
  runtimeStorageEnv.storage.clear();
  await persistTextplayRouteBinding({
    source: 'local',
    connectorId: '',
    model: 'qwen3:4b',
    localModelId: 'qwen3:4b',
    engine: 'ollama',
  });
  assert.equal(runtimeStorageEnv.storage.size, 1);

  await persistTextplayRouteBinding(null);

  assert.equal(runtimeStorageEnv.storage.size, 0);
  assert.equal(await loadTextplayRouteBinding(), null);
});
