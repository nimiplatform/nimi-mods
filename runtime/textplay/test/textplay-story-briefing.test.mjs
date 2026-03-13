import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildContextualUserMessage,
  buildInitiativeSystemPayload,
  buildOpeningSystemPayload,
} from '../src/hooks/story-briefing.ts';

function createEntry() {
  return {
    entryEventId: 'evt-primary',
    worldId: 'world-1',
    timelineSeq: 8,
    title: 'Storm Harbor Incident',
    summary: 'Harbor order breaks under heavy rain.',
    entryBackdrop: 'Heavy rain and a contraband dispute push harbor order toward rupture.',
    entryHook: '你将从目标事件真正发生前的临界时刻切入，亲手塑造之后的走向。',
    participants: ['agent-1', 'agent-2'],
    characterRefs: ['agent-1', 'agent-2'],
    eventHorizon: 'PAST',
    entryMode: 'PRE_EVENT',
    updatedAt: '2026-03-02T09:00:00.000Z',
    playable: true,
    cause: 'Contraband dispute',
    process: 'Negotiation collapses on the pier.',
    result: 'Local order fractures',
    timeRef: 'night-watch',
    locationRefs: ['scene-docks'],
    recommendedSceneId: 'scene-docks',
  };
}

function createStartupPackage() {
  return {
    storyId: 'story_01KXTEXTPLAYBRIEFING1234567',
    worldId: 'world-1',
    entryEventId: 'evt-primary',
    entry: {
      ...createEntry(),
    },
    cast: {
      primaryAgentId: 'agent-1',
      participants: ['agent-1', 'agent-2'],
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
      contexts: [],
      recallSource: 'none',
    },
    narrativeScopes: {
      CANON: {},
      STORY: {
        phase: 'rising',
        objective: 'Keep the inspection line from collapsing',
      },
      SUBJECT: {
        playerBackground: 'You know every service ladder in the harbor.',
      },
      RELATION: {
        playerRole: 'Embedded observer',
      },
    },
    recommendedEntryTurn: null,
    startupPolicy: {
      initiative: {
        enabled: true,
        tickSeconds: 10,
        cooldownSeconds: 180,
        maxConsecutive: 3,
        idleSeconds: 120,
        pausedSeconds: 180,
        highTensionIdleSeconds: 180,
        awaySeconds: 300,
        highTensionThreshold: 0.7,
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
      storyId: 'story_01KXTEXTPLAYBRIEFING1234567',
      entryEventId: 'evt-primary',
      primaryAgentId: 'agent-1',
      version: 'h-test',
      source: 'test',
      loadedAt: '2026-03-02T09:00:00.000Z',
      contextCoverage: {
        canon: true,
        story: true,
        subject: true,
        relation: true,
        scene: true,
      },
      gapWarnings: [],
    },
  };
}

test('opening payload keeps PRE_EVENT semantics and injects user identity context', () => {
  const payload = buildOpeningSystemPayload({
    entry: createEntry(),
    startup: createStartupPackage(),
    userId: 'user-1',
    playerName: 'Han Yun',
    playerIdentity: 'Dock courier',
  });

  assert.equal(payload.opening.entryMode, 'PRE_EVENT');
  assert.equal(payload.opening.entryEventHorizon, 'PAST');
  assert.equal(payload.opening.targetEventMaterialOnly, true);
  assert.equal(payload.opening.userId, 'user-1');
  assert.match(payload.opening.instruction, /发生前的临界阶段/);
  assert.match(payload.opening.background, /Han Yun/);
  assert.match(payload.opening.background, /Dock courier/);
});

test('contextual user message prepends player identity when provided', () => {
  const message = buildContextualUserMessage({
    playerName: 'Han Yun',
    playerIdentity: 'Dock courier',
    userMessage: 'I step toward the signal mast.',
  });

  assert.match(message, /^\[Han Yun（Dock courier）\]:/);
  assert.match(message, /I step toward the signal mast/);
});

test('initiative payload frames autonomous progression around open pressure and presence', () => {
  const payload = buildInitiativeSystemPayload({
    startup: createStartupPackage(),
    records: [],
    playerName: 'Han Yun',
    triggerSource: 'AgentInitiative',
    presence: 'idle',
  });

  assert.equal(payload.initiative.triggerSource, 'AgentInitiative');
  assert.equal(payload.initiative.presence, 'idle');
  assert.match(payload.initiative.directive, /世界推进|冲突压力|角色动机/);
});
