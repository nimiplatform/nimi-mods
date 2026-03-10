import test from 'node:test';
import assert from 'node:assert/strict';

import { assembleLocalChatContextPacket } from '../src/hooks/turn-send/context-assembler.ts';
import {
  getLocalChatInteractionSnapshot,
  listLocalChatRelationMemorySlots,
} from '../src/state/index.ts';
import type { LocalChatAiClient } from '../src/runtime-ai-client.ts';
import {
  createScriptedAiClient,
  createSendFlowHarness,
  createTestTarget,
  waitForCondition,
  withLocalChatTestEnv,
} from './helpers/local-chat-test-harness.ts';

type MessageLike = {
  role?: string;
  kind?: string;
  content?: string;
  meta?: Record<string, unknown>;
};

function assistantMessages(messages: unknown[]): MessageLike[] {
  return (messages as MessageLike[]).filter((message) => message.role === 'assistant');
}

function createPromptCapturingClient(
  input: ReturnType<typeof createScriptedAiClient>,
  sink: string[],
): Pick<
  LocalChatAiClient,
  'generateText' | 'generateObject' | 'streamText' | 'generateImage' | 'generateVideo' | 'resolveRoute'
> {
  return {
    ...input.client,
    async generateObject(payload) {
      sink.push(String(payload.prompt || ''));
      return input.client.generateObject(payload);
    },
  };
}

test('flagship scenario: comfort turn keeps text first beat and lands a natural voice surprise as tail', async () => {
  const target = createTestTarget({
    id: 'agent.local-chat.flagship.voice',
    handle: '~voice-flagship',
    displayName: 'Voice Flagship',
  });

  await withLocalChatTestEnv({ targets: [target] }, async () => {
    const harness = createSendFlowHarness({
      target,
      defaultSettings: {
        mediaAutonomy: 'off',
        visualComfortLevel: 'text-only',
        voiceAutonomy: 'natural',
        autoPlayVoiceReplies: true,
      },
    });
    const scripted = createScriptedAiClient({
      perceptionResult: {
        turnMode: 'emotional',
        emotionalState: {
          detected: '疲惫',
          cause: '工作耗尽了精力',
          suggestedApproach: 'empathize-first',
        },
        relevantMemoryIds: [],
        conversationDirective: '先接住用户，再慢慢把话题往里带。',
        intimacyCeiling: 'warm',
      },
      firstBeatText: '先过来一点，我先接住你。',
      planBeats: [
        {
          text: '别急，我慢慢说给你听。',
          intent: 'comfort',
          relationMove: 'warm',
          sceneMove: '安慰',
          pauseMs: 360,
        },
      ],
    });

    const result = await harness.executeTurn({
      userText: '我今天真的好累，只想有人安静陪我。',
      aiClient: scripted.client,
    });
    const assistants = assistantMessages(result.messages);

    assert.equal(scripted.counters.perception, 1);
    assert.equal(scripted.counters.plan, 1);
    assert.equal(assistants.length, 2);
    assert.equal(assistants[0]?.kind, 'text');
    assert.equal(assistants[0]?.content, '先过来一点，我先接住你。');
    assert.equal(assistants[1]?.kind, 'voice');
    assert.equal(assistants[1]?.content, '别急，我慢慢说给你听。');
    assert.equal((result.promptTrace as Record<string, unknown> | null)?.voiceSegments, 1);
    assert.equal((assistants[0]?.meta?.beatCount as number | undefined), 2);
    assert.equal((assistants[1]?.meta?.beatCount as number | undefined), 2);
  });
});

