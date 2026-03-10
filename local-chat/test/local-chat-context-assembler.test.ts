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

test('context assembler keeps first-beat profile lightweight and continuity-aware', async () => {
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
      content: '昨天你说会提醒我一起去散步。',
      contextText: '昨天你说会提醒我一起去散步。',
      semanticSummary: '用户提到之前的约定',
      timestamp: '2026-03-07T10:00:00.000Z',
      bundleId: '',
      bundleSeq: 0,
    },
    {
      id: 'turn-assistant-1',
      role: 'assistant',
      kind: 'text',
      content: '我记得，晚一点我再把那件事接回来。',
      contextText: '我记得，晚一点我再把那件事接回来。',
      semanticSummary: '助手承接约定',
      timestamp: '2026-03-07T10:00:05.000Z',
      bundleId: '',
      bundleSeq: 0,
    },
    {
      id: 'turn-user-2',
      role: 'user',
      kind: 'text',
      content: '今天有点委屈。',
      contextText: '今天有点委屈。',
      semanticSummary: '用户表达委屈',
      timestamp: '2026-03-07T10:01:00.000Z',
      bundleId: '',
      bundleSeq: 0,
    },
    {
      id: 'turn-assistant-2',
      role: 'assistant',
      kind: 'text',
      content: '我在，你慢慢说。',
      contextText: '我在，你慢慢说。',
      semanticSummary: '助手先接住情绪',
      timestamp: '2026-03-07T10:01:05.000Z',
      bundleId: '',
      bundleSeq: 0,
    },
    {
      id: 'turn-user-3',
      role: 'user',
      kind: 'text',
      content: '你还记得吗？',
      contextText: '你还记得吗？',
      semanticSummary: '用户继续追问',
      timestamp: '2026-03-07T10:02:00.000Z',
      bundleId: '',
      bundleSeq: 0,
    },
  ]);

  await upsertLocalChatInteractionSnapshot({
    conversationId: session.id,
    relationshipState: 'warm',
    activeScene: ['night-walk', 'late-chat'],
    emotionalTemperature: 'warm',
    assistantCommitments: ['提醒用户一起去散步', '继续陪用户把话说完'],
    userPrefs: ['喜欢短句和停顿', '不喜欢被催'],
    openLoops: ['还没一起去散步', '用户刚才那点委屈还没说完'],
    topicThreads: ['散步', '委屈', '夜聊'],
    lastResolvedTurnId: 'turn-assistant-2',
    conversationDirective: '先接住，再往里聊。',
    conversationMomentum: 'steady',
    updatedAt: '2026-03-07T10:02:10.000Z',
  });
  await replaceLocalChatRelationMemorySlots({
    targetId: target.id,
    viewerId: 'viewer.test',
    entries: [{
      id: 'slot-1',
      targetId: target.id,
      viewerId: 'viewer.test',
      slotType: 'promise',
      key: 'walk-promise',
      value: '之后提醒用户一起去散步',
      confidence: 0.92,
      updatedAt: '2026-03-07T10:02:10.000Z',
    }],
  });
  await replaceLocalChatRecallIndex({
    conversationId: session.id,
    docs: [{
      id: 'recall-1',
      conversationId: session.id,
      sourceTurnId: 'turn-assistant-1',
      text: '助手之前答应过要提醒用户一起去散步。',
      createdAt: '2026-03-07T10:02:10.000Z',
      updatedAt: '2026-03-07T10:02:10.000Z',
    }],
  });

  const packet = await assembleLocalChatContextPacket({
    text: '我刚刚那句其实有点不知道怎么讲。',
    viewerId: 'viewer.test',
    viewerDisplayName: 'Viewer',
    selectedTarget: target,
    selectedSessionId: session.id,
    allowMultiReply: true,
    turnMode: 'emotional',
    voiceConversationMode: 'off',
    profile: 'first-beat',
  });

  assert.equal(packet.sessionRecall.length, 0);
  assert.equal(packet.relationMemorySlots?.length ?? 0, 0);
  assert.equal(packet.recallIndex?.length ?? 0, 0);
  assert.equal(packet.platformWarmStart, null);
  assert.ok(packet.recentTurns.length <= 4);
  assert.equal(packet.interactionSnapshot?.assistantCommitments.length, 1);
  assert.equal(packet.interactionSnapshot?.openLoops.length, 1);
  assert.equal(packet.interactionSnapshot?.topicThreads.length, 2);
});

