import test from 'node:test';
import assert from 'node:assert/strict';
import { VIDEOPLAY_OPERATION_TYPE, VIDEOPLAY_REASON } from '../src/contracts.ts';
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

test('generate-voice-line hard rejects route fallback and records audit details', async () => {
  const episode = makeEpisode();
  await assert.rejects(
    () => buildGeneratedVoiceAssets({
      runtimeClient: {
        route: {
          resolve: async ({ binding }) => ({
            source: binding?.source || 'local-runtime',
            connectorId: binding?.connectorId || '',
            model: binding?.model || '',
            provider: 'provider-main',
          }),
        },
        media: {
          tts: {
            listVoices: async () => ({
              voices: [
                { voiceId: 'voice-zh-1', lang: 'zh' },
              ],
              modelResolved: '',
              traceId: 'trace-voices-1',
            }),
          },
        },
      },
      aiClient: {
        checkRouteHealth: async ({ binding }) => {
          if (binding?.source === 'local-runtime') {
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
    }),
    (error) => {
      assert.equal(error?.reasonCode, VIDEOPLAY_REASON.ROUTE_UNAVAILABLE);
      assert.equal(error?.details?.fallbackAudit?.traceId, 'trace-voice-op-1');
      assert.equal(error?.details?.fallbackAudit?.from, 'local-runtime');
      assert.equal(error?.details?.fallbackAudit?.to, 'token-api');
      return true;
    },
  );
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
