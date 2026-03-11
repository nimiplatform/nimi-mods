import {
  VIDEOPLAY_QUALITY_RULE,
  VIDEOPLAY_VISUAL_COMPONENT_WEIGHT,
} from './contracts.js';
import type { SegmentationPolicy } from './types.js';

export const DEFAULT_SEGMENTATION_POLICY: SegmentationPolicy = {
  targetEpisodeDurationSec: 90,
  minEpisodeDurationSec: 15,
  maxEpisodeDurationSec: 180,
  maxTurnsPerEpisode: 12,
  suspenseCutRequired: true,
  hardBreakOnSystemEvent: false,
};

export const SEGMENTATION_POLICY_BOUNDS = {
  targetEpisodeDurationSec: { min: 15, max: 180 },
  minEpisodeDurationSec: { min: 15, max: 180 },
  maxEpisodeDurationSec: { min: 15, max: 180 },
  maxTurnsPerEpisode: { min: 1, max: 30 },
} as const;

type QualityGatePolicy = {
  groundedRatioMin: number;
  assetCoverageRatioMin: number;
  voiceCoverageRatioMin: number;
  durationSecMin: number;
  durationSecMax: number;
  maxAvDriftMs: number;
  visualAttractionMin: number;
  visualAttractionComponentMin: number;
  visualAttractionWeight: {
    characterConsistency: number;
    motionContinuity: number;
    compositionReadability: number;
    lightColorCoherence: number;
  };
};

export const EDIT_COMPOSE_POLICY = {
  episodeMasterDurationMs: {
    min: 15000,
    max: 180000,
  },
  timeline: {
    fpsDefault: 30,
    videoTrackSortedByStartMs: true,
    videoTrackOverlapForbidden: true,
    masterDurationEqualsLastClipEnd: true,
  },
  avThresholds: {
    maxAvDriftMs: VIDEOPLAY_QUALITY_RULE.MAX_AV_DRIFT_MS,
    maxBlackGapMs: VIDEOPLAY_QUALITY_RULE.MAX_BLACK_GAP_MS,
  },
  exportSpec: {
    videoCodec: 'H.264',
    audioCodec: 'AAC',
    container: 'mp4',
  },
} as const;

export const QUALITY_GATE_POLICY = {
  groundedRatioMin: VIDEOPLAY_QUALITY_RULE.GROUNDED_RATIO_MIN,
  assetCoverageRatioMin: VIDEOPLAY_QUALITY_RULE.ASSET_COVERAGE_RATIO_MIN,
  voiceCoverageRatioMin: VIDEOPLAY_QUALITY_RULE.VOICE_COVERAGE_RATIO_MIN,
  durationSecMin: VIDEOPLAY_QUALITY_RULE.EPISODE_DURATION_SEC_MIN,
  durationSecMax: VIDEOPLAY_QUALITY_RULE.EPISODE_DURATION_SEC_MAX,
  maxAvDriftMs: VIDEOPLAY_QUALITY_RULE.MAX_AV_DRIFT_MS,
  visualAttractionMin: VIDEOPLAY_QUALITY_RULE.VISUAL_ATTRACTION_MIN,
  visualAttractionComponentMin: VIDEOPLAY_QUALITY_RULE.VISUAL_COMPONENT_MIN,
  visualAttractionWeight: VIDEOPLAY_VISUAL_COMPONENT_WEIGHT,
} satisfies QualityGatePolicy;

export const CHARACTER_CASTING_POLICY = {
  maxCandidateImages: 3,
  defaultRoleLevel: 'B' as const,
  roleLevelOrder: ['S', 'A', 'B', 'C', 'D'] as const,
} as const;

export const SCENE_PLANNING_POLICY = {
  maxCandidateImages: 3,
} as const;

export const CANDIDATE_SELECTION_POLICY = {
  autoSelectAllRenderedVideo: true,
  trimRangeRequired: false,
} as const;

export const AUDIO_DESIGN_POLICY = {
  defaultBgmVolume: 0.3,
  defaultSfxVolume: 0.6,
  defaultFadeInMs: 1000,
  defaultFadeOutMs: 2000,
} as const;

export const REBUILD_IMPACT_SCOPE = {
  'shot-content-change': 'shot',
  'shot-link-change': 'adjacent-shots-plus-compose',
  'clip-structure-change': 'clip-plus-compose',
  'episode-rhythm-change': 'post-segmentation-full-chain',
} as const;
