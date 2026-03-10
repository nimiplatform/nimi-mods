import type { AnimationPlugin, ParamSetter } from '../animation-controller.js';
import type { LipSyncFrame, LipSyncPhonemeWeights } from '../../contracts.js';
import type { LipSyncStream } from '../../services/voice-engine.js';

const MOUTH_OPEN_PARAM_IDS = ['PARAM_MOUTH_OPEN_Y', 'ParamMouthOpenY'] as const;
const MOUTH_FORM_PARAM_IDS = ['PARAM_MOUTH_FORM', 'ParamMouthForm'] as const;
const ANGLE_X_PARAM_IDS = ['PARAM_ANGLE_X', 'ParamAngleX'] as const;
const ANGLE_Y_PARAM_IDS = ['PARAM_ANGLE_Y', 'ParamAngleY'] as const;
const BODY_X_PARAM_IDS = ['PARAM_BODY_ANGLE_X', 'ParamBodyAngleX'] as const;

/**
 * BD-ANIM-006 口型同步
 * 优先使用 AudioWorklet 音素特征，缺失时回退到 AnalyserNode RMS 音量。
 * 攻击 50ms，释放 80ms，指数插值
 */
export function resolveMouthOpenFromPhonemes(phonemes: LipSyncPhonemeWeights): number {
  const silenceFactor = Math.max(0, 1 - Math.min(phonemes.S || 0, 1));
  const openness = (
    (phonemes.A || 0) * 1.12
    + (phonemes.O || 0) * 0.94
    + (phonemes.U || 0) * 0.68
    + (phonemes.E || 0) * 0.78
    + (phonemes.I || 0) * 0.52
  ) * silenceFactor;
  return Math.max(0, Math.min(Math.pow(openness, 0.92) * 1.08, 1));
}

export function resolveMouthFormFromPhonemes(phonemes: LipSyncPhonemeWeights): number {
  const smileLike = (phonemes.E || 0) * 0.8 + (phonemes.I || 0) * 0.6;
  const roundLike = (phonemes.O || 0) * 0.85 + (phonemes.U || 0) * 0.65;
  const openLike = phonemes.A || 0;
  const form = smileLike * 0.82 + openLike * 0.12 - roundLike * 0.9;
  return Math.max(-1, Math.min(form * 1.12, 1));
}

