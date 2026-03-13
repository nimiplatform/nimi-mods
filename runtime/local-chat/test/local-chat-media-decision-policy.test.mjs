import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTINUITY_REFERENCE_RE,
  RECENT_CONVERSATION_SUMMARY_RE,
  RECENT_MEDIA_RE,
  VISUAL_ANCHOR_RE,
} from './helpers/prompt-matchers.mjs';
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
      autonomy: settings.voiceAutonomy,
      conversationMode: settings.voiceConversationMode,
      autoPlayReplies: settings.autoPlayVoiceReplies,
      selectedVoiceId: settings.voiceName || null,
      selectionMode: settings.voiceName ? 'manual' : 'auto',
    },
    mediaPolicy: {
      autonomy: settings.mediaAutonomy,
      visualComfortLevel: settings.visualComfortLevel,
      routeSource: 'local',
      nsfwPolicy: 'disabled',
      allowVisualAuto: settings.mediaAutonomy === 'natural' && settings.visualComfortLevel !== 'text-only',
      allowAutoVisualHighRisk: false,
      ...(overrides.mediaPolicy || {}),
    },
    contentBoundary: {
      relationshipBoundaryPreset: settings.relationshipBoundaryPreset,
      visualComfortLevel: settings.visualComfortLevel,
      routeSource: 'local',
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
    agentMetadata: {
      persona: '安静、克制、会在深夜自然陪伴用户',
    },
    agentProfile: {
      persona: '温柔里带一点疏离感',
      dna: {
        personality: {
          summary: '安静、克制、深夜感很强',
        },
        appearance: {
          hairColor: '黑色',
          hairStyle: '长发',
          eyeColor: '浅灰色眼睛',
          bodyType: '偏瘦',
          defaultOutfit: '宽松家居衬衫',
          fashionStyle: 'casual-home',
          artStyle: 'photoreal',
        },
      },
    },
  };
}

function createDependencySnapshot(capability, status) {
  return {
    modId: 'local-chat',
    status,
    routeSource: 'local',
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

test('media decision policy keeps explicit image request aligned with runtime path even when dependency snapshot is stale', async () => {
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
      imageRouteSource: 'local',
    },
    resolvedPolicy: createResolvedPolicy({
      ...DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS,
      imageRouteSource: 'local',
    }, {
      mediaPolicy: {
        routeSource: 'local',
      },
    }),
    userText: '给我来张图',
    assistantText: '当然。',
    target: createTarget(),
    worldId: 'world.policy',
    messages: [],
    promptTrace: null,
    nsfwPolicy: 'allowed',
    fallbackRouteSource: 'local',
    imageDependencySnapshot: createDependencySnapshot('image', 'missing'),
    videoDependencySnapshot: createDependencySnapshot('video', 'ready'),
    markerOverrideIntent: null,
  });

  assert.equal(result.kind, 'execute');
  assert.equal(result.promptTracePatch.mediaDecisionSource, 'explicit');
  assert.equal(result.promptTracePatch.mediaExecutionStatus, 'pending');
  assert.equal(result.promptTracePatch.plannerUsed, false);
});

