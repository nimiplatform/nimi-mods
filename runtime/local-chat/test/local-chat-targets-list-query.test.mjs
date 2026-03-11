import test from 'node:test';
import assert from 'node:assert/strict';
import {
  configureLocalChatCoreQueryBridge,
  CORE_DATA_API_FRIENDS_WITH_DETAILS_LIST,
  listLocalChatTargets,
} from '../src/data/index.ts';
import { resetLocalChatDataCaches } from '../src/data/cache-store.ts';

test.afterEach(() => {
  configureLocalChatCoreQueryBridge(null);
  resetLocalChatDataCaches();
});

test('listLocalChatTargets skips profile lookup for explicit non-agent friends', async () => {
  const queriedCapabilities = [];
  configureLocalChatCoreQueryBridge({
    query: async (capability) => {
      queriedCapabilities.push(capability);
      if (capability === CORE_DATA_API_FRIENDS_WITH_DETAILS_LIST) {
        return {
          items: [
            {
              id: 'agent.1',
              handle: '~agent_one',
              displayName: 'Agent One',
              isAgent: true,
            },
            {
              id: 'human.1',
              handle: '@human_one',
              displayName: 'Human One',
              isAgent: false,
            },
          ],
        };
      }
      throw new Error(`unexpected capability: ${capability}`);
    },
  });

  const targets = await listLocalChatTargets({
    realmBaseUrl: 'http://localhost:3002',
  });

  assert.equal(targets.length, 1);
  assert.equal(targets[0]?.id, 'agent.1');
  assert.equal(queriedCapabilities.length, 1);
});

test('listLocalChatTargets skips ambiguous friends during fast list load', async () => {
  configureLocalChatCoreQueryBridge({
    query: async (capability) => {
      if (capability === CORE_DATA_API_FRIENDS_WITH_DETAILS_LIST) {
        return {
          items: [
            {
              id: 'friend.ambiguous',
              handle: '@ambiguous_friend',
              displayName: 'Ambiguous Friend',
            },
          ],
        };
      }
      throw new Error(`unexpected capability: ${capability}`);
    },
  });

  const targets = await listLocalChatTargets({
    realmBaseUrl: 'http://localhost:3002',
  });

  assert.equal(targets.length, 0);
});
