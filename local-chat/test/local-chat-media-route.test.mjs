import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isMediaRouteReady,
  resolveMediaRouteConfig,
  toPinnedRouteBinding,
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
  assert.equal(resolved.routeBinding, undefined);
});

test('toPinnedRouteBinding keeps token-api connector and model', () => {
  const binding = toPinnedRouteBinding({
    source: 'token-api',
    connectorId: 'connector-a',
    model: 'gpt-image-1',
  });

  assert.deepEqual(binding, {
    source: 'token-api',
    connectorId: 'connector-a',
    model: 'gpt-image-1',
  });
});

test('toPinnedRouteBinding keeps local-runtime model and localModelId', () => {
  const binding = toPinnedRouteBinding({
    source: 'local-runtime',
    connectorId: '',
    localModelId: 'z-image-turbo',
    model: 'z-image-turbo',
  });

  assert.deepEqual(binding, {
    source: 'local-runtime',
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
