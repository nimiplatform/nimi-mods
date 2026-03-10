import test from 'node:test';
import assert from 'node:assert/strict';

import { extractRelationMemoryCandidates } from '../src/hooks/turn-send/relation-memory-extractor.ts';
import type { LocalChatSession, RelationMemorySlot } from '../src/state/index.ts';

function createSession(turnText: string): LocalChatSession {
  return {
    id: 'session-memory-extractor',
    targetId: 'agent-1',
    viewerId: 'viewer-1',
    worldId: null,
    title: 'Session',
    bundleCount: 1,
    messageCount: 1,
    createdAt: '2026-03-08T00:00:00.000Z',
    updatedAt: '2026-03-08T00:00:00.000Z',
    turns: [{
      id: 'turn-user-1',
      role: 'user',
      kind: 'text',
      content: turnText,
      contextText: turnText,
      semanticSummary: null,
      timestamp: '2026-03-08T00:00:00.000Z',
      bundleId: 'bundle-1',
      bundleSeq: 1,
    }],
  };
}

function createFallbackSlot(slotType: RelationMemorySlot['slotType'], value: string): RelationMemorySlot {
  return {
    id: `slot-${slotType}`,
    targetId: 'agent-1',
    viewerId: 'viewer-1',
    slotType,
    key: value.slice(0, 24),
    value,
    confidence: 0.7,
    portability: 'local-only',
    sensitivity: 'personal',
    userOverride: 'inherit',
    updatedAt: '2026-03-08T00:00:00.000Z',
  };
}

test('relation memory extractor accepts semantic boundary, taboo, and recurring cue entries from model output', async () => {
  const result = await extractRelationMemoryCandidates({
    aiClient: {
      generateObject: async () => ({
        object: {
          memories: [
            {
              slotType: 'boundary',
              key: '童年经历',
              value: '用户不希望被追问小时候的事。',
              confidence: 0.91,
            },
            {
              slotType: 'taboo',
              key: '怕黑',
              value: '怕黑是敏感话题，不适合拿来打趣。',
              confidence: 0.84,
            },
            {
              slotType: 'recurringCue',
              key: '夜里来聊天',
              value: '用户经常在深夜回来找角色说话。',
              confidence: 0.73,
            },
          ],
        },
      }),
    },
    userText: '其实我一直很怕黑，小时候的事情也不太想提，而且我总是半夜才来找你。',
    deliveredBeats: [{
      beatId: 'beat-1',
      turnId: 'turn-1',
      beatIndex: 0,
      beatCount: 1,
      intent: 'comfort',
      relationMove: 'comfort',
      sceneMove: 'night-chat',
      modality: 'text',
      text: '我知道了，我不会硬碰那些你不想提的地方。',
      pauseMs: 0,
      cancellationScope: 'turn',
    }],
    session: createSession('其实我一直很怕黑，小时候的事情也不太想提，而且我总是半夜才来找你。'),
    interactionSnapshot: null,
    existingSlots: [],
    fallbackSlots: [],
  });

  assert.deepEqual(
    result.map((item) => item.slotType),
    ['boundary', 'taboo', 'recurringCue'],
  );
  assert.equal(result[0]?.key, '童年经历');
  assert.equal(result[1]?.value.includes('敏感话题'), true);
});

test('relation memory extractor falls back to compiler-generated slots when model extraction fails', async () => {
  const result = await extractRelationMemoryCandidates({
    aiClient: {
      generateObject: async () => {
        throw new Error('offline');
      },
    },
    userText: '我喜欢短句聊天，之后提醒我散步。',
    deliveredBeats: [],
    session: createSession('我喜欢短句聊天，之后提醒我散步。'),
    interactionSnapshot: null,
    existingSlots: [],
    fallbackSlots: [
      createFallbackSlot('preference', '喜欢短句聊天'),
      createFallbackSlot('promise', '之后提醒我散步'),
    ],
  });

  assert.deepEqual(
    result.map((item) => item.slotType),
    ['preference', 'promise'],
  );
  assert.equal(result[0]?.value, '喜欢短句聊天');
});
