import assert from 'node:assert/strict';
import test from 'node:test';

import {
  bindingForModel,
  buildImageGenerateRequestParams,
  resolveRouteModelPickerState,
} from '../src/test-ai-page.tsx';

test('image generate request omits responseFormat in auto mode', () => {
  const request = buildImageGenerateRequestParams({
    prompt: 'draw a cat',
    negativePrompt: 'blurry',
    n: 1,
    size: '1024x1024',
    responseFormatMode: 'auto',
    binding: {
      source: 'token-api',
      connectorId: 'connector-dashscope',
      provider: 'dashscope',
      model: 'wan2.6-t2i',
    },
  });

  assert.equal(request.responseFormat, undefined);
  assert.equal(request.binding?.provider, 'dashscope');
});

test('image generate request keeps explicit url override', () => {
  const request = buildImageGenerateRequestParams({
    prompt: 'draw a cat',
    n: 1,
    size: '1024x1024',
    responseFormatMode: 'url',
  });

  assert.equal(request.responseFormat, 'url');
});

test('route model picker exposes connector catalog models for dashscope image generation', () => {
  const snapshot = {
    capability: 'image.generate' as const,
    selected: {
      source: 'token-api' as const,
      connectorId: 'connector-dashscope',
      provider: 'dashscope',
      model: 'wan2.6-t2i',
    },
    localRuntime: {
      models: [],
    },
    connectors: [{
      id: 'connector-dashscope',
      label: 'DashScope',
      provider: 'dashscope',
      models: [
        'qwen-image-2.0-pro',
        'qwen-image-2.0',
        'z-image-turbo',
        'wan2.6-t2i',
      ],
    }],
  };

  const state = resolveRouteModelPickerState(snapshot, null);

  assert.equal(state.tokenApiCatalogMissing, false);
  assert.deepEqual(state.modelOptions, [
    'qwen-image-2.0-pro',
    'qwen-image-2.0',
    'z-image-turbo',
    'wan2.6-t2i',
  ]);
});

test('manual token-api model override preserves connector provider', () => {
  const snapshot = {
    capability: 'image.generate' as const,
    selected: {
      source: 'token-api' as const,
      connectorId: 'connector-dashscope',
      provider: 'dashscope',
      model: 'wan2.6-t2i',
    },
    localRuntime: {
      models: [],
    },
    connectors: [{
      id: 'connector-dashscope',
      label: 'DashScope',
      provider: 'dashscope',
      models: ['wan2.6-t2i'],
    }],
  };

  const nextBinding = bindingForModel(snapshot, 'qwen-image-2.0-pro', snapshot.selected);

  assert.deepEqual(nextBinding, {
    source: 'token-api',
    connectorId: 'connector-dashscope',
    provider: 'dashscope',
    model: 'qwen-image-2.0-pro',
  });
});
