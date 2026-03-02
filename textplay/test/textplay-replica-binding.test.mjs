import test from 'node:test';
import assert from 'node:assert/strict';
import { listPlayableReplicas } from '../src/data/replica-catalog.ts';

function createHookClient(eventRow) {
  return {
    data: {
      query: async ({ capability }) => {
        if (capability === 'data-api.world.events.list') {
          return {
            worldId: 'world-1',
            items: [eventRow],
          };
        }
        throw new Error(`unsupported-capability:${capability}`);
      },
    },
  };
}

test('primary agent falls back to first characterRef when runtime agent is missing', async () => {
  const rows = await listPlayableReplicas({
    hookClient: createHookClient({
      id: 'evt-a',
      level: 'PRIMARY',
      title: 'Event A',
      summary: 'summary',
      characterRefs: ['npc-a', 'npc-b'],
      createdAt: '2026-03-02T08:00:00.000Z',
      updatedAt: '2026-03-02T08:00:00.000Z',
    }),
    worldId: 'world-1',
    runtimeAgentId: '',
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].primaryAgentId, 'npc-a');
  assert.equal(rows[0].agentBindingMissing, false);
});

test('agent binding missing is reported when no runtime agent and no character refs', async () => {
  const rows = await listPlayableReplicas({
    hookClient: createHookClient({
      id: 'evt-b',
      level: 'PRIMARY',
      title: 'Event B',
      summary: 'summary',
      characterRefs: [],
      createdAt: '2026-03-02T08:00:00.000Z',
      updatedAt: '2026-03-02T08:00:00.000Z',
    }),
    worldId: 'world-1',
    runtimeAgentId: '',
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].primaryAgentId, '');
  assert.equal(rows[0].agentBindingMissing, true);
});
