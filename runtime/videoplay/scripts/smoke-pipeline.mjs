import { runVideoPlayEpisodeProduction } from '../src/pipeline/orchestrator.ts';
import {
  VIDEOPLAY_DATA_API_ASSET_BATCH_UPSERT,
  VIDEOPLAY_DATA_API_EPISODE_UPSERT,
  VIDEOPLAY_DATA_API_RELEASE_PUBLISH,
} from '../src/contracts.ts';

const SMOKE_FLAG = 'NIMI_VIDEOPLAY_SMOKE';

function nowIso() {
  return new Date().toISOString();
}

function makeTurn(turnId, turnIndex, eventId) {
  return {
    turnId,
    turnIndex,
    triggerSource: turnIndex % 2 === 0 ? 'UserTurn' : 'AgentInitiative',
    userMessage: `turn-${turnIndex}`,
    systemContext: { locale: 'zh' },
    spineEvents: [{ eventId, visibility: 'public', summary: `event-${eventId}` }],
    stateChanges: {},
    metrics: {},
  };
}

function makeStoryPackage() {
  const turns = [
    makeTurn('turn-1', 1, 'ev-1'),
    makeTurn('turn-2', 2, 'ev-2'),
    makeTurn('turn-3', 3, 'ev-3'),
    makeTurn('turn-4', 4, 'ev-4'),
    makeTurn('turn-5', 5, 'ev-5'),
  ];

  return {
    storyId: 'story.world-main.ev-1',
    worldId: 'world-main',
    entryEventId: 'ev-1',
    sourceMode: 'canonical-story',
    entry: {
      title: 'Smoke Story',
      summary: 'smoke summary',
      cause: 'cause',
      process: 'process',
      result: 'result',
      timeRef: 'now',
      locationRefs: ['scene-1'],
      characterRefs: ['agent-1', 'player-1'],
      recommendedSceneId: 'scene-1',
    },
    cast: {
      primaryAgentId: 'agent-1',
      participants: ['agent-1', 'player-1'],
    },
    materials: {
      lorebooks: [{ id: 'lore-1', key: 'lore-1', content: 'lore', score: 1 }],
      memories: ['memory-1'],
      scenes: [{ id: 'scene-1', name: 'Scene 1', description: 'desc', score: 1 }],
      contexts: [
        {
          id: 'ctx-canon',
          scope: 'CANON',
          scopeKey: 'world-main',
          storyId: null,
          narrativeSetting: {},
          narrativeState: {},
        },
        {
          id: 'ctx-story',
          scope: 'STORY',
          scopeKey: 'story.world-main.ev-1',
          storyId: 'story.world-main.ev-1',
          narrativeSetting: {},
          narrativeState: {},
        },
      ],
      recallSource: 'smoke',
    },
    narrativeScopes: {
      CANON: {},
      STORY: {},
      SUBJECT: {},
      RELATION: {},
    },
    turnWindow: {
      projectId: 'project-main',
      storyId: 'story.world-main.ev-1',
      ingestCursorStart: 'turn-0',
      turns,
    },
    projection: {
      events: turns.map((turn, index) => ({ id: `ev-${index + 1}`, turnId: turn.turnId })),
      triggerSource: 'UserTurn',
      userMessage: 'smoke',
      systemContext: { locale: 'zh' },
      worldStyle: { genre: 'short-drama' },
      agentAnchor: {},
      playerAnchor: {},
      sceneAnchor: {},
      metrics: {},
      sourceEventIds: ['ev-1', 'ev-2', 'ev-3', 'ev-4', 'ev-5'],
    },
    recommendedEntryTurn: {
      turnId: 'turn-5',
      createdAt: nowIso(),
      triggerSource: 'UserTurn',
    },
    windowPolicy: {
      maxTurns: 40,
      readLimit: 100,
      enrichedRequiredTriggerSources: ['UserTurn', 'AgentInitiative'],
    },
    snapshot: {
      storyId: 'story.world-main.ev-1',
      entryEventId: 'ev-1',
      primaryAgentId: 'agent-1',
      version: 'v1',
      source: 'smoke-fixture',
      loadedAt: nowIso(),
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

function createDeps() {
  const writes = {
    episodes: [],
    assets: [],
  };

  const hookClient = {
    data: {
      query: async ({ capability, query }) => {
        if (capability === VIDEOPLAY_DATA_API_EPISODE_UPSERT) {
          if (query.operation === 'upsert') {
            writes.episodes.push(query.episode);
            return { episode: query.episode };
          }
          if (
            query.operation === 'upsert-candidate-selection'
            || query.operation === 'upsert-audio-design'
            || query.operation === 'upsert-character-casting'
            || query.operation === 'upsert-scene-planning'
          ) {
            return { ok: true };
          }
        }

        if (capability === VIDEOPLAY_DATA_API_ASSET_BATCH_UPSERT && query.operation === 'upsert') {
          writes.assets.push(...query.assets);
          return {
            assetBatchResult: {
              episodeId: query.episodeId,
              writeCount: query.assets.length,
            },
          };
        }

        if (capability === VIDEOPLAY_DATA_API_RELEASE_PUBLISH && query.operation === 'publish') {
          return {
            releaseId: query.releasePackage?.releaseId || 'release-smoke-1',
            episodeId: query.episodeId,
            releasePackage: query.releasePackage,
          };
        }

        throw new Error(`VIDEOPLAY_SMOKE_UNSUPPORTED_CAPABILITY:${capability}`);
      },
    },
  };

  const runtimeClient = {
    route: {
      listOptions: async ({ capability }) => ({
        capability,
        selected: {
          source: 'local',
          connectorId: '',
          model: 'smoke-model',
        },
        resolvedDefault: {
          source: 'local',
          connectorId: '',
          model: 'smoke-model',
        },
        connectors: [],
        local: {
          models: [{ localModelId: 'm1', model: 'smoke-model' }],
        },
      }),
      resolve: async ({ binding }) => ({
        source: binding?.source || 'local',
        connectorId: binding?.connectorId || '',
        model: binding?.model || 'smoke-model',
        provider: 'provider-main',
      }),
    },
    media: {
      tts: {
        listVoices: async () => ({
          voices: [
            { voiceId: 'voice-zh-1', lang: 'zh' },
          ],
          modelResolved: 'smoke-model',
          traceId: 'trace-smoke-voices',
        }),
      },
    },
  };

  const aiClient = {
    checkRouteHealth: async () => ({
      status: 'healthy',
      reasonCode: 'RUNTIME_ROUTE_HEALTHY',
    }),
    generateText: async () => ({
      text: '{}',
      route: {
        source: 'local',
        connectorId: '',
        model: 'smoke-model',
      },
    }),
    generateImage: async () => ({
      images: [{ uri: 'image://smoke', mimeType: 'image/png' }],
      route: {
        source: 'local',
        connectorId: '',
        model: 'smoke-model',
      },
    }),
    generateVideo: async () => ({
      videos: [{ uri: 'video://smoke', mimeType: 'video/mp4' }],
      route: {
        source: 'local',
        connectorId: '',
        model: 'smoke-model',
      },
    }),
    synthesizeSpeech: async () => ({
      audioUri: 'audio://smoke',
      mimeType: 'audio/mpeg',
      durationMs: 2200,
      route: {
        source: 'local',
        connectorId: '',
        model: 'smoke-model',
      },
    }),
  };

  const narrativeEngine = {
    turnWindow: async () => {
      throw new Error('smoke-does-not-call-narrative-engine-turnWindow');
    },
    projectionRenderInput: async () => {
      throw new Error('smoke-does-not-call-narrative-engine-projectionRenderInput');
    },
  };

  return {
    deps: {
      hookClient,
      runtimeClient,
      aiClient,
      narrativeEngine,
    },
    writes,
  };
}

async function main() {
  if (process.env[SMOKE_FLAG] !== '1') {
    console.log(`videoplay smoke skipped (${SMOKE_FLAG}!=1)`);
    return;
  }

  const { deps, writes } = createDeps();
  const result = await runVideoPlayEpisodeProduction(deps, {
    projectId: 'project-main',
    storyId: 'story.world-main.ev-1',
    ingestCursorStart: 'turn-0',
    sourceMode: 'canonical-story',
    storyPackage: makeStoryPackage(),
    operator: 'smoke-runner',
  });

  if (result.status !== 'COMPLETED') {
    throw new Error(`VIDEOPLAY_SMOKE_STATUS_INVALID:${result.status}`);
  }
  if (result.releaseCandidates.length < 1) {
    throw new Error('VIDEOPLAY_SMOKE_RELEASE_EMPTY');
  }
  if (writes.episodes.length < 1 || writes.assets.length < 1) {
    throw new Error('VIDEOPLAY_SMOKE_PERSIST_EMPTY');
  }

  console.log('videoplay smoke passed', {
    runId: result.runId,
    traceId: result.traceId,
    releaseCandidates: result.releaseCandidates.length,
    persistedEpisodes: writes.episodes.length,
    persistedAssets: writes.assets.length,
  });
}

await main();
