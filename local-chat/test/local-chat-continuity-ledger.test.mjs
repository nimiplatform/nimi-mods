import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendSegmentToLocalChatBundle,
  createLocalChatSession,
  createLocalChatTurnBundle,
  getLocalChatRunningSummary,
  getLocalChatSession,
  lexicalRecallLocalChatSession,
  listLocalChatDurableMemoryEntries,
  listLocalChatSessions,
  resetLocalChatConversationLedgerForTests,
} from '../src/state/index.ts';
import {
  CORE_DATA_API_AGENT_MEMORY_RECALL_FOR_ENTITY,
  buildLocalChatCompiledPrompt,
  configureLocalChatCoreQueryBridge,
} from '../src/data/index.ts';
import {
  getLocalChatContinuityHealth,
  resetLocalChatContinuityHealthForTests,
  runLocalChatContinuityMaintenance,
} from '../src/hooks/turn-send/continuity-maintenance.ts';
import { assembleLocalChatContextPacket } from '../src/hooks/turn-send/context-assembler.ts';

function createTarget() {
  return {
    id: 'agent.continuity',
    handle: 'continuity-bot',
    displayName: 'Continuity Bot',
    avatarUrl: null,
    bio: 'Keeps long conversations coherent.',
    friendsSince: null,
    isAgent: true,
    worldId: 'world.continuity',
    worldResolvedBy: 'profile',
    agentMetadata: {},
    agentProfile: {},
    world: { name: 'Continuity Harbor' },
    worldview: { name: 'Night Memory' },
    payload: {},
  };
}

test.afterEach(() => {
  configureLocalChatCoreQueryBridge(null);
  resetLocalChatContinuityHealthForTests();
});

test('conversation ledger projects assistant media continuity from bundles', async () => {
  await resetLocalChatConversationLedgerForTests();
  const session = await createLocalChatSession({
    targetId: 'agent.continuity',
    viewerId: 'viewer.test',
    worldId: 'world.continuity',
    title: 'Continuity Session',
  });

  const userBundle = await createLocalChatTurnBundle({
    conversationId: session.id,
    role: 'user',
  });
  await appendSegmentToLocalChatBundle({
    conversationId: session.id,
    bundleId: userBundle.id,
    role: 'user',
    kind: 'text',
    content: '刚刚那个画面很电影感',
    contextText: '刚刚那个画面很电影感',
  });

  const assistantBundle = await createLocalChatTurnBundle({
    conversationId: session.id,
    role: 'assistant',
  });
  await appendSegmentToLocalChatBundle({
    conversationId: session.id,
    bundleId: assistantBundle.id,
    role: 'assistant',
    kind: 'text',
    content: '我知道你说的是那种潮湿霓虹夜景。',
    contextText: '我知道你说的是那种潮湿霓虹夜景。',
  });
  await appendSegmentToLocalChatBundle({
    conversationId: session.id,
    bundleId: assistantBundle.id,
    role: 'assistant',
    kind: 'image',
    content: '',
    contextText: 'shared image: 潮湿霓虹夜景人像',
    semanticSummary: '潮湿霓虹夜景人像',
    media: {
      uri: 'file:///tmp/image.png',
      mimeType: 'image/png',
    },
  });

  const projected = await getLocalChatSession(session.id);
  assert.ok(projected);
  assert.equal(projected.bundleCount, 2);
  assert.equal(projected.turns.length, 3);
  assert.equal(projected.turns[2]?.kind, 'image');
  assert.equal(projected.turns[2]?.semanticSummary, '潮湿霓虹夜景人像');

  const recall = await lexicalRecallLocalChatSession({
    conversationId: session.id,
    query: '霓虹夜景',
    topK: 3,
  });
  assert.ok(recall.some((item) => item.text.includes('潮湿霓虹夜景人像')));
});

