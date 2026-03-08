import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isMediaRouteReady,
  resolveMediaRouteConfig,
  resolveMediaRouteFromOptions,
  toPinnedRouteBinding,
} from '../src/hooks/turn-send/media-route.ts';

function createDefaultSettings(overrides = {}) {
  return {
    deliveryStyle: 'natural',
    mediaAutonomy: 'natural',
    voiceConversationMode: 'off',
    relationshipBoundaryPreset: 'balanced',
    visualComfortLevel: 'soft-visuals',
    enableVoice: false,
    allowProactiveContact: false,
    autoPlayVoiceReplies: false,
    voiceName: 'Cherry',
    ttsRouteSource: 'auto',
    ttsConnectorId: '',
    ttsModel: '',
    sttRouteSource: 'auto',
    sttConnectorId: '',
    sttModel: '',
    imageRouteSource: 'auto',
    imageConnectorId: '',
    imageModel: '',
    videoRouteSource: 'auto',
    videoConnectorId: '',
    videoModel: '',
    ...overrides,
  };
}

test('resolveMediaRouteConfig does not convert undefined settings into "undefined" strings', () => {
  const resolved = resolveMediaRouteConfig({
    kind: 'image',
    settings: createDefaultSettings({
      imageConnectorId: undefined,
      imageModel: undefined,
    }),
    fallbackSource: 'local',
  });

  assert.equal(resolved.routeSource, 'auto');
  assert.equal(resolved.model, undefined);
  assert.equal(resolved.routeBinding, undefined);
});

test('toPinnedRouteBinding keeps cloud connector and model', () => {
  const binding = toPinnedRouteBinding({
    source: 'cloud',
    runtimeModelType: 'image',
    provider: 'openai',
    connectorId: 'connector-a',
    model: 'gpt-image-1',
    endpoint: 'https://example.com',
    localOpenAiEndpoint: 'http://127.0.0.1:11434/v1',
  });

  assert.deepEqual(binding, {
    source: 'cloud',
    connectorId: 'connector-a',
    model: 'gpt-image-1',
  });
});

test('toPinnedRouteBinding keeps local model and localModelId', () => {
  const binding = toPinnedRouteBinding({
    source: 'local',
    runtimeModelType: 'image',
    provider: 'localai',
    connectorId: '',
    localModelId: 'z-image-turbo',
    model: 'z-image-turbo',
    engine: 'localai',
    endpoint: 'http://127.0.0.1:8080',
    localProviderEndpoint: 'http://127.0.0.1:8080',
    localProviderModel: 'z-image-turbo',
    localOpenAiEndpoint: 'http://127.0.0.1:8080/v1',
  });

  assert.deepEqual(binding, {
    source: 'local',
    connectorId: '',
    model: 'z-image-turbo',
    localModelId: 'z-image-turbo',
  });
});

test('isMediaRouteReady is false when route source is auto', () => {
  const settings = createDefaultSettings({
    imageRouteSource: 'auto',
    imageConnectorId: '',
    imageModel: '',
  });
  assert.equal(isMediaRouteReady({ kind: 'image', settings }), false);
});

test('isMediaRouteReady is true when auto route resolves from route options', () => {
  const settings = createDefaultSettings({
    imageRouteSource: 'auto',
  });
  const routeOptions = {
    resolvedDefault: {
      source: 'local',
      model: 'flux-local',
    },
    selected: null,
    connectors: [],
    local: {
      models: [],
    },
  };
  const resolvedRoute = resolveMediaRouteFromOptions({
    kind: 'image',
    settings,
    routeOptions,
    routeOptionsRevision: 3,
  });
  assert.ok(resolvedRoute);
  assert.equal(isMediaRouteReady({
    kind: 'image',
    settings,
    routeOptions,
    routeOptionsRevision: 3,
    resolvedRoute,
  }), true);
});

