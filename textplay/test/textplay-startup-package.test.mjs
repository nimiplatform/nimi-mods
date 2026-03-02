import test from 'node:test';
import assert from 'node:assert/strict';
import { loadReplicaStartupPackage } from '../src/data/replica-catalog.ts';

function createHookClient() {
  return {
    data: {
      query: async ({ capability }) => {
        if (capability === 'data-api.world.lorebooks.list') {
          return {
            worldId: 'world-1',
            items: [
              {
                id: 'lore-1',
                key: 'storm.harbor',
                name: 'Storm Harbor',
                content: 'Harbor district with iron bells and rain.',
                keywords: ['harbor', 'storm'],
              },
              {
                id: 'lore-2',
                key: 'random.misc',
                content: 'Unrelated note',
                keywords: ['misc'],
              },
            ],
          };
        }

        if (capability === 'data-api.core.agent.memory.recall.for-entity') {
          return {
            recallSource: 'remote-only',
            items: [
              { content: 'The player once crossed this harbor at dawn.' },
            ],
            core: [
              { summary: 'The guide distrusts sudden moves.' },
            ],
            e2e: [],
          };
        }

        throw new Error(`unsupported-capability:${capability}`);
      },
    },
  };
}

const detail = {
  replicaId: 'evt-primary',
  storyId: 'tp.story.world-1.evt-primary',
  worldId: 'world-1',
  sourceEventId: 'evt-primary',
  title: 'Storm Harbor Incident',
  summary: 'A tense negotiation breaks under heavy rain.',
  primaryAgentId: 'agent-1',
  participants: ['agent-1', 'player-1'],
  createdAt: '2026-03-02T08:00:00.000Z',
  updatedAt: '2026-03-02T09:00:00.000Z',
  agentBindingMissing: false,
  cause: 'Contraband dispute',
  process: 'Negotiation escalates near docks',
  result: 'Local order fractures',
  timeRef: 'night-watch',
};

test('startup package composes summary/material/objective/snapshot and supports fresh mode', async () => {
  const startup = await loadReplicaStartupPackage({
    hookClient: createHookClient(),
    narrativeEngine: {
      turnLatest: async () => {
        throw new Error('NARRATIVE_TURN_LATEST_NOT_FOUND');
      },
    },
    detail,
    playerId: 'player-1',
  });

  assert.equal(startup.storyId, detail.storyId);
  assert.equal(startup.backgroundSummary.includes('Cause: Contraband dispute'), true);
  assert.equal(startup.phase, 'post-outcome');
  assert.equal(startup.objective, 'Local order fractures');
  assert.equal(startup.availableMaterials.lorebooks.length > 0, true);
  assert.equal(startup.availableMaterials.memories.length > 0, true);
  assert.equal(startup.recommendedEntryTurn, null);
  assert.equal(startup.snapshot.replicaId, detail.replicaId);
  assert.equal(startup.snapshot.version.startsWith('h'), true);
});
