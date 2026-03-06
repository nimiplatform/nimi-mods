import test from 'node:test';
import assert from 'node:assert/strict';
import {
  composeEpisode,
  evaluateQualityGates,
  invokeWithRouteFallback,
  runVideoPlayEpisodeProduction,
  segmentEpisodes,
} from '../src/pipeline/orchestrator.ts';
import {
  createInitialVideoPlayState,
  upsertEpisode,
} from '../src/storage/state.ts';
import { runPromptCanaryCases } from '../src/prompt/canary.ts';
import {
  VIDEOPLAY_REASON,
} from '../src/contracts.ts';

function makeTurn(turnId, turnIndex, eventId) {
  return {
    turnId,
    turnIndex,
    triggerSource: 'player',
    userMessage: `turn ${turnIndex}`,
    systemContext: { locale: 'zh' },
    spineEvents: [{ eventId, visibility: 'public', summary: `event ${eventId}` }],
    stateChanges: {},
    metrics: {},
  };
}

function makeSegmentationInput() {
  return {
    storyId: 'story-1',
    ingestCursorStart: 'turn-0',
    turns: [
      makeTurn('turn-1', 1, 'ev-1'),
      makeTurn('turn-2', 2, 'ev-2'),
      makeTurn('turn-3', 3, 'ev-3'),
    ],
    policy: {
      targetEpisodeDurationSec: 40,
      minEpisodeDurationSec: 15,
      maxEpisodeDurationSec: 120,
      maxTurnsPerEpisode: 3,
      suspenseCutRequired: true,
      hardBreakOnSystemEvent: false,
    },
  };
}

function makeStoryPackage(overrides = {}) {
  const turns = [
    makeTurn('turn-1', 1, 'ev-1'),
    makeTurn('turn-2', 2, 'ev-2'),
    makeTurn('turn-3', 3, 'ev-3'),
    makeTurn('turn-4', 4, 'ev-4'),
    makeTurn('turn-5', 5, 'ev-5'),
  ];
  turns[2].triggerSource = 'UserTurn';

  return {
    storyId: 'story-main',
    worldId: 'world-main',
    entryEventId: 'ev-1',
    sourceMode: 'canonical-story',
    entry: {
      title: 'Entry',
      summary: 'Entry summary',
      cause: 'cause',
      process: 'process',
      result: 'result',
      timeRef: 'time',
      locationRefs: ['scene-1'],
      characterRefs: ['agent-1', 'player-1'],
      recommendedSceneId: 'scene-1',
    },
    cast: {
      primaryAgentId: 'agent-1',
      participants: ['agent-1', 'player-1'],
    },
    materials: {
      lorebooks: [{ id: 'lore-1', key: 'lore-1', content: 'lore', score: 3 }],
      memories: ['memory-1'],
      scenes: [{ id: 'scene-1', name: 'Scene 1', description: 'desc', score: 5 }],
      contexts: [
        {
          id: 'ctx-canon',
          scope: 'CANON',
          scopeKey: 'world-main',
          storyId: null,
          narrativeSetting: { revealPolicy: 'strict' },
          narrativeState: {},
        },
        {
          id: 'ctx-story',
          scope: 'STORY',
          scopeKey: 'story-main',
          storyId: 'story-main',
          narrativeSetting: { phase: 'act1' },
          narrativeState: { tension: 0.4 },
        },
      ],
      recallSource: 'memory-recall',
    },
    narrativeScopes: {
      CANON: { revealPolicy: 'strict' },
      STORY: { phase: 'act1', tension: 0.4 },
      SUBJECT: {},
      RELATION: {},
    },
    turnWindow: {
      projectId: 'project-main',
      storyId: 'story-main',
      ingestCursorStart: 'turn-0',
      turns,
    },
    projection: {
      events: [{ id: 'ev-1' }, { id: 'ev-2' }, { id: 'ev-3' }, { id: 'ev-4' }, { id: 'ev-5' }],
      triggerSource: 'UserTurn',
      userMessage: 'hello',
      systemContext: { locale: 'zh' },
      worldStyle: { genre: 'drama' },
      agentAnchor: {},
      playerAnchor: {},
      sceneAnchor: {},
      metrics: {},
      sourceEventIds: ['ev-1', 'ev-2', 'ev-3', 'ev-4', 'ev-5'],
    },
    recommendedEntryTurn: {
      turnId: 'turn-5',
      triggerSource: 'UserTurn',
      createdAt: new Date().toISOString(),
    },
    windowPolicy: {
      maxTurns: 40,
      readLimit: 100,
      enrichedRequiredTriggerSources: ['UserTurn', 'AgentInitiative'],
    },
    snapshot: {
      storyId: 'story-main',
      entryEventId: 'ev-1',
      primaryAgentId: 'agent-1',
      version: 'vstory-fixed',
      source: 'test-fixture',
      loadedAt: new Date().toISOString(),
      contextCoverage: {
        canon: true,
        story: true,
        subject: true,
        relation: true,
        scene: true,
      },
      gapWarnings: [],
    },
    ...overrides,
  };
}