test('media decision policy keeps scene-only explicit image requests focused on environment instead of forcing the character into frame', async () => {
  const result = await decideMediaExecution({
    aiClient: {
      generateObject: async () => {
        throw new Error('planner should not run for explicit request');
      },
    },
    turnTxnId: 'txn-explicit-scene-only',
    routeBinding: null,
    defaultSettings: {
      ...DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS,
      imageRouteSource: 'local',
    },
    resolvedPolicy: createResolvedPolicy({
      ...DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS,
      imageRouteSource: 'local',
    }, {
      mediaPolicy: {
        routeSource: 'local',
      },
    }),
    userText: '给我来一张山、天空和白云的图片，只看风景，不要人物。',
    assistantText: '这会儿山间都是云雾，天色也很开阔。',
    target: createTarget(),
    worldId: 'world.policy',
    messages: [],
    promptTrace: null,
    nsfwPolicy: 'allowed',
    fallbackRouteSource: 'local',
    imageDependencySnapshot: createDependencySnapshot('image', 'ready'),
    videoDependencySnapshot: createDependencySnapshot('video', 'missing'),
    markerOverrideIntent: null,
  });

  assert.equal(result.kind, 'execute');
  if (result.kind !== 'execute') {
    return;
  }
  const compiledPrompt = result.prepared.compiled.compiledPromptText;
  assert.doesNotMatch(compiledPrompt, /Policy Bot/u);
  assert.doesNotMatch(compiledPrompt, /保持同一角色稳定外观|不要换成另一位角色/u);
  assert.match(compiledPrompt, /no people|不要出现人物/u);
  assert.equal(result.prepared.spec.requestedSize, '1536x1024');
});

test('media decision policy does not block cloud image planner execution when local dependency snapshot is still empty', async () => {
  const result = await decideMediaExecution({
    aiClient: {
      generateObject: async () => ({
        object: {
          version: 'v1',
          kind: 'image',
          trigger: 'scene-enhancement',
          confidence: 0.9,
          prompt: '云雾缭绕的群山远景',
          reason: 'misty mountain vista with strong visual scene detail',
          subject: '被云雾环绕的远山',
          scene: '层叠山脊与流动云海',
          styleIntent: '真实写实风景照片',
          nsfwIntent: 'none',
        },
        traceId: 'trace-cloud-image-planner',
        route: {
          source: 'cloud',
          model: 'chat-cloud-model',
        },
      }),
    },
    turnTxnId: 'txn-cloud-image-null-dependency',
    routeBinding: null,
    defaultSettings: {
      ...DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS,
      imageRouteSource: 'cloud',
      imageConnectorId: 'connector.cloud.image',
      imageModel: 'gemini-3.1-flash-image-preview',
    },
    resolvedPolicy: createResolvedPolicy({
      ...DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS,
      imageRouteSource: 'cloud',
      imageConnectorId: 'connector.cloud.image',
      imageModel: 'gemini-3.1-flash-image-preview',
    }, {
      mediaPolicy: {
        routeSource: 'cloud',
      },
      contentBoundary: {
        routeSource: 'cloud',
      },
    }),
    userText: '这里的云雾缭绕，你能让我也看看吗？',
    assistantText: '我正站在山脊边上，云雾从脚下漫过去，画面很适合拍给你看。',
    target: createTarget(),
    worldId: 'world.policy',
    messages: [],
    promptTrace: null,
    nsfwPolicy: 'allowed',
    fallbackRouteSource: 'local',
    imageDependencySnapshot: null,
    videoDependencySnapshot: createDependencySnapshot('video', 'missing'),
    markerOverrideIntent: null,
  });

  assert.equal(result.kind, 'execute');
  if (result.kind !== 'execute') {
    return;
  }
  assert.equal(result.intent.type, 'image');
  assert.equal(result.resolvedRoute.source, 'cloud');
  assert.equal(result.promptTracePatch.mediaExecutionStatus, 'pending');
});

