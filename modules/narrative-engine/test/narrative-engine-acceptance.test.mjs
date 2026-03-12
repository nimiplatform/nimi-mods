import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NARRATIVE_ENGINE_DATA_API_AUDIT_APPEND,
  NARRATIVE_REASON_CODES,
} from '../src/contracts.ts';
import { createNarrativeEngineModule } from '../src/module.ts';
import {
  getNarrativeSpineByStoryId,
  resetNarrativeRepositoryForTests,
} from '../src/store/repository.ts';

const BASE_NOW_MS = Date.parse('2026-03-02T00:00:00.000Z');

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem(key) {
      const value = map.get(String(key));
      return value == null ? null : String(value);
    },
    setItem(key, value) {
      map.set(String(key), String(value));
    },
    removeItem(key) {
      map.delete(String(key));
    },
    clear() {
      map.clear();
    },
    key(index) {
      return Array.from(map.keys())[index] || null;
    },
    get length() {
      return map.size;
    },
  };
}

function createNarrativeEngine() {
  const worldEvents = [
    {
      id: 'ev-world-1',
      title: 'World Event One',
      summary: 'The world has changed.',
      characterRefs: ['agent-1', 'player-1'],
      process: 'A transition happened.',
    },
  ];
  const worldLorebooks = [
    {
      id: 'lore-1',
      key: 'place.main',
      content: 'Sky Harbor',
      summary: 'A floating city above the sea.',
    },
    {
      id: 'lore-2',
      key: 'rule.core',
      content: 'Never break causality.',
    },
  ];

  return createNarrativeEngineModule({
    queryData: async (capability, query) => {
      if (capability === 'data-api.world.access.me') {
        return {
          hasActiveAccess: true,
          records: [
            {
              scopeWorldId: String(query.worldId || ''),
            },
          ],
        };
      }
      if (capability === 'data-api.world.events.list') {
        return worldEvents;
      }
      if (capability === 'data-api.world.lorebooks.list') {
        return worldLorebooks;
      }
      if (capability === 'data-api.world.scenes.list') {
        return {
          worldId: String(query.worldId || ''),
          items: [
            {
              id: 'scene-1',
              worldId: String(query.worldId || ''),
              name: 'Sky Harbor',
              description: 'Floating harbor with tense factions.',
              setting: { weather: 'storm' },
              activeEntities: ['agent-1', 'player-1'],
              updatedAt: '2026-03-02T00:00:00.000Z',
            },
          ],
        };
      }
      if (capability === 'data-api.world.narrative-contexts.list') {
        const storyId = String(query.storyId || '');
        if (storyId === 'story-context-missing') {
          return { worldId: String(query.worldId || ''), items: [] };
        }
        const useStableStoryAnchor = storyId === 'story.world.event';
        const resolvedStoryId = useStableStoryAnchor ? 'story:world-mainline' : storyId;
        const storyInitiativePolicy = storyId === 'story-initiative-zero-cooldown'
          ? {
            enabled: true,
            cooldownSeconds: 0,
            cooldownWindowSeconds: 0,
            maxConsecutive: 3,
          }
          : { enabled: true };
        return {
          worldId: String(query.worldId || ''),
          items: [
            {
              id: 'ctx-canon',
              worldId: String(query.worldId || ''),
              scope: 'CANON',
              scopeKey: `canon:${query.worldId}`,
              storyId: null,
              narrativeSetting: { pacingPolicy: { curve: 'steady' } },
              narrativeState: {},
              updatedAt: '2026-03-02T00:00:00.000Z',
            },
            {
              id: 'ctx-story',
              worldId: String(query.worldId || ''),
              scope: 'STORY',
              scopeKey: `story:${resolvedStoryId}`,
              storyId: resolvedStoryId,
              narrativeSetting: {
                initiativePolicy: storyInitiativePolicy,
                pacingPolicy: { targetTension: 0.6 },
                materialHints: { conflicts: ['storm-front'] },
                ...(useStableStoryAnchor
                  ? {
                    castPolicy: {
                      mandatorySubjectIds: ['agent-1', 'agent-2'],
                    },
                  }
                  : {}),
              },
              narrativeState: {
                phase: 'opening',
                objective: 'stabilize harbor',
                tension: 0.6,
                openThreads: ['missing convoy'],
              },
              updatedAt: '2026-03-02T00:00:01.000Z',
            },
            {
              id: 'ctx-subject',
              worldId: String(query.worldId || ''),
              scope: 'SUBJECT',
              scopeKey: `subject:${resolvedStoryId}:agent-1`,
              storyId: resolvedStoryId,
              subjectType: 'AGENT',
              subjectId: 'agent-1',
              narrativeSetting: { dramaticRole: 'guardian' },
              narrativeState: { activeObjective: 'assist player' },
              updatedAt: '2026-03-02T00:00:02.000Z',
            },
            {
              id: 'ctx-relation',
              worldId: String(query.worldId || ''),
              scope: 'RELATION',
              scopeKey: useStableStoryAnchor
                ? `relation:${resolvedStoryId}:agent-1:agent-2`
                : `relation:${resolvedStoryId}:agent-1:player-1`,
              storyId: resolvedStoryId,
              subjectType: 'AGENT',
              subjectId: 'agent-1',
              targetSubjectType: useStableStoryAnchor ? 'AGENT' : 'PLAYER',
              targetSubjectId: useStableStoryAnchor ? 'agent-2' : 'player-1',
              narrativeSetting: { relationContract: 'allies' },
              narrativeState: { trust: 0.4 },
              updatedAt: '2026-03-02T00:00:03.000Z',
            },
          ],
        };
      }
      if (capability === 'data-api.core.agent.memory.recall.for-entity') {
        return {
          recallSource: 'remote-only',
          core: ['memory-a'],
          e2e: ['memory-b'],
        };
      }
      throw new Error(`UNHANDLED_QUERY_CAPABILITY:${capability}`);
    },
    generateText: async () => ({
      text: JSON.stringify(makeCoreOutput({ eventCount: 2 })),
    }),
  });
}

