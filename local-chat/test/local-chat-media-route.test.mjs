import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isMediaRouteReady,
  resolveMediaRouteConfig,
  resolveMediaRouteFromOptions,
  toPinnedRouteOverride,
} from '../src/hooks/turn-send/media-route.ts';

function createDefaultSettings(overrides = {}) {
  return {
    enableVoice: false,
    allowMultiReply: false,
    allowProactiveContact: false,
    autoPlayVoiceReplies: false,
    allowNsfwMedia: false,
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
    fallbackSource: 'local-runtime',
  });

  assert.equal(resolved.routeSource, 'auto');
  assert.equal(resolved.model, undefined);
  assert.equal(resolved.routeOverride, undefined);
});

test('toPinnedRouteOverride keeps token-api connector and model', () => {
  const override = toPinnedRouteOverride({
    source: 'token-api',
    runtimeModelType: 'image',
    provider: 'openai',
    connectorId: 'connector-a',
    model: 'gpt-image-1',
    endpoint: 'https://example.com',
    localOpenAiEndpoint: 'http://127.0.0.1:11434/v1',
  });

  assert.deepEqual(override, {
    source: 'token-api',
    connectorId: 'connector-a',
    model: 'gpt-image-1',
  });
});

test('toPinnedRouteOverride keeps local-runtime model and localModelId', () => {
  const override = toPinnedRouteOverride({
    source: 'local-runtime',
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

  assert.deepEqual(override, {
    source: 'local-runtime',
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
      source: 'local-runtime',
      model: 'flux-local',
    },
    selected: null,
    connectors: [],
    localRuntime: {
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

test('isMediaRouteReady is true for local-runtime route source', () => {
  const settings = createDefaultSettings({
    imageRouteSource: 'local-runtime',
    imageModel: '',
  });
  assert.equal(isMediaRouteReady({ kind: 'image', settings }), true);
});

test('isMediaRouteReady requires connector when route source is token-api', () => {
  const settingsMissingConnector = createDefaultSettings({
    imageRouteSource: 'token-api',
    imageConnectorId: '',
  });
  const settingsWithConnector = createDefaultSettings({
    imageRouteSource: 'token-api',
    imageConnectorId: 'connector-1',
  });
  assert.equal(isMediaRouteReady({ kind: 'image', settings: settingsMissingConnector }), false);
  assert.equal(isMediaRouteReady({ kind: 'image', settings: settingsWithConnector }), true);
});
