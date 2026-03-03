import test from 'node:test';
import assert from 'node:assert/strict';
import { listPlayableStories } from '../src/data/story-catalog.ts';

function createHookClient() {
  return {
    data: {
      query: async ({ capability, query }) => {
        if (capability === 'data-api.world.events.list') {
          assert.equal(query.worldId, 'world-1');
          return {
            worldId: 'world-1',
            items: [
              {
                id: 'evt-secondary',
                level: 'SECONDARY',
                title: 'Secondary event',
                summary: 'skip me',
                characterRefs: ['npc-2'],
                createdAt: '2026-03-02T10:00:00.000Z',
                updatedAt: '2026-03-02T11:00:00.000Z',
              },
              {
                id: 'evt-primary',
                level: 'PRIMARY',
                title: 'Primary event',
                summary: 'playable',
                cause: 'Outer wall alarm is triggered',
                characterRefs: ['npc-1', 'npc-2'],
                createdAt: '2026-03-02T08:00:00.000Z',
                updatedAt: '2026-03-02T09:00:00.000Z',
              },
            ],
          };
        }
        throw new Error(`unsupported-capability:${capability}`);
      },
    },
  };
}

test('listPlayableStories keeps PRIMARY events only and yields stable story id', async () => {
  const hookClient = createHookClient();

  const first = await listPlayableStories({
    hookClient,
    worldId: 'world-1',
    runtimeAgentId: 'agent-runtime',
  });
  const second = await listPlayableStories({
    hookClient,
    worldId: 'world-1',
    runtimeAgentId: 'agent-runtime',
  });

  assert.equal(first.length, 1);
  assert.equal(first[0].entryEventId, 'evt-primary');
  assert.equal(first[0].storyId, 'story.world-1.evt-primary');
  assert.equal(second[0].storyId, first[0].storyId);
  assert.equal(first[0].primaryAgentId, 'agent-runtime');
  assert.equal(first[0].participants.includes('agent-runtime'), true);
  assert.equal(first[0].playable, true);
  assert.equal(first[0].eventHorizon, 'FUTURE');
  assert.equal(first[0].summary.includes('尚未发生'), true);
  assert.equal(first[0].summary.includes('Outer wall alarm is triggered'), true);
});