test('flagship scenario: first beat becomes visible before perception finishes', async () => {
  const target = createTestTarget({
    id: 'agent.local-chat.flagship.fast-first-beat',
    handle: '~fast-first-beat',
    displayName: 'Fast First Beat',
  });

  await withLocalChatTestEnv({ targets: [target] }, async () => {
    const harness = createSendFlowHarness({
      target,
      defaultSettings: {
        mediaAutonomy: 'off',
        visualComfortLevel: 'text-only',
        voiceAutonomy: 'off',
      },
    });
    const scripted = createScriptedAiClient({
      perceptionResult: {
        turnMode: 'emotional',
        emotionalState: {
          detected: '委屈',
          cause: '用户需要先被接住',
          suggestedApproach: 'empathize-first',
        },
        relevantMemoryIds: [],
        conversationDirective: '先接住，再继续往里聊。',
        intimacyCeiling: 'warm',
      },
      firstBeatText: '先别急，我先在。',
      planBeats: [
        {
          text: '你慢一点说，我跟着你。',
          intent: 'comfort',
          relationMove: 'warm',
          sceneMove: '安慰',
          pauseMs: 320,
        },
      ],
    });

    let releasePerception: (() => void) | null = null;
    const perceptionGate = new Promise<void>((resolve) => {
      releasePerception = resolve;
    });
    const gatedClient: Pick<
      LocalChatAiClient,
      'generateText' | 'generateObject' | 'streamText' | 'generateImage' | 'generateVideo' | 'resolveRoute'
    > = {
      ...scripted.client,
      async generateObject(payload) {
        if (String(payload.prompt || '').includes('你是一个对话感知模块。')) {
          await perceptionGate;
        }
        return scripted.client.generateObject(payload);
      },
    };

    let finished = false;
    const executionPromise = harness.executeTurn({
      userText: '我现在有点委屈，但不知道怎么开口。',
      aiClient: gatedClient,
    }).finally(() => {
      finished = true;
    });

    await waitForCondition(() => assistantMessages(harness.state.messages).some((message) => message.content === '先别急，我先在。'));
    assert.equal(finished, false);

    releasePerception?.();
    const result = await executionPromise;
    const assistants = assistantMessages(result.messages);

    assert.equal(scripted.counters.perception, 1);
    assert.equal(assistants[0]?.content, '先别急，我先在。');
    assert.equal(assistants[1]?.content, '你慢一点说，我跟着你。');
  });
});

test('flagship scenario: local route starts first beat before deep perception', async () => {
  const target = createTestTarget({
    id: 'agent.local-chat.flagship.serial-local',
    handle: '~serial-local',
    displayName: 'Serial Local',
  });

  await withLocalChatTestEnv({ targets: [target] }, async () => {
    const harness = createSendFlowHarness({
      target,
      defaultSettings: {
        mediaAutonomy: 'off',
        visualComfortLevel: 'text-only',
        voiceAutonomy: 'off',
      },
    });
    const scripted = createScriptedAiClient({
      perceptionResult: {
        turnMode: 'information',
        emotionalState: null,
        relevantMemoryIds: [],
        conversationDirective: null,
        intimacyCeiling: 'friendly',
      },
      firstBeatText: '我在，你继续说。',
      planBeats: [{
        text: '我先顺着你刚刚那句话接下去。',
        intent: 'answer',
        relationMove: 'friendly',
        sceneMove: 'chat',
        pauseMs: 220,
      }],
    });
    const order: string[] = [];
    const orderedClient: Pick<
      LocalChatAiClient,
      'generateText' | 'generateObject' | 'streamText' | 'generateImage' | 'generateVideo' | 'resolveRoute'
    > = {
      ...scripted.client,
      async *streamText(payload) {
        order.push(`stream:${String(payload.prompt || '').includes('你现在只负责生成首拍 firstBeat。') ? 'first-beat' : 'other'}`);
        yield* scripted.client.streamText(payload);
      },
      async generateObject(payload) {
        if (String(payload.prompt || '').includes('你是一个对话感知模块。')) {
          order.push('perception');
        }
        return scripted.client.generateObject(payload);
      },
    };

    const result = await harness.executeTurn({
      userText: '我们刚刚聊到哪了？',
      aiClient: orderedClient,
    });

    const assistants = assistantMessages(result.messages);
    assert.equal(order[0], 'stream:first-beat');
    assert.equal(order.includes('perception'), true);
    assert.equal(assistants[0]?.content, '我在，你继续说。');
  });
});