test('continuity maintenance writes running summary and durable memory', async () => {
  await resetLocalChatConversationLedgerForTests();
  const target = createTarget();
  const session = await createLocalChatSession({
    targetId: target.id,
    viewerId: 'viewer.test',
    worldId: target.worldId,
    title: target.displayName,
  });

  for (let index = 0; index < 5; index += 1) {
    const userBundle = await createLocalChatTurnBundle({
      conversationId: session.id,
      role: 'user',
    });
    await appendSegmentToLocalChatBundle({
      conversationId: session.id,
      bundleId: userBundle.id,
      role: 'user',
      kind: 'text',
      content: index === 0 ? '我喜欢下雨天和霓虹灯。' : `我们继续聊第 ${index + 1} 轮。`,
      contextText: index === 0 ? '我喜欢下雨天和霓虹灯。' : `我们继续聊第 ${index + 1} 轮。`,
    });
    const assistantBundle = await createLocalChatTurnBundle({
      conversationId: session.id,
      role: 'assistant',
    });
    await appendSegmentToLocalChatBundle({
      conversationId: session.id,
      bundleId: assistantBundle.id,
      role: 'assistant',
      kind: 'text',
      content: index === 4
        ? '好，我答应之后给你整理一份雨夜氛围片单。'
        : `第 ${index + 1} 轮我还记得你喜欢这种氛围。`,
      contextText: index === 4
        ? '好，我答应之后给你整理一份雨夜氛围片单。'
        : `第 ${index + 1} 轮我还记得你喜欢这种氛围。`,
    });
  }

  let callCount = 0;
  const aiClient = {
    generateObject: async ({ parse }) => {
      callCount += 1;
      const payload = callCount === 1
        ? {
          relationshipState: ['双方已经形成稳定的夜景审美默契'],
          userFactsEstablished: ['用户喜欢下雨天和霓虹灯氛围'],
          assistantCommitments: ['之后要整理一份雨夜氛围片单'],
          openLoops: ['还没有真正把片单发给用户'],
          sceneState: ['聊天停留在电影感夜景和氛围偏好上'],
        }
        : {
          relationshipState: [{
            slotKey: 'rapport',
            content: '双方在电影感夜景审美上已经形成默契',
            confidence: 0.88,
            importance: 0.72,
            status: 'active',
          }],
          userFacts: [{
            slotKey: 'weather-aesthetic',
            content: '用户喜欢下雨天和霓虹灯氛围',
            confidence: 0.95,
            importance: 0.81,
            status: 'active',
          }],
          preferences: [{
            slotKey: 'visual-style',
            content: '用户偏好电影感夜景和潮湿霓虹画面',
            confidence: 0.9,
            importance: 0.78,
            status: 'active',
          }],
          boundaries: [],
          assistantCommitments: [{
            slotKey: 'rainy-night-list',
            content: '助手承诺之后整理一份雨夜氛围片单',
            confidence: 0.93,
            importance: 0.84,
            status: 'active',
          }],
          openLoops: [{
            slotKey: 'send-rainy-night-list',
            content: '还没有把雨夜氛围片单真正发给用户',
            confidence: 0.91,
            importance: 0.82,
            status: 'active',
          }],
        };
      return {
        object: parse(JSON.stringify(payload)),
        route: {
          source: 'local-runtime',
          model: 'continuity-model',
        },
        traceId: `trace-${callCount}`,
      };
    },
  };

  const continuityHealth = await runLocalChatContinuityMaintenance({
    aiClient,
    routeOverride: null,
    conversationId: session.id,
    viewerId: 'viewer.test',
    target,
  });

  const summary = await getLocalChatRunningSummary(session.id);
  assert.ok(summary);
  assert.ok(summary.lastSummarizedBundleSeq > 0);
  assert.ok(summary.userFactsEstablished.some((item) => item.includes('下雨天和霓虹灯')));

  const durableMemory = await listLocalChatDurableMemoryEntries({
    targetId: target.id,
    viewerId: 'viewer.test',
    includeResolved: true,
  });
  assert.ok(durableMemory.some((entry) => entry.type === 'user-fact' && entry.slotKey === 'weather-aesthetic'));
  assert.ok(durableMemory.some((entry) => entry.type === 'assistant-commitment' && entry.slotKey === 'rainy-night-list'));
  assert.ok(durableMemory.some((entry) => entry.type === 'open-loop' && entry.slotKey === 'send-rainy-night-list'));
  assert.equal(continuityHealth?.runningSummary.status, 'healthy');
  assert.equal(continuityHealth?.durableMemory.status, 'healthy');
  assert.equal(continuityHealth?.runningSummary.consecutiveFailures, 0);
  assert.equal(continuityHealth?.durableMemory.consecutiveFailures, 0);
  assert.equal(typeof continuityHealth?.runningSummary.lastDurationMs, 'number');
  assert.equal(typeof continuityHealth?.durableMemory.lastDurationMs, 'number');
  const persistedHealth = getLocalChatContinuityHealth(session.id);
  assert.deepEqual(persistedHealth, continuityHealth);
});

