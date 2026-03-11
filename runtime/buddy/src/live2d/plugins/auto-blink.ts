import type { AnimationPlugin, ParamSetter } from '../animation-controller.js';

/**
 * BD-ANIM-002 自动眨眼
 * 3-6s 随机间隔，闭合 80ms → 保持 40ms → 打开 120ms
 */
export function createAutoBlinkPlugin(): AnimationPlugin {
  let timer = randomInterval();
  let phase: 'open' | 'closing' | 'hold' | 'opening' = 'open';
  let phaseElapsed = 0;

  const CLOSE_MS = 0.08;
  const HOLD_MS = 0.04;
  const OPEN_MS = 0.12;

  function randomInterval() {
    return 3 + Math.random() * 3; // 3-6 seconds
  }

  function easeInQuad(t: number) {
    return t * t;
  }

  function easeOutQuad(t: number) {
    return 1 - (1 - t) * (1 - t);
  }

  return {
    id: 'auto-blink',
    priority: 30,
    update(dt: number, setParam: ParamSetter) {
      if (phase === 'open') {
        timer -= dt;
        if (timer <= 0) {
          phase = 'closing';
          phaseElapsed = 0;
        }
        setParam('PARAM_EYE_L_OPEN', 1);
        setParam('PARAM_EYE_R_OPEN', 1);
        return;
      }

      phaseElapsed += dt;

      if (phase === 'closing') {
        const progress = Math.min(phaseElapsed / CLOSE_MS, 1);
        const value = 1 - easeInQuad(progress);
        setParam('PARAM_EYE_L_OPEN', value);
        setParam('PARAM_EYE_R_OPEN', value);
        if (progress >= 1) {
          phase = 'hold';
          phaseElapsed = 0;
        }
      } else if (phase === 'hold') {
        setParam('PARAM_EYE_L_OPEN', 0);
        setParam('PARAM_EYE_R_OPEN', 0);
        if (phaseElapsed >= HOLD_MS) {
          phase = 'opening';
          phaseElapsed = 0;
        }
      } else if (phase === 'opening') {
        const progress = Math.min(phaseElapsed / OPEN_MS, 1);
        const value = easeOutQuad(progress);
        setParam('PARAM_EYE_L_OPEN', value);
        setParam('PARAM_EYE_R_OPEN', value);
        if (progress >= 1) {
          phase = 'open';
          timer = randomInterval();
        }
      }
    },
  };
}
