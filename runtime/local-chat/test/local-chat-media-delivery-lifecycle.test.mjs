import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLocalChatSession,
  createLocalChatTurnRecord,
  listLocalChatExactHistoryTurns,
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
  const assistantTurn = await createLocalChatTurnRecord({
    conversationId: session.id,
    role: 'assistant',
    turnId: 'turn-assistant-fixture',
  });
  return {
    sessionId: session.id,
    viewerId: session.viewerId,
    assistantTurnId: assistantTurn.id,
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
    assistantTurnId: fixture.assistantTurnId,
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
    assistantTurnId: fixture.assistantTurnId,
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
    assistantTurnId: fixture.assistantTurnId,
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

test('ready image persistence stores concise continuity summary without dropping media prompt metadata', async () => {
  const fixture = await createAssistantBundleFixture();
  const store = createStateStore([]);
  const rawPrompt = `RAW_MEDIA_PROMPT_MARKER:${'灵界云海'.repeat(80)}`;

  await commitAssistantMessage({
    sessionId: fixture.sessionId,
    targetId: 'target-1',
    viewerId: fixture.viewerId,
    assistantTurnId: fixture.assistantTurnId,
    messageId: 'image-summary-1',
    setMessages: (next) => store.set(next),
    setSessions: () => {},
    message: {
      id: 'image-summary-1',
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
        mediaPrompt: rawPrompt,
        mediaSpec: {
          kind: 'image',
          intentSource: 'explicit',
          plannerTrigger: 'user-explicit',
          confidence: 0.94,
          nsfwIntent: 'none',
          targetId: 'target-1',
          worldId: 'world.test',
          subject: '灵界访客',
          scene: '云海山巅',
          styleIntent: '写实',
          mood: '温柔',
        },
      },
    },
  });

  const [storedTurn] = await listLocalChatExactHistoryTurns(fixture.sessionId, fixture.viewerId);
  assert.ok(storedTurn);
  assert.equal(storedTurn.contextText, '[image] 灵界访客, 云海山巅 (温柔)');
  assert.equal(storedTurn.semanticSummary, '[image] 灵界访客, 云海山巅 (温柔)');
  assert.equal(storedTurn.meta?.mediaPrompt, rawPrompt);
  assert.equal(storedTurn.contextText.includes('RAW_MEDIA_PROMPT_MARKER'), false);
});

test('failed video persistence keeps failure semantics while compacting requested media summary', async () => {
  const fixture = await createAssistantBundleFixture();
  const store = createStateStore([]);
  const rawPrompt = `RAW_VIDEO_PROMPT_MARKER:${'夜海潮声'.repeat(60)}`;

  await commitAssistantMessage({
    sessionId: fixture.sessionId,
    targetId: 'target-1',
    viewerId: fixture.viewerId,
    assistantTurnId: fixture.assistantTurnId,
    messageId: 'video-summary-1',
    setMessages: (next) => store.set(next),
    setSessions: () => {},
    message: {
      id: 'video-summary-1',
      role: 'assistant',
      kind: 'video',
      content: '',
      timestamp: new Date(),
      meta: {
        mediaStatus: 'failed',
        mediaPrompt: rawPrompt,
        mediaError: 'provider rejected request',
        mediaSpec: {
          kind: 'video',
          intentSource: 'explicit',
          plannerTrigger: 'user-explicit',
          confidence: 0.88,
          nsfwIntent: 'none',
          targetId: 'target-1',
          worldId: 'world.test',
          subject: '海浪拍岸',
          scene: '夜色海岸',
          styleIntent: '电影感',
          mood: '平静',
        },
      },
    },
  });

  const [storedTurn] = await listLocalChatExactHistoryTurns(fixture.sessionId, fixture.viewerId);
  assert.ok(storedTurn);
  assert.equal(
    storedTurn.contextText,
    'reason=provider rejected request; requested=[video] 海浪拍岸, 夜色海岸 (平静)',
  );
  assert.equal(
    storedTurn.semanticSummary,
    'reason=provider rejected request; requested=[video] 海浪拍岸, 夜色海岸 (平静)',
  );
  assert.equal(storedTurn.meta?.mediaPrompt, rawPrompt);
  assert.equal(storedTurn.contextText.includes('RAW_VIDEO_PROMPT_MARKER'), false);
});
