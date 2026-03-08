import test from 'node:test';
import assert from 'node:assert/strict';
import { compileInteractionState } from '../src/hooks/turn-send/interaction-state-compiler.ts';

test('interaction state compiler writes snapshot, relation memory slots, and recall docs from delivered beats', () => {
  const compiled = compileInteractionState({
    conversationId: 'session-1',
    targetId: 'agent-1',
    viewerId: 'viewer-1',
    session: {
      id: 'session-1',
      targetId: 'agent-1',
      viewerId: 'viewer-1',
      worldId: 'world-1',
      title: 'Session',
      bundleCount: 2,
      messageCount: 4,
      createdAt: '2026-03-08T00:00:00.000Z',
      updatedAt: '2026-03-08T00:00:00.000Z',
      turns: [
        {
          id: 'user-turn-1',
          role: 'user',
          kind: 'text',
          content: '我喜欢雨夜和霓虹灯，之后提醒我一起去散步。',
          contextText: '我喜欢雨夜和霓虹灯，之后提醒我一起去散步。',
          semanticSummary: null,
          timestamp: '2026-03-08T00:00:00.000Z',
          bundleId: 'bundle-1',
          bundleSeq: 1,
        },
      ],
    },
    deliveredBeats: [
      {
        beatId: 'beat-1',
        turnId: 'turn-1',
        beatIndex: 0,
        beatCount: 2,
        intent: 'comfort',
        relationMove: 'comfort-warm',
        sceneMove: 'rainy-night',
        modality: 'text',
        text: '我在，先陪你把这一刻接住。',
        pauseMs: 0,
        cancellationScope: 'turn',
      },
      {
        beatId: 'beat-2',
        turnId: 'turn-1',
        beatIndex: 1,
        beatCount: 2,
        intent: 'invite',
        relationMove: 'invite-closer',
        sceneMove: 'future-walk',
        modality: 'voice',
        text: '等我一下，之后我会提醒你一起去散步。',
        pauseMs: 650,
        cancellationScope: 'tail',
      },
    ],
  });

  assert.equal(compiled.snapshot.conversationId, 'session-1');
  assert.equal(compiled.snapshot.relationshipState, 'intimate');
  assert.equal(compiled.snapshot.emotionalTemperature, 'heated');
  assert.ok(compiled.snapshot.activeScene.includes('rainy-night'));
  assert.ok(compiled.snapshot.assistantCommitments.some((item) => item.includes('我会提醒你')));
  assert.ok(compiled.snapshot.userPrefs.some((item) => item.includes('喜欢雨夜和霓虹灯')));
  assert.ok(compiled.snapshot.openLoops.some((item) => item.includes('之后')));
  assert.equal(compiled.snapshot.lastResolvedTurnId, 'turn-1');

  assert.ok(compiled.relationMemorySlots.some((slot) => slot.slotType === 'preference'));
  assert.ok(compiled.relationMemorySlots.some((slot) => slot.slotType === 'promise'));
  assert.ok(compiled.relationMemorySlots.some((slot) => slot.slotType === 'rapport'));

  assert.ok(compiled.recallDocs.some((doc) => doc.text.includes('喜欢雨夜和霓虹灯')));
  assert.ok(compiled.recallDocs.some((doc) => doc.text.includes('我会提醒你一起去散步')));
});