test('media decision policy keeps scenic planner requests environment-only unless the user explicitly asks for a person', async () => {
  const result = await decideMediaExecution({
    aiClient: {
      generateObject: async () => ({
        object: {
          version: 'v1',
          kind: 'image',
          trigger: 'scene-enhancement',
          confidence: 0.91,
          prompt: '灵界山川云海',
          reason: 'mountain and cloudscape scene is visually strong',
          subject: 'Policy Bot 站在山巅眺望云海',
          scene: '层叠群山、天空和白云翻涌成海',
          styleIntent: '写实山景，淡墨感氛围',
          nsfwIntent: 'none',
          hints: {
            composition: 'wide panoramic establishing shot',
          },
        },
        traceId: 'trace-scenic-planner-environment',
        route: {
          source: 'cloud',
          model: 'chat-cloud-model',
        },
      }),
    },
    turnTxnId: 'txn-scenic-planner-environment',
    routeBinding: null,
    defaultSettings: {
      ...DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS,
      imageRouteSource: 'cloud',
      imageConnectorId: 'connector.cloud.image',
      imageModel: 'gemini-3.1-flash-image-preview',
    },
    resolvedPolicy: createResolvedPolicy({
      ...DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS,
      imageRouteSource: 'cloud',
      imageConnectorId: 'connector.cloud.image',
      imageModel: 'gemini-3.1-flash-image-preview',
    }, {
      mediaPolicy: {
        routeSource: 'cloud',
      },
      contentBoundary: {
        routeSource: 'cloud',
      },
    }),
    userText: '听说灵界的山云雾缭绕，你能让我也看看吗？我想看山，看天，看白云！',
    assistantText: '灵界的山川云海确实比别处要灵动些，此时雾气正浓，瞧着真像是一幅泼墨画卷呢。',
    target: createTarget(),
    worldId: 'world.policy',
    messages: [],
    promptTrace: null,
    nsfwPolicy: 'allowed',
    fallbackRouteSource: 'cloud',
    imageDependencySnapshot: null,
    videoDependencySnapshot: createDependencySnapshot('video', 'missing'),
    markerOverrideIntent: null,
  });

  assert.equal(result.kind, 'execute');
  if (result.kind !== 'execute') {
    return;
  }
  const compiledPrompt = result.prepared.compiled.compiledPromptText;
  assert.doesNotMatch(compiledPrompt, /Policy Bot|保持同一角色稳定外观|不要换成另一位角色/u);
  assert.match(compiledPrompt, /不要出现人物|no people/u);
  assert.equal(result.resolvedRoute.source, 'cloud');
  assert.equal(result.prepared.spec.requestedSize, '1536x1024');
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
          source: 'local',
          model: 'chat-model',
        },
      }),
    },
    turnTxnId: 'txn-planner-ok',
    routeBinding: null,
    defaultSettings: {
      ...DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS,
      imageRouteSource: 'local',
    },
    resolvedPolicy: createResolvedPolicy({
      ...DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS,
      imageRouteSource: 'local',
    }, {
      mediaPolicy: {
        routeSource: 'local',
      },
    }),
    userText: '刚刚那个霓虹雨夜、潮湿街道、玻璃反光和侧脸特写的画面像电影一样。',
    assistantText: '我正靠在被霓虹灯照亮的窗边，雨水顺着玻璃往下滑，灯光把轮廓和神情都压得很有电影感。',
    target: createTarget(),
    worldId: 'world.policy',
    messages: [],
    promptTrace: null,
    nsfwPolicy: 'allowed',
    fallbackRouteSource: 'local',
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

test('media decision policy still blocks local planner execution when local image dependency snapshot is missing', async () => {
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
        traceId: 'trace-local-image-missing-dependency',
        route: {
          source: 'local',
          model: 'chat-model',
        },
      }),
    },
    turnTxnId: 'txn-local-image-missing-dependency',
    routeBinding: null,
    defaultSettings: {
      ...DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS,
      imageRouteSource: 'local',
    },
    resolvedPolicy: createResolvedPolicy({
      ...DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS,
      imageRouteSource: 'local',
    }, {
      mediaPolicy: {
        routeSource: 'local',
      },
    }),
    userText: '刚刚那个霓虹雨夜、潮湿街道、玻璃反光和侧脸特写的画面像电影一样。',
    assistantText: '我正靠在被霓虹灯照亮的窗边，雨水顺着玻璃往下滑，灯光把轮廓和神情都压得很有电影感。',
    target: createTarget(),
    worldId: 'world.policy',
    messages: [],
    promptTrace: null,
    nsfwPolicy: 'allowed',
    fallbackRouteSource: 'local',
    imageDependencySnapshot: null,
    videoDependencySnapshot: createDependencySnapshot('video', 'missing'),
    markerOverrideIntent: null,
  });

  assert.equal(result.kind, 'none');
  assert.equal(result.promptTracePatch.plannerBlockedReason, 'no-ready-media-route');
});

