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
      conversationMode: 'off',
      autoPlayReplies: false,
      selectedVoiceId: 'alloy',
      selectionMode: 'auto',
      ...(overrides.voicePolicy || {}),
    },
    mediaPolicy: {
      autonomy: 'natural',
      visualComfortLevel: 'soft-visuals',
      routeSource: 'local-runtime',
      nsfwPolicy: 'disabled',
      allowVisualAuto: true,
      allowAutoVisualHighRisk: false,
      ...(overrides.mediaPolicy || {}),
    },
    contentBoundary: {
      relationshipBoundaryPreset: 'balanced',
      visualComfortLevel: 'soft-visuals',
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

test('resolveTurnMode prioritizes explicit voice and media intents', () => {
  const profile = createInteractionProfile();
  assert.equal(resolveTurnMode({
    userText: '直接用语音和我说吧',
    interactionProfile: profile,
    voiceConversationMode: 'off',
  }), 'explicit-voice');
  assert.equal(resolveTurnMode({
    userText: '发张图给我看看你现在的样子',
    interactionProfile: profile,
    voiceConversationMode: 'off',
  }), 'explicit-media');
});

test('resolveTurnMode falls back to playful for bursty persona without direct question', () => {
  assert.equal(resolveTurnMode({
    userText: '嘿嘿今晚一起玩呀',
    interactionProfile: createInteractionProfile({
      expression: { pacingBias: 'bursty' },
    }),
    voiceConversationMode: 'off',
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
        autoPlayReplies: true,
      },
      mediaPolicy: {
        autonomy: 'off',
        allowVisualAuto: false,
      },
    }),
    voiceConversationMode: 'on',
  });

  assert.equal(result[0]?.modality, 'voice');
  assert.equal(result[0]?.autoPlayVoice, true);
});

test('orchestrateBeatModalities promotes image beats only under natural media autonomy', () => {
  const beat = createBeat({
    text: '我想给你看一眼我现在靠在窗边的样子。',
    assetRequest: {
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

  const natural = orchestrateBeatModalities({
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
    voiceConversationMode: 'off',
  });
  const explicitOnly = orchestrateBeatModalities({
    beats: [createBeat({ text: '今晚先好好陪你说话。' })],
    turnMode: 'intimate',
    interactionProfile: profile,
    snapshot: createSnapshot({ relationshipState: 'intimate' }),
    policy: createResolvedExperiencePolicy({
      mediaPolicy: {
        autonomy: 'explicit-only',
        allowVisualAuto: false,
      },
      contentBoundary: {
        relationshipState: 'intimate',
      },
    }),
    voiceConversationMode: 'off',
  });

  assert.equal(natural[0]?.modality, 'image');
  assert.equal(explicitOnly[0]?.modality, 'text');
});
