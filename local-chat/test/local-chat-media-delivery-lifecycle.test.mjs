import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLocalChatSession,
  createLocalChatTurnBundle,
  resetLocalChatConversationLedgerForTests,
} from '../src/state/index.ts';
import { commitAssistantMessage } from '../src/hooks/turn-send/session-persist.ts';

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

async function createAssistantBundleFixture() {
  const session = await createLocalChatSession({
    targetId: 'target-1',
    viewerId: 'viewer.test',
    worldId: 'world.test',
    title: 'Media Delivery Fixture',
  });
  const assistantBundle = await createLocalChatTurnBundle({
    conversationId: session.id,
    role: 'assistant',
  });
  return {
    sessionId: session.id,
    viewerId: session.viewerId,
    assistantBundleId: assistantBundle.id,
  };
}

test('commit assistant message replaces pending image message with finalized image', async () => {
  const fixture = await createAssistantBundleFixture();
  const store = createStateStore([
    {
      id: 'pending-image-1',
      role: 'assistant',
      kind: 'image-pending',
      content: '正在生成图片...',
      timestamp: new Date(),
      meta: {
        mediaStatus: 'pending',
      },
    },
  ]);

  await commitAssistantMessage({
    sessionId: fixture.sessionId,
    targetId: 'target-1',
    viewerId: fixture.viewerId,
    assistantBundleId: fixture.assistantBundleId,
    messageId: 'pending-image-1',
    setMessages: (next) => store.set(next),
    setSessions: () => {},
    message: {
      id: 'pending-image-1',
      role: 'assistant',
      kind: 'image',
      content: '',
      timestamp: new Date(),
      media: {
        uri: 'data:image/png;base64,ZmFrZQ==',
        mimeType: 'image/png',
      },
      meta: {
        mediaStatus: 'ready',
      },
    },
  });

  const messages = store.read();
  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.kind, 'image');
  assert.equal(messages[0]?.meta?.mediaStatus, 'ready');
});

test('commit assistant message replaces pending video message with finalized video', async () => {
  const fixture = await createAssistantBundleFixture();
  const store = createStateStore([
    {
      id: 'pending-video-1',
      role: 'assistant',
      kind: 'video-pending',
      content: 'Generating video...',
      timestamp: new Date(),
      meta: {
        mediaStatus: 'pending',
      },
    },
  ]);

  await commitAssistantMessage({
    sessionId: fixture.sessionId,
    targetId: 'target-1',
    viewerId: fixture.viewerId,
    assistantBundleId: fixture.assistantBundleId,
    messageId: 'pending-video-1',
    setMessages: (next) => store.set(next),
    setSessions: () => {},
    message: {
      id: 'pending-video-1',
      role: 'assistant',
      kind: 'video',
      content: '',
      timestamp: new Date(),
      media: {
        uri: 'file:///tmp/video.mp4',
        mimeType: 'video/mp4',
      },
      meta: {
        mediaStatus: 'ready',
      },
    },
  });

  const messages = store.read();
  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.kind, 'video');
  assert.equal(messages[0]?.meta?.mediaStatus, 'ready');
});

test('commit assistant message appends finalized message when target id does not exist', async () => {
  const fixture = await createAssistantBundleFixture();
  const store = createStateStore([]);

  await commitAssistantMessage({
    sessionId: fixture.sessionId,
    targetId: 'target-1',
    viewerId: fixture.viewerId,
    assistantBundleId: fixture.assistantBundleId,
    messageId: 'missing-pending-id',
    setMessages: (next) => store.set(next),
    setSessions: () => {},
    message: {
      id: 'missing-pending-id',
      role: 'assistant',
      kind: 'image',
      content: '',
      timestamp: new Date(),
      media: {
        uri: 'data:image/png;base64,ZmFrZQ==',
        mimeType: 'image/png',
      },
      meta: {
        mediaStatus: 'ready',
      },
    },
  });

  const messages = store.read();
  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.kind, 'image');
});
