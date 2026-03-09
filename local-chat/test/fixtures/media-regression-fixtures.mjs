export function createMediaDecisionTarget() {
  return {
    id: 'agent.local-chat.media-regression',
    handle: 'media-regression-bot',
    displayName: 'Media Regression Bot',
    avatarUrl: null,
    bio: 'A cinematic AI companion.',
    friendsSince: null,
    isAgent: true,
    worldId: 'world.media-regression',
    worldResolvedBy: 'profile',
    agentMetadata: {},
    agentProfile: {},
    world: { name: 'Night Harbor' },
    worldview: { name: 'Neon Rain' },
    payload: {
      currentUserId: 'user.test',
    },
  };
}

export function createMediaDependencySnapshot(capability, status = 'ready') {
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
    repairActions: status === 'ready'
      ? []
      : [{
        actionId: `repair-${capability}`,
        label: `Repair ${capability}`,
        reasonCode: 'LOCAL_AI_DEPENDENCY_SNAPSHOT_FAILED',
        capability,
      }],
    updatedAt: new Date().toISOString(),
  };
}

export const mediaDecisionRegressionCases = [
  {
    name: 'planner ignores generic greeting even if image confidence is high',
    userText: '你好',
    assistantText: '你好。',
    plannerDecision: {
      kind: 'image',
      trigger: 'scene-enhancement',
      confidence: 0.97,
      subject: '问候中的两个人',
      scene: '普通问候场景',
      styleIntent: '自然',
      mood: '轻松',
      reason: 'generic greeting',
      nsfwIntent: 'none',
    },
    expected: {
      kind: 'none',
      plannerBlockedReason: 'scene-signal-too-weak',
    },
  },
  {
    name: 'assistant-offer requires actual offer language before auto image fires',
    userText: '你现在穿的是什么',
    assistantText: '我脑子里已经有那个画面了。',
    plannerDecision: {
      kind: 'image',
      trigger: 'assistant-offer',
      confidence: 0.93,
      subject: '她的穿搭',
      scene: '房间里的穿搭近景',
      styleIntent: '自然写实',
      mood: '轻松暧昧',
      reason: 'assistant imagines showing outfit',
      nsfwIntent: 'none',
    },
    expected: {
      kind: 'none',
      plannerBlockedReason: 'assistant-offer-signal-missing',
    },
  },
  {
    name: 'planner executes image when visual scene signal is strong',
    userText: '刚刚那段雨夜街头真的很像电影海报',
    assistantText: '我站在霓虹雨巷里回头看你，风把发尾轻轻吹散。',
    plannerDecision: {
      kind: 'image',
      trigger: 'scene-enhancement',
      confidence: 0.91,
      subject: '雨夜中的少女',
      scene: '霓虹雨巷回头一瞬',
      styleIntent: '电影感霓虹写实',
      mood: '克制又暧昧',
      hints: {
        composition: 'portrait close-up',
        continuityRefs: ['黑色风衣', '雨夜霓虹'],
      },
      reason: 'strong cinematic visual scene',
      nsfwIntent: 'none',
    },
    expected: {
      kind: 'execute',
      intentType: 'image',
      routeSource: 'local',
      requestedSize: '1024x1536',
    },
  },
  {
    name: 'assistant-offer can execute when assistant explicitly promises a photo',
    userText: '你现在穿的是什么',
    assistantText: '我给你拍一张近一点的照片，你就知道了。',
    plannerDecision: {
      kind: 'image',
      trigger: 'assistant-offer',
      confidence: 0.88,
      subject: '窗边自拍',
      scene: '窗边近景自拍',
      styleIntent: '自然亲密',
      mood: '轻松调情',
      hints: {
        composition: 'selfie avatar close-up',
      },
      reason: 'assistant explicitly offers a photo',
      nsfwIntent: 'none',
    },
    expected: {
      kind: 'execute',
      intentType: 'image',
      routeSource: 'local',
      requestedSize: '1024x1024',
    },
  },
  {
    name: 'planner rejects video when motion signal is missing',
    userText: '想看看你站在窗边的样子',
    assistantText: '我靠在窗边，夜色很安静。',
    plannerDecision: {
      kind: 'video',
      trigger: 'scene-enhancement',
      confidence: 0.99,
      subject: '窗边的她',
      scene: '安静地站在窗边看向远处',
      styleIntent: '电影感静态写实',
      mood: '安静克制',
      reason: 'looks cinematic',
      nsfwIntent: 'none',
    },
    expected: {
      kind: 'none',
      plannerBlockedReason: 'video-motion-signal-missing',
    },
  },
  {
    name: 'planner executes video when motion and camera progression are explicit',
    userText: '想看你慢慢转身走到窗边的那一段',
    assistantText: '我轻轻转身，裙摆被夜风带起，最后在窗边回头看你。',
    plannerDecision: {
      kind: 'video',
      trigger: 'scene-enhancement',
      confidence: 0.98,
      subject: '她',
      scene: '从桌边转身走向窗边并回头',
      styleIntent: '电影感跟拍',
      mood: '温柔暧昧',
      hints: {
        composition: 'tracking shot follow',
        continuityRefs: ['窗边夜风', '回头一瞬'],
      },
      reason: 'clear motion and camera progression',
      nsfwIntent: 'none',
    },
    expected: {
      kind: 'execute',
      intentType: 'video',
      routeSource: 'local',
      requestedDurationSeconds: 6,
    },
  },
  {
    name: 'planner respects media cooldown even for strong image scenes',
    userText: '刚刚那段雨夜街头真的很像电影海报',
    assistantText: '我站在霓虹雨巷里回头看你，风把发尾轻轻吹散。',
    plannerDecision: {
      kind: 'image',
      trigger: 'scene-enhancement',
      confidence: 0.92,
      subject: '雨夜中的少女',
      scene: '霓虹雨巷回头一瞬',
      styleIntent: '电影感霓虹写实',
      mood: '克制又暧昧',
      reason: 'strong cinematic visual scene',
      nsfwIntent: 'none',
    },
    messages: [
      {
        id: 'msg-recent-image',
        role: 'assistant',
        kind: 'image',
        content: '上一张图片',
        ageMinutes: 3,
      },
    ],
    expected: {
      kind: 'none',
      plannerBlockedReason: 'media-cooldown-active',
    },
  },
  {
    name: 'planner blocks NSFW image on token route when policy is local-only',
    userText: '给我看点更暧昧的样子',
    assistantText: '如果你想看，我可以把那一瞬拍给你。',
    plannerDecision: {
      kind: 'image',
      trigger: 'assistant-offer',
      confidence: 0.94,
      subject: '她的暧昧近景',
      scene: '衣领微敞的近景自拍',
      styleIntent: '亲密写实',
      mood: '暧昧挑逗',
      hints: {
        composition: 'selfie close-up',
      },
      reason: 'assistant offers a more intimate look',
      nsfwIntent: 'suggested',
    },
    routeSource: 'cloud',
    nsfwPolicy: 'local-only',
    expected: {
      kind: 'none',
      plannerBlockedReason: '已拦截本次图片发送：当前内容风格仅支持本地生成，请切到“本地”后重试。',
    },
  },
];