function makeEvent(index, options = {}) {
  const visibility = String(options.visibility || 'public');
  return {
    id: `evt-${index}`,
    type: 'scene-beat',
    visibility,
    payload: {
      content: `event-content-${index}`,
      summary: `event-summary-${index}`,
    },
    sourceEventIds: [`src-${index}`],
  };
}

function makeCoreOutput(options = {}) {
  const eventCount = Number(options.eventCount || 2);
  const visibility = options.visibility || 'public';
  const events = [];
  for (let i = 0; i < eventCount; i += 1) {
    events.push(makeEvent(i + 1, { visibility }));
  }
  return {
    spineEvents: events,
    stateChanges: {
      phase: 'rising',
    },
    metrics: {
      coherence: 0.82,
      groundedRatio: 0.91,
      tension: 0.63,
    },
  };
}

function makeTurnInput(options = {}) {
  return {
    storyId: String(options.storyId || 'story-1'),
    entryEventId: typeof options.entryEventId === 'undefined' ? undefined : String(options.entryEventId),
    worldId: String(options.worldId || 'world-1'),
    agentId: String(options.agentId || 'agent-1'),
    userId: String(options.userId || 'user-1'),
    triggerSource: options.triggerSource || 'UserTurn',
    userMessage: String(options.userMessage || 'hello'),
    systemContext: options.systemContext || { mood: 'neutral' },
    idempotencyKey: String(options.idempotencyKey || `idem-${Math.random().toString(36).slice(2, 8)}`),
    nowMs: Number(options.nowMs || BASE_NOW_MS),
    mockCoreOutput: options.mockCoreOutput || makeCoreOutput({ eventCount: 2 }),
    cancelRequested: Boolean(options.cancelRequested),
    traceId: options.traceId,
    runId: options.runId,
    taskId: options.taskId,
    turnId: options.turnId,
    presence: options.presence,
  };
}

async function upsertContext(narrativeEngine, storyId) {
  return narrativeEngine.contextResolve({
    storyId,
    action: 'upsert',
    scopes: {
      CANON: { pacingPolicy: 'steady' },
      STORY: { phase: 'opening' },
      SUBJECT: { objective: 'survive' },
      RELATION: { trust: 0.4 },
    },
  });
}

test.beforeEach(async () => {
  const storage = createMemoryStorage();
  globalThis.localStorage = storage;
  resetNarrativeRepositoryForTests();
});