test('cold-start context packet injects platform warm-start without seeding local durable memory', async () => {
  await resetLocalChatConversationLedgerForTests();
  configureLocalChatCoreQueryBridge({
    query: async (capability) => {
      if (capability !== CORE_DATA_API_AGENT_MEMORY_RECALL_FOR_ENTITY) return [];
      return {
        core: [{ content: '她平时说话偏亲密，会主动接住情绪。' }],
        e2e: [{ content: '她记得用户偏爱雨夜霓虹氛围。', subjectId: 'viewer.test' }],
        recallSource: 'remote-only',
        entityId: 'viewer.test',
      };
    },
  });

  const target = createTarget();
  const session = await createLocalChatSession({
    targetId: target.id,
    viewerId: 'viewer.test',
    worldId: target.worldId,
    title: target.displayName,
  });

  const packet = await assembleLocalChatContextPacket({
    text: '今晚想聊点有氛围感的',
    viewerId: 'viewer.test',
    viewerDisplayName: 'Tester',
    selectedTarget: target,
    selectedSessionId: session.id,
  });

  assert.deepEqual(packet.platformWarmStart?.core, ['她平时说话偏亲密，会主动接住情绪。']);
  assert.deepEqual(packet.platformWarmStart?.e2e, ['她记得用户偏爱雨夜霓虹氛围。']);
  const durableMemory = await listLocalChatDurableMemoryEntries({
    targetId: target.id,
    viewerId: 'viewer.test',
  });
  assert.equal(durableMemory.length, 0);
});

test('context packet derives reply style, pacing plan, and prompt lane budgets from agent profile', async () => {
  await resetLocalChatConversationLedgerForTests();
  const target = {
    ...createTarget(),
    handle: '~zi-ling',
    displayName: '紫灵',
    agentProfile: {
      dnaPrimary: 'ROMANTIC',
      dnaSecondary: ['GENTLE'],
      postHistoryInstructions: '多用亲密、像微信朋友一样的语气接住对方情绪。',
      exampleDialogue: '想我就直说呀。我先抱一下你，再陪你慢慢聊。',
      dna: {
        communication: {
          responseLength: 'short',
          formality: 'casual',
          sentiment: 'positive',
        },
        personality: {
          relationshipMode: 'romantic',
        },
      },
    },
  };
  const session = await createLocalChatSession({
    targetId: target.id,
    viewerId: 'viewer.test',
    worldId: target.worldId,
    title: target.displayName,
  });

  const packet = await assembleLocalChatContextPacket({
    text: '你好',
    viewerId: 'viewer.test',
    viewerDisplayName: 'Tester',
    selectedTarget: target,
    selectedSessionId: session.id,
  });

  assert.equal(packet.target.replyStyleProfile.responseLength, 'short');
  assert.equal(packet.target.replyStyleProfile.relationshipMode, 'romantic');
  assert.equal(packet.target.replyStyleProfile.followupStyle, 'eager');
  assert.equal(packet.target.replyStyleProfile.warmth, 'intimate');
  assert.equal(packet.pacingPlan.mode, 'burst-2');
  assert.equal(packet.pacingPlan.maxSegments, 2);

  const compiled = buildLocalChatCompiledPrompt({
    contextPacket: {
      ...packet,
      sessionRecall: [{
        id: 'recall-heavy',
        text: '雨夜霓虹'.repeat(500),
        sourceKind: 'running-summary',
        sourceBundleSeq: null,
      }],
      recentBundles: [{
        id: 'bundle-heavy',
        seq: 1,
        role: 'assistant',
        lines: ['电影感夜景'.repeat(500)],
      }],
    },
    maxPromptChars: 3_600,
  });

  assert.equal(compiled.compilerVersion, 'v5');
  assert.ok(compiled.budget.laneBudgets.identity?.maxChars > 0);
  assert.ok(compiled.budget.laneBudgets.userInput?.maxChars > 0);
  assert.equal(compiled.budget.laneBudgets.recentBundles?.truncated, true);
  assert.equal(compiled.truncationByLane.recentBundles, true);
});

test('session listing isolates conversations by viewer id', async () => {
  await resetLocalChatConversationLedgerForTests();
  await createLocalChatSession({
    targetId: 'agent.continuity',
    viewerId: 'viewer.alpha',
    worldId: 'world.continuity',
    title: 'Alpha Session',
  });
  await createLocalChatSession({
    targetId: 'agent.continuity',
    viewerId: 'viewer.beta',
    worldId: 'world.continuity',
    title: 'Beta Session',
  });

  const alphaSessions = await listLocalChatSessions('agent.continuity', 'viewer.alpha');
  const betaSessions = await listLocalChatSessions('agent.continuity', 'viewer.beta');

  assert.equal(alphaSessions.length, 1);
  assert.equal(betaSessions.length, 1);
  assert.equal(alphaSessions[0]?.viewerId, 'viewer.alpha');
  assert.equal(betaSessions[0]?.viewerId, 'viewer.beta');
});
