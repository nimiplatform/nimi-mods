import test from 'node:test';
import assert from 'node:assert/strict';
import { listMyWorlds } from '../src/data/world-catalog.ts';

test('listMyWorlds parses worlds.mine payload and sorts by updatedAt desc', async () => {
  const hookClient = {
    data: {
      query: async ({ capability }) => {
        assert.equal(capability, 'data-api.world.worlds.mine');
        return {
          items: [
            {
              id: 'world-b',
              name: 'World B',
              status: 'ACTIVE',
              updatedAt: '2026-03-02T00:00:00.000Z',
            },
            {
              id: 'world-a',
              name: 'World A',
              status: 'ACTIVE',
              updatedAt: '2026-03-03T00:00:00.000Z',
            },
          ],
        };
      },
    },
  };

  const worlds = await listMyWorlds({
    hookClient,
  });

  assert.equal(worlds.length, 2);
  assert.equal(worlds[0]?.id, 'world-a');
  assert.equal(worlds[1]?.id, 'world-b');
});

test('listMyWorlds tolerates invalid payload and returns empty list', async () => {
  const hookClient = {
    data: {
      query: async () => ({ bad: true }),
    },
  };

  const worlds = await listMyWorlds({
    hookClient,
  });

  assert.deepEqual(worlds, []);
});
