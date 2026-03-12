import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEntryStartupPackage } from '../src/data/startup-package.ts';
import {
  TEXTPLAY_DATA_API_CORE_AGENT_MEMORY_RECALL_FOR_ENTITY,
  TEXTPLAY_DATA_API_WORLD_LOREBOOKS_LIST,
  TEXTPLAY_DATA_API_WORLD_NARRATIVE_CONTEXTS_LIST,
  TEXTPLAY_DATA_API_WORLD_SCENES_LIST,
} from '../src/contracts.ts';

function createHookClient() {
  return {
    data: {
      query: async ({ capability, query }) => {
        if (capability === TEXTPLAY_DATA_API_WORLD_LOREBOOKS_LIST) {
          assert.equal(query.worldId, 'world-1');
          return {
            items: [
              {
                id: 'lore-1',
                key: 'harbor-law',
                name: 'Harbor Ordinance',
                content: 'The harbor is under strict night curfew.',
                keywords: ['harbor', 'curfew'],
              },
            ],
          };
        }
        if (capability === TEXTPLAY_DATA_API_WORLD_SCENES_LIST) {
          assert.equal(query.worldId, 'world-1');
          return {
            items: [
              {
                id: 'scene-docks',
                name: 'Iron Docks',
                description: 'Rain hammers the mooring towers.',
                activeEntities: ['agent-1', 'user-1'],
              },
              {
                id: 'scene-market',
                name: 'Night Market',
                description: 'Lanterns flicker under torn awnings.',
                activeEntities: ['agent-9'],
              },
            ],
          };
        }
        if (capability === TEXTPLAY_DATA_API_WORLD_NARRATIVE_CONTEXTS_LIST) {
          assert.equal(query.worldId, 'world-1');
          return {
            items: [
              {
                id: 'ctx-canon',
                scope: 'CANON',
                scopeKey: 'world:world-1:canon',
                narrativeSetting: {
                  worldviewRules: ['No one crosses the harbor cordon without scrutiny.'],
                },
                narrativeState: {},
                updatedAt: '2026-03-02T09:00:00.000Z',
              },
              {
                id: 'ctx-story',
                scope: 'STORY',
                scopeKey: 'story:world-1:evt-opening',
                storyId: 'story.world-1.evt-opening',
                narrativeSetting: {
                  startupPolicy: {
                    initiative: {
                      enabled: true,
                      tickSeconds: 12,
                      cooldownSeconds: 160,
                      maxConsecutive: 2,
                      blockedPresenceStates: ['active'],
                    },
                    pacing: {
                      targetTension: 0.72,
                      tensionBand: [0.55, 0.85],
                      beatDensity: 0.66,
                      curve: 'surging',
                    },
                  },
                },
                narrativeState: {
                  phase: 'pre-crackdown',
                  objective: 'Find the signal fire before the cordon seals',
                  openThreads: ['Who sabotaged the inspection line?'],
                },
                updatedAt: '2026-03-02T09:10:00.000Z',
              },
              {
                id: 'ctx-subject',
                scope: 'SUBJECT',
                scopeKey: 'subject:agent-1',
                storyId: 'story.world-1.evt-opening',
                subjectType: 'AGENT',
                subjectId: 'agent-1',
                narrativeSetting: {
                  playerIdentity: 'Courier informant',
                },
                narrativeState: {
                  currentSituation: 'You stand near the signal mast while guards rotate shifts.',
                },
                updatedAt: '2026-03-02T09:20:00.000Z',
              },
              {
                id: 'ctx-relation',
                scope: 'RELATION',
                scopeKey: 'relation:agent-1:user-1',
                storyId: 'story.world-1.evt-opening',
                subjectType: 'AGENT',
                subjectId: 'agent-1',
                targetSubjectType: 'PLAYER',
                targetSubjectId: 'user-1',
                narrativeSetting: {
                  playerRole: 'Embedded observer',
                },
                narrativeState: {
                  playerBackground: 'You have been trading information along the docks for months.',
                },
                updatedAt: '2026-03-02T09:30:00.000Z',
              },
            ],
          };
        }
        if (capability === TEXTPLAY_DATA_API_CORE_AGENT_MEMORY_RECALL_FOR_ENTITY) {
          assert.deepEqual(query, {
            agentId: 'agent-1',
            entityId: 'user-1',
            topK: 8,
          });
          return {
            items: [
              { content: 'The agent remembers the courier’s habit of watching exits first.' },
            ],
            core: [],
            e2e: [],
            recallSource: 'remote',
          };
        }
        throw new Error(`unexpected-capability:${capability}`);
      },
    },
  };
}

function createEntryDetail() {
  return {
    entryEventId: 'evt-opening',
    worldId: 'world-1',
    title: 'Opening Clash',
    summary: 'The harbor is one breath away from rupture.',
    materialSummary: 'The harbor is tense and the target event has not happened yet.',
    participants: ['agent-1', 'agent-2'],
    characterRefs: ['agent-1', 'agent-2'],
    eventHorizon: 'PAST',
    entryMode: 'PRE_EVENT',
    updatedAt: '2026-03-02T10:00:00.000Z',
    playable: true,
    cause: 'Contraband dispute',
    process: 'Negotiation collapses on the pier',
    result: 'The cordon begins to harden',
    timeRef: 'night-watch',
    locationRefs: ['scene-docks'],
    recommendedSceneId: 'scene-docks',
  };
}

test('loadEntryStartupPackage builds story-scoped startup package from entry, contexts, scenes and memory', async () => {
  const startup = await loadEntryStartupPackage({
    hookClient: createHookClient(),
    detail: createEntryDetail(),
    storyId: 'story_01KXTEXTPLAYENTRY1234567890',
    agentId: 'agent-1',
    userId: 'user-1',
  });

  assert.equal(startup.storyId, 'story_01KXTEXTPLAYENTRY1234567890');
  assert.equal(startup.entryEventId, 'evt-opening');
  assert.equal(startup.cast.primaryAgentId, 'agent-1');
  assert.deepEqual(startup.cast.participants, ['agent-1', 'agent-2']);
  assert.equal(startup.entry.entryMode, 'PRE_EVENT');
  assert.equal(startup.entry.eventHorizon, 'PAST');
  assert.equal(startup.snapshot.storyId, 'story_01KXTEXTPLAYENTRY1234567890');
  assert.equal(startup.snapshot.primaryAgentId, 'agent-1');
  assert.equal(startup.startupPolicy.initiative.tickSeconds, 12);
  assert.equal(startup.startupPolicy.pacing.curve, 'surging');
  assert.match(startup.background.summary, /Rain hammers the mooring towers/);
  assert.deepEqual(startup.materials.memories, [
    'The agent remembers the courier’s habit of watching exits first.',
  ]);
  assert.equal(startup.materials.scenes[0].id, 'scene-docks');
  assert.equal(startup.narrativeScopes.STORY.phase, 'pre-crackdown');
});
