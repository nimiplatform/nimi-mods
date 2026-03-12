import assert from 'node:assert/strict';

export function createRuntimeRouteClient(options = {}) {
  return {
    listOptions: async ({ capability }) => {
      assert.equal(capability, 'text.generate');
      if (options.failRoute) {
        throw new Error('route-capability-missing');
      }
      return {
        capability,
        selected: {
          source: 'cloud',
          connectorId: 'connector-main',
          model: 'gemini-3-flash-preview',
        },
        resolvedDefault: {
          source: 'cloud',
          connectorId: 'connector-main',
          model: 'gemini-3-flash-preview',
        },
        local: {
          models: [],
          defaultEndpoint: 'http://127.0.0.1:11434/v1',
        },
        connectors: [
          {
            id: 'connector-main',
            label: 'Main Connector',
            models: ['gemini-3-flash-preview'],
          },
        ],
      };
    },
  };
}

export function createAiClient(options = {}) {
  return {
    generateText: async (payload) => {
      if (options.failGenerate) {
        throw new Error('llm-temporary-failure');
      }
      return {
        text: options.text || `Narrative response for ${payload.mode}.`,
        promptTraceId: 'prompt-trace-1',
        route: {
          source: 'cloud',
          connectorId: 'connector-main',
          model: 'gemini-3-flash-preview',
          provider: 'api',
          endpoint: 'https://example.invalid/v1',
        },
      };
    },
  };
}

export function createNarrativeEngineStub() {
  let turnCounter = 0;
  const turns = new Map();

  return {
    turnResultUpsert: async (query) => {
      turnCounter += 1;
      const turnId = `turn-${turnCounter}`;
      turns.set(turnId, {
        storyId: query.storyId,
        turnId,
        runId: query.runId,
        traceId: query.traceId,
        triggerSource: query.triggerSource,
        userId: query.userId,
        playerName: query.playerName || 'Nimi Test User',
        playerIdentity: query.playerIdentity || '',
        agentId: query.agentId,
        userMessage: query.userMessage || '',
        systemContext: query.systemContext || null,
        createdAt: new Date(Date.UTC(2026, 2, 12, 12, turnCounter, 0)).toISOString(),
      });
      return {
        status: 'APPROVED',
        reasonCode: null,
        actionHint: 'ok',
        traceId: query.traceId,
        turnId,
        storyId: query.storyId,
      };
    },
    turnById: async ({ storyId, turnId }) => {
      const turn = turns.get(turnId);
      return {
        storyId,
        turnId,
        triggerSource: turn?.triggerSource || 'UserTurn',
        createdAt: turn?.createdAt || new Date().toISOString(),
      };
    },
    projectionRenderInput: async ({ storyId, turnId }) => {
      const turn = turns.get(turnId);
      const opening = turn?.systemContext?.opening || {};
      const userMessage = String(turn?.userMessage || '');
      return {
        storyId,
        turnId,
        triggerSource: turn?.triggerSource || 'UserTurn',
        player: {
          id: turn?.userId || 'user-1',
          name: turn?.playerName || 'Nimi Test User',
          identity: turn?.playerIdentity || '',
        },
        userMessage,
        systemPayload: turn?.systemContext || undefined,
        scene: {
          summary: String(opening.background || 'Storm clouds gather over the scene.'),
        },
        agent: {
          id: turn?.agentId || 'agent-1',
          summary: 'The lead agent watches the field without breaking cover.',
        },
        worldStyle: {
          summary: 'Grounded xianxia with sensory detail and rising tension.',
        },
        events: [
          {
            eventId: `evt-${turnId}`,
            visibility: 'public',
            content: userMessage || String(opening.entrySummary || 'The opening pressure sharpens before the first move.'),
            thinker: '',
            decider: '',
            experiencer: '',
            owner: '',
            sourceEventIds: [`src-${turnId}`],
          },
        ],
        metrics: {
          dramaticPressure: 0.64,
        },
      };
    },
  };
}

export function createDeps(options = {}) {
  return {
    hookClient: {
      data: {
        query: async () => ({ ok: true }),
      },
    },
    runtimeClient: {
      route: createRuntimeRouteClient(options),
    },
    aiClient: createAiClient(options),
    narrativeEngine: createNarrativeEngineStub(),
  };
}

export function createOpeningRequest(overrides = {}) {
  return {
    storyId: 'story_01KXTEXTPLAYSMOKEOPENING12345',
    entryEventId: 'evt-opening',
    worldId: 'world-1',
    agentId: 'agent-1',
    userId: 'user-1',
    playerName: 'Nimi Test User',
    playerIdentity: 'Dock courier',
    triggerSource: 'SystemEvent',
    runId: 'run-opening-1',
    traceId: 'trace-opening-1',
    systemPayload: {
      opening: {
        mode: 'story-start',
        instruction: '从目标事件真正发生前的临界阶段切入。',
        userId: 'user-1',
        playerName: 'Nimi Test User',
        playerIdentity: 'Dock courier',
        storyId: 'story_01KXTEXTPLAYSMOKEOPENING12345',
        storyTitle: 'Opening Clash',
        entryMode: 'PRE_EVENT',
        entryEventId: 'evt-opening',
        entryEventHorizon: 'PAST',
        targetEventMaterialOnly: true,
        entrySummary: 'The harbor is one breath away from rupture.',
        phase: 'opening',
        objective: 'Secure the signal mast before the cordon seals.',
        background: 'Rain hammers the docks while the city holds its breath.',
        noSpoiler: true,
      },
    },
    ...overrides,
  };
}

export function createUserTurnRequest(overrides = {}) {
  return {
    storyId: 'story_01KXTEXTPLAYSMOKEUSER1234567',
    entryEventId: 'evt-opening',
    worldId: 'world-1',
    agentId: 'agent-1',
    userId: 'user-1',
    playerName: 'Nimi Test User',
    playerIdentity: 'Dock courier',
    triggerSource: 'UserTurn',
    userMessage: 'I move toward the signal mast and watch the guards.',
    runId: 'run-user-1',
    traceId: 'trace-user-1',
    ...overrides,
  };
}
