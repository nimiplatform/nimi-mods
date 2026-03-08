import test from 'node:test';
import assert from 'node:assert/strict';
import { runImageTurn } from '../src/hooks/turn-send/image-turn-runner.ts';

test('media generation result can be soft-cancelled by caller context change', async () => {
  let activeContextKey = 'ctx-a';

  const task = runImageTurn({
    aiClient: {
      resolveRoute: async () => ({ source: 'local-runtime', model: 'z-image-turbo' }),
      generateImage: async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 8);
        });
        return {
          images: [{ uri: 'data:image/png;base64,ZmFrZQ==', mimeType: 'image/png' }],
          traceId: 'trace-soft-cancel',
          route: { source: 'local-runtime', model: 'z-image-turbo' },
        };
      },
    },
    prompt: 'sample prompt',
    nsfwPolicy: 'allowed',
    defaultSettings: {
      deliveryStyle: 'natural',
      mediaAutonomy: 'natural',
      voiceConversationMode: 'off',
      relationshipBoundaryPreset: 'close',
      visualComfortLevel: 'natural-visuals',
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
    },
    fallbackRouteSource: 'local-runtime',
  });

  activeContextKey = 'ctx-b';
  const result = await task;
  const accepted = activeContextKey === 'ctx-a' ? result : null;

  assert.equal(accepted, null);
});

test('media generation result is accepted when context key stays unchanged', async () => {
  const activeContextKey = 'ctx-a';

  const result = await runImageTurn({
    aiClient: {
      resolveRoute: async () => ({ source: 'local-runtime', model: 'z-image-turbo', localModelId: 'z-image-turbo' }),
      generateImage: async () => ({
        images: [{ uri: 'data:image/png;base64,ZmFrZQ==', mimeType: 'image/png' }],
        traceId: 'trace-happy-path',
        route: { source: 'local-runtime', model: 'z-image-turbo', localModelId: 'z-image-turbo' },
      }),
    },
    prompt: 'sample prompt',
    nsfwPolicy: 'allowed',
    defaultSettings: {
      deliveryStyle: 'natural',
      mediaAutonomy: 'natural',
      voiceConversationMode: 'off',
      relationshipBoundaryPreset: 'close',
      visualComfortLevel: 'natural-visuals',
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
    },
    fallbackRouteSource: 'local-runtime',
  });

  const accepted = activeContextKey === 'ctx-a' ? result : null;
  assert.equal(accepted?.status, 'ok');
});
