import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS } from '../src/state/index.ts';
import { decideMediaExecution } from '../src/hooks/turn-send/media-decision-policy.ts';

function createResolvedPolicy(settings = DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS, overrides = {}) {
  return {
    deliveryPolicy: {
      style: settings.deliveryStyle,
      allowMultiReply: settings.deliveryStyle === 'natural',
    },
    voicePolicy: {
      enabled: settings.enableVoice,
      conversationMode: settings.voiceConversationMode,
      autoPlayReplies: settings.autoPlayVoiceReplies,
      selectedVoiceId: settings.voiceName || null,
      selectionMode: settings.voiceName ? 'manual' : 'auto',
    },
    mediaPolicy: {
      autonomy: settings.mediaAutonomy,
      visualComfortLevel: settings.visualComfortLevel,
      routeSource: 'local-runtime',
      nsfwPolicy: 'disabled',
      allowVisualAuto: settings.mediaAutonomy === 'natural' && settings.visualComfortLevel !== 'text-only',
      allowAutoVisualHighRisk: false,
      ...(overrides.mediaPolicy || {}),
    },
    contentBoundary: {
      relationshipBoundaryPreset: settings.relationshipBoundaryPreset,
      visualComfortLevel: settings.visualComfortLevel,
      routeSource: 'local-runtime',
      relationshipState: 'new',
      ...(overrides.contentBoundary || {}),
    },
    inspectFlags: {
      diagnosticsVisible: true,
      runtimeInspectorVisible: false,
      ...(overrides.inspectFlags || {}),
    },
  };
}

function createTarget() {
  return {
    id: 'agent.media-policy',
    handle: 'policy-bot',
    displayName: 'Policy Bot',
    bio: 'A cinematic AI companion.',
    worldId: 'world.policy',
    world: { name: 'Night Harbor' },
    worldview: { name: 'Neon Rain' },
  };
}

function createDependencySnapshot(capability, status) {
  return {
    modId: 'local-chat',
    status,
    routeSource: 'local-runtime',
    warnings: [],
    dependencies: status === 'ready'
      ? [{
        dependencyId: `${capability}-model`,
        kind: 'model',
        capability,
        required: true,
        selected: true,
        preferred: true,
        warnings: [],
      }]
      : [],
    repairActions: [],
    updatedAt: new Date().toISOString(),
  };
}

test('media decision policy blocks explicit image request when dependency is not ready', async () => {
  const result = await decideMediaExecution({
    aiClient: {
      generateObject: async () => {
        throw new Error('planner should not run for explicit request');
      },
    },
    turnTxnId: 'txn-explicit-blocked',
    routeBinding: null,
    defaultSettings: {
      ...DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS,
      imageRouteSource: 'local-runtime',
    },
    resolvedPolicy: createResolvedPolicy({
      ...DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS,
      imageRouteSource: 'local-runtime',
    }, {
      mediaPolicy: {
        routeSource: 'local-runtime',
      },
    }),
    userText: '给我来张图',
    assistantText: '当然。',
    target: createTarget(),
    worldId: 'world.policy',
    messages: [],
    promptTrace: null,
    nsfwPolicy: 'allowed',
    fallbackRouteSource: 'local-runtime',
    imageDependencySnapshot: createDependencySnapshot('image', 'missing'),
    videoDependencySnapshot: createDependencySnapshot('video', 'ready'),
    markerOverrideIntent: null,
  });

  assert.equal(result.kind, 'blocked');
  assert.equal(result.promptTracePatch.mediaDecisionSource, 'explicit');
  assert.equal(result.promptTracePatch.mediaExecutionStatus, 'blocked');
  assert.equal(result.promptTracePatch.plannerUsed, false);
});

