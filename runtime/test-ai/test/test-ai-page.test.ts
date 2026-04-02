import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MEDIA_IMAGE_COMPONENTS_REQUIRED_ERROR,
  bindingForModel,
  buildAsyncImageJobOutcome,
  buildMediaImageWorkflowExtensionsForRequest,
  buildImageWorkflowProfileOverrides,
  buildImageWorkflowComponentSelections,
  buildImageGenerateRequestParams,
  companionAssetListQueryForImageWorkflow,
  resolveRouteModelPickerState,
  scenarioJobEventLabel,
  scenarioJobStatusLabel,
  toArtifactPreviewUri,
} from '../src/test-ai-page.tsx';

test('image generate request omits responseFormat in auto mode', () => {
  const request = buildImageGenerateRequestParams({
    prompt: 'draw a cat',
    negativePrompt: 'blurry',
    n: 1,
    size: '1024x1024',
    responseFormatMode: 'auto',
    binding: {
      source: 'cloud',
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
    timeoutMs: '600000',
    responseFormatMode: 'auto',
    extensions: {
      components: [{ slot: 'vae_path', localArtifactId: 'local_vae_01' }],
      profile_overrides: { step: 25, options: ['diffusion_model'] },
    },
  });

  assert.equal(request.seed, 42);
  assert.equal(request.timeoutMs, 600000);
  assert.deepEqual(request.extensions, {
    components: [{ slot: 'vae_path', localArtifactId: 'local_vae_01' }],
    profile_overrides: { step: 25, options: ['diffusion_model'] },
  });
});

test('image workflow component selections prioritize explicit vae/llm models and dedupe generic rows', () => {
  const components = buildImageWorkflowComponentSelections({
    vaeModel: 'artifact-vae',
    llmModel: 'artifact-llm',
    clipLModel: '',
    clipGModel: '',
    controlnetModel: '',
    loraModel: '',
    auxiliaryModel: '',
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

test('image workflow component selections include layered extended companions in stable order', () => {
  const components = buildImageWorkflowComponentSelections({
    vaeModel: 'artifact-vae',
    llmModel: 'artifact-llm',
    clipLModel: 'artifact-clip-l',
    clipGModel: 'artifact-clip-g',
    controlnetModel: 'artifact-controlnet',
    loraModel: 'artifact-lora',
    auxiliaryModel: 'artifact-aux',
    components: [
      { slot: 'controlnet_path', localArtifactId: 'artifact-controlnet-duplicate' },
      { slot: 'custom_path', localArtifactId: 'artifact-custom' },
    ],
  });

  assert.deepEqual(components, [
    { slot: 'vae_path', localArtifactId: 'artifact-vae' },
    { slot: 'llm_path', localArtifactId: 'artifact-llm' },
    { slot: 'clip_l_path', localArtifactId: 'artifact-clip-l' },
    { slot: 'clip_g_path', localArtifactId: 'artifact-clip-g' },
    { slot: 'controlnet_path', localArtifactId: 'artifact-controlnet' },
    { slot: 'lora_path', localArtifactId: 'artifact-lora' },
    { slot: 'aux_path', localArtifactId: 'artifact-aux' },
    { slot: 'custom_path', localArtifactId: 'artifact-custom' },
  ]);
});

test('media image workflow extensions require explicit companion selections', () => {
  const result = buildMediaImageWorkflowExtensionsForRequest({
    vaeModel: '',
    llmModel: '',
    clipLModel: '',
    clipGModel: '',
    controlnetModel: '',
    loraModel: '',
    auxiliaryModel: '',
    components: [],
    profileOverrides: { step: 25 },
  });

  assert.equal(result.extensions, undefined);
  assert.equal(result.error, MEDIA_IMAGE_COMPONENTS_REQUIRED_ERROR);
});

test('media image workflow extensions keep explicit components and profile overrides', () => {
  const result = buildMediaImageWorkflowExtensionsForRequest({
    vaeModel: 'artifact-vae',
    llmModel: 'artifact-llm',
    clipLModel: '',
    clipGModel: 'artifact-clip-g',
    controlnetModel: '',
    loraModel: '',
    auxiliaryModel: '',
    binding: {
      source: 'local',
      connectorId: '',
      model: 'media/local/z_image_turbo',
      localModelId: 'local-image-main',
    },
    components: [
      { slot: 'controlnet_path', localArtifactId: 'artifact-controlnet' },
    ],
    profileOverrides: { step: 25, options: ['diffusion_model'] },
  });

  assert.equal(result.error, null);
  assert.deepEqual(result.extensions, {
    entry_overrides: [
      { entry_id: 'test-ai/image-main-model', local_asset_id: 'local-image-main' },
      { entry_id: 'test-ai/image-slot/vae_path', local_asset_id: 'artifact-vae' },
      { entry_id: 'test-ai/image-slot/llm_path', local_asset_id: 'artifact-llm' },
      { entry_id: 'test-ai/image-slot/clip_g_path', local_asset_id: 'artifact-clip-g' },
      { entry_id: 'test-ai/image-slot/controlnet_path', local_asset_id: 'artifact-controlnet' },
    ],
    profile_entries: [
      {
        entryId: 'test-ai/image-main-model',
        kind: 'asset',
        capability: 'image',
        title: 'Selected local image model',
        required: true,
        preferred: true,
        assetId: 'local/z_image_turbo',
        assetKind: 'image',
        engine: 'media',
      },
      {
        entryId: 'test-ai/image-slot/vae_path',
        kind: 'asset',
        capability: 'image',
        title: 'Workflow slot vae_path',
        required: true,
        preferred: true,
        assetId: 'vae_path',
        assetKind: 'vae',
        engine: 'media',
        engineSlot: 'vae_path',
      },
      {
        entryId: 'test-ai/image-slot/llm_path',
        kind: 'asset',
        capability: 'image',
        title: 'Workflow slot llm_path',
        required: true,
        preferred: true,
        assetId: 'llm_path',
        assetKind: 'chat',
        engine: 'media',
        engineSlot: 'llm_path',
      },
      {
        entryId: 'test-ai/image-slot/clip_g_path',
        kind: 'asset',
        capability: 'image',
        title: 'Workflow slot clip_g_path',
        required: true,
        preferred: true,
        assetId: 'clip_g_path',
        assetKind: 'clip',
        engine: 'media',
        engineSlot: 'clip_g_path',
      },
      {
        entryId: 'test-ai/image-slot/controlnet_path',
        kind: 'asset',
        capability: 'image',
        title: 'Workflow slot controlnet_path',
        required: true,
        preferred: true,
        assetId: 'controlnet_path',
        assetKind: 'controlnet',
        engine: 'media',
        engineSlot: 'controlnet_path',
      },
    ],
    profile_overrides: { step: 25, options: ['diffusion_model'] },
  });
});

test('media image companion queries do not filter out cross-engine chat assets', () => {
  assert.equal(companionAssetListQueryForImageWorkflow({
    source: 'local',
    connectorId: '',
    provider: 'media',
    engine: 'media',
    model: 'z-image-turbo-Q4_K',
  }), undefined);

  assert.deepEqual(companionAssetListQueryForImageWorkflow({
    source: 'local',
    connectorId: '',
    provider: 'speech',
    engine: 'speech',
    model: 'kokoro-tts',
  }), { engine: 'speech' });
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
      source: 'cloud' as const,
      connectorId: 'connector-dashscope',
      provider: 'dashscope',
      model: 'wan2.6-t2i',
    },
    local: {
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

  assert.equal(state.cloudCatalogMissing, false);
  assert.deepEqual(state.modelOptions, [
    'qwen-image-2.0-pro',
    'qwen-image-2.0',
    'z-image-turbo',
    'wan2.6-t2i',
  ]);
});

test('manual cloud model override preserves connector provider', () => {
  const snapshot = {
    capability: 'image.generate' as const,
    selected: {
      source: 'cloud' as const,
      connectorId: 'connector-dashscope',
      provider: 'dashscope',
      model: 'wan2.6-t2i',
    },
    local: {
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
    source: 'cloud',
    connectorId: 'connector-dashscope',
    provider: 'dashscope',
    model: 'qwen-image-2.0-pro',
  });
});

test('local model selection preserves adapter and go runtime metadata', () => {
  const snapshot = {
    capability: 'image.generate' as const,
    selected: {
      source: 'local' as const,
      connectorId: '',
      provider: 'media',
      model: 'z-image-turbo-Q8_0',
      modelId: 'z-image-turbo-Q8_0',
      localModelId: 'file:local-import-z-image-turbo-q8-0',
      engine: 'media',
      adapter: 'localai_native_adapter',
      goRuntimeLocalModelId: '01JTESTLOCALAIMODEL',
      goRuntimeStatus: 'active',
    },
    local: {
      models: [{
        localModelId: 'file:local-import-z-image-turbo-q8-0',
        label: 'z-image-turbo-Q8_0',
        engine: 'media',
        model: 'z-image-turbo-Q8_0',
        modelId: 'z-image-turbo-Q8_0',
        provider: 'media',
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
    source: 'local',
    connectorId: '',
    model: 'z-image-turbo-Q8_0',
    modelId: 'z-image-turbo-Q8_0',
    provider: 'media',
    localModelId: 'file:local-import-z-image-turbo-q8-0',
    engine: 'media',
    adapter: 'localai_native_adapter',
    endpoint: 'http://127.0.0.1:1234/v1',
    goRuntimeLocalModelId: '01JTESTLOCALAIMODEL',
    goRuntimeStatus: 'active',
  });
});

test('route model picker normalizes local selector model ids', () => {
  const snapshot = {
    capability: 'image.generate' as const,
    selected: {
      source: 'local' as const,
      connectorId: '',
      provider: 'media',
      model: 'z-image-turbo-Q8_0',
      modelId: 'z-image-turbo-Q8_0',
      localModelId: 'file:local-import-z-image-turbo-q8-0',
      engine: 'media',
      adapter: 'localai_native_adapter',
    },
    local: {
      models: [{
        localModelId: 'file:local-import-z-image-turbo-q8-0',
        label: 'z-image-turbo-Q8_0',
        engine: 'media',
        model: 'z-image-turbo-Q8_0',
        modelId: 'z-image-turbo-Q8_0',
        provider: 'media',
        adapter: 'localai_native_adapter',
        status: 'active',
        capabilities: ['image.generate' as const],
      }],
    },
    connectors: [],
  };

  const state = resolveRouteModelPickerState(snapshot, {
    source: 'local',
    connectorId: '',
    provider: 'media',
    model: 'localai/z-image-turbo-Q8_0',
    modelId: 'z-image-turbo-Q8_0',
    localModelId: 'file:local-import-z-image-turbo-q8-0',
    engine: 'media',
  });

  assert.equal(state.activeModel, 'z-image-turbo-Q8_0');
  assert.equal(state.activeModelInOptions, true);
  assert.deepEqual(state.modelOptions, ['z-image-turbo-Q8_0']);
});

test('route model picker tolerates missing local snapshot payload', () => {
  const snapshot = {
    capability: 'image.generate' as const,
    selected: {
      source: 'local' as const,
      connectorId: '',
      model: 'z-image-turbo-Q8_0',
      modelId: 'z-image-turbo-Q8_0',
    },
    connectors: [],
  } as any;

  const state = resolveRouteModelPickerState(snapshot, snapshot.selected);

  assert.equal(state.activeSource, 'local');
  assert.deepEqual(state.modelOptions, []);
  assert.equal(state.activeModel, 'z-image-turbo-Q8_0');
});

test('scenario job labels map numeric protobuf enums to readable values', () => {
  assert.equal(scenarioJobStatusLabel(4), 'completed');
  assert.equal(scenarioJobStatusLabel(5), 'failed');
  assert.equal(scenarioJobEventLabel(4), 'completed');
  assert.equal(scenarioJobEventLabel(2), 'queued');
});

test('artifact preview bytes default to image/png data URI', () => {
  const uri = toArtifactPreviewUri({
    bytes: new Uint8Array([137, 80, 78, 71]),
    defaultMimeType: 'image/png',
  });

  assert.match(uri, /^data:image\/png;base64,/);
});

test('completed async image job surfaces artifact fetch failure explicitly', () => {
  const outcome = buildAsyncImageJobOutcome({
    status: 4,
    artifactFetchError: 'artifact fetch failed',
  });

  assert.deepEqual(outcome, {
    result: 'failed',
    error: 'artifact fetch failed',
    terminalStatus: 'completed',
  });
});
