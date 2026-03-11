import test from 'node:test';
import assert from 'node:assert/strict';

import {
  appendTurnsToSession,
  clearLocalChatHiddenMemoryState,
  createLocalChatSession,
  getLocalChatInteractionSnapshot,
  getLocalChatSession,
  isSyncableRelationMemorySlot,
  listLocalChatRecallIndex,
  listLocalChatRelationMemorySlots,
  mergeLocalChatRelationMemorySlots,
  replaceLocalChatRecallIndex,
  replaceLocalChatRelationMemorySlots,
  resetLocalChatConversationLedgerForTests,
  upsertLocalChatInteractionSnapshot,
} from '../src/state/index.ts';
import type { RelationMemorySlot } from '../src/state/index.ts';

function createSlot(overrides: Partial<RelationMemorySlot>): RelationMemorySlot {
  return {
    id: `slot_${Math.random().toString(36).slice(2)}`,
    targetId: 'agent.store',
    viewerId: 'viewer.store',
    slotType: 'preference',
    key: '偏好',
    value: '用户喜欢慢慢聊。',
    confidence: 0.7,
    portability: 'local-only',
    sensitivity: 'personal',
    userOverride: 'inherit',
    updatedAt: '2026-03-08T00:00:00.000Z',
    ...overrides,
  };
}

test('mergeLocalChatRelationMemorySlots preserves ids for similar updates and resolves finished promises', async () => {
  await resetLocalChatConversationLedgerForTests();

  await replaceLocalChatRelationMemorySlots({
    targetId: 'agent.store',
    viewerId: 'viewer.store',
    entries: [
      createSlot({
        id: 'slot-pref-1',
        slotType: 'preference',
        key: '聊天节奏',
        value: '用户喜欢短句一点的聊天方式。',
        userOverride: 'never-sync',
      }),
      createSlot({
        id: 'slot-promise-1',
        slotType: 'promise',
        key: '提醒散步',
        value: '之后提醒用户一起去散步。',
      }),
    ],
  });

  await mergeLocalChatRelationMemorySlots({
    targetId: 'agent.store',
    viewerId: 'viewer.store',
    entries: [
      createSlot({
        id: 'candidate-pref',
        slotType: 'preference',
        key: '交流节奏',
        value: '用户更喜欢短句一点、停顿更轻的聊天方式。',
        confidence: 0.88,
      }),
    ],
    resolutionTexts: ['我已经提醒你去散步了，这件事办好了。'],
  });

  const slots = await listLocalChatRelationMemorySlots({
    targetId: 'agent.store',
    viewerId: 'viewer.store',
  });

  const preference = slots.find((slot) => slot.slotType === 'preference');
  assert.ok(preference);
  assert.equal(preference?.id, 'slot-pref-1');
  assert.equal(preference?.userOverride, 'never-sync');
  assert.equal(slots.some((slot) => slot.id === 'slot-promise-1'), false);
});

test('mergeLocalChatRelationMemorySlots trims low-priority rapport entries before higher-value slots', async () => {
  await resetLocalChatConversationLedgerForTests();

  await replaceLocalChatRelationMemorySlots({
    targetId: 'agent.store',
    viewerId: 'viewer.store',
    entries: [
      ...Array.from({ length: 47 }, (_, index) => createSlot({
        id: `slot-rapport-${index}`,
        slotType: 'rapport',
        key: `默契-${index}`,
        value: `旧默契 ${index}`,
        confidence: 0.2,
        updatedAt: `2026-03-0${(index % 5) + 1}T00:00:00.000Z`,
      })),
      createSlot({
        id: 'slot-recurring',
        slotType: 'recurringCue',
        key: '夜里聊天',
        value: '用户常在夜里回来聊天。',
        confidence: 0.6,
      }),
      createSlot({
        id: 'slot-preference',
        slotType: 'preference',
        key: '短句聊天',
        value: '用户喜欢短句。',
        confidence: 0.9,
      }),
      createSlot({
        id: 'slot-promise',
        slotType: 'promise',
        key: '提醒散步',
        value: '记得提醒用户散步。',
        confidence: 0.7,
      }),
    ],
  });

  await mergeLocalChatRelationMemorySlots({
    targetId: 'agent.store',
    viewerId: 'viewer.store',
    entries: [
      createSlot({
        id: 'slot-boundary',
        slotType: 'boundary',
        key: '工作话题',
        value: '用户不想被反复追问工作。',
        confidence: 0.95,
      }),
      createSlot({
        id: 'slot-taboo',
        slotType: 'taboo',
        key: '童年经历',
        value: '不要主动提用户小时候的事。',
        confidence: 0.94,
      }),
    ],
    maxEntries: 50,
  });

  const slots = await listLocalChatRelationMemorySlots({
    targetId: 'agent.store',
    viewerId: 'viewer.store',
  });

  assert.equal(slots.length, 50);
  assert.equal(slots.some((slot) => slot.id === 'slot-boundary'), true);
  assert.equal(slots.some((slot) => slot.id === 'slot-taboo'), true);
  assert.equal(slots.some((slot) => slot.id === 'slot-recurring'), true);
  assert.equal(slots.some((slot) => slot.id === 'slot-preference'), true);
  assert.equal(slots.some((slot) => slot.id === 'slot-promise'), true);
  assert.equal(slots.filter((slot) => slot.slotType === 'rapport').length, 45);
});

