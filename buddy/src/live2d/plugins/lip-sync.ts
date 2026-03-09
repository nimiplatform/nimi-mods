import type { AnimationPlugin, ParamSetter } from '../animation-controller.js';

/**
 * BD-ANIM-006 口型同步
 * P0: 基于音量的简化口型同步（AnalyserNode FFT → 音量 → MouthOpenY）
 * 攻击 50ms，释放 80ms，指数插值
 */
export function createLipSyncPlugin() {
  let analyser: AnalyserNode | null = null;
  let dataArray: Uint8Array<ArrayBuffer> | null = null;
  let currentValue = 0;

  const ATTACK_SPEED = 1 / 0.05; // 50ms attack
  const RELEASE_SPEED = 1 / 0.08; // 80ms release
  const VOLUME_THRESHOLD = 0.02;

  function feedAnalyser(node: AnalyserNode) {
    analyser = node;
    analyser.fftSize = 256;
    dataArray = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
  }

  function stopAnalyser() {
    analyser = null;
    dataArray = null;
  }

  function getVolume(): number {
    if (!analyser || !dataArray) return 0;
    analyser.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i] ?? 0;
    }
    return sum / (dataArray.length * 255); // normalized 0-1
  }

  const plugin: AnimationPlugin & {
    feedAnalyser: typeof feedAnalyser;
    stopAnalyser: typeof stopAnalyser;
  } = {
    id: 'lip-sync',
    priority: 10,
    feedAnalyser,
    stopAnalyser,
    update(dt: number, setParam: ParamSetter) {
      const targetVolume = getVolume();
      const target = targetVolume < VOLUME_THRESHOLD ? 0 : Math.min(targetVolume * 2, 1);

      if (target > currentValue) {
        // Attack
        currentValue += (target - currentValue) * Math.min(dt * ATTACK_SPEED, 1);
      } else {
        // Release
        currentValue += (target - currentValue) * Math.min(dt * RELEASE_SPEED, 1);
      }

      setParam('PARAM_MOUTH_OPEN_Y', currentValue);
    },
    destroy() {
      analyser = null;
      dataArray = null;
    },
  };

  return plugin;
}