test('media decision policy blocks automatic high-risk visuals when relationship boundary is not close', async () => {
  const result = await decideMediaExecution({
    aiClient: {
      generateObject: async () => ({
        object: {
          version: 'v1',
          kind: 'image',
          trigger: 'scene-enhancement',
          confidence: 0.95,
          prompt: '贴身、半裸、暧昧靠近的卧室近景',
          reason: 'intimate close-up with clearly sexualized framing',
          subject: '靠得很近、衣料松开的她',
          scene: '卧室里暧昧贴近、几乎半裸的近景画面',
          styleIntent: '高风险亲密视觉表达',
          nsfwIntent: 'suggested',
        },
        traceId: 'trace-media-boundary',
        route: {
          source: 'local',
          model: 'chat-model',
        },
      }),
    },
    turnTxnId: 'txn-planner-boundary-blocked',
    routeBinding: null,
    defaultSettings: {
      ...DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS,
      imageRouteSource: 'local',
      mediaAutonomy: 'natural',
      visualComfortLevel: 'natural-visuals',
    },
    resolvedPolicy: createResolvedPolicy({
      ...DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS,
      imageRouteSource: 'local',
      mediaAutonomy: 'natural',
      visualComfortLevel: 'natural-visuals',
    }, {
      mediaPolicy: {
        routeSource: 'local',
        nsfwPolicy: 'allowed',
        allowVisualAuto: true,
        allowAutoVisualHighRisk: false,
      },
      contentBoundary: {
        relationshipBoundaryPreset: 'balanced',
        relationshipState: 'warm',
      },
    }),
    userText: '我想象你把衬衫滑到肩头，贴得很近。',
    assistantText: '我靠得很近，衣料松开了一点，呼吸都变得暧昧。',
    target: createTarget(),
    worldId: 'world.policy',
    messages: [],
    promptTrace: null,
    nsfwPolicy: 'allowed',
    fallbackRouteSource: 'local',
    imageDependencySnapshot: createDependencySnapshot('image', 'ready'),
    videoDependencySnapshot: createDependencySnapshot('video', 'ready'),
    markerOverrideIntent: null,
  });

  assert.equal(result.kind, 'none');
  assert.equal(result.promptTracePatch.plannerBlockedReason, 'relationship-boundary-blocked');
});

