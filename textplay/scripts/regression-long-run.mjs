import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createNarrativeEngineModule } from '../../narrative-engine/src/module.ts';
import { runTextplayRender } from '../src/pipeline/run-textplay-render.ts';
import {
  TEXTPLAY_CHAIN_REASON,
  TEXTPLAY_DATA_API_RENDER_PERSIST,
  TEXTPLAY_DATA_API_RUNTIME_ROUTE_OPTIONS,
  TEXTPLAY_REASON,
} from '../src/contracts.ts';

const WORLD_ID = '01JKFANREN00000000000001';
const STORY_ID = 'story.01JKFANREN00000000000001.01JKEVTW000000000000049';
const AGENT_ID = '01JKAGENT00000000000001';
const PLAYER_ID = '01KJQQEWVF3590N1VKGATZF49V';
const PLAYER_NAME = '云澜';
const PLAYER_IDENTITY = '灵界散修';
const ENTRY_EVENT_ID = '01JKEVTW000000000000049';

const CONNECTOR_ID = '01KJPF2VWTYXQ0Y40Q3Y3EAHF0';
const MODEL_ID = 'models/gemini-3-flash-preview';

const TURN_COUNT = Math.max(12, Number.parseInt(process.env['TEXTPLAY_LONG_REGRESSION_TURNS'] || '30', 10) || 30);

const state = {
  turnCounter: 0,
  tension: 0.56,
  openThreads: [
    '护阵灵纹在高空压制下反复震荡',
    '后方补给线迟迟未到',
    '真仙分身的方位仍未锁定',
  ],
  pendingEvents: [
    '侦骑回报敌阵将在半炷香后转向青元宫',
    '前线临时结界出现不稳定波动',
  ],
  pressures: [
    '高空仙压与地面阵线冲突',
    '盟军协同出现短暂脱节',
  ],
  agendas: [
    '韩立优先稳住阵眼并评估反击窗口',
    '前线指挥层要求玩家在侧翼牵制敌锋',
  ],
};

const persistedByRunId = new Map();

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

function clampTension(value) {
  return Math.min(0.86, Math.max(0.4, value));
}

function rotateStoryState() {
  state.turnCounter += 1;

  if (state.turnCounter % 3 === 0 && state.openThreads.length > 1) {
    state.openThreads.shift();
    state.openThreads.push(`新压力线索-${state.turnCounter}`);
  }

  if (state.turnCounter % 4 === 0) {
    const moved = state.pendingEvents.shift();
    if (moved) {
      state.pendingEvents.push(`后续余波：${moved}`);
    }
  }

  state.tension = clampTension(
    state.tension + (state.turnCounter % 2 === 0 ? -0.03 : 0.05),
  );
}

function buildNarrativeCoreOutputText(input) {
  const currentThread = input.thread || '战场暗流未明';
  const currentPressure = input.pressure || '前线仍有不稳定因素';
  const tension = Number(input.tension || 0.6);
  const eventIndex = Number(input.eventIndex || 1);

  return JSON.stringify({
    spineEvents: [
      {
        id: 'EVT-LONG-RUN-CONFLICT',
        type: 'scene-beat',
        visibility: 'public',
        payload: {
          description: `第${eventIndex}轮推进中，${currentPressure}，战场回响不断逼近核心阵线。`,
          summary: `局势推进：${currentPressure}`,
          location: '灵界-青元宫战区',
        },
        sourceEventIds: [ENTRY_EVENT_ID],
      },
      {
        id: 'EVT-LONG-RUN-CONFLICT',
        type: 'dialogue',
        visibility: 'public',
        payload: {
          speaker: '韩立',
          listener: PLAYER_NAME,
          content: `${PLAYER_NAME}，先盯住“${currentThread}”，别让局势提前失控。`,
          summary: `韩立要求跟进线索：${currentThread}`,
        },
        sourceEventIds: [ENTRY_EVENT_ID],
      },
      {
        id: 'EVT-LONG-RUN-CONFLICT',
        type: 'state-change',
        visibility: 'sensory',
        payload: {
          summary: `未决线索仍在延续：${currentThread}`,
          tension,
        },
        sourceEventIds: [ENTRY_EVENT_ID],
      },
    ],
    stateChanges: {
      phase: 'RISING',
      objective: 'advance-story',
      narrativeState: {
        tension,
        openThreads: state.openThreads,
      },
    },
    metrics: {
      coherence: 0.86,
      groundedRatio: 0.84,
      tension,
    },
  });
}

