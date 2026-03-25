import test from 'node:test';
import assert from 'node:assert/strict';

import { orchestrateBeatModalities } from '../src/hooks/turn-send/modality-orchestrator.ts';
import type { ResolvedExperiencePolicy } from '../src/hooks/turn-send/resolved-experience-policy.ts';
import { resolveTurnMode } from '../src/hooks/turn-send/turn-mode-resolver.ts';
import type {
  DerivedInteractionProfile,
  InteractionBeat,
  InteractionSnapshot,
} from '../src/state/ledger-types.ts';

function createInteractionProfile(overrides: Partial<DerivedInteractionProfile> = {}): DerivedInteractionProfile {
  return {
    expression: {
      responseLength: 'medium',
      formality: 'casual',
      sentiment: 'positive',
      pacingBias: 'balanced',
      firstBeatStyle: 'gentle',
      infoAnswerStyle: 'balanced',
      ...(overrides.expression || {}),
    },
    relationship: {
      defaultDistance: 'friendly',
      warmth: 'warm',
      flirtAffinity: 'light',
      proactiveStyle: 'gentle',
      intimacyGuard: 'balanced',
      ...(overrides.relationship || {}),
    },
    voice: {
      voiceId: 'alloy',
      language: 'zh-CN',
      genderGuard: 'neutral',
      speedRange: 'balanced',
      pitchRange: 'mid',
      emotionEnabled: true,
      voiceAffinity: 'medium',
      ...(overrides.voice || {}),
    },
    visual: {
      artStyle: 'anime',
      fashionStyle: 'school-uniform',
      personaCue: 'gentle',
      nsfwLevel: 'safe',
      imageAffinity: 'medium',
      videoAffinity: 'low',
      ...(overrides.visual || {}),
    },
    modalityTraits: {
      textBias: 'medium',
      voiceBias: 'medium',
      imageBias: 'medium',
      videoBias: 'low',
      latencyTolerance: 'medium',
      ...(overrides.modalityTraits || {}),
    },
    signals: [...(overrides.signals || [])],
  };
}

function createBeat(overrides: Partial<InteractionBeat> = {}): InteractionBeat {
  return {
    beatId: 'beat-1',
    turnId: 'turn-1',
    beatIndex: 0,
    beatCount: 1,
    intent: 'answer',
    relationMove: 'friendly',
    sceneMove: 'chat',
    modality: 'text',
    text: '我在呢，刚好想回你一句。',
    pauseMs: 0,
    cancellationScope: 'turn',
    ...overrides,
  };
}

function createSnapshot(overrides: Partial<InteractionSnapshot> = {}): InteractionSnapshot {
  return {
    conversationId: 'conv-1',
    relationshipState: 'warm',
    activeScene: ['night-chat'],
    emotionalTemperature: 'warm',
    assistantCommitments: [],
    userPrefs: [],
    openLoops: [],
    topicThreads: [],
    lastResolvedTurnId: 'turn-0',
    updatedAt: '2026-03-08T00:00:00.000Z',
    ...overrides,
  };
}

