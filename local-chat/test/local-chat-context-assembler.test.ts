import test from 'node:test';
import assert from 'node:assert/strict';

import type { LocalChatTarget } from '../src/data/types.ts';
import { buildLocalChatCompiledPrompt } from '../src/data/index.ts';
import { assembleLocalChatContextPacket } from '../src/hooks/turn-send/context-assembler.ts';
import {
  appendTurnsToSession,
  createLocalChatSession,
  replaceLocalChatRecallIndex,
  replaceLocalChatRelationMemorySlots,
  resetLocalChatConversationLedgerForTests,
  upsertLocalChatInteractionSnapshot,
} from '../src/state/index.ts';

function createTarget(): LocalChatTarget {
  return {
    id: 'agent-local-chat',
    handle: '~aki',
    displayName: 'Aki',
    avatarUrl: null,
    bio: '会认真接住用户情绪的角色。',
    friendsSince: null,
    isAgent: true,
    worldId: 'world-local-chat',
    worldResolvedBy: 'profile',
    agentMetadata: {
      rules: ['保持自然口吻，不要像客服。'],
    },
    agentProfile: {
      persona: '温柔但有一点俏皮',
      dna: {
        communication: {
          responseLength: 'short',
          formality: 'casual',
          sentiment: 'positive',
        },
        personality: {
          warmth: 'warm',
          flirtAffinity: 'light',
          pacingStyle: 'bursty',
        },
        voice: {
          voiceId: 'alloy',
          language: 'zh-CN',
        },
        appearance: {
          style: 'anime',
          fashionStyle: 'school',
        },
      },
    },
    world: {
      name: 'Local Chat',
      summary: '一个强调在场感和节奏感的交流世界。',
    },
    worldview: {
      name: 'Warm Night',
      summary: '关系推进要自然，不要一次说尽。',
      rules: ['优先短句和停顿', '保持对话递进感'],
    },
    payload: {},
  };
}

test('context assembler derives interaction profile, pacing plan, and prompt lanes from new interaction state', async () => {
  await resetLocalChatConversationLedgerForTests();
  const target = createTarget();
  const session = await createLocalChatSession({
    targetId: target.id,
    viewerId: 'viewer.test',
    worldId: target.worldId,
    title: 'Aki',
  });

  await appendTurnsToSession(session.id, [
    {
      id: 'turn-user-1',
      role: 'user',
      kind: 'text',
      content: '昨天你说想陪我看烟花。',
      contextText: '昨天你说想陪我看烟花。',
      semanticSummary: '用户提到昨天的约定',
      timestamp: '2026-03-07T10:00:00.000Z',
      bundleId: '',
      bundleSeq: 0,
    },
    {
      id: 'turn-assistant-1',
      role: 'assistant',
      kind: 'text',
      content: '我记得呀，今晚想继续陪你。 ',
      contextText: '我记得呀，今晚想继续陪你。',
      semanticSummary: '助手确认陪伴关系',
      timestamp: '2026-03-07T10:00:05.000Z',
      bundleId: '',
      bundleSeq: 0,
    },
  ]);

  await upsertLocalChatInteractionSnapshot({
    conversationId: session.id,
    relationshipState: 'warm',
    activeScene: ['night-walk'],
    emotionalTemperature: 'warm',
    assistantCommitments: ['陪用户倒数跨年'],
    userPrefs: ['喜欢短句和停顿'],
    openLoops: ['还没一起看烟花'],
    topicThreads: ['跨年夜'],
    lastResolvedTurnId: 'turn-assistant-1',
    updatedAt: '2026-03-07T10:01:00.000Z',
  });
  await replaceLocalChatRelationMemorySlots({
    targetId: target.id,
    viewerId: 'viewer.test',
    entries: [{
      id: 'slot-1',
      targetId: target.id,
      viewerId: 'viewer.test',
      slotType: 'preference',
      key: 'preferred-rhythm',
      value: 'short-beats',
      confidence: 0.94,
      updatedAt: '2026-03-07T10:01:00.000Z',
    }, {
      id: 'slot-2',
      targetId: target.id,
      viewerId: 'viewer.test',
      slotType: 'rapport',
      key: 'comfort-style',
      value: '用户累的时候先轻声接住，再慢慢展开',
      confidence: 0.81,
      updatedAt: '2026-03-08T08:30:00.000Z',
    }],
  });
  await replaceLocalChatRecallIndex({
    conversationId: session.id,
    docs: [{
      id: 'recall-1',
      conversationId: session.id,
      sourceTurnId: 'turn-assistant-1',
      text: '用户期待和助手一起看烟花。',
      createdAt: '2026-03-07T10:01:05.000Z',
      updatedAt: '2026-03-07T10:01:05.000Z',
    }],
  });

  const packet = await assembleLocalChatContextPacket({
    text: '嘿嘿，今晚我们继续一起等零点吗？',
    viewerId: 'viewer.test',
    viewerDisplayName: 'Viewer',
    selectedTarget: target,
    selectedSessionId: session.id,
    allowMultiReply: true,
    turnMode: 'playful',
    voiceConversationMode: 'off',
  });
  const compiled = buildLocalChatCompiledPrompt({
    contextPacket: packet,
  });

  assert.equal(packet.target.interactionProfile.expression.firstBeatStyle, 'gentle');
  assert.equal(packet.interactionSnapshot?.relationshipState, 'warm');
  assert.equal(packet.relationMemorySlots?.[0]?.key, 'comfort-style');
  assert.equal(packet.sessionRecall[0]?.text, '用户期待和助手一起看烟花。');
  assert.equal(packet.pacingPlan.mode, 'answer-followup');
  assert.ok(compiled.layerOrder.includes('interactionProfile'));
  assert.ok(compiled.layerOrder.includes('interactionState'));
  assert.ok(compiled.layerOrder.includes('relationMemory'));
  assert.match(compiled.prompt, /交流画像/u);
  assert.match(compiled.prompt, /关系槽位记忆/u);
  assert.match(compiled.prompt, /用户期待和助手一起看烟花/u);
});
