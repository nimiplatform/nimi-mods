import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FAST_DIRECTIVE_BOUNDARY_RE,
  FAST_DIRECTIVE_MEDIA_FOLLOWUP_RE,
} from './helpers/prompt-matchers.mjs';
import { DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS } from '../src/default-settings-store.ts';
import { resolveFastTurnPerception } from '../src/hooks/turn-send/fast-turn-perception.ts';
import { orchestrateBeatModalities } from '../src/hooks/turn-send/modality-orchestrator.ts';
import { compileResolvedExperiencePolicy } from '../src/hooks/turn-send/resolved-experience-policy.ts';
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
      flirtAffinity: 'high',
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
      fashionStyle: 'casual',
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

function createBeat(text: string): InteractionBeat {
  return {
    beatId: 'beat-1',
    turnId: 'turn-1',
    beatIndex: 0,
    beatCount: 1,
    intent: 'answer',
    relationMove: 'friendly',
    sceneMove: 'chat',
    modality: 'text',
    text,
    pauseMs: 0,
    cancellationScope: 'turn',
  };
}

test('turn-mode regression: high flirt affinity does not upcast neutral questions to intimate', () => {
  const interactionProfile = createInteractionProfile();
  const userText = '你今天在忙什么，能直接告诉我吗？';
  const turnMode = resolveTurnMode({
    userText,
    interactionProfile,
    voiceConversationMode: 'off',
  });

  assert.equal(turnMode, 'information');

  const policy = compileResolvedExperiencePolicy({
    interactionProfile,
    interactionSnapshot: createSnapshot(),
    settings: {
      ...DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS,
      mediaAutonomy: 'natural',
      visualComfortLevel: 'natural-visuals',
    },
    routeSource: 'local',
  });
  const beats = orchestrateBeatModalities({
    beats: [createBeat('我今天在整理资料，等会儿再陪你慢慢聊。')],
    turnMode,
    interactionProfile,
    snapshot: createSnapshot(),
    policy,
    voiceConversationMode: 'off',
  });

  assert.equal(beats[0]?.modality, 'text');
});

test('media regression: non-explicit turns ignore hallucinated beat assetRequest', () => {
  const interactionProfile = createInteractionProfile();
  const policy = compileResolvedExperiencePolicy({
    interactionProfile,
    interactionSnapshot: createSnapshot({ relationshipState: 'warm' }),
    settings: {
      ...DEFAULT_LOCAL_CHAT_DEFAULT_SETTINGS,
      mediaAutonomy: 'natural',
      visualComfortLevel: 'natural-visuals',
    },
    routeSource: 'local',
  });
  const beats = orchestrateBeatModalities({
    beats: [{
      ...createBeat('你好，今天过得怎么样？'),
      assetRequest: {
        kind: 'image',
        prompt: 'warm greeting portrait',
        confidence: 0.91,
        nsfwIntent: 'none',
      },
    }],
    turnMode: 'checkin',
    interactionProfile,
    snapshot: createSnapshot({ relationshipState: 'warm' }),
    policy,
    voiceConversationMode: 'off',
  });

  assert.equal(beats[0]?.modality, 'text');
});

test('turn-mode regression: emotional support stays emotional even for flirty personas', () => {
  const interactionProfile = createInteractionProfile();
  assert.equal(resolveTurnMode({
    userText: '我今天真的有点难过，只想有人安静陪陪我。',
    interactionProfile,
    voiceConversationMode: 'off',
  }), 'emotional');
});

test('fast-turn-perception provides a conservative emotional first-beat hint', () => {
  const interactionProfile = createInteractionProfile();
  const result = resolveFastTurnPerception({
    userText: '我今天真的有点委屈，只想你先抱抱我。',
    interactionProfile,
    snapshot: createSnapshot({
      relationshipState: 'friendly',
      conversationDirective: '顺着上一轮继续聊。',
      openLoops: ['用户刚才还没把委屈讲完'],
    }),
  });

  assert.equal(result.turnMode, 'intimate');
  assert.equal(result.emotionalState?.detected, '委屈');
  assert.equal(result.emotionalState?.suggestedApproach, 'empathize-first');
  assert.equal(result.intimacyCeiling, 'friendly');
  assert.match(result.conversationDirective || '', FAST_DIRECTIVE_BOUNDARY_RE);
});

test('fast-turn-perception keeps explicit media requests as setup-first followups', () => {
  const interactionProfile = createInteractionProfile();
  const result = resolveFastTurnPerception({
    userText: '给我发张你现在的照片',
    interactionProfile,
    snapshot: createSnapshot({ relationshipState: 'warm' }),
  });

  assert.equal(result.turnMode, 'explicit-media');
  assert.equal(result.intimacyCeiling, 'warm');
  assert.match(result.conversationDirective || '', FAST_DIRECTIVE_MEDIA_FOLLOWUP_RE);
});

test('turn-mode regression: explicit intimate cue still resolves to intimate after guard tightening', () => {
  const interactionProfile = createInteractionProfile();
  assert.equal(resolveTurnMode({
    userText: '我有点想你，想抱抱你。',
    interactionProfile,
    voiceConversationMode: 'off',
  }), 'intimate');
});
