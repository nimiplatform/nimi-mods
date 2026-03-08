import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS } from '../src/default-settings-store.ts';
import { compileResolvedExperiencePolicy } from '../src/hooks/turn-send/resolved-experience-policy.ts';
import type { DerivedInteractionProfile, InteractionSnapshot } from '../src/state/ledger-types.ts';

function createInteractionProfile(): DerivedInteractionProfile {
  return {
    expression: {
      responseLength: 'medium',
      formality: 'casual',
      sentiment: 'positive',
      pacingBias: 'balanced',
      firstBeatStyle: 'gentle',
      infoAnswerStyle: 'balanced',
    },
    relationship: {
      defaultDistance: 'friendly',
      warmth: 'warm',
      flirtAffinity: 'light',
      proactiveStyle: 'gentle',
      intimacyGuard: 'balanced',
    },
    voice: {
      voiceId: 'alloy',
      language: 'zh-CN',
      genderGuard: 'female',
      speedRange: 'balanced',
      pitchRange: 'mid',
      emotionEnabled: true,
      voiceAffinity: 'high',
    },
    visual: {
      artStyle: 'anime',
      fashionStyle: 'casual',
      personaCue: 'gentle',
      nsfwLevel: 'suggestive',
      imageAffinity: 'medium',
      videoAffinity: 'low',
    },
    modalityTraits: {
      textBias: 'medium',
      voiceBias: 'high',
      imageBias: 'medium',
      videoBias: 'low',
      latencyTolerance: 'medium',
    },
    signals: [],
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

test('resolved experience policy enables local visual freedom only for close natural visuals', () => {
  const policy = compileResolvedExperiencePolicy({
    interactionProfile: createInteractionProfile(),
    interactionSnapshot: createSnapshot({ relationshipState: 'intimate' }),
    settings: {
      ...DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS,
      enableVoice: true,
      voiceConversationMode: 'off',
      autoPlayVoiceReplies: true,
      voiceName: 'voice-custom',
      relationshipBoundaryPreset: 'close',
      visualComfortLevel: 'natural-visuals',
      mediaAutonomy: 'natural',
    },
    requestedVoiceConversationMode: 'suggested',
    routeSource: 'local',
  });

  assert.equal(policy.mediaPolicy.nsfwPolicy, 'allowed');
  assert.equal(policy.voicePolicy.conversationMode, 'suggested');
  assert.equal(policy.voicePolicy.selectionMode, 'manual');
});
