import * as PIXI from 'pixi.js';
import { Live2DModel, config as live2dConfig } from 'pixi-live2d-display/cubism4';
import { AnimationController } from './animation-controller.js';
import { createAutoBlinkPlugin } from './plugins/auto-blink.js';
import { createEyeSaccadePlugin } from './plugins/eye-saccade.js';
import { createIdleBreathPlugin } from './plugins/idle-breath.js';
import { createExpressionDriverPlugin } from './plugins/expression-driver.js';
import { createLipSyncPlugin } from './plugins/lip-sync.js';
import type { BuddyModelId, EmotionType } from '../contracts.js';
import { DEFAULT_BUDDY_MODEL_ID } from '../contracts.js';
import { getBuddyMotionProfile } from './motion-profile.js';

export type ModelState = 'idle' | 'loading' | 'ready' | 'error';

export interface ModelManager {
  readonly state: ModelState;
  readonly app: PIXI.Application | null;
  readonly model: Live2DModel | null;
  readonly animationController: AnimationController | null;
  mount(canvas: HTMLCanvasElement): void;
  setModelProfile(modelId: BuddyModelId): void;
  loadModel(modelUrl: string): Promise<void>;
  setEmotion(emotion: EmotionType): void;
  startSpeaking(emotion?: EmotionType): void;
  stopSpeaking(): void;
  feedAudio(analyser: AnalyserNode): void;
  stopAudio(): void;
  handleTap(clientX: number, clientY: number): void;
  resize(width: number, height: number): void;
  destroy(): void;
}

