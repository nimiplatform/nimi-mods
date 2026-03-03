import test from 'node:test';
import assert from 'node:assert/strict';
import { invokeWithRouteFallback } from '../src/pipeline/orchestrator.ts';
import {
  createInitialVideoPlayState,
  listReleases,
  loadVideoPlayState,
  publishRelease,
  saveVideoPlayState,
  upsertAssets,
  upsertEpisode,
} from '../src/storage/state.ts';
import {
  VIDEOPLAY_REASON,
  VIDEOPLAY_STORAGE_KEY,
} from '../src/contracts.ts';

function nowIso() {
  return new Date().toISOString();
}

function makeEpisodeRecord(overrides = {}) {
  const now = nowIso();
  return {
    episodeId: 'episode-1',
    storyId: 'story.world-main.ev-1',
    sourceTurnIds: ['turn-1'],
    sourceEventIds: ['ev-1'],
    policyHash: 'policy-hash',
    segmentationReason: 'target-duration-reached',
    screenplay: {
      episodeId: 'episode-1',
      clipPlans: [
        {
          clipId: 'clip-1',
          title: 'clip',
          beatIds: ['beat-1'],
          sourceEventIds: ['ev-1'],
        },
      ],
      beats: [
        {
          beatId: 'beat-1',
          title: 'beat',
          summary: 'summary',
          sourceEventIds: ['ev-1'],
        },
      ],
    },
    storyboard: {
      episodeId: 'episode-1',
      clipPlans: [
        {
          clipId: 'clip-1',
          shotIds: ['shot-1'],
          sourceEventIds: ['ev-1'],
        },
      ],
      shotPlans: [
        {
          shotId: 'shot-1',
          clipId: 'clip-1',
          beatId: 'beat-1',
          visualPrompt: 'visual',
          motionCue: 'motion',
          continuityAnchors: ['anchor-1'],
          sourceEventIds: ['ev-1'],
          durationMs: 2400,
        },
      ],
      sourceEventIds: ['ev-1'],
    },
    quality: {
      status: 'APPROVED',
      gates: [
        {
          gate: 'grounded_ratio',
          passed: true,
          value: 1,
          min: 0.9,
          max: null,
          reasonCode: VIDEOPLAY_REASON.QC_FAILED,
        },
      ],
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
      durationSec: 24,
      failReasonCode: null,
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
          headVersionId: 'version-1',
          createdAt: now,
        },
      },
      lineage: [
        {
          versionId: 'version-1',
          parentVersionId: null,
          branchId: 'branch-main',
          operationType: 'insert-shot',
          deltaSummary: 'bootstrap',
          operator: 'tester',
          timestamp: now,
        },
      ],
      conflictRecords: [],
    },
    ...overrides,
  };
}

function makeReleasePackage(overrides = {}) {
  const now = nowIso();
  return {
    releaseId: 'release-1',
    episodeId: 'episode-1',
    qcStatus: 'APPROVED',
    episodeMasterVideo: {
      uri: 'video://master',
      mimeType: 'video/mp4',
      durationMs: 24000,
      timelineHash: 'timeline-hash',
    },
    episodePoster: {
      uri: 'image://poster',
      mimeType: 'image/png',
    },
    episodeCaptionTrack: {
      uri: 'caption://track',
      mimeType: 'text/vtt',
      lines: [
        {
          startMs: 0,
          endMs: 2000,
          text: 'line',
        },
      ],
    },
    episodeMetadata: {
      storyId: 'story.world-main.ev-1',
      sourceTurnIds: ['turn-1'],
      sourceEventIds: ['ev-1'],
      durationSec: 24,
      policyHash: 'policy-hash',
    },
    episodeTraceBundle: {
      traceId: 'trace-1',
      runId: 'run-1',
      fallbackAudits: [],
      runEvents: [],
      sourceCoverage: {
        episode: ['ev-1'],
        clip: { 'clip-1': ['ev-1'] },
        beat: { 'beat-1': ['ev-1'] },
        shot: { 'shot-1': ['ev-1'] },
      },
    },
    published: false,
    publishedAt: null,
    createdAt: now,
    ...overrides,
  };
}

