import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS } from '../src/default-settings-store.ts';
import { compileResolvedExperiencePolicy } from '../src/hooks/turn-send/resolved-experience-policy.ts';
import type { DerivedInteractionProfile, InteractionSnapshot } from '../src/state/ledger-types.ts';

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
      genderGuard: 'female',
      speedRange: 'balanced',
      pitchRange: 'mid',
      emotionEnabled: true,
      voiceAffinity: 'high',
      ...(overrides.voice || {}),
    },
    visual: {
      artStyle: 'anime',
      fashionStyle: 'casual',
      personaCue: 'gentle',
      nsfwLevel: 'suggestive',
      imageAffinity: 'medium',
      videoAffinity: 'low',
      ...(overrides.visual || {}),
    },
    modalityTraits: {
      textBias: 'medium',
      voiceBias: 'high',
      imageBias: 'medium',
      videoBias: 'low',
      latencyTolerance: 'medium',
      ...(overrides.modalityTraits || {}),
    },
    signals: [...(overrides.signals || [])],
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
    lastResolvedTurnId: 'turn-1',
    conversationDirective: null,
    conversationMomentum: 'steady',
    updatedAt: '2026-03-08T00:00:00.000Z',
    ...overrides,
  };
}

test('resolved experience policy keeps cloud visuals on safe boundary', () => {
  const policy = compileResolvedExperiencePolicy({
    interactionProfile: createInteractionProfile(),
    interactionSnapshot: createSnapshot(),
    settings: {
      ...DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS,
      mediaAutonomy: 'natural',
      relationshipBoundaryPreset: 'close',
      visualComfortLevel: 'natural-visuals',
    },
    routeSource: 'cloud',
  });

  assert.equal(policy.mediaPolicy.routeSource, 'cloud');
  assert.equal(policy.mediaPolicy.nsfwPolicy, 'local-only');
  assert.equal(policy.mediaPolicy.allowVisualAuto, true);
});

test('default settings prefer authentic visuals by default', () => {
  assert.equal(DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS.visualComfortLevel, 'natural-visuals');
});

test('resolved experience policy enables local visual freedom for local natural visuals', () => {
  const policy = compileResolvedExperiencePolicy({
    interactionProfile: createInteractionProfile(),
    interactionSnapshot: createSnapshot({ relationshipState: 'intimate' }),
    settings: {
      ...DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS,
      voiceAutonomy: 'natural',
      voiceConversationMode: 'off',
      autoPlayVoiceReplies: true,
      voiceName: 'voice-custom',
      relationshipBoundaryPreset: 'balanced',
      visualComfortLevel: 'natural-visuals',
      mediaAutonomy: 'natural',
    },
    requestedVoiceConversationMode: 'on',
    routeSource: 'local',
  });

  assert.equal(policy.mediaPolicy.nsfwPolicy, 'allowed');
  assert.equal(policy.voicePolicy.autonomy, 'natural');
  assert.equal(policy.voicePolicy.conversationMode, 'on');
  assert.equal(policy.voicePolicy.selectionMode, 'manual');
});

test('resolved experience policy keeps voice conversation off unless explicitly requested', () => {
  const policy = compileResolvedExperiencePolicy({
    interactionProfile: createInteractionProfile(),
    interactionSnapshot: createSnapshot(),
    settings: {
      ...DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS,
      voiceAutonomy: 'natural',
      voiceConversationMode: 'off',
    },
    routeSource: 'local',
  });

  assert.equal(policy.voicePolicy.conversationMode, 'off');
});

test('resolved experience policy derives natural delivery when unresolved continuity exists', () => {
  const policy = compileResolvedExperiencePolicy({
    interactionProfile: createInteractionProfile({
      expression: {
        responseLength: 'medium',
        formality: 'casual',
        sentiment: 'positive',
        pacingBias: 'reserved',
        firstBeatStyle: 'gentle',
        infoAnswerStyle: 'balanced',
      },
    }),
    interactionSnapshot: createSnapshot({
      relationshipState: 'friendly',
      openLoops: ['说好了今晚去散步'],
      assistantCommitments: [],
      conversationMomentum: 'cooling',
    }),
    settings: {
      ...DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS,
    },
    routeSource: 'local',
  });

  assert.equal(policy.deliveryPolicy.style, 'natural');
  assert.equal(policy.deliveryPolicy.allowMultiReply, true);
});

test('resolved experience policy derives compact delivery for cooling low-intimacy chats without unresolved continuity', () => {
  const policy = compileResolvedExperiencePolicy({
    interactionProfile: createInteractionProfile({
      expression: {
        responseLength: 'medium',
        formality: 'casual',
        sentiment: 'positive',
        pacingBias: 'balanced',
        firstBeatStyle: 'gentle',
        infoAnswerStyle: 'balanced',
      },
    }),
    interactionSnapshot: createSnapshot({
      relationshipState: 'friendly',
      openLoops: [],
      assistantCommitments: [],
      conversationMomentum: 'cooling',
    }),
    settings: {
      ...DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS,
    },
    routeSource: 'local',
  });

  assert.equal(policy.deliveryPolicy.style, 'compact');
  assert.equal(policy.deliveryPolicy.allowMultiReply, false);
});

test('resolved experience policy derives close boundary only for open high-flirt intimate relations', () => {
  const policy = compileResolvedExperiencePolicy({
    interactionProfile: createInteractionProfile({
      relationship: {
        defaultDistance: 'friendly',
        warmth: 'intimate',
        flirtAffinity: 'high',
        proactiveStyle: 'playful',
        intimacyGuard: 'open',
      },
    }),
    interactionSnapshot: createSnapshot({
      relationshipState: 'intimate',
    }),
    settings: {
      ...DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS,
      visualComfortLevel: 'natural-visuals',
      mediaAutonomy: 'natural',
    },
    routeSource: 'local',
  });

  assert.equal(policy.contentBoundary.relationshipBoundaryPreset, 'close');
  assert.equal(policy.mediaPolicy.allowAutoVisualHighRisk, true);
});