test('NAR-001 UserTurn Approved and writes spine + projection required fields', async () => {
  const narrativeEngine = createNarrativeEngine();
  await upsertContext(narrativeEngine, 'story-1');

  const response = await narrativeEngine.turnResultUpsert(makeTurnInput({
    storyId: 'story-1',
    idempotencyKey: 'nar-001',
    mockCoreOutput: makeCoreOutput({ eventCount: 2 }),
  }));

  assert.equal(response.status, 'APPROVED');
  assert.equal(response.reasonCode, null);
  assert.equal(response.coreOutput.spineEvents.length, 2);
  assert.equal(getNarrativeSpineByStoryId('story-1').length, 2);
  assert.equal(Array.isArray(response.projection.events), true);

  const projection = await narrativeEngine.projectionRenderInput({ storyId: 'story-1' });
  const requiredFields = [
    'events',
    'triggerSource',
    'userMessage',
    'systemContext',
    'worldStyle',
    'player',
    'scene',
    'agent',
    'playerAnchor',
    'sceneAnchor',
    'agentAnchor',
    'metrics',
    'sourceEventIds',
  ];
  for (const field of requiredFields) {
    assert.equal(field in projection, true, `projection missing required field: ${field}`);
  }
  assert.equal(projection.sourceEventIds.length >= 2, true);
});

test('NAR-002 Overflow Adjusted truncates to maxEvents=8 and writes spine', async () => {
  const narrativeEngine = createNarrativeEngine();
  await upsertContext(narrativeEngine, 'story-overflow');

  const response = await narrativeEngine.turnResultUpsert(makeTurnInput({
    storyId: 'story-overflow',
    idempotencyKey: 'nar-002',
    mockCoreOutput: makeCoreOutput({ eventCount: 10 }),
  }));

  assert.equal(response.status, 'ADJUSTED');
  assert.equal(response.reasonCode, NARRATIVE_REASON_CODES.NARRATIVE_EVENT_COUNT_OVERFLOW_ADJUSTED);
  assert.equal(response.coreOutput.spineEvents.length, 8);
  assert.equal(getNarrativeSpineByStoryId('story-overflow').length, 8);
});

test('NAR-003 Invalid visibility rejects and does not write spine', async () => {
  const narrativeEngine = createNarrativeEngine();
  await upsertContext(narrativeEngine, 'story-invalid-visibility');

  const response = await narrativeEngine.turnResultUpsert(makeTurnInput({
    storyId: 'story-invalid-visibility',
    idempotencyKey: 'nar-003',
    mockCoreOutput: makeCoreOutput({ eventCount: 2, visibility: 'forbidden-visibility' }),
  }));

  assert.equal(response.status, 'REJECTED');
  assert.equal(response.reasonCode, NARRATIVE_REASON_CODES.NARRATIVE_VISIBILITY_INVALID);
  assert.equal(getNarrativeSpineByStoryId('story-invalid-visibility').length, 0);
});

test('NAR-004 Missing context rejects before write', async () => {
  const narrativeEngine = createNarrativeEngine();
  const response = await narrativeEngine.turnResultUpsert(makeTurnInput({
    storyId: 'story-context-missing',
    idempotencyKey: 'nar-004',
    mockCoreOutput: makeCoreOutput({ eventCount: 2 }),
  }));

  assert.equal(response.status, 'REJECTED');
  assert.equal(response.reasonCode, NARRATIVE_REASON_CODES.NARRATIVE_CONTEXT_INSUFFICIENT);
  assert.equal(getNarrativeSpineByStoryId('story-context-missing').length, 0);
});

test('NAR-008 Event story accepts stable mainline anchor fallback without borrowing another event story', async () => {
  const narrativeEngine = createNarrativeEngine();
  const response = await narrativeEngine.turnResultUpsert(makeTurnInput({
    storyId: 'story.world.event',
    idempotencyKey: 'nar-008',
    mockCoreOutput: makeCoreOutput({ eventCount: 2 }),
  }));

  assert.equal(response.status, 'APPROVED');
  assert.equal(response.reasonCode, null);
  assert.equal(getNarrativeSpineByStoryId('story.world.event').length, 2);
  const projection = await narrativeEngine.projectionRenderInput({ storyId: 'story.world.event' });
  assert.equal(projection.worldStyle.contextCoverage.story, true);
  assert.equal(projection.worldStyle.contextCoverage.relation, true);
  assert.equal(
    projection.worldStyle.contextCoverage.warnings.includes('NARRATIVE_CONTEXT_STORY_SCOPE_FALLBACK_WARN'),
    true,
  );
});