test('media decision policy returns planner execution decision when auto gate passes', async () => {
  const result = await decideMediaExecution({
    aiClient: {
      generateObject: async () => ({
        object: {
          version: 'v1',
          kind: 'image',
          trigger: 'scene-enhancement',
          confidence: 0.9,
          prompt: '电影感夜雨街头人像',
          reason: 'rainy neon street portrait with clear visual detail',
          subject: '站在霓虹雨夜街头、被灯光和雨水一起包住的她',
          scene: '霓虹灯映着潮湿街道和玻璃反光的雨夜街边场景',
          styleIntent: '电影感近景特写，强调灯光、雨丝、侧脸和氛围细节',
          nsfwIntent: 'none',
        },
        traceId: 'trace-media-policy',
        route: {
          source: 'local-runtime',
          model: 'chat-model',
        },
      }),
    },
    turnTxnId: 'txn-planner-ok',
    routeBinding: null,
    defaultSettings: {
      ...DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS,
      imageRouteSource: 'local-runtime',
    },
    resolvedPolicy: createResolvedPolicy({
      ...DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS,
      imageRouteSource: 'local-runtime',
    }, {
      mediaPolicy: {
        routeSource: 'local-runtime',
      },
    }),
    userText: '刚刚那个霓虹雨夜、潮湿街道、玻璃反光和侧脸特写的画面像电影一样。',
    assistantText: '我正靠在被霓虹灯照亮的窗边，雨水顺着玻璃往下滑，灯光把轮廓和神情都压得很有电影感。',
    target: createTarget(),
    worldId: 'world.policy',
    messages: [],
    promptTrace: null,
    nsfwPolicy: 'allowed',
    fallbackRouteSource: 'local-runtime',
    imageDependencySnapshot: createDependencySnapshot('image', 'ready'),
    videoDependencySnapshot: createDependencySnapshot('video', 'missing'),
    markerOverrideIntent: null,
  });

  assert.equal(result.kind, 'execute');
  if (result.kind !== 'execute') {
    return;
  }
  assert.equal(result.intent.type, 'image');
  assert.equal(result.promptTracePatch.plannerUsed, true);
  assert.equal(result.promptTracePatch.mediaDecisionSource, 'planner');
  assert.equal(result.promptTracePatch.mediaExecutionStatus, 'pending');
});

test('media decision policy resolves auto image route via preflight for explicit request', async () => {
  const result = await decideMediaExecution({
    aiClient: {
      generateObject: async () => {
        throw new Error('planner should not run for explicit request');
      },
      resolveRoute: async () => ({
        source: 'local-runtime',
        provider: 'localai',
        model: 'flux-local',
      }),
    },
    turnTxnId: 'txn-explicit-auto-preflight',
    routeBinding: null,
    defaultSettings: {
      ...DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS,
      imageRouteSource: 'auto',
    },
    resolvedPolicy: createResolvedPolicy({
      ...DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS,
      imageRouteSource: 'auto',
    }, {
      mediaPolicy: {
        routeSource: 'local-runtime',
      },
    }),
    userText: '给我来一张图',
    assistantText: '当然。',
    target: createTarget(),
    worldId: 'world.policy',
    messages: [],
    promptTrace: null,
    nsfwPolicy: 'allowed',
    fallbackRouteSource: 'local-runtime',
    imageRouteOptions: null,
    videoRouteOptions: null,
    imageRouteOptionsRevision: 1,
    videoRouteOptionsRevision: 1,
    imageResolvedRoute: null,
    videoResolvedRoute: null,
    imageDependencySnapshot: createDependencySnapshot('image', 'ready'),
    videoDependencySnapshot: createDependencySnapshot('video', 'missing'),
    markerOverrideIntent: null,
  });

  assert.equal(result.kind, 'execute');
  if (result.kind !== 'execute') {
    return;
  }
  assert.equal(result.resolvedRoute.source, 'local-runtime');
  assert.equal(result.promptTracePatch.mediaDecisionSource, 'explicit');
  assert.equal(result.promptTracePatch.mediaRouteResolvedBy, 'preflight');
});
