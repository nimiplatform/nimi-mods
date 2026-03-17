import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { RuntimeRouteBinding, RuntimeRouteOptionsSnapshot } from '@nimiplatform/sdk/mod';

import { reconcileRouteBinding } from '../src/services/route-binding.js';

function createOptions(): RuntimeRouteOptionsSnapshot {
  return {
    local: {
      models: [
        {
          model: 'local-chat',
          modelId: 'local-chat',
          localModelId: 'local-chat-1',
          engine: 'localai',
          provider: 'localai',
          adapter: 'openai_compat_adapter',
          endpoint: 'http://127.0.0.1:8080/v1',
          status: 'active',
        },
      ],
    },
    connectors: [
      {
        id: 'connector-gemini',
        label: 'Gemini',
        provider: 'gemini',
        models: ['gemini-2.5-flash', 'gemini-3-flash-preview'],
        modelCapabilities: {
          'gemini-2.5-flash': ['text.generate'],
          'gemini-3-flash-preview': ['text.generate'],
        },
        modelProfiles: [],
      },
    ],
    selected: {
      source: 'cloud',
      connectorId: 'connector-gemini',
      model: 'gemini-2.5-flash',
      provider: 'gemini',
    },
    resolvedDefault: {
      source: 'cloud',
      connectorId: 'connector-gemini',
      model: 'gemini-2.5-flash',
      provider: 'gemini',
    },
  } as RuntimeRouteOptionsSnapshot;
}

describe('reconcileRouteBinding', () => {
  it('repairs stale cloud models restored from session state', () => {
    const restored: RuntimeRouteBinding = {
      source: 'cloud',
      connectorId: 'connector-gemini',
      model: 'gemini-1.5-pro-old',
    };

    const result = reconcileRouteBinding(restored, createOptions());

    assert.deepEqual(result, {
      source: 'cloud',
      connectorId: 'connector-gemini',
      model: 'gemini-2.5-flash',
      provider: 'gemini',
    });
  });

  it('falls back to the current default binding when the saved connector no longer exists', () => {
    const restored: RuntimeRouteBinding = {
      source: 'cloud',
      connectorId: 'connector-missing',
      model: 'ghost-model',
    };

    const result = reconcileRouteBinding(restored, createOptions());

    assert.deepEqual(result, {
      source: 'cloud',
      connectorId: 'connector-gemini',
      model: 'gemini-2.5-flash',
      provider: 'gemini',
    });
  });

  it('keeps valid local bindings aligned with current local metadata', () => {
    const restored: RuntimeRouteBinding = {
      source: 'local',
      connectorId: '',
      model: 'local-chat',
      modelId: 'local-chat',
      localModelId: 'local-chat-1',
      engine: 'localai',
    };

    const result = reconcileRouteBinding(restored, createOptions());

    assert.deepEqual(result, {
      source: 'local',
      connectorId: '',
      model: 'local-chat',
      modelId: 'local-chat',
      localModelId: 'local-chat-1',
      engine: 'localai',
      provider: 'localai',
      endpoint: 'http://127.0.0.1:8080/v1',
    });
  });
});
