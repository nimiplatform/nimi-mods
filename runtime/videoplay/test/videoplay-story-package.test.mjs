import test from 'node:test';
import assert from 'node:assert/strict';
import {
  listPlayableVideoStories,
  loadVideoStoryPackage,
} from '../src/data/story-package.ts';
import { VideoStoryPackageSchema } from '../src/schemas.ts';
import { VIDEOPLAY_REASON } from '../src/contracts.ts';

function buildTurns(count, options = {}) {
  const userTurnIndex = options.userTurnIndex ?? null;
  const initiativeTurnIndex = options.initiativeTurnIndex ?? null;
  return Array.from({ length: count }, (_, idx) => {
    const turnNumber = idx + 1;
    let triggerSource = 'SystemEvent';
    if (userTurnIndex === turnNumber) {
      triggerSource = 'UserTurn';
    }
    if (initiativeTurnIndex === turnNumber) {
      triggerSource = 'AgentInitiative';
    }
    const eventId = `ev-${turnNumber}`;
    return {
      turnId: `turn-${turnNumber}`,
      turnIndex: turnNumber,
      triggerSource,
      userMessage: `message-${turnNumber}`,
      systemContext: { locale: 'zh' },
      spineEvents: [{ eventId, visibility: 'public', summary: `event-${turnNumber}` }],
      stateChanges: {},
      metrics: {},
    };
  });
}

function buildHookClient(overrides = {}) {
  const worldId = 'world-alpha';
  const events = overrides.events || [
    {
      id: 'ev-primary-1',
      worldId,
      level: 'PRIMARY',
      eventHorizon: 'PAST',
      title: 'Primary One',
      summary: 'primary one summary',
      process: 'process one',
      result: 'result one',
      locationRefs: ['scene-1'],
      characterRefs: ['agent-main', 'player-1'],
      updatedAt: '2026-03-02T10:00:00.000Z',
    },
    {
      id: 'ev-secondary-1',
      worldId,
      level: 'SECONDARY',
      eventHorizon: 'PAST',
      title: 'Secondary One',
      summary: 'secondary summary',
      updatedAt: '2026-03-02T11:00:00.000Z',
    },
    {
      id: 'ev-primary-2',
      worldId,
      level: 'PRIMARY',
      eventHorizon: 'ONGOING',
      title: 'Primary Two',
      summary: 'primary two summary',
      process: 'process two',
      result: 'result two',
      locationRefs: ['scene-2'],
      characterRefs: ['agent-main', 'player-2'],
      updatedAt: '2026-03-01T10:00:00.000Z',
    },
  ];

  const scenes = overrides.scenes || [
    { id: 'scene-1', worldId, name: 'Scene One', description: 'alpha', activeEntities: ['agent-main'] },
    { id: 'scene-2', worldId, name: 'Scene Two', description: 'beta', activeEntities: ['agent-main'] },
  ];

  const lorebooks = overrides.lorebooks || [
    { id: 'lore-1', worldId, key: 'alpha-lore', name: 'Alpha Lore', content: 'primary one setting', keywords: ['primary', 'one'] },
    { id: 'lore-2', worldId, key: 'beta-lore', name: 'Beta Lore', content: 'primary two setting', keywords: ['primary', 'two'] },
  ];

  const contexts = overrides.contexts || [
    {
      id: 'ctx-canon',
      scope: 'CANON',
      scopeKey: worldId,
      storyId: null,
      subjectId: null,
      narrativeSetting: { revealPolicy: 'strict' },
      narrativeState: {},
    },
    {
      id: 'ctx-story',
      scope: 'STORY',
      scopeKey: 'story.world-alpha.ev-primary-1',
      storyId: 'story.world-alpha.ev-primary-1',
      subjectId: null,
      narrativeSetting: { phase: 'act1' },
      narrativeState: { tension: 0.5 },
    },
    {
      id: 'ctx-subject',
      scope: 'SUBJECT',
      scopeKey: 'agent-main',
      storyId: 'story.world-alpha.ev-primary-1',
      subjectId: 'agent-main',
      narrativeSetting: { role: 'lead' },
      narrativeState: {},
    },
    {
      id: 'ctx-relation',
      scope: 'RELATION',
      scopeKey: 'agent-main:player-1',
      storyId: 'story.world-alpha.ev-primary-1',
      subjectId: null,
      narrativeSetting: { trust: 'medium' },
      narrativeState: {},
    },
  ];

  const memoryRecall = overrides.memoryRecall || {
    items: [{ content: 'memory one' }],
    core: [{ summary: 'memory two' }],
    e2e: [],
    recallSource: 'memory-recall',
  };

  return {
    data: {
      query: async ({ capability }) => {
        if (capability === 'data-api.world.events.list') {
          return { worldId, items: events };
        }
        if (capability === 'data-api.world.scenes.list') {
          return { worldId, items: scenes };
        }
        if (capability === 'data-api.world.lorebooks.list') {
          return { worldId, items: lorebooks };
        }
        if (capability === 'data-api.world.narrative-contexts.list') {
          return { worldId, items: contexts };
        }
        if (capability === 'data-api.core.agent.memory.recall.for-entity') {
          return memoryRecall;
        }
        throw new Error(`unexpected capability: ${capability}`);
      },
    },
  };
}

