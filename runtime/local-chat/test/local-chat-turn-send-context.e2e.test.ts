import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTurnSendContextKey } from '../src/hooks/use-local-chat-turn-send.ts';
import type { UseLocalChatTurnSendInput } from '../src/hooks/turn-send/types.ts';

function createBaseInput(): UseLocalChatTurnSendInput {
  return {
    aiClient: {
      generateText: async () => ({ text: '' }),
      generateObject: async () => ({}),
      streamText: async function* () {},
      generateImage: async () => ({ image: '' }),
      generateVideo: async () => ({ video: '' }),
      resolveRoute: async () => ({ source: 'local', model: 'model-a' }),
    },
    viewerId: 'viewer.test',
    viewerDisplayName: 'Viewer',
    inputText: '你好',
    setInputText: () => {},
    runtimeMode: 'STORY',
    chatRouteOptions: null,
    imageRouteOptions: null,
    videoRouteOptions: null,
    imageRouteOptionsRevision: 1,
    videoRouteOptionsRevision: 1,
    routeBinding: null,
    routeSnapshot: {
      source: 'cloud',
      model: 'models/gemini-3-flash-preview',
    },
    imageResolvedRoute: null,
    videoResolvedRoute: null,
    defaultSettings: {
      deliveryStyle: 'natural',
      mediaAutonomy: 'natural',
      voiceAutonomy: 'off',
      voiceConversationMode: 'off',
      relationshipBoundaryPreset: 'balanced',
      visualComfortLevel: 'restrained-visuals',
      voiceName: 'alloy',
      allowProactiveContact: false,
      autoPlayVoiceReplies: false,
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
    selectedTarget: {
      id: 'target-1',
      displayName: 'Target',
      handle: '~target',
      bio: '',
      worldId: null,
      world: null,
      worldview: null,
      isAgent: true,
      avatarUrl: null,
    },
    selectedSessionId: 'session-1',
    messages: [],
    setMessages: () => [],
    setSessions: () => {},
    setSelectedSessionId: () => {},
    setLatestPromptTrace: () => {},
    setLatestTurnAudit: () => {},
    imageDependencySnapshot: {
      modId: 'world.nimi.local-chat',
      status: 'ready',
      routeSource: 'cloud',
      reasonCode: undefined,
      warnings: [],
      entries: [],
      repairActions: [],
      updatedAt: '2026-03-07T00:00:00.000Z',
    },
    videoDependencySnapshot: {
      modId: 'world.nimi.local-chat',
      status: 'ready',
      routeSource: 'cloud',
      reasonCode: undefined,
      warnings: [],
      entries: [],
      repairActions: [],
      updatedAt: '2026-03-07T00:00:00.000Z',
    },
    setStatusBanner: () => {},
  };
}

test('turn send context key stays stable across background route and dependency refreshes', () => {
  const base = createBaseInput();
  const baselineKey = buildTurnSendContextKey(base);

  const refreshedKey = buildTurnSendContextKey({
    ...base,
    imageRouteOptionsRevision: 9,
    videoRouteOptionsRevision: 12,
    imageResolvedRoute: {
      source: 'cloud',
      connectorId: 'connector-a',
      model: 'image-model-a',
      resolvedBy: 'preflight',
      resolvedAt: '2026-03-07T00:00:10.000Z',
      settingsRevision: 'settings-a',
      routeOptionsRevision: 9,
      provider: 'cloud',
    },
    imageDependencySnapshot: {
      ...base.imageDependencySnapshot!,
      updatedAt: '2026-03-07T00:00:10.000Z',
    },
    videoDependencySnapshot: {
      ...base.videoDependencySnapshot!,
      updatedAt: '2026-03-07T00:00:11.000Z',
    },
    defaultSettings: {
      ...base.defaultSettings,
      imageModel: 'image-model-a',
    },
  });

  assert.equal(refreshedKey, baselineKey);
});

test('turn send context key changes when session or target changes', () => {
  const base = createBaseInput();
  const baselineKey = buildTurnSendContextKey(base);

  const sessionChangedKey = buildTurnSendContextKey({
    ...base,
    selectedSessionId: 'session-2',
  });
  const targetChangedKey = buildTurnSendContextKey({
    ...base,
    selectedTarget: {
      ...base.selectedTarget!,
      id: 'target-2',
    },
  });

  assert.notEqual(sessionChangedKey, baselineKey);
  assert.notEqual(targetChangedKey, baselineKey);
});
