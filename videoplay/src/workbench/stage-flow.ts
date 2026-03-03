import {
  VIDEOPLAY_OPERATION_TYPE,
  VIDEOPLAY_REASON,
  VIDEOPLAY_WORKBENCH_STAGE,
  VIDEOPLAY_WORKBENCH_STAGE_ORDER,
  VIDEOPLAY_WORKBENCH_STAGE_STATUS,
  type VideoPlayOperationType,
  type VideoPlayPipelineStep,
  type VideoPlayWorkbenchStage,
} from '../contracts.js';
import type {
  ReleasePackage,
  VideoPlayPipelineStageProgress,
  VideoPlayRebuildImpactPreview,
  VideoPlayStageAdvancePlan,
  VideoPlayWorkbenchStageProgress,
} from '../types.js';

type StageStatus = VideoPlayPipelineStageProgress['status'];

const STAGE_TO_STEPS: Record<VideoPlayWorkbenchStage, readonly VideoPlayPipelineStep[]> = {
  [VIDEOPLAY_WORKBENCH_STAGE.STORY_SOURCE]: ['narrative-ingest'],
  [VIDEOPLAY_WORKBENCH_STAGE.SCRIPT]: ['episode-segmentation', 'screenplay'],
  [VIDEOPLAY_WORKBENCH_STAGE.STORYBOARD]: ['storyboard'],
  [VIDEOPLAY_WORKBENCH_STAGE.VOICE]: ['asset-render'],
  [VIDEOPLAY_WORKBENCH_STAGE.VIDEO]: ['edit-compose'],
  [VIDEOPLAY_WORKBENCH_STAGE.QC]: ['qc-gate'],
  [VIDEOPLAY_WORKBENCH_STAGE.PUBLISH]: ['release-package'],
};

type DeriveStageProgressInput = {
  storySelected: boolean;
  storyPackageReady: boolean;
  routeReady: boolean;
  stageProgress: VideoPlayPipelineStageProgress[];
  selectedReleaseCandidate: ReleasePackage | null;
};

type StageCondition = {
  ok: boolean;
  reasonCode: typeof VIDEOPLAY_REASON[keyof typeof VIDEOPLAY_REASON] | null;
  actionHint: string | null;
};

function stageStepStatuses(input: {
  stepMap: Map<VideoPlayPipelineStep, VideoPlayPipelineStageProgress>;
  stage: VideoPlayWorkbenchStage;
}): Partial<Record<VideoPlayPipelineStep, StageStatus>> {
  const statuses: Partial<Record<VideoPlayPipelineStep, StageStatus>> = {};
  for (const step of STAGE_TO_STEPS[input.stage]) {
    statuses[step] = input.stepMap.get(step)?.status || 'PENDING';
  }
  return statuses;
}

function hasStatus(statuses: StageStatus[], expected: StageStatus[]): boolean {
  return statuses.some((status) => expected.includes(status));
}

function toBlocked(actionHint: string): StageCondition {
  return {
    ok: false,
    reasonCode: VIDEOPLAY_REASON.STAGE_PRECONDITION_BLOCKED,
    actionHint,
  };
}

function toReady(): StageCondition {
  return {
    ok: true,
    reasonCode: null,
    actionHint: null,
  };
}

function statusFromSteps(input: {
  statuses: StageStatus[];
  readyWhenAllCompleted: boolean;
  blockedByPrecondition: StageCondition;
}): VideoPlayWorkbenchStageProgress['status'] {
  if (!input.blockedByPrecondition.ok) {
    return VIDEOPLAY_WORKBENCH_STAGE_STATUS.BLOCKED;
  }
  if (hasStatus(input.statuses, ['FAILED', 'CANCELED'])) {
    return VIDEOPLAY_WORKBENCH_STAGE_STATUS.BLOCKED;
  }
  if (hasStatus(input.statuses, ['RUNNING', 'PAUSED'])) {
    return VIDEOPLAY_WORKBENCH_STAGE_STATUS.PROCESSING;
  }
  if (input.readyWhenAllCompleted && input.statuses.every((status) => status === 'COMPLETED')) {
    return VIDEOPLAY_WORKBENCH_STAGE_STATUS.READY;
  }
  return VIDEOPLAY_WORKBENCH_STAGE_STATUS.EMPTY;
}

