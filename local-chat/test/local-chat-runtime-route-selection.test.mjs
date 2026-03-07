import test from 'node:test';
import assert from 'node:assert/strict';

import {
  hasValidLocalRuntimeChatModelSelection,
  hasValidTokenApiChatModelSelection,
} from '../src/hooks/use-local-chat-runtime-route.ts';
import { buildRouteOverrideForModel } from '../src/hooks/runtime-route/override-actions.ts';

test('token-api chat model selection stays valid when user picks a non-preferred but chat-capable model', () => {
  const result = hasValidTokenApiChatModelSelection({
    model: 'models/gemini-3-flash-preview',
    models: [
      'models/aqa',
      'models/gemini-3-flash-preview',
      'models/gemini-3-pro-preview',
    ],
    modelCapabilities: {
      'models/aqa': ['llm.text.generate', 'llm.text.stream'],
      'models/gemini-3-flash-preview': ['llm.text.generate', 'llm.text.stream'],
      'models/gemini-3-pro-preview': ['llm.text.generate', 'llm.text.stream'],
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
      'models/gemini-3-flash-preview': ['llm.text.generate', 'llm.text.stream'],
      'models/image-only': ['llm.image.generate'],
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
        capabilities: ['llm.text.generate', 'llm.text.stream'],
      },
      {
        localModelId: 'chat-alt',
        model: 'chat-alt',
        capabilities: ['llm.text.generate', 'llm.text.stream'],
      },
    ],
  });

  assert.equal(result, true);
});

test('buildRouteOverrideForModel refreshes local runtime metadata when user switches models', () => {
  const result = buildRouteOverrideForModel({
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
            capabilities: ['llm.text.generate', 'llm.text.stream'],
          },
          {
            localModelId: 'chat-alt',
            model: 'chat-alt',
            engine: 'mlx',
            capabilities: ['llm.text.generate', 'llm.text.stream'],
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