test('compiled prompt renders restrained content boundary when hint is present', async () => {
  await resetLocalChatConversationLedgerForTests();
  const target = createTarget();
  const session = await createLocalChatSession({
    targetId: target.id,
    viewerId: 'viewer.test',
    worldId: target.worldId,
    title: 'Aki',
  });

  const packet = await assembleLocalChatContextPacket({
    text: '你刚刚那句话也太撩了。',
    viewerId: 'viewer.test',
    viewerDisplayName: 'Viewer',
    selectedTarget: target,
    selectedSessionId: session.id,
    allowMultiReply: true,
    turnMode: 'playful',
    voiceConversationMode: 'on',
  });
  packet.contentBoundaryHint = {
    visualComfortLevel: 'restrained-visuals',
    relationshipBoundaryPreset: 'reserved',
  };

  const compiled = buildLocalChatCompiledPrompt({
    contextPacket: packet,
  });

  assert.equal(compiled.layerOrder.includes('contentBoundary'), true);
  assert.match(compiled.prompt, /用户当前选择克制风格/u);
  assert.match(compiled.prompt, /不要主动调情/u);
});

test('context assembler prioritizes unresolved continuity and trims session recall to top-k', async () => {
  await resetLocalChatConversationLedgerForTests();
  const target = createTarget();
  const session = await createLocalChatSession({
    targetId: target.id,
    viewerId: 'viewer.test',
    worldId: target.worldId,
    title: 'Aki',
  });

  await upsertLocalChatInteractionSnapshot({
    conversationId: session.id,
    relationshipState: 'warm',
    activeScene: ['night-walk'],
    emotionalTemperature: 'warm',
    assistantCommitments: ['我会提醒你去散步'],
    userPrefs: ['喜欢短句和停顿'],
    openLoops: ['说好了今晚去散步'],
    topicThreads: ['夜聊', '散步'],
    lastResolvedTurnId: 'turn-last',
    conversationDirective: null,
    conversationMomentum: 'steady',
    updatedAt: '2026-03-08T00:00:00.000Z',
  });
  await replaceLocalChatRelationMemorySlots({
    targetId: target.id,
    viewerId: 'viewer.test',
    entries: [
      {
        id: 'slot-promise',
        targetId: target.id,
        viewerId: 'viewer.test',
        slotType: 'promise',
        key: 'walk-promise',
        value: '说好了今晚去散步',
        confidence: 0.76,
        portability: 'local-only',
        sensitivity: 'personal',
        userOverride: 'inherit',
        updatedAt: '2026-03-08T00:00:00.000Z',
      },
      {
        id: 'slot-preference',
        targetId: target.id,
        viewerId: 'viewer.test',
        slotType: 'preference',
        key: 'preferred-rhythm',
        value: '喜欢短句和停顿',
        confidence: 0.92,
        portability: 'portable',
        sensitivity: 'safe',
        userOverride: 'inherit',
        updatedAt: '2026-03-08T00:00:00.000Z',
      },
    ],
  });
  await replaceLocalChatRecallIndex({
    conversationId: session.id,
    docs: Array.from({ length: 8 }, (_, index) => ({
      id: `recall-${index + 1}`,
      conversationId: session.id,
      sourceTurnId: index === 0 ? 'turn-last' : null,
      text: index === 0
        ? '你们说好了今晚去散步。'
        : `普通历史片段 ${index + 1}`,
      createdAt: `2026-03-0${Math.min(index + 1, 8)}T00:00:00.000Z`,
      updatedAt: `2026-03-0${Math.min(index + 1, 8)}T00:00:00.000Z`,
    })),
  });

  const packet = await assembleLocalChatContextPacket({
    text: '你还记得我们说好的那个安排吗？',
    viewerId: 'viewer.test',
    viewerDisplayName: 'Viewer',
    selectedTarget: target,
    selectedSessionId: session.id,
    allowMultiReply: true,
    turnMode: 'information',
    voiceConversationMode: 'off',
  });

  assert.equal(packet.relationMemorySlots.some((slot) => slot.id === 'slot-promise'), true);
  assert.equal(packet.sessionRecall.length, 6);
  assert.equal(packet.sessionRecall[0]?.text, '你们说好了今晚去散步。');
  assert.equal(packet.diagnostics.sessionRecallCount, 6);
});