function conditionForStage(input: {
  stage: VideoPlayWorkbenchStage;
  stepMap: Map<VideoPlayPipelineStep, VideoPlayPipelineStageProgress>;
  storySelected: boolean;
  storyPackageReady: boolean;
  routeReady: boolean;
  selectedReleaseCandidate: ReleasePackage | null;
}): StageCondition {
  const step = (name: VideoPlayPipelineStep): StageStatus => input.stepMap.get(name)?.status || 'PENDING';
  const isCompleted = (name: VideoPlayPipelineStep): boolean => step(name) === 'COMPLETED';
  const qcStatus = input.selectedReleaseCandidate?.qcStatus || null;

  switch (input.stage) {
    case VIDEOPLAY_WORKBENCH_STAGE.STORY_SOURCE:
      if (!input.storySelected) {
        return toBlocked('Select a playable story first.');
      }
      if (!input.storyPackageReady) {
        return toBlocked('Load and validate story package first.');
      }
      return toReady();
    case VIDEOPLAY_WORKBENCH_STAGE.SCRIPT:
      if (!isCompleted('narrative-ingest')) {
        return toBlocked('Complete story-source ingest before script stage.');
      }
      return toReady();
    case VIDEOPLAY_WORKBENCH_STAGE.STORYBOARD:
      if (!isCompleted('screenplay')) {
        return toBlocked('Complete screenplay before storyboard stage.');
      }
      return toReady();
    case VIDEOPLAY_WORKBENCH_STAGE.VOICE:
      if (!isCompleted('storyboard')) {
        return toBlocked('Complete storyboard before voice stage.');
      }
      if (!input.routeReady) {
        return toBlocked('Ensure runtime routes are ready before voice stage.');
      }
      return toReady();
    case VIDEOPLAY_WORKBENCH_STAGE.VIDEO:
      if (!isCompleted('asset-render')) {
        return toBlocked('Complete voice/asset-render before video stage.');
      }
      if (!input.routeReady) {
        return toBlocked('Ensure runtime routes are ready before video stage.');
      }
      return toReady();
    case VIDEOPLAY_WORKBENCH_STAGE.QC:
      if (!isCompleted('edit-compose')) {
        return toBlocked('Complete compose output before QC stage.');
      }
      return toReady();
    case VIDEOPLAY_WORKBENCH_STAGE.PUBLISH:
      if (!isCompleted('qc-gate')) {
        return toBlocked('Complete QC stage before publish.');
      }
      if (!(qcStatus === 'APPROVED' || qcStatus === 'ADJUSTED')) {
        return toBlocked('QC status must be APPROVED or ADJUSTED before publish.');
      }
      return toReady();
    default:
      return toBlocked('Unsupported stage.');
  }
}

export function deriveWorkbenchStageProgress(
  input: DeriveStageProgressInput,
): VideoPlayWorkbenchStageProgress[] {
  const stepMap = new Map(input.stageProgress.map((row) => [row.step, row] as const));
  return [...VIDEOPLAY_WORKBENCH_STAGE_ORDER].map((stage) => {
    const condition = conditionForStage({
      stage,
      stepMap,
      storySelected: input.storySelected,
      storyPackageReady: input.storyPackageReady,
      routeReady: input.routeReady,
      selectedReleaseCandidate: input.selectedReleaseCandidate,
    });
    const stepStatusesMap = stageStepStatuses({ stepMap, stage });
    const stepStatuses = Object.values(stepStatusesMap);
    const status = statusFromSteps({
      statuses: stepStatuses.length > 0 ? stepStatuses : ['PENDING'],
      readyWhenAllCompleted: true,
      blockedByPrecondition: condition,
    });

    return {
      stage,
      status,
      reasonCode: status === VIDEOPLAY_WORKBENCH_STAGE_STATUS.BLOCKED
        ? (condition.reasonCode || VIDEOPLAY_REASON.STAGE_PRECONDITION_BLOCKED)
        : null,
      actionHint: status === VIDEOPLAY_WORKBENCH_STAGE_STATUS.BLOCKED
        ? (condition.actionHint || 'Complete required upstream outputs before advance.')
        : null,
      stepStatuses: stepStatusesMap,
    };
  });
}

type ComputeAdvancePlanInput = {
  stage: VideoPlayWorkbenchStage;
  stageProgress: VideoPlayPipelineStageProgress[];
  checkpointAvailable: boolean;
  storySelected: boolean;
  storyPackageReady: boolean;
  routeReady: boolean;
  selectedReleaseCandidate: ReleasePackage | null;
};

