import test from 'node:test';
import assert from 'node:assert/strict';
import { runTextplayRender } from '../src/pipeline/run-textplay-render.ts';
import {
  TEXTPLAY_CHAIN_REASON,
  TEXTPLAY_DATA_API_RENDER_PERSIST,
  TEXTPLAY_DATA_API_RUNTIME_ROUTE_OPTIONS,
  TEXTPLAY_REASON,
} from '../src/contracts.ts';

function createBaseRequest() {
  return {
    storyId: 'story-1',
    worldId: 'world-1',
    agentId: '~guide',
    playerId: 'player-1',
    triggerSource: 'UserTurn',
    userMessage: 'I open the old gate and step inside.',
    runId: 'run-1',
    traceId: 'trace-1',
  };
}

function createProjection() {
  return {
    storyId: 'story-1',
    turnId: 'turn-1',
    triggerSource: 'UserTurn',
    player: {
      id: 'player-1',
      name: 'Player',
    },
    userMessage: 'I open the old gate and step inside.',
    systemPayload: undefined,
    scene: {
      summary: 'A cold courtyard with rain and stone statues.',
    },
    agent: {
      id: '~guide',
      summary: 'A silent guide watches from the archway.',
    },
    worldStyle: {
      summary: 'Noir fantasy tone with grounded sensory details.',
    },
    events: [
      {
        eventId: 'evt-public-1',
        visibility: 'public',
        content: 'Rain hits the broken flagstones in irregular bursts.',
        thinker: '',
        decider: '',
        experiencer: '',
        owner: '',
        sourceEventIds: ['spine-001'],
      },
      {
        eventId: 'evt-internal-player',
        visibility: 'internal',
        content: 'The player feels a brief fear but keeps moving.',
        thinker: 'player-1',
        decider: '',
        experiencer: '',
        owner: '',
        sourceEventIds: ['spine-002'],
      },
      {
        eventId: 'evt-internal-npc',
        visibility: 'internal',
        content: 'The guide plans to test the player in silence.',
        thinker: '~guide',
        decider: '',
        experiencer: '',
        owner: '',
        sourceEventIds: ['spine-003'],
      },
    ],
    metrics: {
      dramaticPressure: 0.72,
    },
  };
}

function createRouteOptionsPayload() {
  return {
    selected: {
      source: 'token-api',
      connectorId: 'connector-main',
      model: 'gpt-4.1-mini',
    },
    resolvedDefault: {
      source: 'token-api',
      connectorId: 'connector-main',
      model: 'gpt-4.1-mini',
    },
    localRuntime: {
      models: [],
      defaultEndpoint: 'http://127.0.0.1:8080/v1',
    },
    connectors: [
      {
        id: 'connector-main',
        label: 'Main Connector',
        models: ['gpt-4.1-mini'],
      },
    ],
  };
}

function createHookClient(options = {}) {
  const persistCalls = [];
  const failRoute = options.failRoute === true;

  return {
    persistCalls,
    hookClient: {
      data: {
        query: async ({ capability, query }) => {
          if (capability === TEXTPLAY_DATA_API_RUNTIME_ROUTE_OPTIONS) {
            if (failRoute) {
              throw new Error('route-capability-missing');
            }
            return createRouteOptionsPayload();
          }

          if (capability === TEXTPLAY_DATA_API_RENDER_PERSIST) {
            persistCalls.push(query);
            return {
              ok: true,
              record: query.record,
            };
          }

          throw new Error(`unsupported-capability:${capability}`);
        },
      },
    },
  };
}

function createNarrativeEngine(options = {}) {
  const rejectNarrative = options.rejectNarrative === true;
  let contextScopes = {
    CANON: {},
    STORY: {},
    SUBJECT: {},
    RELATION: {},
  };

  return {
    contextResolve: async (query) => {
      if (query.action === 'upsert' && query.scopes) {
        contextScopes = query.scopes;
      }
      return {
        storyId: query.storyId,
        scopes: contextScopes,
      };
    },
    turnResultUpsert: async (query) => {
      if (rejectNarrative) {
        return {
          status: 'REJECTED',
          reasonCode: 'NARRATIVE_CONTEXT_INSUFFICIENT',
          actionHint: 'Complete required context scopes and retry.',
          traceId: query.traceId,
          turnId: 'turn-1',
          storyId: query.storyId,
        };
      }
      return {
        status: 'APPROVED',
        reasonCode: null,
        actionHint: 'ok',
        traceId: query.traceId,
        turnId: 'turn-1',
        storyId: query.storyId,
      };
    },
    turnById: async (query) => ({
      storyId: query.storyId,
      turnId: query.turnId,
      triggerSource: 'UserTurn',
      createdAt: '2026-03-02T10:00:00.000Z',
    }),
    projectionRenderInput: async () => createProjection(),
  };
}

