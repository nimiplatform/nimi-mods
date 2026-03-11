import type { AnimationPlugin, ParamSetter } from '../animation-controller.js';
import type { EmotionType } from '../../contracts.js';
import { DEFAULT_EMOTION } from '../../contracts.js';
import { EMOTION_MAP, type EmotionParams } from '../emotion-map.js';

/**
 * BD-ANIM-004 表情驱动
 * 根据情绪标签平滑切换参数组合。
 * 瞬时情绪在持续时间后回退到 happy。
 */
export function createExpressionDriverPlugin() {
  let currentParams: EmotionParams = { ...EMOTION_MAP[DEFAULT_EMOTION].params };
  let targetParams: EmotionParams = { ...currentParams };
  let transitionProgress = 1;
  let transientTimer: number | null = null;
  let speaking = false;

  const TRANSITION_DURATION = 0.3; // 300ms

  function easeInOutCubic(t: number) {
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function setEmotion(emotion: EmotionType) {
    const entry = EMOTION_MAP[emotion];
    if (!entry) return;

    targetParams = { ...entry.params };
    transitionProgress = 0;

    // Clear previous transient timer
    if (transientTimer !== null) {
      transientTimer = null;
    }

    // Schedule fallback for transient emotions
    if (entry.transient) {
      transientTimer = entry.transientDurationMs / 1000;
    }
  }

  function setSpeaking(next: boolean) {
    speaking = next;
  }

  const plugin: AnimationPlugin & {
    setEmotion: typeof setEmotion;
    setSpeaking: typeof setSpeaking;
  } = {
    id: 'expression-driver',
    priority: 20,
    setEmotion,
    setSpeaking,
    update(dt: number, setParam: ParamSetter) {
      // Advance transition
      if (transitionProgress < 1) {
        transitionProgress = Math.min(transitionProgress + dt / TRANSITION_DURATION, 1);
        const easedProgress = easeInOutCubic(transitionProgress);

        for (const key of Object.keys(targetParams) as (keyof EmotionParams)[]) {
          currentParams[key] =
            currentParams[key] + (targetParams[key] - currentParams[key]) * easedProgress;
        }
      }

      // Check transient timer
      if (transientTimer !== null) {
        transientTimer -= dt;
        if (transientTimer <= 0) {
          transientTimer = null;
          setEmotion(DEFAULT_EMOTION);
        }
      }

      // Apply params
      setParam('PARAM_EYE_L_SMILE', currentParams.PARAM_EYE_L_SMILE);
      setParam('PARAM_EYE_R_SMILE', currentParams.PARAM_EYE_R_SMILE);
      if (!speaking) {
        setParam('PARAM_MOUTH_FORM', currentParams.PARAM_MOUTH_FORM);
        setParam('ParamMouthForm', currentParams.PARAM_MOUTH_FORM);
      }
      setParam('PARAM_TERE', currentParams.PARAM_TERE ?? 0);
      setParam('PARAM_BROW_L_Y', currentParams.PARAM_BROW_L_Y);
      setParam('PARAM_BROW_R_Y', currentParams.PARAM_BROW_R_Y);
    },
  };

  return plugin;
}
