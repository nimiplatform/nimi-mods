import test from 'node:test';
import assert from 'node:assert/strict';

import {
  hasValidLocalRuntimeChatModelSelection,
  hasValidTokenApiChatModelSelection,
} from '../src/hooks/use-local-chat-runtime-route.ts';
import {
  buildRouteBindingForModel,
  resolveCommittedChatModelQuery,
} from '../src/hooks/runtime-route/override-actions.ts';
import {
  formatRouteSnapshotLabel,
  hasPendingChatModelChange,
} from '../src/components/sidebar/runtime-status-state.ts';

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

test('local runtime chat model selection is rejected when the selected model is not active', () => {
  const result = hasValidLocalRuntimeChatModelSelection({
    model: 'chat-installed',
    localModelId: 'chat-installed',
    models: [
      {
        localModelId: 'chat-installed',
        model: 'chat-installed',
        status: 'installed',
        capabilities: ['text.generate'],
      },
      {
        localModelId: 'chat-active',
        model: 'chat-active',
        status: 'active',
        capabilities: ['text.generate'],
      },
    ],
  });

  assert.equal(result, false);
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
            status: 'active',
            goRuntimeLocalModelId: 'go-chat-default',
            goRuntimeStatus: 'active',
            capabilities: ['text.generate'],
          },
          {
            localModelId: 'chat-alt',
            model: 'chat-alt',
            engine: 'mlx',
            status: 'active',
            goRuntimeLocalModelId: 'go-chat-alt',
            goRuntimeStatus: 'active',
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
    goRuntimeLocalModelId: 'go-chat-alt',
    goRuntimeStatus: 'active',
  });
});

test('buildRouteOverrideForModel ignores non-active local runtime candidates', () => {
  const result = buildRouteOverrideForModel({
    model: 'chat-installed',
    previous: {
      source: 'local-runtime',
      connectorId: '',
      model: 'chat-default',
      localModelId: 'chat-default',
      engine: 'llama.cpp',
      goRuntimeLocalModelId: 'go-chat-default',
      goRuntimeStatus: 'active',
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
            status: 'active',
            goRuntimeLocalModelId: 'go-chat-default',
            goRuntimeStatus: 'active',
            capabilities: ['llm.text.generate', 'llm.text.stream'],
          },
          {
            localModelId: 'chat-installed',
            model: 'chat-installed',
            engine: 'mlx',
            status: 'installed',
            goRuntimeLocalModelId: 'go-chat-installed',
            goRuntimeStatus: 'installed',
            capabilities: ['llm.text.generate', 'llm.text.stream'],
          },
        ],
      },
    },
  });

  assert.deepEqual(result, {
    source: 'local-runtime',
    connectorId: '',
    model: 'chat-installed',
  });
});

test('token-api chat model query commits freeform model input on blur/enter', () => {
  const result = resolveCommittedChatModelQuery({
    source: 'token-api',
    query: 'gemini-3-flash-preview',
    activeModel: 'gemini-2.5-flash',
    availableModels: ['gemini-2.5-flash'],
  });

  assert.deepEqual(result, {
    nextQuery: 'gemini-3-flash-preview',
    nextModel: 'gemini-3-flash-preview',
  });
});

test('local-runtime chat model query reverts invalid freeform input', () => {
  const result = resolveCommittedChatModelQuery({
    source: 'local-runtime',
    query: 'gemini-3-flash-preview',
    activeModel: 'chat-default',
    availableModels: ['chat-default', 'chat-alt'],
  });

  assert.deepEqual(result, {
    nextQuery: 'chat-default',
    nextModel: null,
  });
});

test('runtime status prefers resolved runtime snapshot for effective route label', () => {
  const result = formatRouteSnapshotLabel({
    snapshot: {
      source: 'token-api',
      provider: 'google-gemini',
      model: 'gemini-3-flash-preview',
      endpoint: 'https://example.test',
      connectorId: 'connector-a',
    },
    fallbackBinding: {
      source: 'token-api',
      connectorId: 'connector-a',
      model: 'gemini-2.5-flash',
    },
    connectors: [
      {
        id: 'connector-a',
        label: 'API Connector',
        models: ['gemini-2.5-flash', 'gemini-3-flash-preview'],
      },
    ],
  });

  assert.equal(result, 'Token API · API Connector · gemini-3-flash-preview');
});

test('runtime status detects pending chat model edits', () => {
  assert.equal(hasPendingChatModelChange({
    activeModel: 'gemini-2.5-flash',
    query: 'gemini-3-flash-preview',
  }), true);
  assert.equal(hasPendingChatModelChange({
    activeModel: 'gemini-3-flash-preview',
    query: 'gemini-3-flash-preview',
  }), false);
});