function createAiClient() {
  return {
    generateText: async () => ({
      text: 'You push through the gate, and the courtyard answers with distant iron bells.',
      promptTraceId: 'prompt-trace-1',
      route: {
        source: 'token-api',
        connectorId: 'connector-main',
        model: 'gpt-4.1-mini',
        provider: 'openai',
        endpoint: 'https://example.invalid/v1/chat/completions',
      },
    }),
  };
}

test('textplay pipeline success returns text+meta and persists output', async () => {
  const { hookClient, persistCalls } = createHookClient();
  const narrativeEngine = createNarrativeEngine();
  const result = await runTextplayRender({
    request: createBaseRequest(),
    deps: {
      hookClient,
      aiClient: createAiClient(),
      narrativeEngine,
    },
    presenceReports: [],
  });

  assert.equal(result.ok, true);
  assert.ok(result.text.length > 0);
  assert.equal(result.meta.storyId, 'story-1');
  assert.equal(result.meta.turnId, 'turn-1');
  assert.equal(result.meta.runId, 'run-1');
  assert.equal(result.meta.traceId, 'trace-1');
  assert.equal(result.meta.runSnapshot.status, 'COMPLETED');
  assert.equal(result.meta.warnings.some((warning) => warning.code === TEXTPLAY_REASON.PERSISTENCE_FAILED_WARN), false);
  assert.equal(persistCalls.length, 1);
  assert.equal(persistCalls[0].op, 'upsert');
  assert.equal(persistCalls[0].record.turnId, 'turn-1');
});

test('textplay route unavailable returns structured failure', async () => {
  const { hookClient } = createHookClient({ failRoute: true });
  const narrativeEngine = createNarrativeEngine();
  const result = await runTextplayRender({
    request: createBaseRequest(),
    deps: {
      hookClient,
      aiClient: createAiClient(),
      narrativeEngine,
    },
    presenceReports: [],
  });

  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, TEXTPLAY_REASON.ROUTE_UNAVAILABLE);
  assert.equal(result.chainReasonCode, TEXTPLAY_CHAIN_REASON.ROUTE_UNAVAILABLE);
  assert.equal(result.stage, 'renderer');
  assert.equal(result.runSnapshot.status, 'FAILED');
});

test('textplay cancel path emits run.canceled with CANCELED terminal state', async () => {
  const { hookClient } = createHookClient();
  const narrativeEngine = createNarrativeEngine();
  const controller = new AbortController();
  controller.abort();

  const result = await runTextplayRender({
    request: createBaseRequest(),
    deps: {
      hookClient,
      aiClient: createAiClient(),
      narrativeEngine,
      abortSignal: controller.signal,
    },
    presenceReports: [],
  });

  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, TEXTPLAY_REASON.RUN_CANCELED);
  assert.equal(result.runSnapshot.status, 'CANCELED');
  assert.equal(result.runEvents.some((event) => event.eventType === 'run.canceled'), true);
  assert.equal(result.runEvents.some((event) => event.eventType === 'run.error'), false);
});

test('textplay narrative rejection surfaces chain narrative-rejected failure', async () => {
  const { hookClient } = createHookClient();
  const narrativeEngine = createNarrativeEngine({ rejectNarrative: true });
  const result = await runTextplayRender({
    request: createBaseRequest(),
    deps: {
      hookClient,
      aiClient: createAiClient(),
      narrativeEngine,
    },
    presenceReports: [],
  });

  assert.equal(result.ok, false);
  assert.equal(result.reasonCode, TEXTPLAY_REASON.CONTEXT_MISSING_CRITICAL);
  assert.equal(result.chainReasonCode, TEXTPLAY_CHAIN_REASON.NARRATIVE_REJECTED);
  assert.equal(result.stage, 'renderer');
  assert.equal(result.runSnapshot.status, 'FAILED');
});
