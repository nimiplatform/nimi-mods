import test from 'node:test';
import assert from 'node:assert/strict';

import { assembleLocalChatContextPacket } from '../src/hooks/turn-send/context-assembler.ts';
import {
  getLocalChatInteractionSnapshot,
  listLocalChatRelationMemorySlots,
  updateLocalChatRelationMemorySlot,
} from '../src/state/index.ts';
import {
  createScriptedAiClient,
  createSendFlowHarness,
  createTestTarget,
  waitForCondition,
  withLocalChatTestEnv,
} from './helpers/local-chat-test-harness.ts';

function slotIncludesTerms(value: string, terms: string[]): boolean {
  return terms.every((term) => value.includes(term));
}

test('send-flow continuity persists preference and promise across a neutral follow-up turn', async () => {
  const target = createTestTarget({
    id: 'agent.local-chat.continuity',
    handle: '~continuity',
    displayName: 'Continuity Bot',
  });
  await withLocalChatTestEnv({
    targets: [target],
  }, async () => {
    const harness = createSendFlowHarness({
      target,
      defaultSettings: {
        mediaAutonomy: 'off',
        visualComfortLevel: 'text-only',
      },
    });

    const firstAi = createScriptedAiClient({
      firstBeatText: '好，我记住了。',
      planBeats: [
        {
          text: '__FIRST_BEAT_LOCKED__',
          intent: 'answer',
          relationMove: 'comfort-warm',
          sceneMove: 'rainy-night',
          pauseMs: 0,
        },
        {
          text: '等我一下，之后我会提醒你一起去散步。',
          intent: 'invite',
          relationMove: 'invite-closer',
          sceneMove: 'future-walk',
          pauseMs: 650,
        },
      ],
    });
    const firstTurn = await harness.executeTurn({
      userText: '我喜欢雨夜和短句聊天，之后提醒我一起去散步。',
      aiClient: firstAi.client,
    });
    const sessionId = firstTurn.sessionId;

    await waitForCondition(async () => {
      const slots = await listLocalChatRelationMemorySlots({
        targetId: target.id,
        viewerId: 'user.test',
      });
      return slots.length >= 2;
    });

    const firstSlots = await listLocalChatRelationMemorySlots({
      targetId: target.id,
      viewerId: 'user.test',
    });
    assert.equal(
      firstSlots.some((slot) => slot.slotType === 'preference' && slotIncludesTerms(slot.value, ['雨夜', '短句聊天'])),
      true,
    );
    assert.equal(
      firstSlots.some((slot) => slot.slotType === 'promise' && slotIncludesTerms(slot.value, ['提醒', '散步'])),
      true,
    );

    const secondAi = createScriptedAiClient({
      firstBeatText: '嗯，今天天气还挺安静的。',
      planBeats: [
        {
          text: '__FIRST_BEAT_LOCKED__',
          intent: 'answer',
          relationMove: 'friendly',
          sceneMove: 'weather-chat',
          pauseMs: 0,
        },
        {
          text: '不过我还记得你喜欢那种雨夜里慢慢聊的感觉。',
          intent: 'clarify',
          relationMove: 'friendly',
          sceneMove: 'weather-chat',
          pauseMs: 520,
        },
      ],
    });
    await harness.executeTurn({
      userText: '今天先随便聊聊天气吧。',
      selectedSessionId: sessionId,
      aiClient: secondAi.client,
    });

    await waitForCondition(async () => {
      const snapshot = await getLocalChatInteractionSnapshot(sessionId);
      return Boolean(snapshot?.lastResolvedTurnId);
    });

    const secondSlots = await listLocalChatRelationMemorySlots({
      targetId: target.id,
      viewerId: 'user.test',
    });
    assert.equal(
      secondSlots.some((slot) => slot.slotType === 'preference' && slotIncludesTerms(slot.value, ['雨夜', '短句聊天'])),
      true,
    );
    assert.equal(
      secondSlots.some((slot) => slot.slotType === 'promise' && slotIncludesTerms(slot.value, ['提醒', '散步'])),
      true,
    );

    const packet = await assembleLocalChatContextPacket({
      text: '你还记得我喜欢什么交流节奏吗？',
      viewerId: 'user.test',
      viewerDisplayName: 'Test User',
      selectedTarget: target,
      selectedSessionId: sessionId,
      allowMultiReply: true,
      turnMode: 'information',
      voiceConversationMode: 'off',
    });
    assert.equal(
      packet.relationMemorySlots.some((slot) => slot.slotType === 'preference' && slotIncludesTerms(slot.value, ['雨夜', '短句聊天'])),
      true,
    );
    assert.equal(
      packet.interactionSnapshot?.openLoops.some((value) => slotIncludesTerms(value, ['提醒', '散步'])) ?? false,
      true,
    );
  });
});

test('relation-memory override survives automatic slot regeneration on later turns', async () => {
  const target = createTestTarget({
    id: 'agent.local-chat.override',
    handle: '~override',
    displayName: 'Override Bot',
  });
  await withLocalChatTestEnv({
    targets: [target],
  }, async () => {
    const harness = createSendFlowHarness({
      target,
      defaultSettings: {
        mediaAutonomy: 'off',
        visualComfortLevel: 'text-only',
      },
    });

    const firstAi = createScriptedAiClient({
      firstBeatText: '我记住了。',
      planBeats: [
        {
          text: '__FIRST_BEAT_LOCKED__',
          intent: 'answer',
          relationMove: 'friendly',
          sceneMove: 'chat',
          pauseMs: 0,
        },
        {
          text: '你喜欢短句这件事，我会一直照顾到。',
          intent: 'clarify',
          relationMove: 'friendly',
          sceneMove: 'chat',
          pauseMs: 480,
        },
      ],
    });
    const firstTurn = await harness.executeTurn({
      userText: '我喜欢短句一点的聊天方式。',
      aiClient: firstAi.client,
    });
    const sessionId = firstTurn.sessionId;

    await waitForCondition(async () => {
      const slots = await listLocalChatRelationMemorySlots({
        targetId: target.id,
        viewerId: 'user.test',
      });
      return slots.some((slot) => slot.slotType === 'preference');
    });

    const preferenceSlot = (await listLocalChatRelationMemorySlots({
      targetId: target.id,
      viewerId: 'user.test',
    })).find((slot) => slot.slotType === 'preference');
    assert.ok(preferenceSlot);

    await updateLocalChatRelationMemorySlot({
      id: preferenceSlot!.id,
      targetId: target.id,
      viewerId: 'user.test',
      updater: (previous) => ({
        ...previous,
        userOverride: 'never-sync',
      }),
    });

    const secondAi = createScriptedAiClient({
      firstBeatText: '嗯，我在调整节奏。',
      planBeats: [
        {
          text: '__FIRST_BEAT_LOCKED__',
          intent: 'answer',
          relationMove: 'friendly',
          sceneMove: 'chat',
          pauseMs: 0,
        },
      ],
    });
    await harness.executeTurn({
      userText: '那我们继续。',
      selectedSessionId: sessionId,
      aiClient: secondAi.client,
    });

    await waitForCondition(async () => {
      const slots = await listLocalChatRelationMemorySlots({
        targetId: target.id,
        viewerId: 'user.test',
      });
      return slots.some((slot) => slot.id === preferenceSlot!.id && slot.userOverride === 'never-sync');
    });

    const slots = await listLocalChatRelationMemorySlots({
      targetId: target.id,
      viewerId: 'user.test',
    });
    assert.equal(slots.some((slot) => slot.id === preferenceSlot!.id && slot.userOverride === 'never-sync'), true);
  });
});
