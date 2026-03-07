import test from 'node:test';
import assert from 'node:assert/strict';
import { getPlayableStoryDetail, listPlayableStories } from '../src/data/story-catalog.ts';

function createHookClient(eventItems) {
  return {
    data: {
      query: async ({ capability, query }) => {
        if (capability === 'data-api.world.events.list') {
          assert.equal(query.worldId, 'world-1');
          return {
            worldId: 'world-1',
            items: eventItems,
          };
        }
        throw new Error(`unsupported-capability:${capability}`);
      },
    },
  };
}

test('listPlayableStories keeps PRIMARY events only and yields stable story id', async () => {
  const hookClient = createHookClient([
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
      result: 'The wall holds but patrol routes change.',
      eventHorizon: 'PAST',
      characterRefs: ['npc-1', 'npc-2'],
      createdAt: '2026-03-02T08:00:00.000Z',
      updatedAt: '2026-03-02T09:00:00.000Z',
    },
  ]);

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
  assert.equal(first[0].eventHorizon, 'PAST');
  assert.equal(first[0].entryMode, 'PRE_EVENT');
  assert.equal(first[0].summary.endsWith('……'), true);
  assert.equal(first[0].summary.includes('Outer wall alarm is triggered'), true);
  assert.equal(first[0].summary.includes('The wall holds but patrol routes change.'), false);
  assert.equal(first[0].materialSummary.includes('发生前的临界阶段'), true);
});

test('listPlayableStories hides FUTURE PRIMARY events from direct player selection', async () => {
  const rows = await listPlayableStories({
    hookClient: createHookClient([
      {
        id: 'evt-future',
        level: 'PRIMARY',
        title: 'Future event',
        summary: 'should stay hidden',
        eventHorizon: 'FUTURE',
        characterRefs: ['npc-1'],
        createdAt: '2026-03-02T12:00:00.000Z',
        updatedAt: '2026-03-02T12:00:00.000Z',
      },
      {
        id: 'evt-ongoing',
        level: 'PRIMARY',
        title: 'Ongoing event',
        summary: 'visible now',
        process: 'Rain-swept confrontation at the gate',
        eventHorizon: 'ONGOING',
        characterRefs: ['npc-2'],
        createdAt: '2026-03-02T11:00:00.000Z',
        updatedAt: '2026-03-02T11:30:00.000Z',
      },
    ]),
    worldId: 'world-1',
    runtimeAgentId: '',
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].entryEventId, 'evt-ongoing');
  assert.equal(rows[0].eventHorizon, 'ONGOING');
  assert.equal(rows[0].entryMode, 'PRE_EVENT');
  assert.equal(rows[0].summary.endsWith('……'), true);
  assert.equal(rows[0].materialSummary.includes('发生前的临界阶段'), true);
});

test('getPlayableStoryDetail rejects FUTURE stories even when addressed by story id', async () => {
  const detail = await getPlayableStoryDetail({
    hookClient: createHookClient([
      {
        id: 'evt-future',
        level: 'PRIMARY',
        title: 'Future event',
        summary: 'hidden',
        eventHorizon: 'FUTURE',
        characterRefs: ['npc-1'],
        createdAt: '2026-03-02T12:00:00.000Z',
        updatedAt: '2026-03-02T12:00:00.000Z',
      },
    ]),
    worldId: 'world-1',
    storyId: 'story.world-1.evt-future',
    runtimeAgentId: '',
  });

  assert.equal(detail, null);
});