function buildNarrativeEngine(input = {}) {
  const storyId = input.storyId || 'story.world-alpha.ev-primary-1';
  const turns = input.turns || buildTurns(8, { userTurnIndex: 6 });
  const projectionSourceIds = turns.flatMap((turn) => turn.spineEvents.map((event) => event.eventId));
  return {
    turnLatest: async () => ({
      storyId,
      turnId: turns[turns.length - 1].turnId,
      triggerSource: turns[turns.length - 1].triggerSource,
      createdAt: '2026-03-03T00:00:00.000Z',
    }),
    turnWindow: async () => ({
      projectId: 'project-main',
      storyId,
      ingestCursorStart: 'turn-0',
      turns,
    }),
    projectionRenderInput: async () => ({
      events: projectionSourceIds.map((id) => ({ id })),
      triggerSource: turns[turns.length - 1].triggerSource,
      userMessage: turns[turns.length - 1].userMessage,
      systemContext: { locale: 'zh' },
      worldStyle: { genre: 'drama' },
      agentAnchor: { id: 'agent-main' },
      playerAnchor: { id: 'player-1' },
      sceneAnchor: { id: 'scene-1' },
      metrics: { tension: 0.5 },
      sourceEventIds: projectionSourceIds,
    }),
  };
}

test('PRIMARY-only story catalog', async () => {
  const hookClient = buildHookClient();
  const stories = await listPlayableVideoStories({
    hookClient,
    worldId: 'world-alpha',
    runtimeAgentId: 'agent-main',
  });

  assert.equal(stories.length, 2);
  assert.deepEqual(
    stories.map((item) => item.entryEventId).sort(),
    ['ev-primary-1', 'ev-primary-2'],
  );
  assert.ok(stories.every((item) => item.storyId.startsWith('story.world-alpha.')));
});

test('VideoStoryPackage schema completeness', async () => {
  const hookClient = buildHookClient();
  const narrativeEngine = buildNarrativeEngine();
  const pkg = await loadVideoStoryPackage({
    hookClient,
    narrativeEngine,
    worldId: 'world-alpha',
    storyId: 'story.world-alpha.ev-primary-1',
    projectId: 'project-main',
    ingestCursorStart: 'turn-0',
    sourceMode: 'canonical-story',
    runtimeAgentId: 'agent-main',
  });

  const parsed = VideoStoryPackageSchema.safeParse(pkg);
  assert.equal(parsed.success, true);
  assert.equal(pkg.sourceMode, 'canonical-story');
  assert.equal(pkg.cast.primaryAgentId, 'agent-main');
  assert.equal(pkg.turnWindow.turns.length > 0, true);
  assert.equal(pkg.materials.lorebooks.length > 0, true);
  assert.equal(pkg.snapshot.contextCoverage.canon, true);
  assert.equal(pkg.snapshot.contextCoverage.story, true);
});