function makeQualityFixture(overrides = {}) {
  const episode = {
    episodeId: 'episode-1',
    sourceTurnRange: {
      startTurnId: 'turn-1',
      endTurnId: 'turn-2',
    },
    sourceTurnIds: ['turn-1', 'turn-2'],
    sourceEventIds: ['ev-1', 'ev-2'],
    segmentationReason: 'target-duration-reached',
    policyHash: 'policy-hash',
    turns: [
      makeTurn('turn-1', 1, 'ev-1'),
      makeTurn('turn-2', 2, 'ev-2'),
    ],
    estimatedDurationSec: 30,
  };

  const screenplay = {
    episodeId: 'episode-1',
    clipPlans: [{
      clipId: 'clip-1',
      title: 'Clip 1',
      beatIds: ['beat-1', 'beat-2'],
      sourceEventIds: ['ev-1', 'ev-2'],
    }],
    beats: [
      { beatId: 'beat-1', title: 'Beat 1', summary: 'A', sourceEventIds: ['ev-1'] },
      { beatId: 'beat-2', title: 'Beat 2', summary: 'B', sourceEventIds: ['ev-2'] },
    ],
  };

  const storyboard = {
    episodeId: 'episode-1',
    clipPlans: [{
      clipId: 'clip-1',
      shotIds: ['shot-1', 'shot-2'],
      sourceEventIds: ['ev-1', 'ev-2'],
    }],
    shotPlans: [
      {
        shotId: 'shot-1',
        clipId: 'clip-1',
        beatId: 'beat-1',
        visualPrompt: 'A',
        motionCue: 'static',
        continuityAnchors: ['a'],
        sourceEventIds: ['ev-1'],
        durationMs: 8000,
        startMs: 0,
        shotType: 'medium',
        cameraMove: 'static',
        photographyRule: { composition: 'center', lighting: 'natural', colorPalette: 'neutral', atmosphere: 'calm', technicalNotes: '' },
        actingDirection: { characters: [] },
        videoPrompt: 'A',
        characterIds: [],
        locationId: null,
      },
      {
        shotId: 'shot-2',
        clipId: 'clip-1',
        beatId: 'beat-2',
        visualPrompt: 'B',
        motionCue: 'static',
        continuityAnchors: ['b'],
        sourceEventIds: ['ev-2'],
        durationMs: 9000,
        startMs: 8000,
        shotType: 'medium',
        cameraMove: 'static',
        photographyRule: { composition: 'center', lighting: 'natural', colorPalette: 'neutral', atmosphere: 'calm', technicalNotes: '' },
        actingDirection: { characters: [] },
        videoPrompt: 'B',
        characterIds: [],
        locationId: null,
      },
    ],
    sourceEventIds: ['ev-1', 'ev-2'],
  };

  const composeOutput = {
    episodeTimeline: [
      {
        assetId: 'asset-1',
        clipId: 'clip-1',
        shotId: 'shot-1',
        startMs: 0,
        endMs: 8000,
        trimInMs: null,
        trimOutMs: null,
        uri: 'video://1',
        sourceEventIds: ['ev-1'],
        transitionIn: null,
        transitionOut: null,
      },
      {
        assetId: 'asset-2',
        clipId: 'clip-1',
        shotId: 'shot-2',
        startMs: 8000,
        endMs: 17000,
        trimInMs: null,
        trimOutMs: null,
        uri: 'video://2',
        sourceEventIds: ['ev-2'],
        transitionIn: null,
        transitionOut: null,
      },
    ],
    episodeMasterVideo: {
      uri: 'video://master',
      mimeType: 'video/mp4',
      durationMs: 17000,
      timelineHash: 'timeline-hash',
    },
    episodePoster: {
      uri: 'image://poster',
      mimeType: 'image/png',
    },
    episodeCaptionTrack: {
      uri: 'caption://vtt',
      mimeType: 'text/vtt',
      lines: [
        { startMs: 0, endMs: 8000, text: 'a' },
        { startMs: 8000, endMs: 17000, text: 'b' },
      ],
    },
    composeTrace: {
      avDriftMs: 20,
      blackGapMs: 0,
      exportSpec: {
        videoCodec: 'H.264',
        audioCodec: 'AAC',
        container: 'mp4',
      },
    },
    bgmTrack: null,
    sfxLayers: [],
    subtitleOverlay: null,
  };

  const assetOutput = {
    episodeId: 'episode-1',
    clipAssets: [],
    shotAssets: [
      {
        assetId: 'asset-1',
        episodeId: 'episode-1',
        shotId: 'shot-1',
        clipId: 'clip-1',
        assetType: 'video',
        uri: 'video://1',
        mimeType: 'video/mp4',
        durationMs: 8000,
        fps: 30,
        resolution: '1920x1080',
        sourceEventIds: ['ev-1'],
        routeSource: 'local-runtime',
        metadata: {},
      },
      {
        assetId: 'asset-2',
        episodeId: 'episode-1',
        shotId: 'shot-2',
        clipId: 'clip-1',
        assetType: 'video',
        uri: 'video://2',
        mimeType: 'video/mp4',
        durationMs: 9000,
        fps: 30,
        resolution: '1920x1080',
        sourceEventIds: ['ev-2'],
        routeSource: 'local-runtime',
        metadata: {},
      },
    ],
    sourceEventMap: {
      'shot-1': ['ev-1'],
      'shot-2': ['ev-2'],
    },
    renderTrace: {},
    coverage: {
      plannedShots: 2,
      renderedShots: 2,
      ratio: 1,
      plannedVoiceShots: 2,
      renderedVoiceShots: 2,
      voiceRatio: 1,
    },
  };

  return {
    baselineSourceEventIds: new Set(['ev-1', 'ev-2']),
    episode,
    screenplay,
    storyboard,
    assetOutput,
    composeOutput,
    ...overrides,
  };
}

