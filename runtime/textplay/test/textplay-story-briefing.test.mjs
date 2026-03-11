import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOpeningSystemPayload } from '../src/hooks/story-briefing.ts';

function createStartupPackage() {
  return {
    storyId: 'story.world-1.evt-primary',
    worldId: 'world-1',
    entryEventId: 'evt-primary',
    entry: {
      title: 'Storm Harbor Incident',
      summary: 'Harbor order breaks under heavy rain.',
      cause: 'Contraband dispute',
      process: 'Negotiation collapses on the pier.',
      result: 'Local order fractures',
      timeRef: 'night-watch',
      locationRefs: ['scene-docks'],
      characterRefs: ['agent-1', 'player-1'],
      recommendedSceneId: 'scene-docks',
    },
    cast: {
      primaryAgentId: 'agent-1',
      participants: ['agent-1', 'player-1'],
    },
    background: {
      summary: 'The harbor is tense and rain-soaked.',
    },
    materials: {
      lorebooks: [],
      memories: [],
      scenes: [
        {
          id: 'scene-docks',
          name: 'Iron Docks',
          description: 'Rain hammers the mooring towers.',
          score: 10,
        },
      ],
      contexts: [
        {
          id: 'ctx-story',
          scope: 'STORY',
          scopeKey: 'story:world-1:evt-primary',
          storyId: 'story.world-1.evt-primary',
          narrativeSetting: {},
          narrativeState: {},
        },
      ],
      recallSource: 'none',
    },
    narrativeScopes: {
      CANON: {},
      STORY: {},
      SUBJECT: {},
      RELATION: {},
    },
    recommendedEntryTurn: null,
    startupPolicy: {
      initiative: {
        enabled: true,
        tickSeconds: 10,
        cooldownSeconds: 180,
        maxConsecutive: 3,
        blockedPresenceStates: ['composing', 'active'],
      },
      pacing: {
        targetTension: 0.6,
        tensionBand: [0.45, 0.75],
        beatDensity: 0.5,
        curve: 'steady-rise',
      },
    },
    snapshot: {
      storyId: 'story.world-1.evt-primary',
      entryEventId: 'evt-primary',
      primaryAgentId: 'agent-1',
      version: 'h-test',
      source: 'test',
      loadedAt: '2026-03-02T09:00:00.000Z',
      contextCoverage: {
        canon: true,
        story: true,
        subject: false,
        relation: false,
        scene: true,
      },
      gapWarnings: [],
    },
  };
}

function createStory(eventHorizon) {
  return {
    storyId: 'story.world-1.evt-primary',
    worldId: 'world-1',
    entryEventId: 'evt-primary',
    title: 'Storm Harbor Incident',
    summary: 'Storm pressure rises over the harbor……',
    materialSummary: 'Harbor order breaks under heavy rain while the target event still lies ahead.',
    primaryAgentId: 'agent-1',
    participants: ['agent-1', 'player-1'],
    updatedAt: '2026-03-02T09:00:00.000Z',
    eventHorizon,
    entryMode: 'PRE_EVENT',
    playable: true,
    agentBindingMissing: false,
    cause: 'Contraband dispute',
    process: 'Negotiation collapses on the pier.',
    result: 'Local order fractures',
    timeRef: 'night-watch',
    locationRefs: ['scene-docks'],
    characterRefs: ['agent-1', 'player-1'],
    recommendedSceneId: 'scene-docks',
  };
}

test('opening payload keeps event horizon for aftermath stories', () => {
  const payload = buildOpeningSystemPayload({
    story: createStory('PAST'),
    startup: createStartupPackage(),
    playerId: 'player-1',
    playerName: 'Han Yun',
    playerIdentity: 'Dock courier',
  });

  assert.equal(payload.opening.entryMode, 'PRE_EVENT');
  assert.equal(payload.opening.entryEventHorizon, 'PAST');
  assert.equal(payload.opening.targetEventMaterialOnly, true);
  assert.match(payload.opening.instruction, /发生前/);
  assert.doesNotMatch(payload.opening.instruction, /目标事件已经发生/);
});

test('opening payload uses live-conflict instructions for ongoing stories', () => {
  const payload = buildOpeningSystemPayload({
    story: createStory('ONGOING'),
    startup: createStartupPackage(),
    playerId: 'player-1',
    playerName: 'Han Yun',
    playerIdentity: 'Dock courier',
  });

  assert.equal(payload.opening.entryMode, 'PRE_EVENT');
  assert.equal(payload.opening.entryEventHorizon, 'ONGOING');
  assert.match(payload.opening.instruction, /发生前/);
  assert.match(payload.opening.instruction, /进行中素材带/);
});
