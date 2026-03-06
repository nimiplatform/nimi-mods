import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendSegmentToLocalChatBundle,
  createLocalChatSession,
  createLocalChatTurnBundle,
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
  const alphaBundle = await createLocalChatTurnBundle({
    conversationId: alpha.id,
    role: 'assistant',
  });
  await appendSegmentToLocalChatBundle({
    conversationId: alpha.id,
    bundleId: alphaBundle.id,
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
  const betaBundle = await createLocalChatTurnBundle({
    conversationId: beta.id,
    role: 'assistant',
  });
  await appendSegmentToLocalChatBundle({
    conversationId: beta.id,
    bundleId: betaBundle.id,
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
  const ignoredBundle = await createLocalChatTurnBundle({
    conversationId: ignored.id,
    role: 'assistant',
  });
  await appendSegmentToLocalChatBundle({
    conversationId: ignored.id,
    bundleId: ignoredBundle.id,
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