test('story package fails close when CANON/STORY context missing', async () => {
  const hookClient = buildHookClient({
    contexts: [
      {
        id: 'ctx-subject',
        scope: 'SUBJECT',
        scopeKey: 'agent-main',
        storyId: 'story.world-alpha.ev-primary-1',
        subjectId: 'agent-main',
        narrativeSetting: { role: 'lead' },
        narrativeState: {},
      },
    ],
  });
  const narrativeEngine = buildNarrativeEngine();

  await assert.rejects(
    loadVideoStoryPackage({
      hookClient,
      narrativeEngine,
      worldId: 'world-alpha',
      storyId: 'story.world-alpha.ev-primary-1',
      projectId: 'project-main',
      ingestCursorStart: 'turn-0',
      sourceMode: 'canonical-story',
      runtimeAgentId: 'agent-main',
    }),
    (error) => {
      assert.equal(error.reasonCode, VIDEOPLAY_REASON.STORY_PACKAGE_INVALID);
      return true;
    },
  );
});

test('enriched source requires UserTurn or AgentInitiative in selected window', async () => {
  const hookClient = buildHookClient();
  const narrativeEngine = buildNarrativeEngine({
    turns: buildTurns(8),
  });

  await assert.rejects(
    loadVideoStoryPackage({
      hookClient,
      narrativeEngine,
      worldId: 'world-alpha',
      storyId: 'story.world-alpha.ev-primary-1',
      projectId: 'project-main',
      ingestCursorStart: 'turn-0',
      sourceMode: 'textplay-enriched-story',
      runtimeAgentId: 'agent-main',
    }),
    (error) => {
      assert.equal(error.reasonCode, VIDEOPLAY_REASON.STORY_SOURCE_UNAVAILABLE);
      assert.match(String(error.message || ''), /ENRICHED_SOURCE_TRIGGER_MISSING/);
      return true;
    },
  );
});

test('enriched latest window selection is stable', async () => {
  const hookClient = buildHookClient();
  const turns = buildTurns(50, { userTurnIndex: 45 });
  const narrativeEngine = buildNarrativeEngine({ turns });

  const first = await loadVideoStoryPackage({
    hookClient,
    narrativeEngine,
    worldId: 'world-alpha',
    storyId: 'story.world-alpha.ev-primary-1',
    projectId: 'project-main',
    ingestCursorStart: 'turn-0',
    sourceMode: 'textplay-enriched-story',
    runtimeAgentId: 'agent-main',
    windowPolicy: {
      maxTurns: 40,
      readLimit: 100,
    },
  });

  const second = await loadVideoStoryPackage({
    hookClient,
    narrativeEngine,
    worldId: 'world-alpha',
    storyId: 'story.world-alpha.ev-primary-1',
    projectId: 'project-main',
    ingestCursorStart: 'turn-0',
    sourceMode: 'textplay-enriched-story',
    runtimeAgentId: 'agent-main',
    windowPolicy: {
      maxTurns: 40,
      readLimit: 100,
    },
  });

  assert.equal(first.turnWindow.turns.length, 40);
  assert.equal(first.turnWindow.turns[0].turnId, 'turn-11');
  assert.equal(first.turnWindow.turns[39].turnId, 'turn-50');
  assert.deepEqual(
    first.turnWindow.turns.map((turn) => turn.turnId),
    second.turnWindow.turns.map((turn) => turn.turnId),
  );
  assert.equal(first.snapshot.version, second.snapshot.version);
});
