import test from 'node:test';
import assert from 'node:assert/strict';
import { planMediaTurn } from '../src/hooks/turn-send/media-planner.ts';

function createTarget() {
  return {
    id: 'agent.local-chat.test',
    handle: 'planner-bot',
    displayName: 'Planner Bot',
    avatarUrl: null,
    bio: 'A cinematic companion.',
    friendsSince: null,
    isAgent: true,
    worldId: 'world.test',
    worldResolvedBy: 'profile',
    agentMetadata: {},
    agentProfile: {},
    world: { name: 'Test World' },
    worldview: { name: 'Night City' },
    payload: {},
  };
}

test('media planner returns parsed decision on valid JSON object', async () => {
  const result = await planMediaTurn({
    aiClient: {
      generateObject: async (input) => {
        const text = JSON.stringify({
          version: 'v1',
          kind: 'image',
          trigger: 'scene-enhancement',
          confidence: 0.91,
          prompt: 'cinematic neon portrait',
          reason: 'visual scene',
          nsfwIntent: 'none',
        });
        return {
          object: input.parse ? input.parse(text) : JSON.parse(text),
          text,
          traceId: 'trace-media-planner-1',
          promptTraceId: 'trace-media-planner-1',
          route: {
            source: 'local',
            model: 'local-chat-model',
            localModelId: 'local-chat-model',
          },
        };
      },
    },
    routeBinding: null,
    userText: '刚刚那个场景很像电影镜头',
    assistantText: '我脑子里已经有画面了。',
    target: createTarget(),
    worldId: 'world.test',
    nsfwPolicy: 'allowed',
    imageReady: true,
    videoReady: false,
    imageDependencyStatus: 'ready',
    videoDependencyStatus: 'missing',
    recentMediaSummary: 'recentMedia=none · recentVideo=none · pending=no',
    promptTrace: null,
  });

  assert.equal(result.status, 'ok');
  if (result.status === 'ok') {
    assert.equal(result.decision.kind, 'image');
    assert.equal(result.decision.confidence, 0.91);
    assert.equal(result.routeSource, 'local');
  }
});

test('media planner silently reports failure on invalid JSON', async () => {
  const result = await planMediaTurn({
    aiClient: {
      generateObject: async (input) => {
        const text = 'not-json';
        if (input.parse) {
          input.parse(text);
        }
        return {
          object: {},
          text,
          traceId: 'trace-media-planner-bad',
          promptTraceId: 'trace-media-planner-bad',
          route: {
            source: 'cloud',
            connectorId: 'openai',
            model: 'gpt-5-mini',
          },
        };
      },
    },
    routeBinding: null,
    userText: '发点什么',
    assistantText: '普通聊天回复',
    target: createTarget(),
    worldId: 'world.test',
    nsfwPolicy: 'disabled',
    imageReady: false,
    videoReady: false,
    imageDependencyStatus: 'missing',
    videoDependencyStatus: 'missing',
    recentMediaSummary: 'recentMedia=none · recentVideo=none · pending=no',
    promptTrace: null,
  });

  assert.equal(result.status, 'failed');
});
