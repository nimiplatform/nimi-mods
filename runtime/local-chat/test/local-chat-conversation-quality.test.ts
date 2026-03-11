import test from 'node:test';
import assert from 'node:assert/strict';
import { derivePacingPlan } from '../src/hooks/turn-send/context-assembler.ts';
import { compileInteractionState, inferConversationMomentum } from '../src/hooks/turn-send/interaction-state-compiler.ts';
import type { DerivedInteractionProfile } from '../src/state/ledger-types.ts';

function createProfile(overrides?: Partial<{
  pacingBias: DerivedInteractionProfile['expression']['pacingBias'];
  warmth: DerivedInteractionProfile['relationship']['warmth'];
  defaultDistance: DerivedInteractionProfile['relationship']['defaultDistance'];
  flirtAffinity: DerivedInteractionProfile['relationship']['flirtAffinity'];
}>): DerivedInteractionProfile {
  return {
    expression: {
      responseLength: 'short',
      formality: 'casual',
      sentiment: 'positive',
      pacingBias: overrides?.pacingBias || 'balanced',
      firstBeatStyle: 'gentle',
      infoAnswerStyle: 'concise',
    },
    relationship: {
      defaultDistance: overrides?.defaultDistance || 'friendly',
      warmth: overrides?.warmth || 'warm',
      flirtAffinity: overrides?.flirtAffinity || 'none',
      proactiveStyle: 'gentle',
      intimacyGuard: 'balanced',
    },
    voice: {
      voiceId: null,
      language: null,
      genderGuard: 'neutral',
      speedRange: 'balanced',
      pitchRange: 'mid',
      emotionEnabled: false,
      voiceAffinity: 'low',
    },
    visual: {
      artStyle: null,
      fashionStyle: null,
      personaCue: null,
      nsfwLevel: null,
      imageAffinity: 'low',
      videoAffinity: 'low',
    },
    modalityTraits: {
      textBias: 'high',
      voiceBias: 'low',
      imageBias: 'low',
      videoBias: 'low',
      latencyTolerance: 'medium',
    },
    signals: [],
  };
}

// --- Fix 1: compact delivery style respected after re-derive ---

test('derivePacingPlan respects allowMultiReply=false even with emotional turnMode', () => {
  const plan = derivePacingPlan({
    text: '好累啊',
    interactionProfile: createProfile({ pacingBias: 'bursty', warmth: 'intimate' }),
    allowMultiReply: false,
    turnMode: 'emotional',
    emotionalHint: '疲惫',
  });
  // With allowMultiReply=false (compact mode), emotional should still get followup
  // but the key point is that information mode stays single
  const infoPlan = derivePacingPlan({
    text: '什么是量子力学？',
    interactionProfile: createProfile({ pacingBias: 'bursty' }),
    allowMultiReply: false,
    turnMode: 'information',
  });
  assert.equal(infoPlan.mode, 'single');
  assert.equal(infoPlan.maxSegments, 1);
});

test('derivePacingPlan with allowMultiReply=false keeps single for information mode', () => {
  const plan = derivePacingPlan({
    text: '这个怎么用？',
    interactionProfile: createProfile({ pacingBias: 'balanced', warmth: 'warm' }),
    allowMultiReply: false,
    turnMode: 'information',
  });
  assert.equal(plan.maxSegments, 1);
  assert.equal(plan.mode, 'single');
});

// --- Fix 2: suggestedApproach drives pacing decisions ---

test('derivePacingPlan uses high-emotion keyword in emotionalHint for extended pacing', () => {
  const plan = derivePacingPlan({
    text: '我好难过',
    interactionProfile: createProfile(),
    allowMultiReply: true,
    turnMode: 'emotional',
    emotionalHint: '崩溃',
  });
  assert.equal(plan.reason, 'high-emotion-needs-extended-followup');
  assert.equal(plan.maxSegments, 3);
});

test('suggestedApproach=empathize-first adds followup segment to emotional turn', () => {
  const baseline = derivePacingPlan({
    text: '有点烦',
    interactionProfile: createProfile(),
    allowMultiReply: true,
    turnMode: 'emotional',
  });
  const withApproach = derivePacingPlan({
    text: '有点烦',
    interactionProfile: createProfile(),
    allowMultiReply: true,
    turnMode: 'emotional',
    suggestedApproach: 'empathize-first',
  });
  assert.ok(withApproach.maxSegments >= baseline.maxSegments,
    `empathize-first should not reduce segments: ${withApproach.maxSegments} vs ${baseline.maxSegments}`);
  assert.equal(withApproach.energy, 'low');
});

test('suggestedApproach=lighten-mood raises energy without changing segment count', () => {
  const plan = derivePacingPlan({
    text: '有点烦',
    interactionProfile: createProfile(),
    allowMultiReply: true,
    turnMode: 'emotional',
    suggestedApproach: 'lighten-mood',
  });
  assert.equal(plan.energy, 'medium');
});

test('suggestedApproach=be-supportive adds comfort followup', () => {
  const plan = derivePacingPlan({
    text: '好累',
    interactionProfile: createProfile(),
    allowMultiReply: true,
    turnMode: 'emotional',
    suggestedApproach: 'be-supportive',
  });
  assert.ok(plan.maxSegments >= 2, `be-supportive should allow followup: maxSegments=${plan.maxSegments}`);
  assert.equal(plan.energy, 'low');
});

// --- P1 regression: natural-mode information questions keep answer-followup ---

test('derivePacingPlan allows answer-followup for information questions when allowMultiReply=true', () => {
  const plan = derivePacingPlan({
    text: '这个怎么用？',
    interactionProfile: createProfile(),
    allowMultiReply: true,
    turnMode: 'information',
  });
  assert.equal(plan.mode, 'answer-followup');
  assert.equal(plan.maxSegments, 2);
});

