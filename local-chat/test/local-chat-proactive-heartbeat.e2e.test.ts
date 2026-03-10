import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_LOCAL_CHAT_SETTINGS, persistLocalChatSettings } from '../src/default-settings-store.ts';
import { runLocalChatProactiveHeartbeatCycle } from '../src/proactive/engine.ts';
import {
  appendTurnsToSession,
  createLocalChatSession,
  getLocalChatInteractionSnapshot,
  getLocalChatSession,
  listLocalChatRelationMemorySlots,
} from '../src/state/index.ts';
import {
  createScriptedAiClient,
  createTestTarget,
  waitForCondition,
  withLocalChatTestEnv,
} from './helpers/local-chat-test-harness.ts';

test('proactive heartbeat persists assistant turn, prompt trace, and continuity through the shared pipeline', async () => {
  const nowMs = Date.parse('2026-03-08T12:00:00.000Z');
  const target = createTestTarget({
    id: 'agent.local-chat.proactive',
    handle: '~proactive',
    displayName: 'Proactive Bot',
    agentMetadata: {
      wakeStrategy: 'PROACTIVE',
    },
    payload: {
      currentUserId: 'user.test',
      wakeStrategy: 'PROACTIVE',
    },
  });
  await withLocalChatTestEnv({
    targets: [target],
  }, async ({ readContext }) => {
    persistLocalChatSettings({
      ...DEFAULT_LOCAL_CHAT_SETTINGS,
      product: {
        ...DEFAULT_LOCAL_CHAT_SETTINGS.product,
        allowProactiveContact: true,
        mediaAutonomy: 'off',
        visualComfortLevel: 'text-only',
      },
    });

    const session = await createLocalChatSession({
      targetId: target.id,
      viewerId: 'user.test',
      worldId: target.worldId,
      title: target.displayName,
    });
    await appendTurnsToSession(session.id, [{
      id: 'turn-user-1',
      turnId: 'turn-user-1',
      turnSeq: 1,
      beatIndex: 0,
      beatCount: 1,
      role: 'user',
      kind: 'text',
      content: '如果你之后想起我，就来找我。',
      contextText: '如果你之后想起我，就来找我。',
      semanticSummary: '用户允许主动联系',
      timestamp: '2026-03-08T08:00:00.000Z',
      bundleId: '',
      bundleSeq: 0,
    }]);

    const ai = createScriptedAiClient({
      firstBeatText: '在吗，我刚刚想起你了。',
      planBeats: [
        {
          text: '晚点我也可以继续陪你，把刚刚那点情绪接住。',
          intent: 'comfort',
          relationMove: 'comfort-warm',
          sceneMove: 'idle-reachout',
          pauseMs: 520,
        },
      ],
    });
    const auditEvents: Array<{ reasonCode: string; actionHint: string }> = [];

    await runLocalChatProactiveHeartbeatCycle({
      aiClient: ai.client,
      getReadContext: () => readContext,
      nowMs: () => nowMs,
      onAuditEvent: (event) => {
        auditEvents.push({
          reasonCode: event.reasonCode,
          actionHint: event.actionHint,
        });
      },
    });

    await waitForCondition(async () => {
      const nextSession = await getLocalChatSession(session.id, 'user.test');
      return (nextSession?.turns.filter((turn) => turn.role === 'assistant').length || 0) >= 2;
    });

    const nextSession = await getLocalChatSession(session.id, 'user.test');
    assert.ok(nextSession);
    const assistantTurns = nextSession!.turns.filter((turn) => turn.role === 'assistant');
    assert.equal(assistantTurns.length >= 2, true);
    assert.equal(assistantTurns[0]?.promptTrace?.turnMode, 'checkin');
    assert.equal(Boolean(assistantTurns[0]?.audit), true);

    const snapshot = await getLocalChatInteractionSnapshot(session.id);
    assert.equal(Boolean(snapshot?.lastResolvedTurnId), true);

    const slots = await listLocalChatRelationMemorySlots({
      targetId: target.id,
      viewerId: 'user.test',
    });
    assert.equal(slots.some((slot) => slot.slotType === 'promise' && slot.value.includes('之后想起我')), true);

    assert.equal(auditEvents.some((event) => event.reasonCode === 'LOCAL_CHAT_PROACTIVE_ALLOWED' && event.actionHint === 'policy-gate-passed'), true);
    assert.equal(auditEvents.some((event) => event.reasonCode === 'LOCAL_CHAT_PROACTIVE_ALLOWED' && event.actionHint === 'contact-sent'), true);
  });
});