export function computeStageAdvancePlan(input: ComputeAdvancePlanInput): VideoPlayStageAdvancePlan {
  const stageRows = deriveWorkbenchStageProgress({
    storySelected: input.storySelected,
    storyPackageReady: input.storyPackageReady,
    routeReady: input.routeReady,
    stageProgress: input.stageProgress,
    selectedReleaseCandidate: input.selectedReleaseCandidate,
  });
  const stageRow = stageRows.find((row) => row.stage === input.stage);
  if (!stageRow) {
    return {
      stage: input.stage,
      allowed: false,
      stepBudget: 0,
      reasonCode: VIDEOPLAY_REASON.STAGE_PRECONDITION_BLOCKED,
      actionHint: 'Unknown stage.',
    };
  }
  if (stageRow.status === VIDEOPLAY_WORKBENCH_STAGE_STATUS.BLOCKED) {
    return {
      stage: input.stage,
      allowed: false,
      stepBudget: 0,
      reasonCode: stageRow.reasonCode || VIDEOPLAY_REASON.STAGE_PRECONDITION_BLOCKED,
      actionHint: stageRow.actionHint || 'Complete required upstream outputs before advance.',
    };
  }
  if (!input.checkpointAvailable && input.stage !== VIDEOPLAY_WORKBENCH_STAGE.STORY_SOURCE) {
    return {
      stage: input.stage,
      allowed: false,
      stepBudget: 0,
      reasonCode: VIDEOPLAY_REASON.STAGE_PRECONDITION_BLOCKED,
      actionHint: 'Run story-source stage first to create checkpoint.',
    };
  }
  const pendingStepCount = STAGE_TO_STEPS[input.stage]
    .filter((step) => (stageRow.stepStatuses[step] || 'PENDING') !== 'COMPLETED')
    .length;
  if (pendingStepCount <= 0) {
    return {
      stage: input.stage,
      allowed: false,
      stepBudget: 0,
      reasonCode: VIDEOPLAY_REASON.STAGE_ADVANCE_REQUIRED,
      actionHint: 'Stage already complete. Select next stage to advance.',
    };
  }
  return {
    stage: input.stage,
    allowed: true,
    stepBudget: pendingStepCount,
    reasonCode: null,
    actionHint: null,
  };
}

function stageForOperation(operationType: VideoPlayOperationType): VideoPlayWorkbenchStage {
  switch (operationType) {
    case VIDEOPLAY_OPERATION_TYPE.GENERATE_VOICE_LINE:
    case VIDEOPLAY_OPERATION_TYPE.APPLY_LIP_SYNC:
      return VIDEOPLAY_WORKBENCH_STAGE.VOICE;
    case VIDEOPLAY_OPERATION_TYPE.CREATE_BRANCH:
    case VIDEOPLAY_OPERATION_TYPE.SWITCH_BRANCH:
    case VIDEOPLAY_OPERATION_TYPE.MERGE_BRANCH:
      return VIDEOPLAY_WORKBENCH_STAGE.SCRIPT;
    default:
      return VIDEOPLAY_WORKBENCH_STAGE.STORYBOARD;
  }
}

function rerunStepForScope(scope: VideoPlayRebuildImpactPreview['scope']): VideoPlayPipelineStep {
  switch (scope) {
    case 'shot':
      return 'asset-render';
    case 'adjacent-shots-plus-compose':
      return 'edit-compose';
    case 'clip-plus-compose':
      return 'storyboard';
    case 'post-segmentation-full-chain':
      return 'episode-segmentation';
    default:
      return 'storyboard';
  }
}

export function buildRebuildImpactPreview(input: {
  operationType: VideoPlayOperationType;
  scope: VideoPlayRebuildImpactPreview['scope'];
}): VideoPlayRebuildImpactPreview {
  return {
    operationType: input.operationType,
    scope: input.scope,
    recommendedRerunStep: rerunStepForScope(input.scope),
    stage: stageForOperation(input.operationType),
    confirmed: false,
    createdAt: new Date().toISOString(),
  };
}

export function workbenchStageSteps(stage: VideoPlayWorkbenchStage): readonly VideoPlayPipelineStep[] {
  return STAGE_TO_STEPS[stage];
}