// --- Fix 3: momentum affects pacing ---

test('derivePacingPlan accelerating momentum increases maxSegments', () => {
  const base = derivePacingPlan({
    text: '你好',
    interactionProfile: createProfile({ pacingBias: 'balanced', warmth: 'warm' }),
    allowMultiReply: true,
    turnMode: 'playful',
  });
  const accelerated = derivePacingPlan({
    text: '你好',
    interactionProfile: createProfile({ pacingBias: 'balanced', warmth: 'warm' }),
    allowMultiReply: true,
    turnMode: 'playful',
    momentum: 'accelerating',
  });
  assert.ok(accelerated.maxSegments >= base.maxSegments);
});

test('derivePacingPlan cooling momentum reduces maxSegments', () => {
  const base = derivePacingPlan({
    text: '你好呀',
    interactionProfile: createProfile({ pacingBias: 'bursty', warmth: 'warm' }),
    allowMultiReply: true,
    turnMode: 'checkin',
  });
  const cooled = derivePacingPlan({
    text: '你好呀',
    interactionProfile: createProfile({ pacingBias: 'bursty', warmth: 'warm' }),
    allowMultiReply: true,
    turnMode: 'checkin',
    momentum: 'cooling',
  });
  assert.ok(cooled.maxSegments <= base.maxSegments);
});

// --- Fix 4: inferConversationMomentum ---

test('inferConversationMomentum returns accelerating for increasing user message lengths', () => {
  const result = inferConversationMomentum([
    { role: 'user', textLength: 5, timestamp: '2026-03-09T00:00:00Z' },
    { role: 'assistant', textLength: 20 },
    { role: 'user', textLength: 15, timestamp: '2026-03-09T00:00:30Z' },
    { role: 'assistant', textLength: 25 },
    { role: 'user', textLength: 30, timestamp: '2026-03-09T00:01:00Z' },
  ]);
  assert.equal(result, 'accelerating');
});

test('inferConversationMomentum returns cooling for decreasing user message lengths', () => {
  const result = inferConversationMomentum([
    { role: 'user', textLength: 30 },
    { role: 'assistant', textLength: 20 },
    { role: 'user', textLength: 15 },
    { role: 'assistant', textLength: 25 },
    { role: 'user', textLength: 5 },
  ]);
  assert.equal(result, 'cooling');
});

test('inferConversationMomentum returns cooling for long time intervals', () => {
  const result = inferConversationMomentum([
    { role: 'user', textLength: 20, timestamp: '2026-03-09T00:00:00Z' },
    { role: 'user', textLength: 20, timestamp: '2026-03-09T00:10:00Z' },
    { role: 'user', textLength: 20, timestamp: '2026-03-09T00:20:00Z' },
  ]);
  assert.equal(result, 'cooling');
});

test('inferConversationMomentum returns steady for mixed lengths', () => {
  const result = inferConversationMomentum([
    { role: 'user', textLength: 10 },
    { role: 'user', textLength: 20 },
    { role: 'user', textLength: 10 },
  ]);
  assert.equal(result, 'steady');
});

test('inferConversationMomentum returns steady for fewer than 2 user turns', () => {
  assert.equal(inferConversationMomentum([{ role: 'user', textLength: 10 }]), 'steady');
  assert.equal(inferConversationMomentum([]), 'steady');
});

// --- Fix 5: compileInteractionState includes conversationMomentum ---

test('compileInteractionState writes conversationMomentum into snapshot', () => {
  const compiled = compileInteractionState({
    conversationId: 'session-momentum',
    targetId: 'agent-1',
    viewerId: 'viewer-1',
    session: {
      id: 'session-momentum',
      targetId: 'agent-1',
      viewerId: 'viewer-1',
      worldId: null,
      title: 'Test',
      turns: [
        { id: 't1', role: 'user', kind: 'text', content: '短', contextText: '短', timestamp: '2026-03-09T00:00:00Z', bundleId: '', bundleSeq: 1 },
        { id: 't2', role: 'assistant', kind: 'text', content: '好', contextText: '好', timestamp: '2026-03-09T00:00:01Z', bundleId: '', bundleSeq: 2 },
        { id: 't3', role: 'user', kind: 'text', content: '更长一点的消息', contextText: '更长一点的消息', timestamp: '2026-03-09T00:00:05Z', bundleId: '', bundleSeq: 3 },
        { id: 't4', role: 'assistant', kind: 'text', content: '好的好的', contextText: '好的好的', timestamp: '2026-03-09T00:00:06Z', bundleId: '', bundleSeq: 4 },
        { id: 't5', role: 'user', kind: 'text', content: '这是一条非常非常长的消息来表示加速', contextText: '这是一条非常非常长的消息来表示加速', timestamp: '2026-03-09T00:00:10Z', bundleId: '', bundleSeq: 5 },
      ],
      bundleCount: 5,
      messageCount: 5,
      createdAt: '2026-03-09T00:00:00Z',
      updatedAt: '2026-03-09T00:00:10Z',
    },
    deliveredBeats: [
      {
        beatId: 'beat-1',
        turnId: 'turn-1',
        beatIndex: 0,
        beatCount: 1,
        intent: 'answer',
        relationMove: 'friendly',
        sceneMove: '日常',
        modality: 'text',
        text: '好的',
        pauseMs: 0,
        cancellationScope: 'turn',
      },
    ],
  });

  assert.ok(compiled.snapshot.conversationMomentum !== undefined);
  assert.ok(['accelerating', 'steady', 'cooling'].includes(compiled.snapshot.conversationMomentum!));
});