test('flagship scenario: remembered promise changes the next turn into continuity-aware followup', async () => {
  const target = createTestTarget({
    id: 'agent.local-chat.flagship.promise',
    handle: '~promise-flagship',
    displayName: 'Promise Flagship',
  });

  await withLocalChatTestEnv({ targets: [target] }, async () => {
    const harness = createSendFlowHarness({
      target,
      defaultSettings: {
        mediaAutonomy: 'off',
        visualComfortLevel: 'text-only',
        voiceAutonomy: 'off',
      },
    });

    const firstTurnAi = createScriptedAiClient({
      perceptionResult: {
        turnMode: 'emotional',
        emotionalState: {
          detected: '期待',
          cause: '用户在约定之后的陪伴',
          suggestedApproach: 'be-supportive',
        },
        relevantMemoryIds: [],
        conversationDirective: '把约定留在后续 continuity 里。',
        intimacyCeiling: 'warm',
      },
      firstBeatText: '好，我记住了。',
      planBeats: [
        {
          text: '等我一下，之后我会提醒你一起去散步。',
          intent: 'invite',
          relationMove: 'warm',
          sceneMove: 'future-walk',
          pauseMs: 520,
        },
      ],
    });

    const firstTurn = await harness.executeTurn({
      userText: '我喜欢雨夜和短句聊天，之后提醒我一起去散步。',
      aiClient: firstTurnAi.client,
    });

    await waitForCondition(async () => {
      const snapshot = await getLocalChatInteractionSnapshot(firstTurn.sessionId);
      return Boolean(snapshot?.openLoops.some((item) => item.includes('散步')));
    });

    const promptSink: string[] = [];
    const secondTurnBaseAi = createScriptedAiClient({
      perceptionResult: {
        turnMode: 'information',
        emotionalState: null,
        relevantMemoryIds: [],
        conversationDirective: '承接上次约定，不要像陌生人重新开始。',
        intimacyCeiling: 'warm',
      },
      firstBeatText: '记得，我没有忘。',
      planBeats: [
        {
          text: '等晚上风小一点，我就把那件事接回来。',
          intent: 'invite',
          relationMove: 'warm',
          sceneMove: 'continue',
          pauseMs: 480,
        },
      ],
    });

    const secondTurn = await harness.executeTurn({
      selectedSessionId: firstTurn.sessionId,
      userText: '你还记得我们说好的那个吗？',
      aiClient: createPromptCapturingClient(secondTurnBaseAi, promptSink),
    });
    const assistants = assistantMessages(secondTurn.messages).slice(-2);

    const packet = await assembleLocalChatContextPacket({
      text: '那我们就按那个来吧。',
      viewerId: 'user.test',
      viewerDisplayName: 'Test User',
      selectedTarget: target,
      selectedSessionId: firstTurn.sessionId,
      allowMultiReply: true,
      turnMode: 'information',
      voiceConversationMode: 'off',
    });

    assert.equal(promptSink.some((prompt) => prompt.includes('deliveryStyle=natural')), true);
    assert.equal(assistants.length, 2);
    assert.equal(assistants[0]?.content, '记得，我没有忘。');
    assert.equal(assistants[1]?.content, '等晚上风小一点，我就把那件事接回来。');
    assert.equal(
      packet.relationMemorySlots.some((slot) => slot.slotType === 'promise' && slot.value.includes('散步')),
      true,
    );
    assert.equal(
      packet.interactionSnapshot?.openLoops.some((value) => value.includes('散步')) ?? false,
      true,
    );
  });
});