function createPipelineDeps(options = {}) {
  const writes = {
    episodes: [],
    assets: [],
  };

  const hookClient = {
    data: {
      query: async ({ capability, query }) => {
        if (capability === 'data-api.videoplay.episode.upsert') {
          if (query.operation === 'upsert') {
            writes.episodes.push(query.episode);
            return { episode: query.episode };
          }
          if (query.operation === 'upsert-candidate-selection' || query.operation === 'upsert-audio-design' || query.operation === 'upsert-character-casting' || query.operation === 'upsert-scene-planning') {
            return { ok: true };
          }
        }

        if (capability === 'data-api.videoplay.asset.batch-upsert' && query.operation === 'upsert') {
          writes.assets.push(...query.assets);
          return {
            assetBatchResult: {
              episodeId: query.episodeId,
              writeCount: query.assets.length,
            },
          };
        }

        if (capability === 'data-api.core.agent.memory.recall.for-entity') {
          return { items: [{ content: 'mock memory' }], core: [], e2e: [], recallSource: 'mock' };
        }

        throw new Error(`unhandled capability: ${capability}`);
      },
    },
  };

  const runtimeClient = {
    route: {
      listOptions: async ({ capability }) => ({
        capability,
        selected: {
          source: 'local-runtime',
          connectorId: '',
          model: 'mock-model',
        },
        resolvedDefault: {
          source: 'local-runtime',
          connectorId: '',
          model: 'mock-model',
        },
        connectors: [],
        localRuntime: {
          models: [{ localModelId: 'm1', model: 'mock-model' }],
        },
      }),
      resolve: async ({ binding }) => ({
        source: binding?.source || 'local-runtime',
        connectorId: binding?.connectorId || '',
        model: binding?.model || 'mock-model',
        provider: 'provider-main',
      }),
    },
    media: {
      tts: {
        listVoices: async () => ({
          voices: typeof options.listVoices === 'function'
            ? options.listVoices().map((voice) => ({
              voiceId: voice.id,
              lang: voice.lang,
            }))
            : [
              { voiceId: 'voice-zh-1', lang: 'zh' },
              { voiceId: 'voice-en-1', lang: 'en' },
            ],
          modelResolved: 'mock-model',
          traceId: 'trace-voices-1',
        }),
      },
    },
  };

  const narrativeEngine = {
    turnWindow: async () => ({
      projectId: 'project-main',
      storyId: 'story-main',
      ingestCursorStart: 'turn-0',
      turns: [
        makeTurn('turn-1', 1, 'ev-1'),
        makeTurn('turn-2', 2, 'ev-2'),
        makeTurn('turn-3', 3, 'ev-3'),
        makeTurn('turn-4', 4, 'ev-4'),
        makeTurn('turn-5', 5, 'ev-5'),
      ],
    }),
    projectionRenderInput: async () => ({
      events: [{ id: 'ev-1' }, { id: 'ev-2' }, { id: 'ev-3' }, { id: 'ev-4' }, { id: 'ev-5' }],
      triggerSource: 'player',
      userMessage: 'hello',
      systemContext: { locale: 'zh' },
      worldStyle: { genre: 'drama' },
      agentAnchor: {},
      playerAnchor: {},
      sceneAnchor: {},
      metrics: {},
      sourceEventIds: ['ev-1', 'ev-2', 'ev-3', 'ev-4', 'ev-5'],
    }),
  };

  const aiClient = {
    checkRouteHealth: async ({ capability, binding }) => {
      if (typeof options.checkRouteHealth === 'function') {
        return options.checkRouteHealth({ capability, binding });
      }
      if (binding?.source === 'local-runtime') {
        return {
          status: 'healthy',
          reasonCode: 'RUNTIME_ROUTE_HEALTHY',
        };
      }
      return {
        status: 'healthy',
        reasonCode: 'RUNTIME_ROUTE_HEALTHY',
      };
    },
    generateText: async () => ({ text: '{}', route: { source: 'local-runtime', connectorId: '', model: 'mock-model' } }),
    generateImage: async () => ({ images: [{ uri: 'image://x', mimeType: 'image/png' }], route: { source: 'local-runtime', connectorId: '', model: 'mock-model' } }),
    generateVideo: async () => ({ videos: [{ uri: 'video://x', mimeType: 'video/mp4' }], route: { source: 'local-runtime', connectorId: '', model: 'mock-model' } }),
    synthesizeSpeech: async () => ({
      ...(typeof options.synthesizeSpeech === 'function'
        ? await options.synthesizeSpeech()
        : {
          audioUri: 'audio://x',
          mimeType: 'audio/mpeg',
          durationMs: 3000,
          route: { source: 'local-runtime', connectorId: '', model: 'mock-model' },
        }),
    }),
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

test('segmentation is deterministic with same input and policy', () => {
  const input = makeSegmentationInput();
  const first = segmentEpisodes(input);
  const second = segmentEpisodes(input);
  assert.deepEqual(first, second);
});

test('sourceEventIds out-of-baseline fails close in quality gate', () => {
  const fixture = makeQualityFixture({
    storyboard: {
      episodeId: 'episode-1',
      clipPlans: [{ clipId: 'clip-1', shotIds: ['shot-1'], sourceEventIds: ['ev-999'] }],
      shotPlans: [{
        shotId: 'shot-1',
        clipId: 'clip-1',
        beatId: 'beat-1',
        visualPrompt: 'bad',
        motionCue: 'static',
        continuityAnchors: [],
        sourceEventIds: ['ev-999'],
        durationMs: 17000,
        startMs: 0,
        shotType: 'medium',
        cameraMove: 'static',
        photographyRule: { composition: 'center', lighting: 'natural', colorPalette: 'neutral', atmosphere: 'calm', technicalNotes: '' },
        actingDirection: { characters: [] },
        videoPrompt: 'bad',
        characterIds: [],
        locationId: null,
      }],
      sourceEventIds: ['ev-999'],
    },
    assetOutput: {
      episodeId: 'episode-1',
      clipAssets: [],
      shotAssets: [],
      sourceEventMap: {},
      renderTrace: {},
      coverage: {
        plannedShots: 1,
        renderedShots: 1,
        ratio: 1,
        plannedVoiceShots: 1,
        renderedVoiceShots: 1,
        voiceRatio: 1,
      },
    },
  });

  const report = evaluateQualityGates(fixture);
  assert.equal(report.status, 'REJECTED');
  assert.equal(report.failReasonCode, VIDEOPLAY_REASON.QC_FAILED);
});

test('route fallback audit fields are complete', async () => {
  const result = await invokeWithRouteFallback({
    stage: 'screenplay',
    capability: 'text.generate',
    traceId: 'trace-1',
    checkHealth: async (_capability, binding) => {
      if (binding?.source === 'local-runtime') {
        return { status: 'unhealthy', reasonCode: 'RUNTIME_ROUTE_DOWN' };
      }
      return { status: 'healthy', reasonCode: 'RUNTIME_ROUTE_HEALTHY' };
    },
    invoke: async () => ({ ok: true }),
  });

  assert.equal(result.routeSource, 'token-api');
  assert.ok(result.fallbackAudit);
  assert.equal(result.fallbackAudit.traceId, 'trace-1');
  assert.equal(result.fallbackAudit.stage, 'screenplay');
  assert.equal(result.fallbackAudit.capability, 'text.generate');
  assert.equal(result.fallbackAudit.from, 'local-runtime');
  assert.equal(result.fallbackAudit.to, 'token-api');
  assert.ok(result.fallbackAudit.reason.length > 0);
});

test('idempotent replay does not duplicate episode write side effects', () => {
  const state = createInitialVideoPlayState();
  const episode = {
    episodeId: 'episode-1',
    storyId: 'story-1',
    sourceTurnIds: ['turn-1'],
    sourceEventIds: ['ev-1'],
    policyHash: 'hash',
    segmentationReason: 'window-exhausted',
    screenplay: {
      episodeId: 'episode-1',
      clipPlans: [{ clipId: 'clip-1', title: 'clip', beatIds: ['beat-1'], sourceEventIds: ['ev-1'] }],
      beats: [{ beatId: 'beat-1', title: 'beat', summary: 'sum', sourceEventIds: ['ev-1'] }],
    },
    storyboard: {
      episodeId: 'episode-1',
      clipPlans: [{ clipId: 'clip-1', shotIds: ['shot-1'], sourceEventIds: ['ev-1'] }],
      shotPlans: [{
        shotId: 'shot-1',
        clipId: 'clip-1',
        beatId: 'beat-1',
        visualPrompt: 'v',
        motionCue: 'm',
        continuityAnchors: ['a'],
        sourceEventIds: ['ev-1'],
        durationMs: 17000,
        startMs: 0,
        shotType: 'medium',
        cameraMove: 'static',
        photographyRule: { composition: 'center', lighting: 'natural', colorPalette: 'neutral', atmosphere: 'calm', technicalNotes: '' },
        actingDirection: { characters: [] },
        videoPrompt: 'v',
        characterIds: [],
        locationId: null,
      }],
      sourceEventIds: ['ev-1'],
    },
    quality: {
      status: 'APPROVED',
      gates: [{ gate: 'grounded_ratio', passed: true, value: 1, min: 0.98, max: null, reasonCode: 'VIDEOPLAY_QC_FAILED' }],
      groundedRatio: 1,
      assetCoverageRatio: 1,
      voiceCoverageRatio: 1,
      visualAttractionScore: 0.9,
      visualAttractionComponents: {
        characterConsistency: 0.9,
        motionContinuity: 0.9,
        compositionReadability: 0.9,
        lightColorCoherence: 0.9,
      },
      avDriftMs: 0,
      durationSec: 17,
      failReasonCode: null,
      characterConsistencyScore: 0.9,
      photographyComplianceScore: 0.9,
      actingQualityScore: 0.9,
      audioCompletenessRatio: 1,
    },
    candidateRelease: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    editor: {
      activeBranchId: 'branch-1',
      branches: {
        'branch-1': {
          branchId: 'branch-1',
          name: 'main',
          headVersionId: 'v1',
          createdAt: new Date().toISOString(),
        },
      },
      lineage: [{
        versionId: 'v1',
        parentVersionId: null,
        branchId: 'branch-1',
        operationType: 'insert-shot',
        deltaSummary: 'bootstrap',
        operator: 'system',
        timestamp: new Date().toISOString(),
      }],
      conflictRecords: [],
    },
  };

  upsertEpisode(state, {
    idempotencyKey: 'same-key',
    episode,
  });
  upsertEpisode(state, {
    idempotencyKey: 'same-key',
    episode,
  });

  assert.equal(Object.keys(state.episodesById).length, 1);
});

test('compose requires selected timeline segments', () => {
  assert.throws(() => composeEpisode({
    episodeId: 'episode-1',
    storyboard: {
      episodeId: 'episode-1',
      clipPlans: [{ clipId: 'clip-1', shotIds: ['shot-1', 'shot-2'], sourceEventIds: ['ev-1'] }],
      shotPlans: [
        {
          shotId: 'shot-1',
          clipId: 'clip-1',
          beatId: 'beat-1',
          visualPrompt: 'a',
          motionCue: 'm',
          continuityAnchors: [],
          sourceEventIds: ['ev-1'],
          durationMs: 5000,
          startMs: 0,
          shotType: 'medium',
          cameraMove: 'static',
          photographyRule: { composition: 'center', lighting: 'natural', colorPalette: 'neutral', atmosphere: 'calm', technicalNotes: '' },
          actingDirection: { characters: [] },
          videoPrompt: 'a',
          characterIds: [],
          locationId: null,
        },
        {
          shotId: 'shot-2',
          clipId: 'clip-1',
          beatId: 'beat-2',
          visualPrompt: 'b',
          motionCue: 'm',
          continuityAnchors: [],
          sourceEventIds: ['ev-1'],
          durationMs: 5000,
          startMs: 1000,
          shotType: 'medium',
          cameraMove: 'static',
          photographyRule: { composition: 'center', lighting: 'natural', colorPalette: 'neutral', atmosphere: 'calm', technicalNotes: '' },
          actingDirection: { characters: [] },
          videoPrompt: 'b',
          characterIds: [],
          locationId: null,
        },
      ],
      sourceEventIds: ['ev-1'],
    },
    assetOutput: {
      episodeId: 'episode-1',
      clipAssets: [],
      shotAssets: [
        {
          assetId: 'asset-1',
          episodeId: 'episode-1',
          shotId: 'shot-1',
          clipId: 'clip-1',
          assetType: 'video',
          uri: 'video://1',
          mimeType: 'video/mp4',
          durationMs: 5000,
          fps: 30,
          resolution: '1920x1080',
          sourceEventIds: ['ev-1'],
          routeSource: 'local-runtime',
          metadata: {},
        },
        {
          assetId: 'asset-2',
          episodeId: 'episode-1',
          shotId: 'shot-2',
          clipId: 'clip-1',
          assetType: 'video',
          uri: 'video://2',
          mimeType: 'video/mp4',
          durationMs: 5000,
          fps: 30,
          resolution: '1920x1080',
          sourceEventIds: ['ev-1'],
          routeSource: 'local-runtime',
          metadata: {},
        },
      ],
      sourceEventMap: {
        'shot-1': ['ev-1'],
        'shot-2': ['ev-1'],
      },
      renderTrace: {},
      coverage: {
        plannedShots: 2,
        renderedShots: 2,
        ratio: 1,
        plannedVoiceShots: 2,
        renderedVoiceShots: 2,
        voiceRatio: 1,
      },
    },
    candidateSelection: {
      episodeId: 'episode-1',
      selectedAssetIds: [],
      timelineSegments: [],
    },
  }), /VIDEOPLAY_SELECTED_SEGMENTS_EMPTY/);
});

test('AV drift above 80ms is rejected by QC', () => {
  const fixture = makeQualityFixture({
    composeOutput: {
      ...makeQualityFixture().composeOutput,
      composeTrace: {
        ...makeQualityFixture().composeOutput.composeTrace,
        avDriftMs: 120,
      },
    },
  });

  const report = evaluateQualityGates(fixture);
  assert.equal(report.status, 'REJECTED');
  assert.equal(report.failReasonCode, VIDEOPLAY_REASON.AV_SYNC_DRIFT);
});

test('visual attraction below threshold is rejected by QC', () => {
  const fixture = makeQualityFixture();
  const report = evaluateQualityGates({
    ...fixture,
    forceVisualAttractionScore: 0.5,
  });
  assert.equal(report.status, 'REJECTED');
  assert.equal(report.failReasonCode, VIDEOPLAY_REASON.VISUAL_ATTRACTION_LOW);
});

test('asset coverage below 0.90 is rejected by QC', () => {
  const fixture = makeQualityFixture({
    assetOutput: {
      ...makeQualityFixture().assetOutput,
      coverage: {
        plannedShots: 10,
        renderedShots: 5,
        ratio: 0.5,
        plannedVoiceShots: 10,
        renderedVoiceShots: 5,
        voiceRatio: 0.5,
      },
    },
  });

  const report = evaluateQualityGates(fixture);
  assert.equal(report.status, 'REJECTED');
  assert.equal(report.failReasonCode, VIDEOPLAY_REASON.COVERAGE_LOW);
});

test('voice coverage below 0.90 is rejected by QC', () => {
  const fixture = makeQualityFixture({
    assetOutput: {
      ...makeQualityFixture().assetOutput,
      coverage: {
        plannedShots: 2,
        renderedShots: 2,
        ratio: 1,
        plannedVoiceShots: 2,
        renderedVoiceShots: 1,
        voiceRatio: 0.5,
      },
    },
  });

  const report = evaluateQualityGates(fixture);
  assert.equal(report.status, 'REJECTED');
  assert.equal(report.failReasonCode, VIDEOPLAY_REASON.VOICE_RENDER_FAILED);
});

test('asset render emits analysis/queue trace and voice assets', async () => {
  const { deps, writes } = createPipelineDeps();
  const result = await runVideoPlayEpisodeProduction(deps, {
    projectId: 'project-main',
    storyId: 'story-main',
    ingestCursorStart: 'turn-0',
    sourceMode: 'canonical-story',
    storyPackage: makeStoryPackage(),
  });

  assert.equal(result.status, 'COMPLETED');
  assert.ok(result.episodes.length > 0);
  const analysis = result.runEvents.find(
    (event) => event.step === 'asset-render' && event.details?.phase === 'batch-queue-execute',
  );
  assert.ok(analysis, 'asset-render batch queue trace missing');
  const voiceBatchEvents = result.runEvents.filter(
    (event) => event.step === 'asset-render' && event.details?.modality === 'voice',
  );
  assert.ok(voiceBatchEvents.length > 0, 'voice batch events missing');
  const subflowPhases = [];
  for (const event of result.runEvents) {
    if (event.step !== 'asset-render') {
      continue;
    }
    const phase = String(event.details?.phase || '');
    if (
      phase
      && ['voice-analyze', 'voice-render', 'lip-sync', 'video-render'].includes(phase)
      && !subflowPhases.includes(phase)
    ) {
      subflowPhases.push(phase);
    }
  }
  assert.deepEqual(
    subflowPhases.slice(0, 4),
    ['voice-analyze', 'voice-render', 'lip-sync', 'video-render'],
  );
  const voiceAssets = writes.assets.filter((asset) => asset.assetType === 'voice-audio');
  assert.ok(voiceAssets.length > 0, 'voice audio assets missing');
  const lipSyncAssets = writes.assets.filter((asset) => asset.assetType === 'lip-sync');
  assert.ok(lipSyncAssets.length > 0, 'lip sync assets missing');
});

test('voice route fallback is audited in pipeline', async () => {
  const { deps } = createPipelineDeps({
    checkRouteHealth: ({ capability, binding }) => {
      if (capability === 'audio.synthesize' && binding?.source === 'local-runtime') {
        return { status: 'unhealthy', reasonCode: 'RUNTIME_ROUTE_DOWN' };
      }
      return { status: 'healthy', reasonCode: 'RUNTIME_ROUTE_HEALTHY' };
    },
  });

  const result = await runVideoPlayEpisodeProduction(deps, {
    projectId: 'project-main',
    storyId: 'story-main',
    ingestCursorStart: 'turn-0',
    sourceMode: 'canonical-story',
    storyPackage: makeStoryPackage(),
  });

  const voiceFallback = result.fallbackAudits.find((item) => item.stage === 'asset-render-voice');
  assert.ok(voiceFallback);
  assert.equal(voiceFallback.from, 'local-runtime');
  assert.equal(voiceFallback.to, 'token-api');
  assert.equal(voiceFallback.capability, 'audio.synthesize');
});

test('release package contains mandatory minimum fields', async () => {
  const { deps } = createPipelineDeps();
  const result = await runVideoPlayEpisodeProduction(deps, {
    projectId: 'project-main',
    storyId: 'story-main',
    ingestCursorStart: 'turn-0',
    sourceMode: 'canonical-story',
    storyPackage: makeStoryPackage(),
  });

  assert.equal(result.releaseCandidates.length > 0, true);
  const pkg = result.releaseCandidates[0];
  assert.ok(pkg.episodeMasterVideo);
  assert.ok(pkg.episodePoster);
  assert.ok(pkg.episodeCaptionTrack);
  assert.ok(pkg.episodeMetadata);
  assert.ok(pkg.episodeTraceBundle);
  assert.equal(pkg.published, false);
});

test('run blocks when story package is missing', async () => {
  const { deps } = createPipelineDeps();
  await assert.rejects(
    runVideoPlayEpisodeProduction(deps, {
      projectId: 'project-main',
      storyId: 'story-main',
      ingestCursorStart: 'turn-0',
      sourceMode: 'canonical-story',
    }),
    /VIDEOPLAY_STORY_PACKAGE_SCHEMA_INVALID/,
  );
});

test('stepwise run pauses with checkpoint metadata', async () => {
  const { deps } = createPipelineDeps();
  const result = await runVideoPlayEpisodeProduction(deps, {
    projectId: 'project-main',
    storyId: 'story-main',
    ingestCursorStart: 'turn-0',
    sourceMode: 'canonical-story',
    storyPackage: makeStoryPackage(),
    execution: {
      mode: 'stepwise',
      stepBudget: 1,
    },
  });

  assert.equal(result.status, 'PAUSED');
  assert.equal(result.nextStep, 'character-casting');
  const ingest = result.stageProgress.find((item) => item.step === 'narrative-ingest');
  assert.ok(ingest);
  assert.equal(ingest.status, 'COMPLETED');
  assert.ok(ingest.checkpointToken);
  assert.ok(ingest.stepInputHash);
});

test('continue from checkpoint advances the next stage only', async () => {
  const { deps } = createPipelineDeps();
  const first = await runVideoPlayEpisodeProduction(deps, {
    projectId: 'project-main',
    storyId: 'story-main',
    ingestCursorStart: 'turn-0',
    sourceMode: 'canonical-story',
    storyPackage: makeStoryPackage(),
    execution: {
      mode: 'stepwise',
      stepBudget: 1,
    },
  });

  const second = await runVideoPlayEpisodeProduction(deps, {
    projectId: 'project-main',
    storyId: 'story-main',
    ingestCursorStart: 'turn-0',
    sourceMode: 'canonical-story',
    storyPackage: makeStoryPackage(),
    execution: {
      mode: 'stepwise',
      stepBudget: 1,
      checkpoint: first.checkpoint,
    },
  });

  assert.equal(second.runId, first.runId);
  assert.equal(second.status, 'PAUSED');
  assert.equal(second.nextStep, 'scene-planning');
  const casted = second.stageProgress.find((item) => item.step === 'character-casting');
  assert.ok(casted);
  assert.equal(casted.status, 'COMPLETED');
});

test('rerun step invalidates downstream and increments attempt', async () => {
  const { deps } = createPipelineDeps();
  const full = await runVideoPlayEpisodeProduction(deps, {
    projectId: 'project-main',
    storyId: 'story-main',
    ingestCursorStart: 'turn-0',
    sourceMode: 'canonical-story',
    storyPackage: makeStoryPackage(),
  });

  const rerun = await runVideoPlayEpisodeProduction(deps, {
    projectId: 'project-main',
    storyId: 'story-main',
    ingestCursorStart: 'turn-0',
    sourceMode: 'canonical-story',
    storyPackage: makeStoryPackage(),
    execution: {
      mode: 'stepwise',
      stepBudget: 1,
      checkpoint: full.checkpoint,
      rerunStep: 'screenplay',
    },
  });

  assert.equal(rerun.status, 'PAUSED');
  assert.equal(rerun.nextStep, 'storyboard');
  const screenplay = rerun.stageProgress.find((item) => item.step === 'screenplay');
  assert.ok(screenplay);
  assert.equal(screenplay.attempt, 2);
  assert.equal(screenplay.status, 'COMPLETED');

  const storyboard = rerun.stageProgress.find((item) => item.step === 'storyboard');
  assert.ok(storyboard);
  assert.equal(storyboard.status, 'PAUSED');
  assert.equal(storyboard.checkpointToken, null);
});

test('resume hash mismatch fails close', async () => {
  const { deps } = createPipelineDeps();
  const first = await runVideoPlayEpisodeProduction(deps, {
    projectId: 'project-main',
    storyId: 'story-main',
    ingestCursorStart: 'turn-0',
    sourceMode: 'canonical-story',
    storyPackage: makeStoryPackage(),
    execution: {
      mode: 'stepwise',
      stepBudget: 1,
    },
  });

  const brokenCheckpoint = JSON.parse(JSON.stringify(first.checkpoint));
  brokenCheckpoint.stageProgress = brokenCheckpoint.stageProgress.map((item) => (
    item.step === 'narrative-ingest'
      ? { ...item, stepInputHash: 'broken-hash' }
      : item
  ));

  await assert.rejects(
    runVideoPlayEpisodeProduction(deps, {
      projectId: 'project-main',
      storyId: 'story-main',
      ingestCursorStart: 'turn-0',
      sourceMode: 'canonical-story',
      storyPackage: makeStoryPackage(),
      execution: {
        mode: 'stepwise',
        stepBudget: 1,
        checkpoint: brokenCheckpoint,
      },
    }),
    (error) => {
      assert.equal(error.reasonCode, VIDEOPLAY_REASON.STEP_RESUME_HASH_MISMATCH);
      return true;
    },
  );
});

test('cancel run enters terminal canceled state', async () => {
  const { deps } = createPipelineDeps();
  const result = await runVideoPlayEpisodeProduction(deps, {
    projectId: 'project-main',
    storyId: 'story-main',
    ingestCursorStart: 'turn-0',
    sourceMode: 'canonical-story',
    storyPackage: makeStoryPackage(),
    execution: {
      mode: 'stepwise',
      stepBudget: 1,
      shouldCancel: () => true,
    },
  });

  assert.equal(result.status, 'CANCELED');
  assert.equal(result.runEvents.some((event) => event.eventType === 'run.canceled'), true);
});

test('prompt canary covers shape/locale-parity/registry-drift cases', () => {
  const report = runPromptCanaryCases();
  assert.equal(report.ok, true);
  assert.equal(report.failures.length, 0);
  const requiredCaseIds = [
    'VPROMPT-001-STORYBOARD-PLAN-SHAPE',
    'VPROMPT-002-SHOT-REWRITE-SHAPE',
    'VPROMPT-003-VARIANT-GENERATE-SHAPE',
    'VPROMPT-004-PLACEHOLDER-PARITY-ZH-EN',
    'VPROMPT-005-VARIABLE-SCHEMA-VALIDATION',
    'VPROMPT-006-CATALOG-TEMPLATE-DRIFT',
    'VPROMPT-007-CHARACTER-VISUAL-SHAPE',
    'VPROMPT-008-SCENE-DESCRIPTION-SHAPE',
    'VPROMPT-009-CINEMATOGRAPHY-SHAPE',
    'VPROMPT-010-ACTING-SHAPE',
    'VPROMPT-011-DETAIL-SHAPE',
    'VPROMPT-012-AUDIO-DESIGN-SHAPE',
  ];
  for (const caseId of requiredCaseIds) {
    assert.ok(report.executedCaseIds.includes(caseId), `missing case: ${caseId}`);
  }
});
