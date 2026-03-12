import type { EmotionType } from '../contracts.js';

export interface EmotionParams {
  PARAM_EYE_L_SMILE: number;
  PARAM_EYE_R_SMILE: number;
  PARAM_MOUTH_FORM: number;
  PARAM_TERE: number; // 照れ (cheek blush)
  PARAM_BROW_L_Y: number;
  PARAM_BROW_R_Y: number;
}

interface EmotionEntry {
  params: EmotionParams;
  transient: boolean;
  transientDurationMs: number;
  transientFallback: EmotionType;
}

/** BD-ANIM-004 情绪到参数映射（同 tables/emotion-map.yaml） */
export const EMOTION_MAP: Record<EmotionType, EmotionEntry> = {
  happy: {
    params: {
      PARAM_EYE_L_SMILE: 0.7,
      PARAM_EYE_R_SMILE: 0.7,
      PARAM_MOUTH_FORM: 0.8,
      PARAM_TERE: 0.4,
      PARAM_BROW_L_Y: 0.1,
      PARAM_BROW_R_Y: 0.1,
    },
    transient: false,
    transientDurationMs: 0,
    transientFallback: 'happy',
  },
  excited: {
    params: {
      PARAM_EYE_L_SMILE: 0.9,
      PARAM_EYE_R_SMILE: 0.9,
      PARAM_MOUTH_FORM: 1.0,
      PARAM_TERE: 0.8,
      PARAM_BROW_L_Y: 0.3,
      PARAM_BROW_R_Y: 0.3,
    },
    transient: true,
    transientDurationMs: 3000,
    transientFallback: 'happy',
  },
  sad: {
    params: {
      PARAM_EYE_L_SMILE: 0,
      PARAM_EYE_R_SMILE: 0,
      PARAM_MOUTH_FORM: -0.5,
      PARAM_TERE: 0,
      PARAM_BROW_L_Y: -0.3,
      PARAM_BROW_R_Y: -0.3,
    },
    transient: false,
    transientDurationMs: 0,
    transientFallback: 'happy',
  },
  surprised: {
    params: {
      PARAM_EYE_L_SMILE: 0,
      PARAM_EYE_R_SMILE: 0,
      PARAM_MOUTH_FORM: 0.3,
      PARAM_TERE: 0,
      PARAM_BROW_L_Y: 0.5,
      PARAM_BROW_R_Y: 0.5,
    },
    transient: true,
    transientDurationMs: 2000,
    transientFallback: 'happy',
  },
  thinking: {
    params: {
      PARAM_EYE_L_SMILE: 0,
      PARAM_EYE_R_SMILE: 0,
      PARAM_MOUTH_FORM: 0,
      PARAM_TERE: 0,
      PARAM_BROW_L_Y: 0.2,
      PARAM_BROW_R_Y: -0.1,
    },
    transient: false,
    transientDurationMs: 0,
    transientFallback: 'happy',
  },
  sleepy: {
    params: {
      PARAM_EYE_L_SMILE: 0.3,
      PARAM_EYE_R_SMILE: 0.3,
      PARAM_MOUTH_FORM: 0.2,
      PARAM_TERE: 0.3,
      PARAM_BROW_L_Y: -0.1,
      PARAM_BROW_R_Y: -0.1,
    },
    transient: false,
    transientDurationMs: 0,
    transientFallback: 'happy',
  },
  calm: {
    params: {
      PARAM_EYE_L_SMILE: 0.2,
      PARAM_EYE_R_SMILE: 0.2,
      PARAM_MOUTH_FORM: 0.25,
      PARAM_TERE: 0.05,
      PARAM_BROW_L_Y: 0.02,
      PARAM_BROW_R_Y: 0.02,
    },
    transient: false,
    transientDurationMs: 0,
    transientFallback: 'happy',
  },
  shy: {
    params: {
      PARAM_EYE_L_SMILE: 0.35,
      PARAM_EYE_R_SMILE: 0.35,
      PARAM_MOUTH_FORM: 0.45,
      PARAM_TERE: 0.8,
      PARAM_BROW_L_Y: -0.05,
      PARAM_BROW_R_Y: -0.05,
    },
    transient: true,
    transientDurationMs: 2200,
    transientFallback: 'happy',
  },
  confused: {
    params: {
      PARAM_EYE_L_SMILE: 0,
      PARAM_EYE_R_SMILE: 0,
      PARAM_MOUTH_FORM: -0.1,
      PARAM_TERE: 0,
      PARAM_BROW_L_Y: 0.18,
      PARAM_BROW_R_Y: -0.22,
    },
    transient: false,
    transientDurationMs: 0,
    transientFallback: 'happy',
  },
  playful: {
    params: {
      PARAM_EYE_L_SMILE: 0.8,
      PARAM_EYE_R_SMILE: 0.8,
      PARAM_MOUTH_FORM: 0.9,
      PARAM_TERE: 0.55,
      PARAM_BROW_L_Y: 0.08,
      PARAM_BROW_R_Y: 0.14,
    },
    transient: true,
    transientDurationMs: 2600,
    transientFallback: 'happy',
  },
  caring: {
    params: {
      PARAM_EYE_L_SMILE: 0.45,
      PARAM_EYE_R_SMILE: 0.45,
      PARAM_MOUTH_FORM: 0.55,
      PARAM_TERE: 0.25,
      PARAM_BROW_L_Y: 0.06,
      PARAM_BROW_R_Y: 0.06,
    },
    transient: false,
    transientDurationMs: 0,
    transientFallback: 'happy',
  },
};
