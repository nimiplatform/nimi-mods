import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createLocalChatSession,
  listAllLocalChatSessions,
  listLocalChatSessions,
  resetLocalChatConversationLedgerForTests,
  upsertLocalChatSession,
} from '../src/state/index.ts';

test('createLocalChatSession reuses the sole session for the same target and viewer', async () => {
  await resetLocalChatConversationLedgerForTests();

  const first = await createLocalChatSession({
    targetId: 'agent.alpha',
    viewerId: 'viewer.test',
    title: 'Alpha',
  });
  const second = await createLocalChatSession({
    targetId: 'agent.alpha',
    viewerId: 'viewer.test',
    title: 'Alpha Again',
  });

  assert.equal(second.id, first.id);

  const sessions = await listLocalChatSessions('agent.alpha', 'viewer.test');
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]?.id, first.id);
});

test('upsertLocalChatSession collapses same target and viewer writes onto the canonical session', async () => {
  await resetLocalChatConversationLedgerForTests();

  const canonical = await createLocalChatSession({
    targetId: 'agent.alpha',
    viewerId: 'viewer.test',
    title: 'Alpha',
  });

  const upserted = await upsertLocalChatSession({
    id: 'conv_external_override',
    targetId: 'agent.alpha',
    viewerId: 'viewer.test',
    title: 'Renamed Alpha',
  });

  assert.equal(upserted.id, canonical.id);
  assert.equal(upserted.title, 'Renamed Alpha');

  const sessions = await listLocalChatSessions('agent.alpha', 'viewer.test');
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]?.id, canonical.id);
  assert.equal(sessions[0]?.title, 'Renamed Alpha');

  const allSessions = await listAllLocalChatSessions('viewer.test');
  assert.equal(allSessions.length, 1);
  assert.equal(allSessions[0]?.id, canonical.id);
});

test('single-session scope remains isolated per viewer', async () => {
  await resetLocalChatConversationLedgerForTests();

  const viewerA = await createLocalChatSession({
    targetId: 'agent.alpha',
    viewerId: 'viewer.a',
    title: 'Alpha',
  });
  const viewerB = await createLocalChatSession({
    targetId: 'agent.alpha',
    viewerId: 'viewer.b',
    title: 'Alpha',
  });

  assert.notEqual(viewerA.id, viewerB.id);

  const sessionsForViewerA = await listLocalChatSessions('agent.alpha', 'viewer.a');
  const sessionsForViewerB = await listLocalChatSessions('agent.alpha', 'viewer.b');
  assert.equal(sessionsForViewerA.length, 1);
  assert.equal(sessionsForViewerB.length, 1);
  assert.equal(sessionsForViewerA[0]?.id, viewerA.id);
  assert.equal(sessionsForViewerB[0]?.id, viewerB.id);
});