function createResolvedExperiencePolicy(
  overrides: Partial<ResolvedExperiencePolicy> = {},
): ResolvedExperiencePolicy {
  return {
    deliveryPolicy: {
      style: 'natural',
      allowMultiReply: true,
      ...(overrides.deliveryPolicy || {}),
    },
    voicePolicy: {
      enabled: true,
      autonomy: 'natural',
      conversationMode: 'off',
      autoPlayReplies: false,
      selectedVoiceId: 'alloy',
      selectionMode: 'auto',
      ...(overrides.voicePolicy || {}),
    },
    mediaPolicy: {
      autonomy: 'natural',
      visualComfortLevel: 'restrained-visuals',
      routeSource: 'local',
      nsfwPolicy: 'disabled',
      allowVisualAuto: true,
      allowAutoVisualHighRisk: false,
      ...(overrides.mediaPolicy || {}),
    },
    contentBoundary: {
      relationshipBoundaryPreset: 'balanced',
      visualComfortLevel: 'restrained-visuals',
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

test('resolveTurnMode prioritizes explicit voice and media intents', () => {
  const profile = createInteractionProfile();
  assert.equal(resolveTurnMode({
    userText: '直接用语音和我说吧',
    interactionProfile: profile,
  }), 'explicit-voice');
  assert.equal(resolveTurnMode({
    userText: '发张图给我看看你现在的样子',
    interactionProfile: profile,
  }), 'explicit-media');
});

test('resolveTurnMode falls back to playful for bursty persona without direct question', () => {
  assert.equal(resolveTurnMode({
    userText: '嘿嘿今晚一起玩呀',
    interactionProfile: createInteractionProfile({
      expression: { pacingBias: 'bursty' },
    }),
  }), 'playful');
});

test('orchestrateBeatModalities prefers voice in voice-first sessions', () => {
  const result = orchestrateBeatModalities({
    beats: [createBeat({ text: '嗯，我慢慢说给你听。' })],
    turnMode: 'emotional',
    interactionProfile: createInteractionProfile({
      voice: { voiceAffinity: 'high' },
      visual: {
        imageAffinity: 'low',
        videoAffinity: 'low',
      },
    }),
    snapshot: createSnapshot({ relationshipState: 'friendly' }),
    policy: createResolvedExperiencePolicy({
      voicePolicy: {
        enabled: true,
        autonomy: 'natural',
        conversationMode: 'on',
        autoPlayReplies: true,
      },
      mediaPolicy: {
        autonomy: 'off',
        allowVisualAuto: false,
      },
    }),
  });

  assert.equal(result[0]?.modality, 'voice');
  assert.equal(result[0]?.autoPlayVoice, true);
});

test('orchestrateBeatModalities keeps emotional turns text-first when voice mode is off', () => {
  const result = orchestrateBeatModalities({
    beats: [createBeat({
      text: '别急，我在这里。',
      intent: 'comfort',
    })],
    turnMode: 'emotional',
    interactionProfile: createInteractionProfile({
      voice: { voiceAffinity: 'high' },
    }),
    snapshot: createSnapshot({ relationshipState: 'warm' }),
    policy: createResolvedExperiencePolicy({
      voicePolicy: {
        enabled: true,
        autonomy: 'off',
        autoPlayReplies: true,
      },
    }),
  });

  assert.equal(result[0]?.modality, 'text');
});

test('orchestrateBeatModalities allows natural voice moments instead of full voice-session takeover', () => {
  const result = orchestrateBeatModalities({
    beats: [createBeat({
      text: '那你先靠过来一点，我慢慢说。',
      intent: 'comfort',
    })],
    turnMode: 'emotional',
    interactionProfile: createInteractionProfile({
      voice: { voiceAffinity: 'high' },
    }),
    snapshot: createSnapshot({ relationshipState: 'warm' }),
    policy: createResolvedExperiencePolicy({
      voicePolicy: {
        enabled: true,
        autonomy: 'natural',
        autoPlayReplies: true,
      },
    }),
  });

  assert.equal(result[0]?.modality, 'voice');
});

test('orchestrateBeatModalities keeps explicit voice turns voiced even when visual auto is allowed', () => {
  const result = orchestrateBeatModalities({
    beats: [createBeat({ text: '可以，我直接说给你听。' })],
    turnMode: 'explicit-voice',
    interactionProfile: createInteractionProfile({
      voice: { voiceAffinity: 'high' },
      visual: {
        imageAffinity: 'high',
        videoAffinity: 'medium',
      },
    }),
    snapshot: createSnapshot({ relationshipState: 'intimate' }),
    policy: createResolvedExperiencePolicy({
      voicePolicy: {
        enabled: true,
        autonomy: 'off',
        autoPlayReplies: true,
      },
      mediaPolicy: {
        autonomy: 'natural',
        allowVisualAuto: true,
      },
      contentBoundary: {
        relationshipState: 'intimate',
      },
    }),
  });

  assert.equal(result[0]?.modality, 'voice');
  assert.equal(result[0]?.autoPlayVoice, true);
});

test('orchestrateBeatModalities does not let voice-first mode swallow explicit media turns', () => {
  const result = orchestrateBeatModalities({
    beats: [createBeat({
      text: '发张图给我看看。',
      mediaRequest: {
        kind: 'image',
        prompt: 'casual portrait',
        confidence: 0.9,
        nsfwIntent: 'none',
      },
    })],
    turnMode: 'explicit-media',
    interactionProfile: createInteractionProfile({
      voice: { voiceAffinity: 'high' },
      visual: {
        imageAffinity: 'medium',
        videoAffinity: 'low',
      },
    }),
    snapshot: createSnapshot({ relationshipState: 'warm' }),
    policy: createResolvedExperiencePolicy({
      voicePolicy: {
        enabled: true,
        autonomy: 'natural',
        conversationMode: 'on',
        autoPlayReplies: true,
      },
      mediaPolicy: {
        autonomy: 'natural',
        allowVisualAuto: true,
      },
    }),
  });

  assert.equal(result[0]?.modality, 'image');
});

test('orchestrateBeatModalities keeps non-explicit turns text-first even if a beat carries mediaRequest', () => {
  const beat = createBeat({
    text: '我想给你看一眼我现在靠在窗边的样子。',
    mediaRequest: {
      kind: 'image',
      prompt: 'window portrait',
      confidence: 0.91,
      nsfwIntent: 'none',
    },
  });
  const profile = createInteractionProfile({
    visual: {
      imageAffinity: 'high',
      videoAffinity: 'medium',
    },
  });

  const intimate = orchestrateBeatModalities({
    beats: [beat],
    turnMode: 'intimate',
    interactionProfile: profile,
    snapshot: createSnapshot({ relationshipState: 'intimate' }),
    policy: createResolvedExperiencePolicy({
      mediaPolicy: {
        autonomy: 'natural',
        allowVisualAuto: true,
      },
      contentBoundary: {
        relationshipState: 'intimate',
      },
    }),
  });
  const explicitMedia = orchestrateBeatModalities({
    beats: [beat],
    turnMode: 'explicit-media',
    interactionProfile: profile,
    snapshot: createSnapshot({ relationshipState: 'intimate' }),
    policy: createResolvedExperiencePolicy({
      mediaPolicy: {
        autonomy: 'off',
        allowVisualAuto: false,
      },
      contentBoundary: {
        relationshipState: 'intimate',
      },
    }),
  });

  assert.equal(intimate[0]?.modality, 'text');
  assert.equal(explicitMedia[0]?.modality, 'image');
});