test('context assembler omits the just-persisted user turn from recent turns so userInput is not duplicated', async () => {
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
      id: 'turn-user-current',
      role: 'user',
      kind: 'text',
      content: '今晚也想和你慢慢聊。',
      contextText: '今晚也想和你慢慢聊。',
      semanticSummary: '',
      timestamp: '2026-03-08T09:00:00.000Z',
      bundleId: '',
      bundleSeq: 0,
    },
  ]);

  const packet = await assembleLocalChatContextPacket({
    text: '今晚也想和你慢慢聊。',
    viewerId: 'viewer.test',
    viewerDisplayName: 'Viewer',
    selectedTarget: target,
    selectedSessionId: session.id,
    allowMultiReply: true,
    turnMode: 'checkin',
    voiceConversationMode: 'off',
  });
  const compiled = buildLocalChatCompiledPrompt({
    contextPacket: packet,
    profile: 'first-beat',
  });

  assert.equal(packet.recentTurns.length, 0);
  assert.match(compiled.prompt, /用户这次说：今晚也想和你慢慢聊。/u);
  assert.doesNotMatch(compiled.prompt, /Assistant #/u);
  assert.doesNotMatch(compiled.prompt, /User #1[\s\S]*今晚也想和你慢慢聊。/u);
});

test('first-beat prompt profile excludes warm-start and session recall while keeping continuity lanes', async () => {
  await resetLocalChatConversationLedgerForTests();
  const target = createTarget();
  const session = await createLocalChatSession({
    targetId: target.id,
    viewerId: 'viewer.test',
    worldId: target.worldId,
    title: 'Aki',
  });

  const packet = await assembleLocalChatContextPacket({
    text: '今晚还是有点想继续聊下去。',
    viewerId: 'viewer.test',
    viewerDisplayName: 'Viewer',
    selectedTarget: target,
    selectedSessionId: session.id,
    allowMultiReply: true,
    turnMode: 'emotional',
    voiceConversationMode: 'off',
  });

  const enrichedPacket = {
    ...packet,
    interactionSnapshot: {
      conversationId: session.id,
      relationshipState: 'warm' as const,
      activeScene: ['night-walk'],
      emotionalTemperature: 'warm' as const,
      assistantCommitments: ['今晚继续陪着你'],
      userPrefs: ['喜欢短句和停顿'],
      openLoops: ['今晚还想继续聊'],
      topicThreads: ['夜聊'],
      lastResolvedTurnId: 'turn-last',
      conversationDirective: null,
      conversationMomentum: 'steady' as const,
      updatedAt: '2026-03-08T00:00:00.000Z',
    },
    relationMemorySlots: [
      {
        id: 'slot-1',
        targetId: target.id,
        viewerId: 'viewer.test',
        slotType: 'preference' as const,
        key: 'preferred-rhythm',
        value: '喜欢短句和停顿',
        confidence: 0.92,
        portability: 'portable' as const,
        sensitivity: 'safe' as const,
        userOverride: 'inherit' as const,
        updatedAt: '2026-03-08T00:00:00.000Z',
      },
    ],
    platformWarmStart: {
      core: ['平台预热 core 记忆'],
      e2e: ['平台预热 e2e 记忆'],
      recallSource: 'local-index+remote-backfill' as const,
      entityId: target.id,
    },
    sessionRecall: [
      {
        id: 'recall-a',
        text: '这条历史召回不应该进入 first-beat prompt。',
        sourceKind: 'recall-index' as const,
        sourceTurnId: 'turn-a',
      },
    ],
    recentTurns: Array.from({ length: 6 }, (_, index) => ({
      id: `recent-${index + 1}`,
      seq: index + 1,
      role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
      lines: [`最近对话 ${index + 1}`],
    })),
  };

  const fullTurnCompiled = buildLocalChatCompiledPrompt({
    contextPacket: enrichedPacket,
    profile: 'full-turn',
  });
  const firstBeatCompiled = buildLocalChatCompiledPrompt({
    contextPacket: enrichedPacket,
    profile: 'first-beat',
  });

  assert.equal(fullTurnCompiled.profile, 'full-turn');
  assert.equal(firstBeatCompiled.profile, 'first-beat');
  assert.match(fullTurnCompiled.prompt, /平台预热 core 记忆/u);
  assert.match(fullTurnCompiled.prompt, /这条历史召回不应该进入 first-beat prompt/u);
  assert.doesNotMatch(firstBeatCompiled.prompt, /平台预热 core 记忆/u);
  assert.doesNotMatch(firstBeatCompiled.prompt, /这条历史召回不应该进入 first-beat prompt/u);
  assert.equal(firstBeatCompiled.retrieval.sessionRecallCount, 0);
  assert.equal(firstBeatCompiled.retrieval.recentTurnCount, 4);
  assert.equal(firstBeatCompiled.layers.find((layer) => layer.layer === 'interactionState')?.applied, true);
  assert.equal(firstBeatCompiled.layers.find((layer) => layer.layer === 'relationMemory')?.applied, true);
  assert.equal(firstBeatCompiled.layerOrder.includes('platformWarmStart'), false);
  assert.equal(firstBeatCompiled.layerOrder.includes('sessionRecall'), false);
});
