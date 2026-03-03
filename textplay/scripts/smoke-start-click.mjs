import { runTextplayRender } from '../src/pipeline/run-textplay-render.ts';
import {
  TEXTPLAY_DATA_API_RENDER_PERSIST,
  TEXTPLAY_DATA_API_RUNTIME_ROUTE_OPTIONS,
} from '../src/contracts.ts';

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

function createHookClient() {
  return {
    data: {
      query: async ({ capability, query }) => {
        if (capability === TEXTPLAY_DATA_API_RUNTIME_ROUTE_OPTIONS) {
          return {
            selected: {
              source: 'token-api',
              connectorId: '01KJPF2VWTYXQ0Y40Q3Y3EAHF0',
              model: 'models/gemini-3-flash-preview',
            },
            resolvedDefault: {
              source: 'token-api',
              connectorId: '01KJPF2VWTYXQ0Y40Q3Y3EAHF0',
              model: 'models/gemini-3-flash-preview',
            },
            localRuntime: {
              models: [],
              defaultEndpoint: 'http://127.0.0.1:8080/v1',
            },
            connectors: [
              {
                id: '01KJPF2VWTYXQ0Y40Q3Y3EAHF0',
                label: 'API Connector 1',
                models: ['models/gemini-3-flash-preview'],
              },
            ],
          };
        }

        if (capability === TEXTPLAY_DATA_API_RENDER_PERSIST) {
          return {
            ok: true,
            record: query.record,
          };
        }

        throw new Error(`unsupported-capability:${capability}`);
      },
    },
  };
}

function createAiClient() {
  return {
    generateText: async () => ({
      text: '开场风雷已起，韩立立于余烬之上，下一步由你决断。',
      promptTraceId: makeId('prompt'),
      route: {
        source: 'token-api',
        connectorId: '01KJPF2VWTYXQ0Y40Q3Y3EAHF0',
        model: 'models/gemini-3-flash-preview',
        provider: 'openai-compatible',
        endpoint: 'https://example.invalid/v1/chat/completions',
      },
    }),
  };
}

function createNarrativeEngine() {
  const turnId = makeId('turn');
  return {
    turnResultUpsert: async (query) => ({
      status: 'APPROVED',
      reasonCode: null,
      actionHint: 'ok',
      traceId: query.traceId,
      turnId,
      storyId: query.storyId,
    }),
    turnById: async (query) => ({
      storyId: query.storyId,
      turnId: query.turnId,
      triggerSource: 'SystemEvent',
      createdAt: new Date().toISOString(),
    }),
    projectionRenderInput: async (query) => ({
      storyId: query.storyId,
      turnId: query.turnId,
      triggerSource: 'SystemEvent',
      player: null,
      userMessage: '',
      systemPayload: null,
      scene: null,
      agent: null,
      worldStyle: null,
      events: [],
      metrics: {},
    }),
  };
}

async function main() {
  const runId = makeId('run');
  const traceId = makeId('trace');
  const result = await runTextplayRender({
    request: {
      storyId: 'story.01JKFANREN00000000000001.01JKEVTW000000000000049',
      worldId: '01JKFANREN00000000000001',
      agentId: '01JKAGENT00000000000001',
      playerId: '01KJQQEWVF3590N1VKGATZF49V',
      triggerSource: 'SystemEvent',
      userMessage: '',
      systemPayload: {
        opening: {
          mode: 'story-start',
          instruction: '生成第一段开场叙事',
          playerId: '01KJQQEWVF3590N1VKGATZF49V',
          storyId: 'story.01JKFANREN00000000000001.01JKEVTW000000000000049',
          storyTitle: '斩杀真仙马良',
          entryEventId: '01JKEVTW000000000000049',
          entrySummary: '韩立联合灵界众强者斩杀真仙马良，扭转灵界危机。',
          phase: 'RISING',
          objective: 'advance-story',
          background: '灵界风暴未歇，新的冲突即将降临。',
        },
      },
      routeOverride: {
        source: 'token-api',
        connectorId: '01KJPF2VWTYXQ0Y40Q3Y3EAHF0',
        model: 'models/gemini-3-flash-preview',
      },
      runId,
      traceId,
    },
    deps: {
      hookClient: createHookClient(),
      aiClient: createAiClient(),
      narrativeEngine: createNarrativeEngine(),
    },
    presenceReports: [],
  });

  if (!result.ok) {
    console.error('start-smoke failed', {
      reasonCode: result.reasonCode,
      actionHint: result.actionHint,
      chainReasonCode: result.chainReasonCode,
      stage: result.stage,
      snapshot: result.runSnapshot,
    });
    process.exitCode = 1;
    return;
  }

  console.log('start-smoke passed', {
    runId: result.meta.runId,
    traceId: result.meta.traceId,
    storyId: result.meta.storyId,
    turnId: result.meta.turnId,
    textLength: result.text.length,
  });
}

await main();
