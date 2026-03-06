import { createNarrativeEngineModule } from '../../narrative-engine/src/module.ts';
import { runTextplayRender } from '../src/pipeline/run-textplay-render.ts';
import {
  TEXTPLAY_DATA_API_RENDER_PERSIST,
} from '../src/contracts.ts';

const WORLD_ID = '01JKFANREN00000000000001';
const STORY_ID = 'story.01JKFANREN00000000000001.01JKEVTW000000000000049';
const AGENT_ID = '01JKAGENT00000000000001';
const PLAYER_ID = '01KJQQEWVF3590N1VKGATZF49V';
const ENTRY_EVENT_ID = '01JKEVTW000000000000049';
const CONNECTOR_ID = '01KJPF2VWTYXQ0Y40Q3Y3EAHF0';
const MODEL_ID = 'models/gemini-3-flash-preview';

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

function buildNarrativeCoreOutputText() {
  return JSON.stringify({
    spineEvents: [
      {
        id: 'EVT-01JK-START-001',
        type: 'scene-beat',
        visibility: 'public',
        payload: {
          description: '灵界天幕被血色裂缝撕开，真仙威压席卷全域。',
          location: '灵界-青元宫高空',
        },
        sourceEventIds: [ENTRY_EVENT_ID],
      },
      {
        id: 'EVT-01JK-START-002',
        type: 'scene-beat',
        visibility: 'sensory',
        payload: {
          description: '空气中血腥与仙灵力交织，远方灵山崩塌。',
        },
        sourceEventIds: [ENTRY_EVENT_ID],
      },
    ],
    stateChanges: {
      phase: 'RISING',
      objective: 'advance-story',
    },
    metrics: {
      coherence: 0.85,
      groundedRatio: 0.84,
      tension: 0.79,
    },
  });
}