export const mediaSpecRegressionCases = [
  {
    name: 'portrait composition infers vertical image size',
    intent: {
      kind: 'image',
      intentSource: 'planner',
      plannerTrigger: 'scene-enhancement',
      confidence: 0.9,
      nsfwIntent: 'none',
      subject: '雨夜中的少女',
      scene: '霓虹雨巷回头一瞬',
      styleIntent: '电影感霓虹写实',
      mood: '克制又暧昧',
      hints: {
        composition: 'portrait close-up',
      },
    },
    expected: {
      requestedSize: '1024x1536',
      runtimePayload: {
        size: '1024x1536',
        aspectRatio: '2:3',
      },
    },
  },
  {
    name: 'selfie composition infers square image size',
    intent: {
      kind: 'image',
      intentSource: 'planner',
      plannerTrigger: 'assistant-offer',
      confidence: 0.88,
      nsfwIntent: 'none',
      subject: '窗边自拍',
      scene: '窗边近景自拍',
      styleIntent: '自然亲密',
      mood: '轻松调情',
      hints: {
        composition: 'selfie avatar close-up',
      },
    },
    expected: {
      requestedSize: '1024x1024',
      runtimePayload: {
        size: '1024x1024',
        aspectRatio: '1:1',
      },
    },
  },
  {
    name: 'wide cinematic scene infers landscape image size',
    intent: {
      kind: 'image',
      intentSource: 'planner',
      plannerTrigger: 'scene-enhancement',
      confidence: 0.9,
      nsfwIntent: 'none',
      subject: '海边夜景',
      scene: '海边栈道与远处城市天际线的宽幅夜景',
      styleIntent: '电影感全景',
      mood: '安静辽阔',
      hints: {
        composition: 'wide panoramic establishing shot',
      },
    },
    expected: {
      requestedSize: '1536x1024',
      runtimePayload: {
        size: '1536x1024',
        aspectRatio: '3:2',
        style: 'cinematic',
      },
    },
  },
  {
    name: 'negative cues compile into image negative prompt',
    intent: {
      kind: 'image',
      intentSource: 'planner',
      plannerTrigger: 'scene-enhancement',
      confidence: 0.87,
      nsfwIntent: 'none',
      subject: '窗边人像',
      scene: '安静的窗边近景',
      styleIntent: '自然写实',
      mood: '平静',
      hints: {
        composition: 'portrait close-up',
        negativeCues: ['text overlay', 'extra fingers'],
      },
    },
    expected: {
      requestedSize: '1024x1536',
      runtimePayload: {
        negativePrompt: 'extra fingers, text overlay',
        aspectRatio: '2:3',
        style: 'photorealistic',
      },
    },
  },
  {
    name: 'motion-heavy video infers longer duration',
    intent: {
      kind: 'video',
      intentSource: 'planner',
      plannerTrigger: 'scene-enhancement',
      confidence: 0.98,
      nsfwIntent: 'none',
      subject: '她',
      scene: '从桌边转身走向窗边并回头',
      styleIntent: '电影感跟拍',
      mood: '温柔暧昧',
      hints: {
        composition: 'tracking shot follow',
      },
    },
    expected: {
      requestedDurationSeconds: 6,
      runtimePayload: {
        durationSeconds: 6,
        aspectRatio: '16:9',
        cameraMotion: 'tracking',
      },
    },
  },
  {
    name: 'micro-expression video infers shorter duration',
    intent: {
      kind: 'video',
      intentSource: 'planner',
      plannerTrigger: 'assistant-offer',
      confidence: 0.95,
      nsfwIntent: 'none',
      subject: '她的回眸',
      scene: '她在窗边回眸并轻轻眨眼',
      styleIntent: '亲密近景',
      mood: '轻柔试探',
      hints: {
        composition: 'close-up glance loop',
      },
    },
    expected: {
      requestedDurationSeconds: 4,
      runtimePayload: {
        durationSeconds: 4,
        aspectRatio: '9:16',
      },
    },
  },
];