test('media decision policy resolves auto image route via preflight for explicit request', async () => {
  const result = await decideMediaExecution({
    aiClient: {
      generateObject: async () => {
        throw new Error('planner should not run for explicit request');
      },
      resolveRoute: async () => ({
        source: 'local',
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
        routeSource: 'local',
      },
    }),
    userText: '给我来一张图',
    assistantText: '当然。',
    target: createTarget(),
    worldId: 'world.policy',
    messages: [],
    promptTrace: null,
    nsfwPolicy: 'allowed',
    fallbackRouteSource: 'local',
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
  assert.equal(result.resolvedRoute.source, 'local');
  assert.equal(result.promptTracePatch.mediaDecisionSource, 'explicit');
  assert.equal(result.promptTracePatch.mediaRouteResolvedBy, 'preflight');
});

test('media decision policy enriches explicit image request with visual anchor and continuity cues', async () => {
  const result = await decideMediaExecution({
    aiClient: {
      generateObject: async () => {
        throw new Error('planner should not run for explicit request');
      },
    },
    turnTxnId: 'txn-explicit-enriched',
    routeBinding: null,
    defaultSettings: {
      ...DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS,
      imageRouteSource: 'local',
    },
    resolvedPolicy: createResolvedPolicy({
      ...DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS,
      imageRouteSource: 'local',
    }, {
      mediaPolicy: {
        routeSource: 'local',
      },
    }),
    userText: '发张照片看看',
    assistantText: '我刚靠在窗边回你消息。',
    target: createTarget(),
    worldId: 'world.policy',
    messages: [{
      id: 'assistant-image-1',
      role: 'assistant',
      kind: 'image',
      content: '',
      timestamp: new Date('2026-03-08T22:00:00.000Z'),
      meta: {
        mediaShadow: {
          kind: 'image',
          status: 'ready',
          subject: 'Policy Bot，黑色长发，宽松家居衬衫',
          scene: '雨夜窗边，暖灯下回消息',
          styleIntent: '电影感、生活流、私聊自拍感',
          mood: '安静、亲近',
          routeSource: 'local',
          routeModel: 'flux-local',
          assetOrigin: 'generated',
          shadowText: '[media:image:ready] subject=Policy Bot，黑色长发，宽松家居衬衫',
        },
      },
    }],
    promptTrace: null,
    nsfwPolicy: 'allowed',
    fallbackRouteSource: 'local',
    imageDependencySnapshot: createDependencySnapshot('image', 'ready'),
    videoDependencySnapshot: createDependencySnapshot('video', 'missing'),
    markerOverrideIntent: null,
  });

  assert.equal(result.kind, 'execute');
  if (result.kind !== 'execute') {
    return;
  }
  const compiledPrompt = result.prepared.compiled.compiledPromptText;
  assert.match(compiledPrompt, /Policy Bot/u);
  assert.match(compiledPrompt, /黑色.*长发|浅灰色眼睛|宽松家居衬衫/u);
  assert.match(compiledPrompt, CONTINUITY_REFERENCE_RE);
  assert.match(compiledPrompt, RECENT_MEDIA_RE);
});

test('media decision policy passes visual anchor and recent turn context into planner prompt', async () => {
  let capturedPrompt = '';
  const result = await decideMediaExecution({
    aiClient: {
      generateObject: async (request) => {
        capturedPrompt = String(request.prompt || '');
        return {
          object: {
            kind: 'none',
            trigger: 'none',
            confidence: 0.15,
            subject: '',
            scene: '',
            styleIntent: '',
            mood: '',
            reason: 'no media needed',
            nsfwIntent: 'none',
          },
          traceId: 'trace-media-policy-context',
          route: {
            source: 'local',
            model: 'chat-model',
          },
        };
      },
    },
    turnTxnId: 'txn-planner-context',
    routeBinding: null,
    defaultSettings: {
      ...DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS,
      imageRouteSource: 'local',
    },
    resolvedPolicy: createResolvedPolicy({
      ...DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS,
      imageRouteSource: 'local',
    }, {
      mediaPolicy: {
        routeSource: 'local',
      },
    }),
    userText: '刚才那个雨夜窗边回消息的画面很有感觉。',
    assistantText: '我正靠在窗边回你消息，灯光把侧脸压得很安静。',
    target: createTarget(),
    worldId: 'world.policy',
    messages: [{
      id: 'user-prev',
      role: 'user',
      kind: 'text',
      content: '你穿着那件宽松衬衫的时候很好看。',
      timestamp: new Date('2026-03-08T21:58:00.000Z'),
    }],
    promptTrace: null,
    nsfwPolicy: 'allowed',
    fallbackRouteSource: 'local',
    imageDependencySnapshot: createDependencySnapshot('image', 'ready'),
    videoDependencySnapshot: createDependencySnapshot('video', 'missing'),
    markerOverrideIntent: null,
  });

  assert.equal(result.kind, 'none');
  assert.match(capturedPrompt, VISUAL_ANCHOR_RE);
  assert.match(capturedPrompt, RECENT_CONVERSATION_SUMMARY_RE);
  assert.match(capturedPrompt, CONTINUITY_REFERENCE_RE);
});