test('resolveMediaRouteFromOptions skips local defaults that are not active', () => {
  const settings = createDefaultSettings({
    imageRouteSource: 'auto',
  });
  const routeOptions = {
    resolvedDefault: {
      source: 'local',
      connectorId: '',
      model: 'flux-local',
      localModelId: 'flux-local',
      goRuntimeLocalModelId: 'go-flux-local',
      goRuntimeStatus: 'installed',
    },
    selected: {
      source: 'cloud',
      connectorId: 'connector-a',
      model: 'gpt-image-1',
    },
    connectors: [{
      id: 'connector-a',
      label: 'Image API',
      models: ['gpt-image-1'],
    }],
    local: {
      models: [{
        localModelId: 'flux-local',
        model: 'flux-local',
        status: 'installed',
        goRuntimeLocalModelId: 'go-flux-local',
        goRuntimeStatus: 'installed',
        capabilities: ['image.generate'],
      }],
    },
  };

  const resolved = resolveMediaRouteFromOptions({
    kind: 'image',
    settings,
    routeOptions,
    routeOptionsRevision: 5,
  });

  assert.deepEqual(resolved, {
    source: 'cloud',
    connectorId: 'connector-a',
    model: 'gpt-image-1',
    resolvedBy: 'selected',
    resolvedAt: resolved?.resolvedAt,
    settingsRevision: 'image|auto||',
    routeOptionsRevision: 5,
  });
});

test('isMediaRouteReady is true for local route source', () => {
  const settings = createDefaultSettings({
    imageRouteSource: 'local',
    imageModel: '',
  });
  assert.equal(isMediaRouteReady({
    kind: 'image',
    settings,
    routeOptions: {
      selected: {
        source: 'local',
        connectorId: '',
        model: 'flux-local',
        localModelId: 'flux-local',
        goRuntimeLocalModelId: 'go-flux-local',
        goRuntimeStatus: 'active',
      },
      resolvedDefault: {
        source: 'local',
        connectorId: '',
        model: 'flux-local',
        localModelId: 'flux-local',
        goRuntimeLocalModelId: 'go-flux-local',
        goRuntimeStatus: 'active',
      },
      connectors: [],
      local: {
        models: [{
          localModelId: 'flux-local',
          model: 'flux-local',
          status: 'active',
          goRuntimeLocalModelId: 'go-flux-local',
          goRuntimeStatus: 'active',
          capabilities: ['image.generate'],
        }],
      },
    },
  }), true);
});

test('isMediaRouteReady is false for local route source when the model is not active', () => {
  const settings = createDefaultSettings({
    imageRouteSource: 'local',
    imageModel: '',
  });
  assert.equal(isMediaRouteReady({
    kind: 'image',
    settings,
    routeOptions: {
      selected: {
        source: 'local',
        connectorId: '',
        model: 'flux-local',
        localModelId: 'flux-local',
        goRuntimeLocalModelId: 'go-flux-local',
        goRuntimeStatus: 'installed',
      },
      resolvedDefault: {
        source: 'local',
        connectorId: '',
        model: 'flux-local',
        localModelId: 'flux-local',
        goRuntimeLocalModelId: 'go-flux-local',
        goRuntimeStatus: 'installed',
      },
      connectors: [],
      local: {
        models: [{
          localModelId: 'flux-local',
          model: 'flux-local',
          status: 'installed',
          goRuntimeLocalModelId: 'go-flux-local',
          goRuntimeStatus: 'installed',
          capabilities: ['image.generate'],
        }],
      },
    },
  }), false);
});

test('isMediaRouteReady requires connector when route source is cloud', () => {
  const settingsMissingConnector = createDefaultSettings({
    imageRouteSource: 'cloud',
    imageConnectorId: '',
  });
  const settingsWithConnector = createDefaultSettings({
    imageRouteSource: 'cloud',
    imageConnectorId: 'connector-1',
  });
  assert.equal(isMediaRouteReady({ kind: 'image', settings: settingsMissingConnector }), false);
  assert.equal(isMediaRouteReady({ kind: 'image', settings: settingsWithConnector }), true);
});
