import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendBeatToLocalChatTurn,
  createLocalChatSession,
  createLocalChatTurnRecord,
  listLocalChatTargetPreviews,
  resetLocalChatConversationLedgerForTests,
} from '../src/state/index.ts';

test('local-chat target previews project latest visible segment per target without full session rebuild', async () => {
  await resetLocalChatConversationLedgerForTests();

  const alpha = await createLocalChatSession({
    targetId: 'agent.alpha',
    viewerId: 'viewer.test',
    title: 'Alpha',
  });
  const alphaTurn = await createLocalChatTurnRecord({
    conversationId: alpha.id,
    role: 'assistant',
  });
  await appendBeatToLocalChatTurn({
    conversationId: alpha.id,
    turnId: alphaTurn.id,
    role: 'assistant',
    kind: 'text',
    content: '第一条本地消息',
    contextText: '第一条本地消息',
    timestamp: '2026-03-06T09:00:00.000Z',
  });

  const beta = await createLocalChatSession({
    targetId: 'agent.beta',
    viewerId: 'viewer.test',
    title: 'Beta',
  });
  const betaTurn = await createLocalChatTurnRecord({
    conversationId: beta.id,
    role: 'assistant',
  });
  await appendBeatToLocalChatTurn({
    conversationId: beta.id,
    turnId: betaTurn.id,
    role: 'assistant',
    kind: 'image',
    content: '',
    contextText: 'shared image: 雨夜街道',
    timestamp: '2026-03-06T09:10:00.000Z',
  });

  const ignored = await createLocalChatSession({
    targetId: 'agent.alpha',
    viewerId: 'viewer.other',
    title: 'Other Viewer',
  });
  const ignoredTurn = await createLocalChatTurnRecord({
    conversationId: ignored.id,
    role: 'assistant',
  });
  await appendBeatToLocalChatTurn({
    conversationId: ignored.id,
    turnId: ignoredTurn.id,
    role: 'assistant',
    kind: 'text',
    content: '不应该混进当前 viewer 的 preview',
    contextText: '不应该混进当前 viewer 的 preview',
    timestamp: '2026-03-06T09:20:00.000Z',
  });

  const previews = await listLocalChatTargetPreviews('viewer.test');

  assert.deepEqual(previews, [
    {
      targetId: 'agent.beta',
      latestLocalMessage: 'shared image: 雨夜街道',
      latestLocalMessageAt: '2026-03-06T09:10:00.000Z',
    },
    {
      targetId: 'agent.alpha',
      latestLocalMessage: '第一条本地消息',
      latestLocalMessageAt: '2026-03-06T09:00:00.000Z',
    },
  ]);
});
