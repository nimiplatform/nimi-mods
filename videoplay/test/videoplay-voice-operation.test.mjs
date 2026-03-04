import test from 'node:test';
import assert from 'node:assert/strict';
import { VIDEOPLAY_OPERATION_TYPE } from '../src/contracts.ts';
import {
  buildGeneratedVoiceAssets,
  buildManualLipSyncAssets,
} from '../src/operations/voice-assets.ts';

function makeEpisode() {
  return {
    episodeId: 'episode-1',
    storyId: 'story-main',
    sourceTurnIds: ['turn-1'],
    sourceEventIds: ['ev-1'],
    policyHash: 'policy-hash',
    segmentationReason: 'window-exhausted',
    screenplay: {
      episodeId: 'episode-1',
      clipPlans: [{ clipId: 'clip-1', title: 'clip-1', beatIds: ['beat-1'], sourceEventIds: ['ev-1'] }],
      beats: [{ beatId: 'beat-1', title: 'beat-1', summary: 'line', sourceEventIds: ['ev-1'] }],
    },
    storyboard: {
      episodeId: 'episode-1',
      clipPlans: [{ clipId: 'clip-1', shotIds: ['shot-1'], sourceEventIds: ['ev-1'] }],
      shotPlans: [{
        shotId: 'shot-1',
        clipId: 'clip-1',
        beatId: 'beat-1',
        visualPrompt: 'shot visual',
        motionCue: 'static',
        continuityAnchors: [],
        sourceEventIds: ['ev-1'],
        durationMs: 2400,
        startMs: 0,
        shotType: 'medium',
        cameraMove: 'static',
        photographyRule: { composition: 'center', lighting: 'natural', colorPalette: 'neutral', atmosphere: 'calm', technicalNotes: '' },
        actingDirection: { characters: [] },
        videoPrompt: 'shot visual',
        characterIds: [],
        locationId: null,
      }],
      sourceEventIds: ['ev-1'],
    },
    quality: {
      status: 'APPROVED',
      gates: [],
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
      durationSec: 2.4,
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
          headVersionId: 'v-1',
          createdAt: new Date().toISOString(),
        },
      },
      lineage: [{
        versionId: 'v-1',
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
}

test('generate-voice-line produces real voice audio and fallback audit', async () => {
  const episode = makeEpisode();
  const result = await buildGeneratedVoiceAssets({
    hookClient: {
      llm: {
        speech: {
          listVoices: async () => ([
            { id: 'voice-zh-1', providerId: 'provider-main', lang: 'zh' },
          ]),
        },
      },
    },
    aiClient: {
      checkRouteHealth: async ({ routeOverride }) => {
        if (routeOverride?.source === 'local-runtime') {
          return { status: 'unhealthy', reasonCode: 'RUNTIME_ROUTE_DOWN' };
        }
        return { status: 'healthy', reasonCode: 'RUNTIME_ROUTE_HEALTHY' };
      },
      synthesizeSpeech: async () => ({
        audioUri: 'audio://voice-1',
        mimeType: 'audio/mpeg',
        durationMs: 2100,
      }),
    },
    traceId: 'trace-voice-op-1',
    episode,
    payload: {
      shotId: 'shot-1',
      voiceLine: '你好，这是测试台词',
      language: 'zh',
    },
  });

  const assetTypes = result.assets.map((asset) => asset.assetType);
  assert.ok(assetTypes.includes('voice-script'));
  assert.ok(assetTypes.includes('voice-audio'));
  assert.ok(assetTypes.includes('lip-sync'));
  const voice = result.assets.find((asset) => asset.assetType === 'voice-audio');
  assert.ok(voice);
  assert.equal(voice.uri, 'audio://voice-1');
  assert.equal(voice.routeSource, 'token-api');
  assert.ok(result.fallbackAudit);
  assert.equal(result.fallbackAudit.from, 'local-runtime');
  assert.equal(result.fallbackAudit.to, 'token-api');
});

test('apply-lip-sync operation emits deterministic lip-sync asset', () => {
  const episode = makeEpisode();
  const assets = buildManualLipSyncAssets({
    episode,
    operationType: VIDEOPLAY_OPERATION_TYPE.APPLY_LIP_SYNC,
    payload: {
      shotId: 'shot-1',
      anchors: [
        { t: 0, viseme: 'A' },
        { t: 800, viseme: 'O' },
      ],
    },
  });

  assert.equal(assets.length, 1);
  assert.equal(assets[0].assetType, 'lip-sync');
  assert.equal(assets[0].metadata.source, 'manual-lip-sync');
});
