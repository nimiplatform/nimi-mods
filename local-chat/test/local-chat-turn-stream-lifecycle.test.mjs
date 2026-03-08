import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLocalChatSession,
  resetLocalChatConversationLedgerForTests,
} from '../src/state/index.ts';
import {
  commitAssistantMessage,
  scheduleAssistantTurnDeliveries,
} from '../src/hooks/turn-send/session-persist.ts';
import { createSessionTurn } from '../src/services/view/messages.ts';

function createStateStore(initialMessages) {
  let messages = [...initialMessages];
  return {
    read() {
      return messages;
    },
    set(next) {
      messages = typeof next === 'function' ? next(messages) : next;
    },
  };
}

test.beforeEach(async () => {
  await resetLocalChatConversationLedgerForTests();
});

test('scheduled assistant beats are committed in order through the unified delivery engine', async () => {
  const session = await createLocalChatSession({
    targetId: 'target-1',
    viewerId: 'viewer.test',
    worldId: 'world.test',
    title: 'Stream Lifecycle Fixture',
  });
  const messageStore = createStateStore([]);
  const promptTrace = {
    id: 'trace-1',
    conversationId: session.id,
    routeSource: 'local',
    routeModel: 'model-a',
    promptChars: 10,
    layerOrder: [],
    appliedLayers: [],
    droppedLayers: [],
    laneChars: {},
    truncationByLane: {},
    laneBudgets: {},
    memorySlices: { core: 0, e2e: 0, worldLore: 0, agentLore: 0 },
    budget: { maxChars: 100, usedChars: 10, truncated: false },
    compilerVersion: 'v2',
    planner: 'stream',
    planSegments: 2,
    voiceSegments: 0,
    textSegments: 2,
    schedulerTotalDelayMs: 1,
    streamDeltaCount: 3,
    streamDurationMs: 120,
    segmentParseMode: 'double-newline',
    nsfwPolicy: 'disabled',
    selectedTurnSeqs: [],
    sessionRecallCount: 0,
    createdAt: new Date().toISOString(),
  };
  const turnAudit = {
    id: 'audit-1',
    targetId: 'target-1',
    worldId: null,
    latencyMs: 120,
    error: null,
    createdAt: new Date().toISOString(),
  };

  const schedule = await scheduleAssistantTurnDeliveries({
    sessionId: session.id,
    targetId: 'target-1',
    viewerId: session.viewerId,
    turnTxnId: 'txn-1',
    assistantTurnId: 'turn-assistant-1',
    assistantBeatCount: 2,
    userTurns: [createSessionTurn({
      message: {
        id: 'user-1',
        role: 'user',
        kind: 'text',
        content: 'hi',
        timestamp: new Date(),
      },
    })],
    deliveries: [
      {
        delayMs: 0,
        id: 'assistant-1',
        run: async ({ assistantTurnId }) => {
          await commitAssistantMessage({
            sessionId: session.id,
            targetId: 'target-1',
            viewerId: session.viewerId,
            assistantTurnId,
            messageId: 'assistant-1',
            setMessages: (next) => messageStore.set(next),
            setSessions: () => {},
            promptTrace,
            turnAudit,
            message: {
              id: 'assistant-1',
              role: 'assistant',
              kind: 'text',
              content: 'first segment',
              timestamp: new Date(),
              latencyMs: 120,
              meta: {
                beatIndex: 0,
                beatCount: 2,
              },
            },
          });
        },
      },
      {
        delayMs: 1,
        id: 'assistant-2',
        run: async ({ assistantTurnId }) => {
          await commitAssistantMessage({
            sessionId: session.id,
            targetId: 'target-1',
            viewerId: session.viewerId,
            assistantTurnId,
            messageId: 'assistant-2',
            setMessages: (next) => messageStore.set(next),
            setSessions: () => {},
            message: {
              id: 'assistant-2',
              role: 'assistant',
              kind: 'text',
              content: 'second segment',
              timestamp: new Date(),
              meta: {
                beatIndex: 1,
                beatCount: 2,
              },
            },
          });
        },
      },
    ],
    setSessions: () => {},
  });

  await schedule.done;
  const messages = messageStore.read();

  assert.equal(messages.length, 2);
  assert.equal(messages[0]?.id, 'assistant-1');
  assert.equal(messages[1]?.id, 'assistant-2');
  assert.equal(messages.some((message) => message.kind === 'streaming'), false);
});