export function createLipSyncPlugin() {
  let analyser: AnalyserNode | null = null;
  let dataArray: Uint8Array<ArrayBuffer> | null = null;
  let currentValue = 0;
  let latestFrame: LipSyncFrame | null = null;
  let latestFrameAt = 0;
  let unsubscribeStream: (() => void) | null = null;
  let diagnosticsReporter: ((payload: Record<string, unknown>) => void) | null = null;
  let lastDiagnosticsAt = 0;
  let currentMouthForm = 0;
  let speakingClock = 0;
  let currentAngleX = 0;
  let currentAngleY = 0;
  let currentBodyX = 0;

  const ATTACK_SPEED = 1 / 0.028; // 28ms attack
  const RELEASE_SPEED = 1 / 0.05; // 50ms release
  const VOLUME_THRESHOLD = 0.01;
  const VOLUME_GAIN = 14;
  const WORKLET_FRAME_TTL_MS = 180;
  const SPEAKING_THRESHOLD = 0.08;

  function feedAnalyser(node: AnalyserNode) {
    analyser = node;
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.65;
    dataArray = new Uint8Array(new ArrayBuffer(analyser.fftSize));
  }

  function attachLipSyncStream(stream: LipSyncStream | null | undefined) {
    unsubscribeStream?.();
    unsubscribeStream = null;
    latestFrame = null;
    latestFrameAt = 0;
    if (!stream) return;
    unsubscribeStream = stream.subscribe((frame) => {
      latestFrame = frame;
      latestFrameAt = performance.now();
    });
  }

  function setDiagnosticsReporter(reporter: ((payload: Record<string, unknown>) => void) | null) {
    diagnosticsReporter = reporter;
  }

  function stopAnalyser() {
    analyser = null;
    dataArray = null;
    currentValue = 0;
    currentMouthForm = 0;
    currentAngleX = 0;
    currentAngleY = 0;
    currentBodyX = 0;
    speakingClock = 0;
    latestFrame = null;
    latestFrameAt = 0;
    unsubscribeStream?.();
    unsubscribeStream = null;
  }

  function getVolume(): number {
    if (!analyser || !dataArray) return 0;
    analyser.getByteTimeDomainData(dataArray);
    let sumSquares = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const centered = ((dataArray[i] ?? 128) - 128) / 128;
      sumSquares += centered * centered;
    }
    return Math.sqrt(sumSquares / dataArray.length);
  }

  const plugin: AnimationPlugin & {
    feedAnalyser: typeof feedAnalyser;
    attachLipSyncStream: typeof attachLipSyncStream;
    stopAnalyser: typeof stopAnalyser;
    setDiagnosticsReporter: typeof setDiagnosticsReporter;
  } = {
    id: 'lip-sync',
    priority: 10,
    feedAnalyser,
    attachLipSyncStream,
    stopAnalyser,
    setDiagnosticsReporter,
    update(dt: number, setParam: ParamSetter) {
      speakingClock += dt;
      const rmsVolume = getVolume();
      const rmsTarget = rmsVolume < VOLUME_THRESHOLD
        ? 0
        : Math.min((rmsVolume - VOLUME_THRESHOLD) * VOLUME_GAIN, 1);
      const workletActive = latestFrame && (performance.now() - latestFrameAt) <= WORKLET_FRAME_TTL_MS;
      const phonemeTarget = workletActive && latestFrame
        ? resolveMouthOpenFromPhonemes(latestFrame.phonemes)
        : 0;
      const mouthFormTarget = workletActive && latestFrame
        ? resolveMouthFormFromPhonemes(latestFrame.phonemes)
        : 0;
      const target = workletActive && latestFrame
        ? Math.min(Math.max(phonemeTarget * 1.18, rmsTarget * 0.75), 1)
        : Math.min(rmsTarget * 1.08, 1);
      const speakingActive = target > SPEAKING_THRESHOLD || currentValue > SPEAKING_THRESHOLD;
      const emphasizedTarget = speakingActive
        ? Math.min(0.08 + target * 1.06, 1)
        : target;

      if (emphasizedTarget > currentValue) {
        // Attack
        currentValue += (emphasizedTarget - currentValue) * Math.min(dt * ATTACK_SPEED, 1);
      } else {
        // Release
        currentValue += (emphasizedTarget - currentValue) * Math.min(dt * RELEASE_SPEED, 1);
      }

      for (const id of MOUTH_OPEN_PARAM_IDS) {
        setParam(id, currentValue);
      }
      currentMouthForm += (mouthFormTarget - currentMouthForm) * Math.min(dt * 18, 1);
      for (const id of MOUTH_FORM_PARAM_IDS) {
        setParam(id, currentMouthForm);
      }

      const speechEnergy = Math.max(currentValue, emphasizedTarget);
      const angleXTarget = speakingActive
        ? Math.sin(speakingClock * 8.4) * (1.2 + speechEnergy * 3.8)
        : 0;
      const angleYTarget = speakingActive
        ? Math.cos(speakingClock * 5.3) * (0.45 + speechEnergy * 1.1)
        : 0;
      const bodyXTarget = speakingActive
        ? Math.sin(speakingClock * 4.2 + 0.7) * (0.6 + speechEnergy * 1.45)
        : 0;
      currentAngleX += (angleXTarget - currentAngleX) * Math.min(dt * 9, 1);
      currentAngleY += (angleYTarget - currentAngleY) * Math.min(dt * 8, 1);
      currentBodyX += (bodyXTarget - currentBodyX) * Math.min(dt * 7, 1);

      for (const id of ANGLE_X_PARAM_IDS) {
        setParam(id, currentAngleX);
      }
      for (const id of ANGLE_Y_PARAM_IDS) {
        setParam(id, currentAngleY);
      }
      for (const id of BODY_X_PARAM_IDS) {
        setParam(id, currentBodyX);
      }

      const now = performance.now();
      if (diagnosticsReporter && now - lastDiagnosticsAt >= 250) {
        lastDiagnosticsAt = now;
        diagnosticsReporter({
          rmsVolume,
          rmsTarget,
          phonemeTarget,
          mouthFormTarget,
          mouthOpen: currentValue,
          mouthForm: currentMouthForm,
          speechEnergy,
          usingWorklet: Boolean(workletActive),
          dominantPhoneme: latestFrame?.dominantPhoneme || 'S',
          phonemes: latestFrame?.phonemes || null,
          mfcc: latestFrame?.mfcc || [],
          paramIds: MOUTH_OPEN_PARAM_IDS,
        });
      }
    },
    destroy() {
      analyser = null;
      dataArray = null;
      currentValue = 0;
      currentMouthForm = 0;
      currentAngleX = 0;
      currentAngleY = 0;
      currentBodyX = 0;
      speakingClock = 0;
      latestFrame = null;
      latestFrameAt = 0;
      unsubscribeStream?.();
      unsubscribeStream = null;
      diagnosticsReporter = null;
    },
  };

  return plugin;
}
