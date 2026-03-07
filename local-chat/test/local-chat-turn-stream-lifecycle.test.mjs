import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLocalChatSession,
  resetLocalChatConversationLedgerForTests,
} from '../src/state/index.ts';
import { persistSuccessfulTurn } from '../src/hooks/turn-send/session-persist.ts';

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

test('streaming placeholder is replaced by first finalized assistant segment', async () => {
  const session = await createLocalChatSession({
    targetId: 'target-1',
    viewerId: 'viewer.test',
    worldId: 'world.test',
    title: 'Stream Lifecycle Fixture',
  });
  const streamingPlaceholder = {
    id: 'stream-txn-1',
    role: 'assistant',
    kind: 'streaming',
    content: 'typing...',
    timestamp: new Date(),
    meta: {
      streamId: 'txn-1',
      streamChunkCount: 3,
    },
  };
  const messageStore = createStateStore([streamingPlaceholder]);

  const schedule = await persistSuccessfulTurn({
    sessionId: session.id,
    targetId: 'target-1',
    viewerId: session.viewerId,
    turnTxnId: 'txn-1',
    userMessage: {
      id: 'user-1',
      role: 'user',
      kind: 'text',
      content: 'hi',
      timestamp: new Date(),
    },
    assistantDeliveries: [
      {
        id: 'assistant-1',
        kind: 'text',
        content: 'first segment',
        delayMs: 0,
        meta: {},
      },
      {
        id: 'assistant-2',
        kind: 'text',
        content: 'second segment',
        delayMs: 1,
        meta: {},
      },
    ],
    latencyMs: 120,
    promptTrace: {
      id: 'trace-1',
      routeSource: 'local-runtime',
      routeModel: 'model-a',
      promptChars: 10,
      layerOrder: [],
      appliedLayers: [],
      droppedLayers: [],
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
      createdAt: new Date().toISOString(),
    },
    turnAudit: {
      id: 'audit-1',
      targetId: 'target-1',
      worldId: null,
      latencyMs: 120,
      error: null,
      createdAt: new Date().toISOString(),
    },
    replaceFirstMessageId: streamingPlaceholder.id,
    setMessages: (next) => messageStore.set(next),
    setSessions: () => {},
  });

  await schedule.done;
  const messages = messageStore.read();

  assert.equal(messages.length, 2);
  assert.equal(messages[0]?.id, 'assistant-1');
  assert.equal(messages[1]?.id, 'assistant-2');
  assert.equal(messages.some((message) => message.kind === 'streaming'), false);
});
