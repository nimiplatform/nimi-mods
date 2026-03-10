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
  assert.equal(target?.referenceImageUrl, null);
  assert.deepEqual(queriedCapabilities, []);
});

test('resolveLocalChatTargetDetail prefers resolved world context over seed world payload', async () => {
  const queriedCapabilities = [];
  configureLocalChatCoreQueryBridge({
    query: async (capability, query = {}) => {
      queriedCapabilities.push({ capability, query });
      if (capability === 'data-api.core.world.by-id.get') {
        return {
          id: 'world.1',
          summary: 'resolved world',
        };
      }
      if (capability === 'data-api.core.worldview.by-id.get') {
        return {
          id: 'world.1',
          summary: 'resolved worldview',
        };
      }
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
      worldId: 'world.1',
      avatarUrl: 'https://example.com/avatar.png',
      bio: 'hello',
      world: {
        id: 'world.seed',
        summary: 'seed world',
      },
      worldview: {
        id: 'world.seed',
        summary: 'seed worldview',
      },
    },
  );

  assert.ok(target);
  assert.deepEqual(target?.world, {
    id: 'world.1',
    summary: 'resolved world',
  });
  assert.deepEqual(target?.worldview, {
    id: 'world.1',
    summary: 'resolved worldview',
  });
  assert.deepEqual(queriedCapabilities, [
    {
      capability: 'data-api.core.world.by-id.get',
      query: { worldId: 'world.1' },
    },
    {
      capability: 'data-api.core.worldview.by-id.get',
      query: { worldId: 'world.1' },
    },
  ]);
});

test('resolveLocalChatTargetDetail enriches unresolved targets with reference image via id lookup', async () => {
  const queriedCapabilities = [];
  configureLocalChatCoreQueryBridge({
    query: async (capability, query = {}) => {
      queriedCapabilities.push({ capability, query });
      if (capability === 'data-api.core.user.by-id.get') {
        return {
          id: 'agent.1',
          handle: '~agent_one',
          isAgent: true,
          agentProfile: {
            referenceImageUrl: 'https://example.com/agent-reference.png',
            persona: 'warm',
          },
        };
      }
      return null;
    },
  });

  const target = await resolveLocalChatTargetDetail(
    {
      realmBaseUrl: 'http://localhost:3002',
    },
    {
      id: 'agent.1',
      handle: 'agent_one',
      displayName: 'Agent One',
      avatarUrl: 'https://example.com/avatar.png',
      bio: 'hello',
    },
  );

  assert.ok(target);
  assert.equal(target?.handle, '~agent_one');
  assert.equal(target?.referenceImageUrl, 'https://example.com/agent-reference.png');
  assert.deepEqual(queriedCapabilities, [
    {
      capability: 'data-api.core.user.by-id.get',
      query: { userId: 'agent.1' },
    },
  ]);
});
