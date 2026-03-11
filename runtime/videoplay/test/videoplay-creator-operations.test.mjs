import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCreatorOperation } from '../src/storage/operations.ts';
import { VIDEOPLAY_OPERATION_TYPE } from '../src/contracts.ts';

function makeEpisode() {
  const now = new Date().toISOString();
  return {
    episodeId: 'episode-1',
    storyId: 'story-1',
    sourceTurnIds: ['turn-1'],
    sourceEventIds: ['ev-1'],
    policyHash: 'policy-1',
    segmentationReason: 'target-duration-reached',
    screenplay: {
      episodeId: 'episode-1',
      clipPlans: [{ clipId: 'clip-1', title: 'clip', beatIds: ['beat-1'], sourceEventIds: ['ev-1'] }],
      beats: [{ beatId: 'beat-1', title: 'beat', summary: 'summary', sourceEventIds: ['ev-1'] }],
    },
    storyboard: {
      episodeId: 'episode-1',
      clipPlans: [{ clipId: 'clip-1', shotIds: ['shot-1'], sourceEventIds: ['ev-1'] }],
      shotPlans: [{
        shotId: 'shot-1',
        clipId: 'clip-1',
        beatId: 'beat-1',
        visualPrompt: 'visual',
        motionCue: 'static',
        continuityAnchors: ['anchor-1'],
        sourceEventIds: ['ev-1'],
        durationMs: 2000,
        startMs: 0,
        shotType: 'medium',
        cameraMove: 'static',
        photographyRule: {
          composition: 'center',
          lighting: 'natural',
          colorPalette: 'neutral',
          atmosphere: 'calm',
          technicalNotes: '',
        },
        actingDirection: { characters: [] },
        videoPrompt: 'visual',
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
      durationSec: 2,
      failReasonCode: null,
      characterConsistencyScore: 0.9,
      photographyComplianceScore: 0.9,
      actingQualityScore: 0.9,
      audioCompletenessRatio: 1,
    },
    candidateRelease: null,
    createdAt: now,
    updatedAt: now,
    editor: {
      activeBranchId: 'branch-main',
      branches: {
        'branch-main': {
          branchId: 'branch-main',
          name: 'main',
          headVersionId: 'v-1',
          createdAt: now,
        },
      },
      lineage: [{
        versionId: 'v-1',
        parentVersionId: null,
        branchId: 'branch-main',
        operationType: 'insert-shot',
        deltaSummary: 'bootstrap',
        operator: 'system',
        timestamp: now,
      }],
      conflictRecords: [],
    },
  };
}

test('select-candidate updates selected timeline segment', () => {
  const episode = makeEpisode();
  const result = applyCreatorOperation({
    episode,
    operationType: VIDEOPLAY_OPERATION_TYPE.SELECT_CANDIDATE,
    operator: 'creator',
    payload: {
      assetId: 'asset-1',
      shotId: 'shot-1',
      order: 0,
      trimInMs: 200,
      trimOutMs: 1800,
    },
    candidateSelection: {
      episodeId: 'episode-1',
      selectedAssetIds: [],
      timelineSegments: [],
    },
  });

  assert.ok(result.candidateSelection);
  assert.deepEqual(result.candidateSelection.selectedAssetIds, ['asset-1']);
  assert.equal(result.candidateSelection.timelineSegments[0].assetId, 'asset-1');
  assert.equal(result.candidateSelection.timelineSegments[0].trimInMs, 200);
  assert.equal(result.candidateSelection.timelineSegments[0].trimOutMs, 1800);
});

test('update-character-appearance appends appearance version', () => {
  const episode = makeEpisode();
  const result = applyCreatorOperation({
    episode,
    operationType: VIDEOPLAY_OPERATION_TYPE.UPDATE_CHARACTER_APPEARANCE,
    operator: 'creator',
    payload: {
      agentId: 'agent-1',
      description: 'new look',
      changeReason: 'creator-edit',
    },
    characterCasting: {
      storyId: 'story-1',
      characters: [{
        agentId: 'agent-1',
        name: 'Agent One',
        roleLevel: 'B',
        visualKeywords: ['heroic'],
        appearances: [{
          appearanceIndex: 0,
          description: 'old look',
          imageUrls: ['img://old'],
          selectedIndex: 0,
          changeReason: 'initial',
          previousImageUrl: null,
        }],
        activeAppearanceIndex: 0,
        referenceImageUri: 'img://old',
      }],
    },
  });

  assert.ok(result.characterCasting);
  assert.equal(result.characterCasting.characters[0].activeAppearanceIndex, 1);
  assert.equal(result.characterCasting.characters[0].appearances.length, 2);
  assert.equal(result.characterCasting.characters[0].appearances[1].description, 'new look');
});

test('audio design operations update bgm track and sfx layer', () => {
  const episode = makeEpisode();
  const baseAudioDesign = {
    episodeId: 'episode-1',
    bgmTrack: {
      trackId: 'bgm-old',
      uri: 'audio://bgm-old',
      durationMs: 10000,
      fadeInMs: 500,
      fadeOutMs: 1000,
      volume: 0.4,
      startOffsetMs: 0,
    },
    sfxLayers: [{
      sfxId: 'sfx-1',
      uri: 'audio://sfx-1',
      startMs: 100,
      endMs: 1000,
      volume: 0.3,
    }],
  };

  const bgmUpdated = applyCreatorOperation({
    episode,
    operationType: VIDEOPLAY_OPERATION_TYPE.SELECT_BGM_TRACK,
    operator: 'creator',
    payload: { trackId: 'bgm-new' },
    audioDesign: baseAudioDesign,
  });
  assert.ok(bgmUpdated.audioDesign);
  assert.equal(bgmUpdated.audioDesign.bgmTrack.trackId, 'bgm-new');

  const sfxUpdated = applyCreatorOperation({
    episode,
    operationType: VIDEOPLAY_OPERATION_TYPE.UPDATE_SFX_LAYER,
    operator: 'creator',
    payload: { sfxId: 'sfx-1', volume: 0.8 },
    audioDesign: baseAudioDesign,
  });
  assert.ok(sfxUpdated.audioDesign);
  assert.equal(sfxUpdated.audioDesign.sfxLayers[0].volume, 0.8);
});