function withMockLocalStorage(localStorage, fn) {
  const hasOwn = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  const original = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorage,
    configurable: true,
    writable: true,
  });
  try {
    return fn();
  } finally {
    if (hasOwn) {
      Object.defineProperty(globalThis, 'localStorage', {
        value: original,
        configurable: true,
        writable: true,
      });
    } else {
      // eslint-disable-next-line no-undef
      delete globalThis.localStorage;
    }
  }
}

test('degraded chain fail-close when both route sources unavailable', async () => {
  await assert.rejects(
    () => invokeWithRouteFallback({
      stage: 'render',
      capability: 'llm.video.generate',
      traceId: 'trace-route-fail',
      routeHint: 'video/high',
      checkHealth: async () => ({
        status: 'down',
        reasonCode: 'RUNTIME_ROUTE_DOWN',
      }),
      invoke: async () => {
        throw new Error('invoke-failed');
      },
    }),
    (error) => error?.reasonCode === VIDEOPLAY_REASON.ROUTE_UNAVAILABLE,
  );
});

test('input validation rejects asset upsert without episodeId', () => {
  const state = createInitialVideoPlayState();
  assert.throws(
    () => upsertAssets(state, {
      idempotencyKey: 'asset-k1',
      episodeId: '',
      assets: [],
    }),
    (error) => error?.reasonCode === VIDEOPLAY_REASON.INPUT_INVALID,
  );
});

test('ID conflict handling rejects publish when episodeId mismatches package', () => {
  const state = createInitialVideoPlayState();
  assert.throws(
    () => publishRelease(state, {
      idempotencyKey: 'publish-k1',
      episodeId: 'episode-2',
      releasePackage: makeReleasePackage({ episodeId: 'episode-1' }),
    }),
    (error) => error?.reasonCode === VIDEOPLAY_REASON.RELEASE_PACKAGE_INVALID,
  );
});

test('publish flow supports idempotency and reentry without duplicate release IDs', () => {
  const state = createInitialVideoPlayState();
  const payload = makeReleasePackage();

  const first = publishRelease(state, {
    idempotencyKey: 'publish-k1',
    episodeId: 'episode-1',
    releasePackage: payload,
  });
  const second = publishRelease(state, {
    idempotencyKey: 'publish-k1',
    episodeId: 'episode-1',
    releasePackage: payload,
  });
  const reentry = publishRelease(state, {
    idempotencyKey: 'publish-k2',
    episodeId: 'episode-1',
    releasePackage: payload,
  });

  assert.equal(first.releaseRecord.releaseId, 'release-1');
  assert.deepEqual(second.releaseRecord, first.releaseRecord);
  assert.equal(reentry.releaseRecord.releaseId, 'release-1');
  assert.equal(reentry.releaseRecord.published, true);

  const listed = listReleases(state, 'episode-1');
  assert.equal(listed.releases.length, 1);
  assert.equal(state.releaseIdsByEpisodeId['episode-1']?.length, 1);
});

test('persist success branch writes/reads through localStorage', () => {
  const memory = new Map();
  const localStorage = {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => {
      memory.set(String(key), String(value));
    },
    removeItem: (key) => {
      memory.delete(String(key));
    },
    clear: () => {
      memory.clear();
    },
  };

  withMockLocalStorage(localStorage, () => {
    const state = createInitialVideoPlayState();
    const episode = makeEpisodeRecord();
    upsertEpisode(state, {
      idempotencyKey: 'episode-k1',
      episode,
    });

    saveVideoPlayState(state);
    assert.ok(memory.get(VIDEOPLAY_STORAGE_KEY));

    const loaded = loadVideoPlayState();
    assert.equal(Object.keys(loaded.episodesById).length, 1);
    assert.ok(loaded.episodesById['episode-1']);
  });
});

test('persist failure branch swallows localStorage write error and falls back to empty state', () => {
  const localStorage = {
    getItem: () => null,
    setItem: () => {
      throw new Error('quota-exceeded');
    },
    removeItem: () => {},
    clear: () => {},
  };

  withMockLocalStorage(localStorage, () => {
    const state = createInitialVideoPlayState();
    upsertEpisode(state, {
      idempotencyKey: 'episode-k1',
      episode: makeEpisodeRecord(),
    });

    assert.doesNotThrow(() => saveVideoPlayState(state));

    const loaded = loadVideoPlayState();
    assert.equal(Object.keys(loaded.episodesById).length, 0);
    assert.equal(Object.keys(loaded.releasesById).length, 0);
  });
});
