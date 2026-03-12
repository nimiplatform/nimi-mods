import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadTextplayRouteBinding,
  persistTextplayRouteBinding,
} from '../src/route-override-store.ts';

class MemoryStorage {
  #store = new Map();

  get length() {
    return this.#store.size;
  }

  clear() {
    this.#store.clear();
  }

  getItem(key) {
    return this.#store.has(key) ? this.#store.get(key) : null;
  }

  key(index) {
    return Array.from(this.#store.keys())[index] || null;
  }

  removeItem(key) {
    this.#store.delete(key);
  }

  setItem(key, value) {
    this.#store.set(key, String(value));
  }
}

function installStorage() {
  const previousWindow = globalThis.window;
  const previousLocalStorage = globalThis.localStorage;
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: storage,
    },
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  });
  return {
    storage,
    restore() {
      if (previousWindow === undefined) {
        delete globalThis.window;
      } else {
        Object.defineProperty(globalThis, 'window', {
          configurable: true,
          value: previousWindow,
        });
      }
      if (previousLocalStorage === undefined) {
        delete globalThis.localStorage;
      } else {
        Object.defineProperty(globalThis, 'localStorage', {
          configurable: true,
          value: previousLocalStorage,
        });
      }
    },
  };
}

test('textplay route override store persists and reloads cloud binding', () => {
  const env = installStorage();
  try {
    persistTextplayRouteBinding({
      source: 'cloud',
      connectorId: 'connector-gemini',
      model: 'gemini-3-flash-preview',
      provider: 'google',
    });

    const restored = loadTextplayRouteBinding();
    assert.equal(restored?.source, 'cloud');
    assert.equal(restored?.connectorId, 'connector-gemini');
    assert.equal(restored?.model, 'gemini-3-flash-preview');
    assert.equal(restored?.localModelId, undefined);
    assert.equal(restored?.engine, undefined);
  } finally {
    env.restore();
  }
});

test('textplay route override store clears persisted binding on null', () => {
  const env = installStorage();
  try {
    persistTextplayRouteBinding({
      source: 'local',
      connectorId: '',
      model: 'qwen3:4b',
      localModelId: 'qwen3:4b',
      engine: 'ollama',
    });
    assert.equal(env.storage.length, 1);

    persistTextplayRouteBinding(null);

    assert.equal(env.storage.length, 0);
    assert.equal(loadTextplayRouteBinding(), null);
  } finally {
    env.restore();
  }
});