test('NAR-005 Initiative cooldown returns NOOP and no additional spine write', async () => {
  const narrativeEngine = createNarrativeEngine();
  await upsertContext(narrativeEngine, 'story-initiative');

  const first = await narrativeEngine.turnResultUpsert(makeTurnInput({
    storyId: 'story-initiative',
    triggerSource: 'AgentInitiative',
    idempotencyKey: 'nar-005-fire',
    nowMs: BASE_NOW_MS,
    mockCoreOutput: makeCoreOutput({ eventCount: 2 }),
  }));
  assert.equal(first.status, 'APPROVED');

  const second = await narrativeEngine.turnResultUpsert(makeTurnInput({
    storyId: 'story-initiative',
    triggerSource: 'AgentInitiative',
    idempotencyKey: 'nar-005-noop',
    nowMs: BASE_NOW_MS + 60_000,
    mockCoreOutput: makeCoreOutput({ eventCount: 2 }),
  }));

  assert.equal(second.status, 'NOOP');
  assert.equal(second.reasonCode, NARRATIVE_REASON_CODES.NARRATIVE_INITIATIVE_COOLDOWN_ACTIVE);
  assert.equal(getNarrativeSpineByStoryId('story-initiative').length, 2);
});

test('NAR-009 Initiative cooldown=0 allows immediate follow-up initiative turn', async () => {
  const narrativeEngine = createNarrativeEngine();
  await upsertContext(narrativeEngine, 'story-initiative-zero-cooldown');

  const first = await narrativeEngine.turnResultUpsert(makeTurnInput({
    storyId: 'story-initiative-zero-cooldown',
    triggerSource: 'AgentInitiative',
    idempotencyKey: 'nar-009-fire-1',
    nowMs: BASE_NOW_MS,
    mockCoreOutput: makeCoreOutput({ eventCount: 2 }),
  }));
  assert.equal(first.status, 'APPROVED');

  const bridge = await narrativeEngine.turnResultUpsert(makeTurnInput({
    storyId: 'story-initiative-zero-cooldown',
    triggerSource: 'UserTurn',
    idempotencyKey: 'nar-009-bridge',
    nowMs: BASE_NOW_MS + 1_000,
    mockCoreOutput: makeCoreOutput({ eventCount: 2 }),
  }));
  assert.equal(bridge.status, 'APPROVED');

  const second = await narrativeEngine.turnResultUpsert(makeTurnInput({
    storyId: 'story-initiative-zero-cooldown',
    triggerSource: 'AgentInitiative',
    idempotencyKey: 'nar-009-fire-2',
    nowMs: BASE_NOW_MS + 60_000,
    mockCoreOutput: makeCoreOutput({ eventCount: 2 }),
  }));

  assert.equal(second.status, 'APPROVED');
  assert.equal(second.reasonCode, null);
  assert.equal(getNarrativeSpineByStoryId('story-initiative-zero-cooldown').length, 6);
});

test('NAR-006 Cancel reaches run.canceled terminal without run.error normalization', async () => {
  const narrativeEngine = createNarrativeEngine();
  await upsertContext(narrativeEngine, 'story-cancel');

  const response = await narrativeEngine.turnResultUpsert(makeTurnInput({
    storyId: 'story-cancel',
    idempotencyKey: 'nar-006',
    cancelRequested: true,
    mockCoreOutput: makeCoreOutput({ eventCount: 2 }),
  }));

  assert.equal(response.status, 'CANCELED');
  assert.equal(response.reasonCode, NARRATIVE_REASON_CODES.NARRATIVE_RUN_CANCELED);
  assert.equal(response.runEnvelope.state, 'CANCELED');
  assert.equal(response.runEnvelope.eventType, 'run.canceled');

  const replay = await narrativeEngine.invoke(
    NARRATIVE_ENGINE_DATA_API_AUDIT_APPEND,
    {
      action: 'replay',
      runId: response.runEnvelope.runId,
      afterSeq: 0,
      limit: 50,
    },
  );

  const eventTypes = replay.events.map((event) => event.eventType);
  assert.equal(eventTypes.includes('run.canceled'), true);
  assert.equal(eventTypes.includes('run.error'), false);
});