test('clearLocalChatHiddenMemoryState removes snapshot, relation memory, and recall index while preserving chat turns', async () => {
  await resetLocalChatConversationLedgerForTests();

  const session = await createLocalChatSession({
    targetId: 'agent.store',
    viewerId: 'viewer.store',
    title: 'Store Test',
  });
  await appendTurnsToSession(session.id, [{
    id: 'turn-user-1',
    role: 'user',
    kind: 'text',
    content: '这一段聊天记录应该保留。',
    contextText: '这一段聊天记录应该保留。',
    semanticSummary: null,
    timestamp: '2026-03-08T00:00:00.000Z',
    bundleId: 'bundle-1',
    bundleSeq: 1,
  }]);
  await upsertLocalChatInteractionSnapshot({
    conversationId: session.id,
    relationshipState: 'warm',
    activeScene: ['night-chat'],
    emotionalTemperature: 'warm',
    assistantCommitments: ['继续陪聊'],
    userPrefs: ['喜欢短句'],
    openLoops: ['之后继续聊'],
    topicThreads: ['夜聊'],
    lastResolvedTurnId: 'turn-user-1',
    updatedAt: '2026-03-08T00:01:00.000Z',
  });
  await replaceLocalChatRelationMemorySlots({
    targetId: 'agent.store',
    viewerId: 'viewer.store',
    entries: [
      createSlot({
        id: 'slot-pref',
        slotType: 'preference',
        key: '短句聊天',
        value: '用户喜欢短句聊天。',
      }),
    ],
  });
  await replaceLocalChatRecallIndex({
    conversationId: session.id,
    docs: [{
      id: 'recall-1',
      conversationId: session.id,
      sourceTurnId: 'turn-user-1',
      text: '这一段聊天记录应该保留。',
      createdAt: '2026-03-08T00:01:00.000Z',
      updatedAt: '2026-03-08T00:01:00.000Z',
    }],
  });

  await clearLocalChatHiddenMemoryState({
    conversationId: session.id,
    targetId: 'agent.store',
    viewerId: 'viewer.store',
  });

  const nextSession = await getLocalChatSession(session.id, 'viewer.store');
  assert.equal(nextSession?.turns.length, 1);
  assert.equal(await getLocalChatInteractionSnapshot(session.id), null);
  assert.equal((await listLocalChatRelationMemorySlots({
    targetId: 'agent.store',
    viewerId: 'viewer.store',
  })).length, 0);
  assert.equal((await listLocalChatRecallIndex(session.id)).length, 0);
});

test('isSyncableRelationMemorySlot only allows portable and non-intimate slots without never-sync override', () => {
  assert.equal(isSyncableRelationMemorySlot({
    portability: 'portable',
    sensitivity: 'safe',
    userOverride: 'inherit',
  }), true);
  assert.equal(isSyncableRelationMemorySlot({
    portability: 'local-only',
    sensitivity: 'safe',
    userOverride: 'inherit',
  }), false);
  assert.equal(isSyncableRelationMemorySlot({
    portability: 'portable',
    sensitivity: 'intimate',
    userOverride: 'inherit',
  }), false);
  assert.equal(isSyncableRelationMemorySlot({
    portability: 'portable',
    sensitivity: 'safe',
    userOverride: 'never-sync',
  }), false);
});
