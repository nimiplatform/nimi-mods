import type { AnimationPlugin, ParamSetter } from '../animation-controller.js';

/**
 * BD-ANIM-005 呼吸动画
 * 正弦波 3.5 秒周期，始终运行
 */
export function createIdleBreathPlugin(): AnimationPlugin {
  let elapsed = 0;
  const PERIOD = 3.5;

  return {
    id: 'idle-breath',
    priority: 50,
    update(dt: number, setParam: ParamSetter) {
      elapsed += dt;
      const value = Math.sin((elapsed * 2 * Math.PI) / PERIOD) * 0.5 + 0.5;
      setParam('PARAM_BREATH', value);
    },
  };
}
