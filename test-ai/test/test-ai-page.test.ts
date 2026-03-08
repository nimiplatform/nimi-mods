import assert from 'node:assert/strict';
import test from 'node:test';

import {
  bindingForModel,
  buildImageWorkflowProfileOverrides,
  buildImageWorkflowComponentSelections,
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

test('image generate request forwards seed and workflow extensions', () => {
  const request = buildImageGenerateRequestParams({
    prompt: 'draw a cat',
    n: 1,
    size: '1024x1024',
    seed: '42',
    responseFormatMode: 'auto',
    extensions: {
      components: [{ slot: 'vae_path', localArtifactId: 'local_vae_01' }],
      profile_overrides: { step: 25, options: ['diffusion_model'] },
    },
  });

  assert.equal(request.seed, 42);
  assert.deepEqual(request.extensions, {
    components: [{ slot: 'vae_path', localArtifactId: 'local_vae_01' }],
    profile_overrides: { step: 25, options: ['diffusion_model'] },
  });
});

test('image workflow component selections prioritize explicit vae/llm models and dedupe generic rows', () => {
  const components = buildImageWorkflowComponentSelections({
    vaeModel: 'artifact-vae',
    llmModel: 'artifact-llm',
    components: [
      { slot: 'vae_path', localArtifactId: 'artifact-vae-duplicate' },
      { slot: 'controlnet_path', localArtifactId: 'artifact-controlnet' },
    ],
  });

  assert.deepEqual(components, [
    { slot: 'vae_path', localArtifactId: 'artifact-vae' },
    { slot: 'llm_path', localArtifactId: 'artifact-llm' },
    { slot: 'controlnet_path', localArtifactId: 'artifact-controlnet' },
  ]);
});

test('image workflow profile overrides merge structured fields with raw json', () => {
  const result = buildImageWorkflowProfileOverrides({
    rawJsonText: '{"scheduler":"karras","clip_skip":2}',
    step: '25',
    cfgScale: '1.5',
    sampler: 'euler',
    optionsText: 'diffusion_model\noffload_params_to_cpu:true',
  });

  assert.equal(result.error, null);
  assert.deepEqual(result.overrides, {
    scheduler: 'karras',
    clip_skip: 2,
    step: 25,
    cfg_scale: 1.5,
    sampler: 'euler',
    options: ['diffusion_model', 'offload_params_to_cpu:true'],
  });
});

test('image workflow profile overrides rejects non-object raw json', () => {
  const result = buildImageWorkflowProfileOverrides({
    rawJsonText: '[]',
  });

  assert.equal(result.error, 'Raw profile_overrides JSON must be an object.');
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

test('local-runtime model selection preserves adapter and go runtime metadata', () => {
  const snapshot = {
    capability: 'image.generate' as const,
    selected: {
      source: 'local-runtime' as const,
      connectorId: '',
      provider: 'localai',
      model: 'z-image-turbo-Q8_0',
      modelId: 'z-image-turbo-Q8_0',
      localModelId: 'file:local-import-z-image-turbo-q8-0',
      engine: 'localai',
      adapter: 'localai_native_adapter',
      goRuntimeLocalModelId: '01JTESTLOCALAIMODEL',
      goRuntimeStatus: 'active',
    },
    localRuntime: {
      models: [{
        localModelId: 'file:local-import-z-image-turbo-q8-0',
        label: 'z-image-turbo-Q8_0',
        engine: 'localai',
        model: 'z-image-turbo-Q8_0',
        modelId: 'z-image-turbo-Q8_0',
        provider: 'localai',
        adapter: 'localai_native_adapter',
        endpoint: 'http://127.0.0.1:1234/v1',
        status: 'active',
        goRuntimeLocalModelId: '01JTESTLOCALAIMODEL',
        goRuntimeStatus: 'active',
        capabilities: ['image.generate' as const],
      }],
    },
    connectors: [],
  };

  const nextBinding = bindingForModel(snapshot, 'z-image-turbo-Q8_0', snapshot.selected);

  assert.deepEqual(nextBinding, {
    source: 'local-runtime',
    connectorId: '',
    model: 'z-image-turbo-Q8_0',
    modelId: 'z-image-turbo-Q8_0',
    provider: 'localai',
    localModelId: 'file:local-import-z-image-turbo-q8-0',
    engine: 'localai',
    adapter: 'localai_native_adapter',
    endpoint: 'http://127.0.0.1:1234/v1',
    goRuntimeLocalModelId: '01JTESTLOCALAIMODEL',
    goRuntimeStatus: 'active',
  });
});

test('route model picker normalizes local-runtime selector model ids', () => {
  const snapshot = {
    capability: 'image.generate' as const,
    selected: {
      source: 'local-runtime' as const,
      connectorId: '',
      provider: 'localai',
      model: 'z-image-turbo-Q8_0',
      modelId: 'z-image-turbo-Q8_0',
      localModelId: 'file:local-import-z-image-turbo-q8-0',
      engine: 'localai',
      adapter: 'localai_native_adapter',
    },
    localRuntime: {
      models: [{
        localModelId: 'file:local-import-z-image-turbo-q8-0',
        label: 'z-image-turbo-Q8_0',
        engine: 'localai',
        model: 'z-image-turbo-Q8_0',
        modelId: 'z-image-turbo-Q8_0',
        provider: 'localai',
        adapter: 'localai_native_adapter',
        status: 'active',
        capabilities: ['image.generate' as const],
      }],
    },
    connectors: [],
  };

  const state = resolveRouteModelPickerState(snapshot, {
    source: 'local-runtime',
    connectorId: '',
    provider: 'localai',
    model: 'localai/z-image-turbo-Q8_0',
    modelId: 'z-image-turbo-Q8_0',
    localModelId: 'file:local-import-z-image-turbo-q8-0',
    engine: 'localai',
  });

  assert.equal(state.activeModel, 'z-image-turbo-Q8_0');
  assert.equal(state.activeModelInOptions, true);
  assert.deepEqual(state.modelOptions, ['z-image-turbo-Q8_0']);
});