test('NAR-007 Recovery replay applies gap refill before new events', async () => {
  const narrativeEngine = createNarrativeEngine();

  await narrativeEngine.invoke(
    NARRATIVE_ENGINE_DATA_API_AUDIT_APPEND,
    {
      action: 'append',
      runId: 'run-gap',
      event: {
        traceId: 'trace-gap',
        step: 'run',
        eventType: 'run.start',
        seq: 1,
        attempt: 1,
        timestamp: new Date(BASE_NOW_MS).toISOString(),
      },
    },
  );
  await narrativeEngine.invoke(
    NARRATIVE_ENGINE_DATA_API_AUDIT_APPEND,
    {
      action: 'append',
      runId: 'run-gap',
      event: {
        traceId: 'trace-gap',
        step: 'run',
        eventType: 'step.complete',
        seq: 3,
        attempt: 1,
        timestamp: new Date(BASE_NOW_MS + 1_000).toISOString(),
      },
    },
  );

  const replay = await narrativeEngine.invoke(
    NARRATIVE_ENGINE_DATA_API_AUDIT_APPEND,
    {
      action: 'replay',
      runId: 'run-gap',
      afterSeq: 2,
      limit: 50,
    },
  );

  assert.equal(replay.gapRefillApplied, true);
  assert.equal(Array.isArray(replay.gapRefill), true);
  assert.equal(replay.gapRefill.length > 0, true);
});

test('Idempotency replay returns existing result; conflicting payload returns spine write conflict', async () => {
  const narrativeEngine = createNarrativeEngine();
  await upsertContext(narrativeEngine, 'story-idem');

  const first = await narrativeEngine.turnResultUpsert(makeTurnInput({
    storyId: 'story-idem',
    idempotencyKey: 'idem-fixed',
    userMessage: 'first-message',
    mockCoreOutput: makeCoreOutput({ eventCount: 2 }),
  }));
  const second = await narrativeEngine.turnResultUpsert(makeTurnInput({
    storyId: 'story-idem',
    idempotencyKey: 'idem-fixed',
    userMessage: 'first-message',
    mockCoreOutput: makeCoreOutput({ eventCount: 2 }),
  }));

  assert.equal(second.turnId, first.turnId);
  assert.equal(second.runEnvelope.runId, first.runEnvelope.runId);
  assert.equal(getNarrativeSpineByStoryId('story-idem').length, 2);

  const conflict = await narrativeEngine.turnResultUpsert(makeTurnInput({
    storyId: 'story-idem',
    idempotencyKey: 'idem-fixed',
    userMessage: 'changed-message',
    mockCoreOutput: makeCoreOutput({ eventCount: 2 }),
  }));
  assert.equal(conflict.status, 'REJECTED');
  assert.equal(conflict.reasonCode, NARRATIVE_REASON_CODES.NARRATIVE_SPINE_WRITE_CONFLICT);
});

test('Spine append auto-remaps conflicting ids instead of failing the run', async () => {
  const narrativeEngine = createNarrativeEngine();
  await upsertContext(narrativeEngine, 'story-remap');

  const first = await narrativeEngine.turnResultUpsert(makeTurnInput({
    storyId: 'story-remap',
    idempotencyKey: 'idem-remap-1',
    userMessage: 'start-1',
    mockCoreOutput: makeCoreOutput({ eventCount: 2 }),
  }));
  assert.notEqual(first.status, 'REJECTED');

  const second = await narrativeEngine.turnResultUpsert(makeTurnInput({
    storyId: 'story-remap',
    idempotencyKey: 'idem-remap-2',
    userMessage: 'start-2',
    mockCoreOutput: makeCoreOutput({ eventCount: 2 }),
  }));
  assert.notEqual(second.status, 'REJECTED');
  assert.equal(Array.isArray(second.coreOutput?.spineEvents), true);

  const firstIds = new Set((first.coreOutput?.spineEvents || []).map((event) => event.id));
  const secondIds = (second.coreOutput?.spineEvents || []).map((event) => event.id);
  assert.equal(secondIds.length, 2);
  for (const id of secondIds) {
    assert.equal(firstIds.has(id), false);
  }

  const spine = getNarrativeSpineByStoryId('story-remap');
  assert.equal(spine.length, 4);
  const uniqueIds = new Set(spine.map((event) => event.id));
  assert.equal(uniqueIds.size, spine.length);
});