function createHookClient() {
  return {
    data: {
      query: async ({ capability, query }) => {
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

function createNarrativeEngine() {
  return createNarrativeEngineModule({
    queryData: async (capability, query) => {
      if (capability === 'data-api.world.access.me') {
        return {
          hasActiveAccess: true,
          records: [{ scopeWorldId: String(query.worldId || '') }],
        };
      }
      if (capability === 'data-api.world.events.list') {
        return {
          items: [
            {
              id: ENTRY_EVENT_ID,
              summary: '韩立联合灵界众强者斩杀真仙马良，扭转灵界存亡危机。',
              eventHorizon: 'PAST',
              characterRefs: ['韩立'],
            },
          ],
        };
      }
      if (capability === 'data-api.world.lorebooks.list') {
        return {
          items: [
            {
              id: 'lore-core-1',
              key: 'history:core',
              content: '修仙界法则严苛，资源争夺残酷。',
              summary: '世界常识',
            },
          ],
        };
      }
      if (capability === 'data-api.world.scenes.list') {
        return {
          items: [
            {
              id: 'scene-immortal-realm',
              name: '仙界',
              description: '仙气缭绕，法则完整，真仙云集。',
              activeEntities: [AGENT_ID],
              setting: {
                atmosphere: '仙气缭绕，危机暗涌',
              },
            },
          ],
        };
      }
      if (capability === 'data-api.world.narrative-contexts.list') {
        return {
          items: [
            {
              id: 'ctx-canon-main',
              scope: 'CANON',
              storyId: null,
              narrativeSetting: {
                worldviewRules: ['修仙界弱肉强食，因果自洽'],
                stylePolicy: { tone: '肃杀克制' },
              },
              narrativeState: {
                phase: 'RISING',
                objective: 'advance-story',
              },
            },
            {
              id: 'ctx-story-main',
              scope: 'STORY',
              storyId: String(query.storyId || ''),
              narrativeSetting: {
                pacingPolicy: { targetTension: 0.7 },
                stylePolicy: { perspective: 'third-limited' },
              },
              narrativeState: {
                phase: 'RISING',
                objective: 'advance-story',
                tension: 0.7,
                openThreads: ['真仙威胁未除'],
              },
            },
            {
              id: 'ctx-subject-agent',
              scope: 'SUBJECT',
              storyId: String(query.storyId || ''),
              subjectType: 'AGENT',
              subjectId: AGENT_ID,
              narrativeSetting: {
                role: 'protagonist',
              },
              narrativeState: {
                activeObjective: '稳住战局',
              },
            },
            {
              id: 'ctx-relation-main',
              scope: 'RELATION',
              storyId: String(query.storyId || ''),
              subjectType: 'AGENT',
              subjectId: AGENT_ID,
              targetSubjectType: 'PLAYER',
              targetSubjectId: PLAYER_ID,
              narrativeSetting: {
                relationContract: 'allies',
              },
              narrativeState: {
                trust: 0.65,
              },
            },
          ],
        };
      }
      if (capability === 'data-api.core.agent.memory.recall.for-entity') {
        return [
          {
            category: 'CORE',
            type: 'CORE_FACT',
            content: '谨慎是生存之道。',
            importance: 1,
          },
        ];
      }
      throw new Error(`unsupported-capability:${capability}`);
    },
    generateText: async () => ({
      text: buildNarrativeCoreOutputText(),
    }),
  });
}

function createRuntimeRouteClient() {
  return {
    listOptions: async () => ({
      capability: 'text.generate',
      selected: {
        source: 'token-api',
        connectorId: CONNECTOR_ID,
        model: MODEL_ID,
      },
      resolvedDefault: {
        source: 'token-api',
        connectorId: CONNECTOR_ID,
        model: MODEL_ID,
      },
      localRuntime: {
        models: [],
        defaultEndpoint: 'http://127.0.0.1:8080/v1',
      },
      connectors: [
        {
          id: CONNECTOR_ID,
          label: 'API Connector 1',
          models: [MODEL_ID],
        },
      ],
    }),
  };
}

function createRuntimeTextClient() {
  return {
    generateText: async () => ({
      text: '开场风雷已起，韩立立于余烬之上，下一步由你决断。',
      promptTraceId: makeId('prompt'),
      route: {
        source: 'token-api',
        connectorId: CONNECTOR_ID,
        model: MODEL_ID,
        provider: 'openai-compatible',
      },
    }),
  };
}

async function runStartOnce(input) {
  return runTextplayRender({
    request: {
      storyId: STORY_ID,
      worldId: WORLD_ID,
      agentId: AGENT_ID,
      playerId: PLAYER_ID,
      triggerSource: 'SystemEvent',
      userMessage: '',
      systemPayload: {
        opening: {
          mode: 'story-start',
          instruction: '生成第一段开场叙事',
          playerId: PLAYER_ID,
          storyId: STORY_ID,
          storyTitle: '斩杀真仙马良',
          entryEventId: ENTRY_EVENT_ID,
          entrySummary: '韩立联合灵界众强者斩杀真仙马良，扭转灵界危机。',
          phase: 'RISING',
          objective: 'advance-story',
          background: '灵界风暴未歇，新的冲突即将降临。',
        },
      },
      binding: {
        source: 'token-api',
        connectorId: CONNECTOR_ID,
        model: MODEL_ID,
      },
      runId: input.runId,
      traceId: input.traceId,
    },
    deps: {
      hookClient: input.hookClient,
      runtimeClient: input.runtimeClient,
      aiClient: input.aiClient,
      narrativeEngine: input.narrativeEngine,
    },
    presenceReports: [],
  });
}

async function main() {
  const hookClient = createHookClient();
  const runtimeClient = createRuntimeRouteClient();
  const aiClient = createRuntimeTextClient();
  const narrativeEngine = createNarrativeEngine();

  const first = await runStartOnce({
    runId: makeId('run-1'),
    traceId: makeId('trace-1'),
    hookClient,
    runtimeClient,
    aiClient,
    narrativeEngine,
  });
  if (!first.ok) {
    console.error('first start failed', first.reasonCode, first.actionHint, first.chainReasonCode);
    process.exit(1);
  }

  const second = await runStartOnce({
    runId: makeId('run-2'),
    traceId: makeId('trace-2'),
    hookClient,
    runtimeClient,
    aiClient,
    narrativeEngine,
  });
  if (!second.ok) {
    console.error('second start failed', second.reasonCode, second.actionHint, second.chainReasonCode);
    process.exit(1);
  }

  console.log('start replay smoke passed', {
    firstTurnId: first.meta.turnId,
    secondTurnId: second.meta.turnId,
    firstRunId: first.meta.runId,
    secondRunId: second.meta.runId,
    textLengths: [first.text.length, second.text.length],
  });
}

await main();
