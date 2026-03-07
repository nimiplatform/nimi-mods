import test from 'node:test';
import assert from 'node:assert/strict';
import {
  configureLocalChatCoreQueryBridge,
  resolveLocalChatTargetDetail,
} from '../src/data/index.ts';
import { resetLocalChatDataCaches } from '../src/data/cache-store.ts';

test.afterEach(() => {
  configureLocalChatCoreQueryBridge(null);
  resetLocalChatDataCaches();
});

test('resolveLocalChatTargetDetail fast-paths agent seeds without core profile lookup', async () => {
  const queriedCapabilities = [];
  configureLocalChatCoreQueryBridge({
    query: async (capability) => {
      queriedCapabilities.push(capability);
      throw new Error(`unexpected capability: ${capability}`);
    },
  });

  const target = await resolveLocalChatTargetDetail(
    {
      realmBaseUrl: 'http://localhost:3002',
    },
    {
      id: 'agent.1',
      handle: '~agent_one',
      displayName: 'Agent One',
      isAgent: true,
      avatarUrl: 'https://example.com/avatar.png',
      bio: 'hello',
    },
  );

  assert.ok(target);
  assert.equal(target?.id, 'agent.1');
  assert.equal(target?.displayName, 'Agent One');
  assert.equal(target?.handle, '~agent_one');
  assert.equal(target?.isAgent, true);
  assert.deepEqual(queriedCapabilities, []);
});
