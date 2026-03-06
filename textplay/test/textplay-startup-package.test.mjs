import test from 'node:test';
import assert from 'node:assert/strict';
import { loadStoryStartupPackage } from '../src/data/story-catalog.ts';

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

        if (capability === 'data-api.world.scenes.list') {
          return {
            worldId: 'world-1',
            items: [
              {
                id: 'scene-docks',
                worldId: 'world-1',
                name: 'Iron Docks',
                description: 'Rain hammers the mooring towers.',
                setting: { weather: 'rain' },
                activeEntities: ['agent-1', 'player-1'],
                updatedAt: '2026-03-02T09:00:00.000Z',
              },
            ],
          };
        }

        if (capability === 'data-api.world.narrative-contexts.list') {
          return {
            worldId: 'world-1',
            items: [
              {
                id: 'ctx-canon',
                scope: 'CANON',
                scopeKey: 'canon:world-1',
                storyId: null,
                narrativeSetting: { pacingPolicy: { curve: 'steady' } },
                narrativeState: {},
              },
              {
                id: 'ctx-story',
                scope: 'STORY',
                scopeKey: 'story:world-1:evt-primary',
                storyId: 'story.world-1.evt-primary',
                narrativeSetting: {
                  recommendedSceneId: 'scene-docks',
                  initiativePolicy: { enabled: true, tickSeconds: 10, cooldownSeconds: 180, maxConsecutive: 3 },
                  pacingPolicy: { targetTension: 0.6, tensionBand: [0.45, 0.75], beatDensity: 0.5, curve: 'steady-rise' },
                },
                narrativeState: {
                  phase: 'in-progress',
                  objective: 'Stabilize the negotiation',
                  tension: 0.62,
                  openThreads: ['missing cargo stamp'],
                },
              },
              {
                id: 'ctx-subject',
                scope: 'SUBJECT',
                scopeKey: 'subject:world-1:agent-1',
                storyId: 'story.world-1.evt-primary',
                subjectType: 'AGENT',
                subjectId: 'agent-1',
                narrativeSetting: { dramaticRole: 'mediator' },
                narrativeState: { activeObjective: 'protect player' },
              },
              {
                id: 'ctx-relation',
                scope: 'RELATION',
                scopeKey: 'relation:world-1:agent-1:player-1',
                storyId: 'story.world-1.evt-primary',
                subjectType: 'AGENT',
                subjectId: 'agent-1',
                targetSubjectType: 'PLAYER',
                targetSubjectId: 'player-1',
                narrativeSetting: { relationContract: 'uneasy-allies' },
                narrativeState: { trust: 0.4 },
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

function createHookClientMissingStoryContext() {
  return {
    data: {
      query: async ({ capability }) => {
        if (capability === 'data-api.world.lorebooks.list') {
          return { worldId: 'world-1', items: [] };
        }
        if (capability === 'data-api.world.scenes.list') {
          return {
            worldId: 'world-1',
            items: [
              {
                id: 'scene-docks',
                worldId: 'world-1',
                name: 'Iron Docks',
                description: 'Rain hammers the mooring towers.',
                setting: { weather: 'rain' },
                activeEntities: ['agent-1', 'player-1'],
                updatedAt: '2026-03-02T09:00:00.000Z',
              },
            ],
          };
        }
        if (capability === 'data-api.world.narrative-contexts.list') {
          return {
            worldId: 'world-1',
            items: [
              {
                id: 'ctx-canon',
                scope: 'CANON',
                scopeKey: 'canon:world-1',
                storyId: null,
                narrativeSetting: { pacingPolicy: { curve: 'steady' } },
                narrativeState: {},
              },
              {
                id: 'ctx-story-other',
                scope: 'STORY',
                scopeKey: 'story:world-1:evt-other',
                storyId: 'story.world-1.evt-other',
                narrativeSetting: {
                  recommendedSceneId: 'scene-docks',
                },
                narrativeState: {
                  phase: 'other-story',
                },
              },
            ],
          };
        }
        if (capability === 'data-api.core.agent.memory.recall.for-entity') {
          return {
            recallSource: 'remote-only',
            items: [],
            core: [],
            e2e: [],
          };
        }
        throw new Error(`unsupported-capability:${capability}`);
      },
    },
  };
}

function createHookClientWithCrossStoryContextLeak() {
  return {
    data: {
      query: async ({ capability }) => {
        if (capability === 'data-api.world.lorebooks.list') {
          return { worldId: 'world-1', items: [] };
        }
        if (capability === 'data-api.world.scenes.list') {
          return {
            worldId: 'world-1',
            items: [
              {
                id: 'scene-docks',
                worldId: 'world-1',
                name: 'Iron Docks',
                description: 'Rain hammers the mooring towers.',
                setting: { weather: 'rain' },
                activeEntities: ['agent-1', 'player-1'],
                updatedAt: '2026-03-02T09:00:00.000Z',
              },
            ],
          };
        }
        if (capability === 'data-api.world.narrative-contexts.list') {
          return {
            worldId: 'world-1',
            items: [
              {
                id: 'ctx-canon',
                scope: 'CANON',
                scopeKey: 'canon:world-1',
                storyId: null,
                narrativeSetting: { pacingPolicy: { curve: 'steady' } },
                narrativeState: {},
              },
              {
                id: 'ctx-story',
                scope: 'STORY',
                scopeKey: 'story:world-1:evt-primary',
                storyId: 'story.world-1.evt-primary',
                narrativeSetting: {
                  recommendedSceneId: 'scene-docks',
                },
                narrativeState: {
                  phase: 'in-progress',
                },
              },
              {
                id: 'ctx-subject-other',
                scope: 'SUBJECT',
                scopeKey: 'subject:world-1:agent-1:other',
                storyId: 'story.world-1.evt-other',
                subjectType: 'AGENT',
                subjectId: 'agent-1',
                narrativeSetting: { dramaticRole: 'saboteur' },
                narrativeState: { activeObjective: 'mislead player' },
              },
              {
                id: 'ctx-relation-other',
                scope: 'RELATION',
                scopeKey: 'relation:world-1:agent-1:player-1:other',
                storyId: 'story.world-1.evt-other',
                subjectType: 'AGENT',
                subjectId: 'agent-1',
                targetSubjectType: 'PLAYER',
                targetSubjectId: 'player-1',
                narrativeSetting: { relationContract: 'hostile' },
                narrativeState: { trust: -0.6 },
              },
            ],
          };
        }
        if (capability === 'data-api.core.agent.memory.recall.for-entity') {
          return {
            recallSource: 'remote-only',
            items: [],
            core: [],
            e2e: [],
          };
        }
        throw new Error(`unsupported-capability:${capability}`);
      },
    },
  };
}

const detail = {
  storyId: 'story.world-1.evt-primary',
  worldId: 'world-1',
  entryEventId: 'evt-primary',
  title: 'Storm Harbor Incident',
  summary: 'Contraband pressure keeps building on the docks……',
  materialSummary: 'A tense negotiation breaks under heavy rain while the target event still lies ahead.',
  primaryAgentId: 'agent-1',
  participants: ['agent-1', 'player-1'],
  updatedAt: '2026-03-02T09:00:00.000Z',
  eventHorizon: 'PAST',
  entryMode: 'PRE_EVENT',
  playable: true,
  agentBindingMissing: false,
  cause: 'Contraband dispute',
  process: 'Negotiation escalates near docks',
  result: 'Local order fractures',
  timeRef: 'night-watch',
  locationRefs: ['scene-docks'],
  characterRefs: ['agent-1', 'player-1'],
  recommendedSceneId: 'scene-docks',
};

test('startup package composes summary/material/objective/snapshot and supports fresh mode', async () => {
  const startup = await loadStoryStartupPackage({
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
  assert.equal(startup.background.summary.includes('Contraband dispute'), true);
  assert.equal(startup.narrativeScopes.STORY.phase, 'in-progress');
  assert.equal(startup.narrativeScopes.STORY.objective, 'Stabilize the negotiation');
  assert.equal(startup.materials.lorebooks.length > 0, true);
  assert.equal(startup.materials.memories.length > 0, true);
  assert.equal(startup.materials.scenes.length > 0, true);
  assert.equal(startup.materials.contexts.length >= 4, true);
  assert.equal(startup.recommendedEntryTurn, null);
  assert.equal(startup.snapshot.entryEventId, detail.entryEventId);
  assert.equal(startup.snapshot.contextCoverage.canon, true);
  assert.equal(startup.snapshot.contextCoverage.story, true);
  assert.equal(startup.startupPolicy.initiative.cooldownSeconds, 180);
  assert.equal(startup.snapshot.version.startsWith('h'), true);
});

test('startup package fails close when STORY context is missing', async () => {
  await assert.rejects(
    async () => {
      await loadStoryStartupPackage({
        hookClient: createHookClientMissingStoryContext(),
        narrativeEngine: {
          turnLatest: async () => null,
        },
        detail,
        playerId: 'player-1',
      });
    },
    /TEXTPLAY_CONTEXT_MISSING_CRITICAL/,
  );
});

test('startup package does not borrow SUBJECT or RELATION context from a different story', async () => {
  const startup = await loadStoryStartupPackage({
    hookClient: createHookClientWithCrossStoryContextLeak(),
    narrativeEngine: {
      turnLatest: async () => null,
    },
    detail,
    playerId: 'player-1',
  });

  assert.equal(startup.snapshot.gapWarnings.includes('TEXTPLAY_CONTEXT_SUBJECT_MISSING_WARN'), true);
  assert.equal(startup.snapshot.gapWarnings.includes('TEXTPLAY_CONTEXT_RELATION_MISSING_WARN'), true);
  assert.equal(startup.materials.contexts.some((row) => row.id === 'ctx-subject-other'), false);
  assert.equal(startup.materials.contexts.some((row) => row.id === 'ctx-relation-other'), false);
});
