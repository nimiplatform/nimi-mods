import test from 'node:test';
import assert from 'node:assert/strict';

import {
  hasValidLocalRuntimeChatModelSelection,
  hasValidTokenApiChatModelSelection,
} from '../src/hooks/use-local-chat-runtime-route.ts';
import { buildRouteBindingForModel } from '../src/hooks/runtime-route/override-actions.ts';

test('token-api chat model selection stays valid when user picks a non-preferred but chat-capable model', () => {
  const result = hasValidTokenApiChatModelSelection({
    model: 'models/gemini-3-flash-preview',
    models: [
      'models/aqa',
      'models/gemini-3-flash-preview',
      'models/gemini-3-pro-preview',
    ],
    modelCapabilities: {
      'models/aqa': ['text.generate'],
      'models/gemini-3-flash-preview': ['text.generate'],
      'models/gemini-3-pro-preview': ['text.generate'],
    },
  });

  assert.equal(result, true);
});

test('token-api chat model selection is rejected when the current model is no longer valid for chat', () => {
  const result = hasValidTokenApiChatModelSelection({
    model: 'models/image-only',
    models: [
      'models/gemini-3-flash-preview',
      'models/image-only',
    ],
    modelCapabilities: {
      'models/gemini-3-flash-preview': ['text.generate'],
      'models/image-only': ['image.generate'],
    },
  });

  assert.equal(result, false);
});

test('local runtime chat model selection stays valid when user picks a non-preferred but chat-capable model', () => {
  const result = hasValidLocalRuntimeChatModelSelection({
    model: 'chat-alt',
    localModelId: 'chat-alt',
    models: [
      {
        localModelId: 'chat-default',
        model: 'chat-default',
        capabilities: ['text.generate'],
      },
      {
        localModelId: 'chat-alt',
        model: 'chat-alt',
        capabilities: ['text.generate'],
      },
    ],
  });

  assert.equal(result, true);
});

test('buildRouteBindingForModel refreshes local runtime metadata when user switches models', () => {
  const result = buildRouteBindingForModel({
    model: 'chat-alt',
    previous: {
      source: 'local-runtime',
      connectorId: '',
      model: 'chat-default',
      localModelId: 'chat-default',
      engine: 'llama.cpp',
    },
    options: {
      selected: {
        source: 'local-runtime',
        connectorId: '',
        model: 'chat-default',
      },
      resolvedDefault: {
        source: 'local-runtime',
        connectorId: '',
        model: 'chat-default',
      },
      connectors: [],
      localRuntime: {
        models: [
          {
            localModelId: 'chat-default',
            model: 'chat-default',
            engine: 'llama.cpp',
            capabilities: ['text.generate'],
          },
          {
            localModelId: 'chat-alt',
            model: 'chat-alt',
            engine: 'mlx',
            capabilities: ['text.generate'],
          },
        ],
      },
    },
  });

  assert.deepEqual(result, {
    source: 'local-runtime',
    connectorId: '',
    model: 'chat-alt',
    localModelId: 'chat-alt',
    engine: 'mlx',
  });
});
