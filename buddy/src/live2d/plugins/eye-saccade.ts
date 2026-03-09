import type { AnimationPlugin, ParamSetter } from '../animation-controller.js';

/**
 * BD-ANIM-003 眼球微动
 * 800-3000ms 随机间隔（偏短），lerp 0.08 平滑过渡
 * 鼠标在 Canvas 内时偏向鼠标位置（权重 0.3）
 */
export function createEyeSaccadePlugin(canvas: HTMLCanvasElement | null): AnimationPlugin {
  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;
  let timer = randomInterval();
  let pointerX = 0;
  let pointerY = 0;
  let pointerInCanvas = false;

  const LERP = 0.08;
  const RANGE = 0.5;
  const POINTER_WEIGHT = 0.3;

  function randomInterval() {
    // Exponential distribution biased toward short intervals
    return 0.8 + Math.pow(Math.random(), 2) * 2.2;
  }

  function onPointerMove(e: PointerEvent) {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    pointerX = ((e.clientX - rect.left) / rect.width - 0.5) * 2; // -1 to 1
    pointerY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    pointerX = Math.max(-1, Math.min(1, pointerX));
    pointerY = Math.max(-1, Math.min(1, pointerY));
  }

  function onPointerEnter() { pointerInCanvas = true; }
  function onPointerLeave() { pointerInCanvas = false; }

  if (canvas) {
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerenter', onPointerEnter);
    canvas.addEventListener('pointerleave', onPointerLeave);
  }

  return {
    id: 'eye-saccade',
    priority: 40,
    update(dt: number, setParam: ParamSetter) {
      timer -= dt;
      if (timer <= 0) {
        targetX = (Math.random() - 0.5) * 2 * RANGE;
        targetY = (Math.random() - 0.5) * 2 * RANGE;
        timer = randomInterval();
      }

      let goalX = targetX;
      let goalY = targetY;

      if (pointerInCanvas) {
        goalX = targetX * (1 - POINTER_WEIGHT) + pointerX * RANGE * POINTER_WEIGHT;
        goalY = targetY * (1 - POINTER_WEIGHT) + pointerY * RANGE * POINTER_WEIGHT;
      }

      currentX += (goalX - currentX) * LERP;
      currentY += (goalY - currentY) * LERP;

      setParam('PARAM_EYE_BALL_X', currentX);
      setParam('PARAM_EYE_BALL_Y', currentY);
    },
    destroy() {
      if (canvas) {
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerenter', onPointerEnter);
        canvas.removeEventListener('pointerleave', onPointerLeave);
      }
    },
  };
}