export function createModelManager(
  onStateChange: (state: ModelState, error?: string) => void,
): ModelManager {
  let state: ModelState = 'idle';
  let app: PIXI.Application | null = null;
  let model: Live2DModel | null = null;
  let animCtrl: AnimationController | null = null;
  let lipSyncPlugin: ReturnType<typeof createLipSyncPlugin> | null = null;
  let expressionPlugin: ReturnType<typeof createExpressionDriverPlugin> | null = null;
  let canvasEl: HTMLCanvasElement | null = null;
  let idleMotionTimer: ReturnType<typeof setInterval> | null = null;
  let currentModelId: BuddyModelId = DEFAULT_BUDDY_MODEL_ID;
  let currentMotionProfile = getBuddyMotionProfile(DEFAULT_BUDDY_MODEL_ID);
  let currentEmotion: EmotionType = 'happy';

  async function playFirstAvailableMotion(groups: string[]): Promise<boolean> {
    const activeModel = model;
    if (!activeModel) return false;
    for (const group of groups) {
      try {
        const started = await activeModel.motion(group);
        if (started) {
          return true;
        }
      } catch {
        // Try the next fallback group.
      }
    }
    return false;
  }

  function applyModelLayout(viewWidth: number, viewHeight: number) {
    if (!model) return;
    model.anchor.set(0.5, 1);
    const widthScale = (viewWidth * 0.58) / model.width;
    const heightScale = (viewHeight * 0.8) / model.height;
    const scale = Math.min(widthScale, heightScale);
    model.scale.set(scale);
    model.x = viewWidth * 0.5;
    model.y = viewHeight * 0.98;
  }

  function clearIdleMotionLoop() {
    if (idleMotionTimer) {
      clearInterval(idleMotionTimer);
      idleMotionTimer = null;
    }
  }

  function restartIdleMotionLoop() {
    clearIdleMotionLoop();
    if (!model) return;
    void playFirstAvailableMotion(currentMotionProfile.idle);
    idleMotionTimer = setInterval(() => {
      if (!model) return;
      const ambientGroups = currentMotionProfile.ambient;
      const selectedGroup = ambientGroups[Math.floor(Math.random() * ambientGroups.length)] || '';
      void playFirstAvailableMotion([selectedGroup, ...currentMotionProfile.idle]);
    }, 10_000);
  }

  function setState(s: ModelState, error?: string) {
    state = s;
    onStateChange(s, error);
  }

  function mount(canvas: HTMLCanvasElement) {
    canvasEl = canvas;
    if (app) {
      app.destroy(true);
    }
    // pixi-live2d-display 0.4 reads motion sound from a global config flag
    // instead of per-model options. Disable it so Buddy only speaks through TTS.
    live2dConfig.sound = false;
    // pixi-live2d-display requires an explicit ticker registration when PIXI
    // isn't exposed as a global on window.
    Live2DModel.registerTicker(PIXI.Ticker);
    app = new PIXI.Application({
      view: canvas,
      autoStart: true,
      backgroundAlpha: 0,
      resizeTo: canvas.parentElement ?? undefined,
    });
  }

  function setModelProfile(modelId: BuddyModelId) {
    currentModelId = modelId;
    currentMotionProfile = getBuddyMotionProfile(modelId);
  }

  async function loadModel(modelUrl: string) {
    if (!app) return;
    setState('loading');

    try {
      // Remove previous model
      if (model) {
        app.stage.removeChild(model as unknown as PIXI.DisplayObject);
        model.destroy();
        model = null;
      }
      clearIdleMotionLoop();
      if (animCtrl) {
        animCtrl.destroy();
        animCtrl = null;
      }

      // Load Live2D model
      const loaded = await Live2DModel.from(modelUrl, {
        autoInteract: false,
        autoUpdate: true,
      } as any);
      model = loaded;

      // Scale and position model to fit canvas
      const { width, height } = app.renderer;
      applyModelLayout(width, height);

      app.stage.addChild(model as unknown as PIXI.DisplayObject);

      // Initialize animation plugins
      lipSyncPlugin = createLipSyncPlugin();
      expressionPlugin = createExpressionDriverPlugin();

      animCtrl = new AnimationController(model);
      animCtrl.register(lipSyncPlugin);
      animCtrl.register(expressionPlugin);
      animCtrl.register(createAutoBlinkPlugin());
      animCtrl.register(createEyeSaccadePlugin(canvasEl));
      animCtrl.register(createIdleBreathPlugin());
      animCtrl.start();
      void playFirstAvailableMotion(currentMotionProfile.greet);
      restartIdleMotionLoop();

      setState('ready');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setState('error', msg);
    }
  }

  function setEmotion(emotion: EmotionType) {
    currentEmotion = emotion;
    expressionPlugin?.setEmotion(emotion);
    void playFirstAvailableMotion([
      ...(currentMotionProfile.emotion[emotion] || []),
      ...currentMotionProfile.idle,
    ]);
  }

  function startSpeaking(emotion?: EmotionType) {
    const activeEmotion = emotion || currentEmotion;
    void playFirstAvailableMotion([
      ...(currentMotionProfile.emotion[activeEmotion] || []),
      ...currentMotionProfile.speak,
      ...currentMotionProfile.idle,
    ]);
  }

  function stopSpeaking() {
    void playFirstAvailableMotion(currentMotionProfile.idle);
  }

  function feedAudio(analyser: AnalyserNode) {
    lipSyncPlugin?.feedAnalyser(analyser);
  }

  function stopAudio() {
    lipSyncPlugin?.stopAnalyser();
  }

  function handleTap(clientX: number, clientY: number) {
    const activeModel = model;
    if (!activeModel || !canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    activeModel.tap(x, y);
    void playFirstAvailableMotion([
      ...currentMotionProfile.tap,
      ...currentMotionProfile.idle,
    ]);
  }

  function resize(width: number, height: number) {
    if (!app || !model) return;
    app.renderer.resize(width, height);
    applyModelLayout(width, height);
  }

  function destroy() {
    clearIdleMotionLoop();
    animCtrl?.destroy();
    animCtrl = null;
    if (model && app) {
      app.stage.removeChild(model as unknown as PIXI.DisplayObject);
      model.destroy();
    }
    model = null;
    app?.destroy(true);
    app = null;
    lipSyncPlugin = null;
    expressionPlugin = null;
    setState('idle');
  }

  return {
    get state() { return state; },
    get app() { return app; },
    get model() { return model; },
    get animationController() { return animCtrl; },
    mount,
    setModelProfile,
    loadModel,
    setEmotion,
    startSpeaking,
    stopSpeaking,
    feedAudio,
    stopAudio,
    handleTap,
    resize,
    destroy,
  };
}
