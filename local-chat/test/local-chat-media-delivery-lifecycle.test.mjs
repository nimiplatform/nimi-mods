import test from 'node:test';
import assert from 'node:assert/strict';
import { replacePendingAssistantMessage } from '../src/hooks/turn-send/session-persist.ts';

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

test('media pending message is replaced by finalized image message', () => {
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

  replacePendingAssistantMessage({
    sessionId: 'session-not-found',
    targetId: 'target-1',
    pendingMessageId: 'pending-image-1',
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

test('video pending message is replaced by finalized video message', () => {
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

  replacePendingAssistantMessage({
    sessionId: 'session-not-found',
    targetId: 'target-1',
    pendingMessageId: 'pending-video-1',
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

test('replace pending appends finalized message when pending id does not exist', () => {
  const store = createStateStore([]);

  replacePendingAssistantMessage({
    sessionId: 'session-not-found',
    targetId: 'target-1',
    pendingMessageId: 'missing-pending-id',
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