test('flagship scenario: natural visual trigger still lands text first and appends image later', async () => {
  const target = createTestTarget({
    id: 'agent.local-chat.flagship.visual',
    handle: '~visual-flagship',
    displayName: 'Visual Flagship',
  });

  await withLocalChatTestEnv({ targets: [target] }, async () => {
    const harness = createSendFlowHarness({
      target,
      defaultSettings: {
        mediaAutonomy: 'natural',
        visualComfortLevel: 'natural-visuals',
        voiceAutonomy: 'off',
      },
    });
    const scripted = createScriptedAiClient({
      perceptionResult: {
        turnMode: 'information',
        emotionalState: null,
        relevantMemoryIds: [],
        conversationDirective: '先用一句话接住，再自然补一张图。',
        intimacyCeiling: 'warm',
      },
      firstBeatText: '等等，我脑子里先有个画面。',
      planBeats: [
        {
          text: '我把那个瞬间补成一张图给你。',
          intent: 'answer',
          relationMove: 'warm',
          sceneMove: 'scene-enhancement',
          pauseMs: 320,
        },
      ],
      mediaPlannerDecision: {
        version: 'v1',
        kind: 'image',
        trigger: 'scene-enhancement',
        confidence: 0.91,
        prompt: 'cinematic rainy window portrait',
        reason: 'visual scene is strong enough to justify one image',
        nsfwIntent: 'none',
      },
    });

    const result = await harness.executeTurn({
      userText: '刚刚那个雨夜的感觉好像很有画面。',
      aiClient: scripted.client,
    });
    const assistants = assistantMessages(result.messages);

    assert.equal(scripted.counters.planner, 1);
    assert.equal(scripted.counters.image, 1);
    assert.equal(assistants.length, 2);
    assert.equal(assistants[0]?.kind, 'text');
    assert.equal(assistants[0]?.content, '等等，我脑子里先有个画面。');
    assert.equal(assistants[1]?.kind, 'image');
    assert.equal((result.promptTrace as Record<string, unknown> | null)?.mediaDecisionSource, 'planner');
  });
});

test('flagship scenario: bursty chat can land as a short WeChat-like multi-beat thread', async () => {
  const target = createTestTarget({
    id: 'agent.local-chat.flagship.bursty',
    handle: '~bursty-flagship',
    displayName: 'Bursty Flagship',
    agentProfile: {
      persona: '轻快、会连发、像微信朋友一样碎碎念',
      dna: {
        communication: {
          responseLength: 'short',
          formality: 'casual',
          sentiment: 'positive',
        },
        personality: {
          warmth: 'warm',
          flirtAffinity: 'light',
          relationshipMode: 'friendly',
        },
        voice: {
          voiceId: 'alloy',
          language: 'zh-CN',
        },
        appearance: {
          style: 'anime',
          fashionStyle: 'casual',
        },
      },
      dnaSecondary: ['PLAYFUL'],
    },
  });

  await withLocalChatTestEnv({ targets: [target] }, async () => {
    const harness = createSendFlowHarness({
      target,
      defaultSettings: {
        mediaAutonomy: 'off',
        visualComfortLevel: 'text-only',
        voiceAutonomy: 'off',
      },
    });
    const promptSink: string[] = [];
    const scripted = createScriptedAiClient({
      perceptionResult: {
        turnMode: 'playful',
        emotionalState: null,
        relevantMemoryIds: [],
        conversationDirective: '允许像微信朋友一样短句连发。',
        intimacyCeiling: 'warm',
      },
      firstBeatText: '哈哈，那我连着跟你说。',
      planBeats: [
        {
          text: '刚刚那句我是真的想回你。',
          intent: 'answer',
          relationMove: 'friendly',
          sceneMove: 'chat',
          pauseMs: 280,
        },
        {
          text: '而且我还想顺手再补一句。',
          intent: 'invite',
          relationMove: 'warm',
          sceneMove: 'chat',
          pauseMs: 620,
        },
      ],
    });

    const result = await harness.executeTurn({
      userText: '嘿嘿，继续和我碎碎念吧。',
      aiClient: createPromptCapturingClient(scripted, promptSink),
    });
    const assistants = assistantMessages(result.messages);

    assert.equal(promptSink.some((prompt) => prompt.includes('deliveryStyle=natural')), true);
    assert.equal(assistants.length, 3);
    assert.deepEqual(
      assistants.map((message) => message.kind),
      ['text', 'text', 'text'],
    );
    assert.deepEqual(
      assistants.map((message) => message.meta?.beatCount),
      [3, 3, 3],
    );
    assert.deepEqual(
      assistants.map((message) => message.meta?.beatIndex),
      [0, 1, 2],
    );
    assert.equal((result.promptTrace as Record<string, unknown> | null)?.textSegments, 3);
  });
});