function createHookClient() {
  return {
    data: {
      query: async ({ capability, query }) => {
        if (capability === TEXTPLAY_DATA_API_RUNTIME_ROUTE_OPTIONS) {
          return {
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
          };
        }

        if (capability === TEXTPLAY_DATA_API_RENDER_PERSIST) {
          if (query.op === 'upsert') {
            persistedByRunId.set(query.record.runId, query.record);
            return {
              ok: true,
              record: query.record,
            };
          }
          if (query.op === 'getRun') {
            const record = persistedByRunId.get(query.runId) || null;
            return {
              record,
              events: record?.runEvents || [],
              runSnapshot: record?.runSnapshot || null,
              gapRefillApplied: false,
              nextAfterSeq: Number(query.afterSeq || 0),
            };
          }
          if (query.op === 'listByStory') {
            const records = [...persistedByRunId.values()].filter((row) => row.storyId === query.storyId);
            return { records };
          }
          return { ok: true };
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
      if (capability === 'data-api.runtime.route.options') {
        return {
          selected: {
            source: 'token-api',
            connectorId: CONNECTOR_ID,
            model: MODEL_ID,
          },
        };
      }
      if (capability === 'data-api.world.events.list') {
        return {
          worldId: WORLD_ID,
          items: [
            {
              id: ENTRY_EVENT_ID,
              level: 'PRIMARY',
              eventHorizon: 'PAST',
              title: '诛杀真仙马良',
              summary: '韩立联合灵界众强者斩杀真仙马良，扭转灵界存亡危机。',
              cause: '真仙威压降临',
              process: '战线濒临崩裂',
              result: '仍有余波未平',
              characterRefs: [AGENT_ID, PLAYER_ID],
            },
          ],
        };
      }
      if (capability === 'data-api.world.lorebooks.list') {
        return {
          worldId: WORLD_ID,
          items: [
            {
              id: 'lore-core-1',
              key: 'world.rule',
              content: '修仙界强者博弈，因果必须自洽。',
              summary: '核心规则',
            },
            {
              id: 'lore-core-2',
              key: 'world.tone',
              content: '大战未止，局势长期拉锯。',
              summary: '叙事基调',
            },
          ],
        };
      }
      if (capability === 'data-api.world.scenes.list') {
        return {
          worldId: WORLD_ID,
          items: [
            {
              id: 'scene-immortal-frontline',
              worldId: WORLD_ID,
              name: '灵界战场',
              description: '残阵与仙压交织，战云未散。',
              setting: {
                atmosphere: '肃杀压抑，危机持续逼近',
              },
              activeEntities: [AGENT_ID, PLAYER_ID],
            },
          ],
        };
      }
      if (capability === 'data-api.world.narrative-contexts.list') {
        const storyId = String(query.storyId || STORY_ID);
        return {
          worldId: WORLD_ID,
          items: [
            {
              id: 'ctx-canon-main',
              scope: 'CANON',
              scopeKey: `canon:${WORLD_ID}`,
              storyId: null,
              narrativeSetting: {
                worldviewRules: ['修仙界弱肉强食，因果自洽'],
                stylePolicy: { tone: '肃杀克制', perspective: 'third-limited' },
              },
              narrativeState: {},
            },
            {
              id: 'ctx-story-main',
              scope: 'STORY',
              scopeKey: `story:${storyId}`,
              storyId,
              narrativeSetting: {
                initiativePolicy: {
                  enabled: true,
                  tickSeconds: 10,
                  cooldownSeconds: 0,
                  maxConsecutive: 3,
                },
                pacingPolicy: {
                  targetTension: state.tension,
                  tensionBand: [0.45, 0.82],
                  curve: 'steady-rise',
                },
                materialHints: {
                  pendingEvents: state.pendingEvents,
                  conflicts: state.pressures,
                  npcsWithAgenda: state.agendas,
                },
              },
              narrativeState: {
                phase: 'RISING',
                objective: 'advance-story',
                tension: state.tension,
                openThreads: state.openThreads,
              },
            },
            {
              id: 'ctx-subject-main',
              scope: 'SUBJECT',
              scopeKey: `subject:${storyId}:${AGENT_ID}`,
              storyId,
              subjectType: 'AGENT',
              subjectId: AGENT_ID,
              narrativeSetting: { dramaticRole: 'guardian' },
              narrativeState: { activeObjective: '稳住战线' },
            },
            {
              id: 'ctx-relation-main',
              scope: 'RELATION',
              scopeKey: `relation:${storyId}:${AGENT_ID}:${PLAYER_ID}`,
              storyId,
              subjectType: 'AGENT',
              subjectId: AGENT_ID,
              targetSubjectType: 'PLAYER',
              targetSubjectId: PLAYER_ID,
              narrativeSetting: { relationType: 'ALLY' },
              narrativeState: { trust: 0.62, playerRole: PLAYER_IDENTITY },
            },
          ],
        };
      }
      if (capability === 'data-api.core.agent.memory.recall.for-entity') {
        return [
          {
            category: 'CORE',
            type: 'CORE_FACT',
            content: '谨慎推进，不可一击定胜负。',
          },
        ];
      }
      throw new Error(`UNHANDLED_QUERY_CAPABILITY:${capability}`);
    },
    generateText: async () => {
      const thread = state.openThreads[0] || '战场暗流未明';
      const pressure = state.pressures[state.turnCounter % state.pressures.length] || '局势压力上升';
      const nextText = buildNarrativeCoreOutputText({
        thread,
        pressure,
        tension: state.tension,
        eventIndex: state.turnCounter + 1,
      });
      rotateStoryState();
      return { text: nextText };
    },
  });
}

function createAiClient() {
  return {
    generateText: async (payload) => {
      const prompt = String(payload.prompt || '');
      const isOpening = prompt.includes('Opening Mode: story-start');
      const text = isOpening
        ? `血色裂缝压低了天幕，${PLAYER_NAME}立在残阵边缘，耳畔尽是金铁与雷鸣。韩立并未给出结论，只让你先盯住阵眼的细微震颤。局势尚未收束，你准备先稳阵还是先探敌锋？`
        : `阵线余波再起，${PLAYER_NAME}顺着韩立的指引捕捉到新的破绽。高空仙压仍在回落与反弹之间拉扯，眼前线索只被撬开一道口子。你要立刻追击这道口子，还是先加固后方退路？`;
      return {
        text,
        promptTraceId: makeId('prompt'),
        route: {
          source: 'token-api',
          connectorId: CONNECTOR_ID,
          model: MODEL_ID,
          provider: 'openai-compatible',
          endpoint: 'https://example.invalid/v1/chat/completions',
        },
      };
    },
  };
}

function buildRequestForTurn(index) {
  const runId = makeId(`run-${index}`);
  const traceId = makeId(`trace-${index}`);
  if (index === 1) {
    return {
      runId,
      traceId,
      triggerSource: 'SystemEvent',
      userMessage: '',
      systemPayload: {
        opening: {
          mode: 'story-start',
          instruction: '生成第一段开场叙事，禁止剧透并保持目标事件前态。',
          noSpoiler: true,
          playerId: PLAYER_ID,
          playerName: PLAYER_NAME,
          playerIdentity: PLAYER_IDENTITY,
          storyId: STORY_ID,
          storyTitle: '诛杀真仙马良',
          entryEventId: ENTRY_EVENT_ID,
          entrySummary: '大战前夜，灵界防线濒临失守。',
          phase: 'RISING',
          objective: 'advance-story',
          background: '敌压临境，盟军未稳，任何失误都会放大。',
          currentSituation: '战场正处于剧烈拉扯的临界点，尚无终局。',
        },
      },
    };
  }

  if (index % 5 === 0) {
    const directive = `【世界推进】围绕“${state.openThreads[0] || '前线暗流'}”制造可感知变化，保持未决并给玩家可行动口子。`;
    return {
      runId,
      traceId,
      triggerSource: 'AgentInitiative',
      userMessage: directive,
      systemPayload: {
        initiative: {
          source: 'regression.auto-tick',
          strategy: 'open-thread',
          directive,
        },
      },
    };
  }

  const userActions = [
    '我先稳住阵眼，再观察敌阵侧翼变化。',
    '我去确认补给线是否还能接入主阵。',
    '我尝试诱导敌锋偏移，给盟友争取窗口。',
    '我先不冒进，记录灵压波动并回报韩立。',
  ];

  return {
    runId,
    traceId,
    triggerSource: 'UserTurn',
    userMessage: userActions[index % userActions.length],
    systemPayload: undefined,
  };
}

function summarizeLastStep(runEvents) {
  if (!Array.isArray(runEvents) || runEvents.length === 0) {
    return { step: '', reasonCode: '', actionHint: '' };
  }
  const last = runEvents[runEvents.length - 1];
  if (last?.eventType === 'run.error' || last?.eventType === 'run.canceled') {
    return {
      step: String(last.step || ''),
      reasonCode: String(last.reasonCode || ''),
      actionHint: String(last.actionHint || ''),
    };
  }
  const stepError = [...runEvents].reverse().find((event) => event.eventType === 'step.error');
  if (stepError) {
    return {
      step: String(stepError.step || ''),
      reasonCode: String(stepError.reasonCode || ''),
      actionHint: String(stepError.actionHint || ''),
    };
  }
  return {
    step: String(last.step || ''),
    reasonCode: '',
    actionHint: '',
  };
}

function assertTurnInvariants(input) {
  const issues = [];
  if (!input.result.ok) {
    issues.push(`render-failed:${input.result.reasonCode}`);
    return issues;
  }

  if (input.result.meta.runSnapshot.status !== 'COMPLETED') {
    issues.push(`snapshot-not-completed:${input.result.meta.runSnapshot.status}`);
  }

  if (String(input.result.text || '').trim().length < 30) {
    issues.push('render-text-too-short');
  }

  if (input.index === 1) {
    const spoilerPattern = /(已(?:经)?斩杀真仙马良|马良(?:已|已经)被斩杀|终局已定)/;
    if (spoilerPattern.test(input.result.text)) {
      issues.push('opening-spoiler-detected');
    }
  }

  const bannedMetaPattern = /(spine events?|core output|json 输出|系统事件字段)/i;
  if (bannedMetaPattern.test(input.result.text)) {
    issues.push('meta-leak-detected');
  }

  if (input.openThreadsAfter.length === 0) {
    issues.push('no-open-thread-after-turn');
  }

  return issues;
}

async function writeReport(report) {
  const currentFile = fileURLToPath(import.meta.url);
  const scriptsDir = path.dirname(currentFile);
  const reportDir = path.resolve(scriptsDir, '../../dev/report');
  await fs.mkdir(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, 'textplay-long-run-regression.latest.json');
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return reportPath;
}

async function main() {
  const hookClient = createHookClient();
  const aiClient = createAiClient();
  const narrativeEngine = createNarrativeEngine();

  const turns = [];
  const failures = [];
  const turnIds = new Set();

  for (let index = 1; index <= TURN_COUNT; index += 1) {
    const requestSeed = buildRequestForTurn(index);
    const openThreadsBefore = [...state.openThreads];
    const tensionBefore = state.tension;

    const result = await runTextplayRender({
      request: {
        storyId: STORY_ID,
        worldId: WORLD_ID,
        agentId: AGENT_ID,
        playerId: PLAYER_ID,
        playerName: PLAYER_NAME,
        playerIdentity: PLAYER_IDENTITY,
        triggerSource: requestSeed.triggerSource,
        userMessage: requestSeed.userMessage,
        systemPayload: requestSeed.systemPayload,
        routeOverride: {
          source: 'token-api',
          connectorId: CONNECTOR_ID,
          model: MODEL_ID,
        },
        runId: requestSeed.runId,
        traceId: requestSeed.traceId,
      },
      deps: {
        hookClient,
        aiClient,
        narrativeEngine,
      },
      presenceReports: [],
    });

    const openThreadsAfter = [...state.openThreads];
    const tensionAfter = state.tension;
    const eventSummary = summarizeLastStep(result.runEvents);
    const warningCodes = result.ok
      ? result.meta.warnings.map((warning) => warning.code)
      : result.warnings.map((warning) => warning.code);

    let guardAdjustment = false;
    let narrativeStatus = '';
    let narrativeReasonCode = '';
    let turnId = result.ok ? result.meta.turnId : '';
    if (turnId) {
      const turnById = await narrativeEngine.turnById({
        storyId: STORY_ID,
        turnId,
        traceId: result.ok ? result.meta.traceId : requestSeed.traceId,
      });
      const record = turnById && typeof turnById === 'object' ? turnById : {};
      narrativeStatus = String(record.status || '');
      narrativeReasonCode = String(record.reasonCode || '');
      guardAdjustment = narrativeStatus === 'ADJUSTED' || Boolean(narrativeReasonCode);
    }

    const row = {
      index,
      runId: requestSeed.runId,
      traceId: result.ok ? result.meta.traceId : result.traceId,
      triggerSource: requestSeed.triggerSource,
      turnId,
      narrativeStatus,
      reasonCode: result.ok ? (narrativeReasonCode || null) : result.reasonCode,
      chainReasonCode: result.ok ? (result.meta.chainReasonCode || null) : result.chainReasonCode,
      step: eventSummary.step || '',
      stepReasonCode: eventSummary.reasonCode || '',
      stepActionHint: eventSummary.actionHint || '',
      actionHint: result.ok ? null : result.actionHint,
      guardAdjustment,
      openThreadsBefore,
      openThreadsAfter,
      tensionBefore,
      tensionAfter,
      runSnapshotStatus: result.ok ? result.meta.runSnapshot.status : result.runSnapshot.status,
      warningCodes,
      textPreview: result.ok ? String(result.text || '').slice(0, 120) : '',
      ok: result.ok,
    };
    turns.push(row);

    if (turnId) {
      if (turnIds.has(turnId)) {
        failures.push({
          index,
          code: 'duplicate-turn-id',
          detail: turnId,
        });
      } else {
        turnIds.add(turnId);
      }
    }

    const invariantIssues = assertTurnInvariants({
      index,
      result,
      openThreadsAfter,
    });
    for (const issue of invariantIssues) {
      failures.push({
        index,
        code: issue,
        detail: {
          runId: requestSeed.runId,
          turnId,
          triggerSource: requestSeed.triggerSource,
        },
      });
    }

    console.log(JSON.stringify({
      type: 'textplay.long-regression.turn',
      index,
      runId: row.runId,
      turnId: row.turnId,
      traceId: row.traceId,
      triggerSource: row.triggerSource,
      reasonCode: row.reasonCode,
      step: row.step,
      actionHint: row.actionHint,
      stepActionHint: row.stepActionHint,
      guardAdjustment: row.guardAdjustment,
      openThreadsBefore: row.openThreadsBefore.length,
      openThreadsAfter: row.openThreadsAfter.length,
      tensionBefore: row.tensionBefore,
      tensionAfter: row.tensionAfter,
      ok: row.ok,
    }));
  }

  const summary = {
    totalTurns: TURN_COUNT,
    successTurns: turns.filter((row) => row.ok).length,
    failureCount: failures.length,
    chainReasonHistogram: turns.reduce((acc, row) => {
      const key = row.chainReasonCode || 'none';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
    warningHistogram: turns.reduce((acc, row) => {
      for (const code of row.warningCodes) {
        acc[code] = (acc[code] || 0) + 1;
      }
      return acc;
    }, {}),
  };

  const report = {
    generatedAt: new Date().toISOString(),
    storyId: STORY_ID,
    worldId: WORLD_ID,
    playerId: PLAYER_ID,
    playerName: PLAYER_NAME,
    model: MODEL_ID,
    connectorId: CONNECTOR_ID,
    invariants: [
      'no-render-failure',
      'snapshot-completed',
      'opening-no-spoiler',
      'no-meta-leak',
      'open-thread-kept-alive',
      'no-duplicate-turn-id',
    ],
    summary,
    failures,
    turns,
  };

  const reportPath = await writeReport(report);
  console.log(JSON.stringify({
    type: 'textplay.long-regression.summary',
    reportPath,
    ...summary,
  }));

  if (failures.length > 0) {
    process.exitCode = 1;
    return;
  }
}

main().catch((error) => {
  console.error('textplay long regression failed', {
    message: error instanceof Error ? error.message : String(error || ''),
    chainReasonCode: TEXTPLAY_CHAIN_REASON.RENDER_FAILED,
    reasonCode: TEXTPLAY_REASON.PROMPT_BUILD_FAILED,
  });
  process.exitCode = 1;
});
