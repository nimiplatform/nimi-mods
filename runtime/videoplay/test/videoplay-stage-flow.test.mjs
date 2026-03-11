import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VIDEOPLAY_PIPELINE_CHAIN,
  VIDEOPLAY_REASON,
  VIDEOPLAY_WORKBENCH_STAGE,
} from '../src/contracts.ts';
import {
  buildRebuildImpactPreview,
  computeStageAdvancePlan,
  deriveWorkbenchStageProgress,
  listManualRerunSteps,
} from '../src/workbench/stage-flow.ts';

function makeStageProgress(overrides = {}) {
  const now = new Date().toISOString();
  return VIDEOPLAY_PIPELINE_CHAIN.map((step) => ({
    step,
    status: 'PENDING',
    attempt: 0,
    checkpointToken: null,
    stepInputHash: null,
    lastCompletedUnit: null,
    reasonCode: null,
    actionHint: null,
    updatedAt: now,
    ...(overrides[step] || {}),
  }));
}

test('script stage is blocked before narrative-ingest completion', () => {
  const rows = deriveWorkbenchStageProgress({
    storySelected: true,
    storyPackageReady: true,
    routeReady: true,
    stageProgress: makeStageProgress(),
    selectedReleaseCandidate: null,
  });
  const script = rows.find((row) => row.stage === VIDEOPLAY_WORKBENCH_STAGE.SCRIPT);
  assert.ok(script);
  assert.equal(script.status, 'blocked');
  assert.equal(script.reasonCode, VIDEOPLAY_REASON.STAGE_PRECONDITION_BLOCKED);
});

test('script stage becomes ready when segmentation and screenplay are completed', () => {
  const rows = deriveWorkbenchStageProgress({
    storySelected: true,
    storyPackageReady: true,
    routeReady: true,
    stageProgress: makeStageProgress({
      'narrative-ingest': { status: 'COMPLETED', attempt: 1 },
      'character-casting': { status: 'COMPLETED', attempt: 1 },
      'scene-planning': { status: 'COMPLETED', attempt: 1 },
      'episode-segmentation': { status: 'COMPLETED', attempt: 1 },
      screenplay: { status: 'COMPLETED', attempt: 1 },
    }),
    selectedReleaseCandidate: null,
  });
  const script = rows.find((row) => row.stage === VIDEOPLAY_WORKBENCH_STAGE.SCRIPT);
  assert.ok(script);
  assert.equal(script.status, 'ready');
});

test('advance plan computes multi-step budget for script stage', () => {
  const plan = computeStageAdvancePlan({
    stage: VIDEOPLAY_WORKBENCH_STAGE.SCRIPT,
    stageProgress: makeStageProgress({
      'narrative-ingest': { status: 'COMPLETED', attempt: 1 },
      'character-casting': { status: 'COMPLETED', attempt: 1 },
      'scene-planning': { status: 'COMPLETED', attempt: 1 },
      'episode-segmentation': { status: 'PENDING', attempt: 0 },
      screenplay: { status: 'PENDING', attempt: 0 },
    }),
    checkpointAvailable: true,
    storySelected: true,
    storyPackageReady: true,
    routeReady: true,
    selectedReleaseCandidate: null,
  });
  assert.equal(plan.allowed, true);
  assert.equal(plan.stepBudget, 2);
  assert.equal(plan.reasonCode, null);
});

test('advance plan blocks completed stage with explicit-advance reason', () => {
  const plan = computeStageAdvancePlan({
    stage: VIDEOPLAY_WORKBENCH_STAGE.SCRIPT,
    stageProgress: makeStageProgress({
      'narrative-ingest': { status: 'COMPLETED', attempt: 1 },
      'character-casting': { status: 'COMPLETED', attempt: 1 },
      'scene-planning': { status: 'COMPLETED', attempt: 1 },
      'episode-segmentation': { status: 'COMPLETED', attempt: 1 },
      screenplay: { status: 'COMPLETED', attempt: 1 },
    }),
    checkpointAvailable: true,
    storySelected: true,
    storyPackageReady: true,
    routeReady: true,
    selectedReleaseCandidate: null,
  });
  assert.equal(plan.allowed, false);
  assert.equal(plan.reasonCode, VIDEOPLAY_REASON.STAGE_ADVANCE_REQUIRED);
});

test('rebuild preview maps operation scope to rerun step and stage', () => {
  const preview = buildRebuildImpactPreview({
    operationType: 'generate-voice-line',
    scope: 'shot',
  });
  assert.equal(preview.stage, VIDEOPLAY_WORKBENCH_STAGE.VOICE);
  assert.equal(preview.recommendedRerunStep, 'asset-render');
  assert.equal(preview.confirmed, false);
});

test('manual rerun control covers the full canonical pipeline chain', () => {
  assert.deepEqual(listManualRerunSteps(), VIDEOPLAY_PIPELINE_CHAIN);
});
