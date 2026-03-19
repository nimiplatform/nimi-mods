import * as PIXI from 'pixi.js';
import type { Live2DModel } from 'pixi-live2d-display/cubism4';
import { AnimationController } from './animation-controller.js';
import { createAutoBlinkPlugin } from './plugins/auto-blink.js';
import { createEyeSaccadePlugin } from './plugins/eye-saccade.js';
import { createIdleBreathPlugin } from './plugins/idle-breath.js';
import { createExpressionDriverPlugin } from './plugins/expression-driver.js';
import { createLipSyncPlugin } from './plugins/lip-sync.js';
import type { BuddyModelId, EmotionType } from '../contracts.js';
import { DEFAULT_BUDDY_MODEL_ID } from '../contracts.js';
import { getBuddyMotionProfile } from './motion-profile.js';
import type { LipSyncStream } from '../services/voice-engine.js';
import { isBuddyDebugEnabled, logBuddyConsole } from '../services/debug-log.js';
import { ensureCubismCore } from '../cubism-core-loader.js';
import { logRendererEvent } from "@nimiplatform/sdk/mod";
type Live2DModule = typeof import('pixi-live2d-display/cubism4');
let live2dModulePromise: Promise<Live2DModule> | null = null;
async function loadLive2DModule(): Promise<Live2DModule> {
    await ensureCubismCore();
    if (!live2dModulePromise) {
        live2dModulePromise = import('pixi-live2d-display/cubism4');
    }
    return live2dModulePromise;
}
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
    feedAudio(analyser: AnalyserNode, lipSyncStream?: LipSyncStream | null): void;
    stopAudio(): void;
    handleTap(clientX: number, clientY: number): void;
    setViewportScale(multiplier: number): void;
    setViewportOffsetX(offsetPx: number): void;
    setViewportOffsetY(offsetPx: number): void;
    resize(width: number, height: number): void;
    pauseBackgroundWork(): void;
    resumeBackgroundWork(): void;
    destroy(): void;
}
export function createModelManager(onStateChange: (state: ModelState, error?: string) => void): ModelManager {
    let state: ModelState = 'idle';
    let app: PIXI.Application | null = null;
    let model: Live2DModel | null = null;
    let animCtrl: AnimationController | null = null;
    let lipSyncPlugin: ReturnType<typeof createLipSyncPlugin> | null = null;
    let expressionPlugin: ReturnType<typeof createExpressionDriverPlugin> | null = null;
    let canvasEl: HTMLCanvasElement | null = null;
    let idleMotionTimer: ReturnType<typeof setInterval> | null = null;
    let speakingMotionTimer: ReturnType<typeof setInterval> | null = null;
    let currentModelId: BuddyModelId = DEFAULT_BUDDY_MODEL_ID;
    let currentMotionProfile = getBuddyMotionProfile(DEFAULT_BUDDY_MODEL_ID);
    let currentEmotion: EmotionType = 'happy';
    let speaking = false;
    let viewportScale = 1.9;
    let viewportOffsetX = 0;
    let viewportOffsetY = 0;
    const debugEnabled = isBuddyDebugEnabled();
    function getViewportSize() {
        const parent = canvasEl?.parentElement;
        const width = parent?.clientWidth || canvasEl?.clientWidth || app?.screen.width || 0;
        const height = parent?.clientHeight || canvasEl?.clientHeight || app?.screen.height || 0;
        return { width, height };
    }
    function buildEmotionMotionQueue(emotion: EmotionType, mode: 'idle' | 'speak' | 'tap' | 'greet'): string[] {
        if (mode === 'tap') {
            return [
                ...(currentMotionProfile.tap || []),
                ...(currentMotionProfile.emotion[emotion] || []),
                ...(currentMotionProfile.idle || []),
            ];
        }
        if (mode === 'greet') {
            return [
                ...(currentMotionProfile.greet || []),
                ...(currentMotionProfile.emotion[emotion] || []),
                ...(currentMotionProfile.idle || []),
            ];
        }
        if (mode === 'speak') {
            return [
                ...(currentMotionProfile.speak || []),
                ...(currentMotionProfile.emotion[emotion] || []),
                ...(currentMotionProfile.idle || []),
            ];
        }
        return [
            ...(currentMotionProfile.emotion[emotion] || []),
            ...(currentMotionProfile.idle || []),
        ];
    }
    async function playFirstAvailableMotion(groups: string[]): Promise<boolean> {
        const activeModel = model;
        if (!activeModel)
            return false;
        for (const group of groups) {
            try {
                const started = await activeModel.motion(group);
                if (started) {
                    return true;
                }
            }
            catch {
                // Try the next fallback group.
            }
        }
        return false;
    }
    function computeViewportScale(viewWidth: number, viewHeight: number, naturalWidth: number, naturalHeight: number): number {
        const widthScale = (viewWidth * 0.48) / naturalWidth;
        const heightScale = (viewHeight * 0.78) / naturalHeight;
        return Math.min(widthScale, heightScale) * viewportScale;
    }
    function clampViewportOffsetX(offset: number, viewWidth: number, viewHeight: number): number {
        if (!model) {
            const fallbackLimit = Math.max(viewWidth * 0.18, 60);
            return Math.min(fallbackLimit, Math.max(-fallbackLimit, offset));
        }
        const bounds = model.getLocalBounds();
        const naturalWidth = Math.max(bounds.width || 0, 1);
        const naturalHeight = Math.max(bounds.height || 0, 1);
        const scale = computeViewportScale(viewWidth, viewHeight, naturalWidth, naturalHeight);
        const scaledWidth = naturalWidth * scale;
        const overflowAllowance = Math.max((scaledWidth - viewWidth * 0.58) * 0.5, 0);
        const limit = Math.max(viewWidth * 0.1, overflowAllowance, 60);
        return Math.min(limit, Math.max(-limit, offset));
    }
    function clampViewportOffset(offset: number, viewWidth: number, viewHeight: number): number {
        if (!model) {
            const fallbackLimit = Math.max(viewHeight * 0.28, 80);
            return Math.min(fallbackLimit, Math.max(-fallbackLimit, offset));
        }
        const bounds = model.getLocalBounds();
        const naturalWidth = Math.max(bounds.width || 0, 1);
        const naturalHeight = Math.max(bounds.height || 0, 1);
        const scale = computeViewportScale(viewWidth, viewHeight, naturalWidth, naturalHeight);
        const scaledHeight = naturalHeight * scale;
        const overflowAllowance = Math.max((scaledHeight - viewHeight * 0.7) * 0.5, 0);
        const limit = Math.max(viewHeight * 0.18, overflowAllowance, 80);
        return Math.min(limit, Math.max(-limit, offset));
    }
    function applyModelLayout(viewWidth: number, viewHeight: number) {
        if (!model)
            return;
        const bounds = model.getLocalBounds();
        const naturalWidth = Math.max(bounds.width || 0, 1);
        const naturalHeight = Math.max(bounds.height || 0, 1);
        model.anchor.set(0.5, 0.5);
        const scale = computeViewportScale(viewWidth, viewHeight, naturalWidth, naturalHeight);
        model.scale.set(scale);
        model.x = (viewWidth * 0.5) + clampViewportOffsetX(viewportOffsetX, viewWidth, viewHeight);
        model.y = (viewHeight * 0.56) + clampViewportOffset(viewportOffsetY, viewWidth, viewHeight);
    }
    function clearIdleMotionLoop() {
        if (idleMotionTimer) {
            clearInterval(idleMotionTimer);
            idleMotionTimer = null;
        }
    }
    function clearSpeakingMotionLoop() {
        if (speakingMotionTimer) {
            clearInterval(speakingMotionTimer);
            speakingMotionTimer = null;
        }
    }
    function restartIdleMotionLoop() {
        clearIdleMotionLoop();
        if (!model || speaking)
            return;
        void playFirstAvailableMotion(buildEmotionMotionQueue(currentEmotion, 'idle'));
        idleMotionTimer = setInterval(() => {
            if (!model || speaking)
                return;
            const ambientGroups = currentMotionProfile.ambient;
            const selectedGroup = ambientGroups[Math.floor(Math.random() * ambientGroups.length)] || '';
            void playFirstAvailableMotion([
                selectedGroup,
                ...buildEmotionMotionQueue(currentEmotion, 'idle'),
            ]);
        }, 10000);
    }
    function restartSpeakingMotionLoop(emotion: EmotionType) {
        clearSpeakingMotionLoop();
        if (!model)
            return;
        void playFirstAvailableMotion(buildEmotionMotionQueue(emotion, 'speak'));
        speakingMotionTimer = setInterval(() => {
            if (!model || !speaking)
                return;
            void playFirstAvailableMotion(buildEmotionMotionQueue(currentEmotion, 'speak'));
        }, 2400);
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
        app = new PIXI.Application({
            view: canvas,
            autoStart: true,
            backgroundAlpha: 0,
            antialias: true,
            autoDensity: true,
            resolution: Math.min((typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1), 2),
            resizeTo: canvas.parentElement ?? undefined,
        });
    }
    function setModelProfile(modelId: BuddyModelId) {
        currentModelId = modelId;
        currentMotionProfile = getBuddyMotionProfile(modelId);
    }
    async function loadModel(modelUrl: string) {
        if (!app)
            return;
        setState('loading');
        try {
            const { Live2DModel, config: live2dConfig } = await loadLive2DModule();
            live2dConfig.sound = false;
            Live2DModel.registerTicker(PIXI.Ticker);
            // Remove previous model
            if (model) {
                app.stage.removeChild(model as unknown as PIXI.DisplayObject);
                model.destroy();
                model = null;
            }
            clearIdleMotionLoop();
            clearSpeakingMotionLoop();
            speaking = false;
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
            const coreModel = (loaded.internalModel as any)?.coreModel;
            if (coreModel) {
                const details = {
                    modelId: currentModelId,
                    modelUrl,
                    hasPARAM_MOUTH_OPEN_Y: coreModel.getParameterIndex('PARAM_MOUTH_OPEN_Y') >= 0,
                    hasParamMouthOpenY: coreModel.getParameterIndex('ParamMouthOpenY') >= 0,
                    hasPARAM_MOUTH_FORM: coreModel.getParameterIndex('PARAM_MOUTH_FORM') >= 0,
                    hasParamMouthForm: coreModel.getParameterIndex('ParamMouthForm') >= 0,
                    hasPARAM_ANGLE_X: coreModel.getParameterIndex('PARAM_ANGLE_X') >= 0,
                    hasParamAngleX: coreModel.getParameterIndex('ParamAngleX') >= 0,
                    hasPARAM_BODY_ANGLE_X: coreModel.getParameterIndex('PARAM_BODY_ANGLE_X') >= 0,
                    hasParamBodyAngleX: coreModel.getParameterIndex('ParamBodyAngleX') >= 0,
                };
                if (debugEnabled) {
                    logBuddyConsole('debug', 'buddy:model:mouth-params', details);
                    logRendererEvent({
                        level: 'debug',
                        area: 'buddy',
                        message: 'buddy:model:mouth-params',
                        details,
                    });
                }
            }
            // Scale and position model to fit canvas
            const { width, height } = getViewportSize();
            applyModelLayout(width, height);
            app.stage.addChild(model as unknown as PIXI.DisplayObject);
            // Initialize animation plugins
            lipSyncPlugin = createLipSyncPlugin();
            if (debugEnabled) {
                lipSyncPlugin.setDiagnosticsReporter((payload) => {
                    logBuddyConsole('debug', 'buddy:lipsync:frame', payload);
                    logRendererEvent({
                        level: 'debug',
                        area: 'buddy',
                        message: 'buddy:lipsync:frame',
                        details: payload,
                    });
                });
            }
            else {
                lipSyncPlugin.setDiagnosticsReporter(null);
            }
            expressionPlugin = createExpressionDriverPlugin();
            animCtrl = new AnimationController(model);
            animCtrl.register(lipSyncPlugin);
            animCtrl.register(expressionPlugin);
            animCtrl.register(createAutoBlinkPlugin());
            animCtrl.register(createEyeSaccadePlugin(canvasEl));
            animCtrl.register(createIdleBreathPlugin());
            animCtrl.start();
            expressionPlugin?.setEmotion(currentEmotion);
            expressionPlugin?.setSpeaking(false);
            void playFirstAvailableMotion(buildEmotionMotionQueue(currentEmotion, 'greet'));
            restartIdleMotionLoop();
            setState('ready');
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setState('error', msg);
        }
    }
    function setEmotion(emotion: EmotionType) {
        currentEmotion = emotion;
        expressionPlugin?.setEmotion(emotion);
        if (speaking) {
            expressionPlugin?.setSpeaking(true);
            restartSpeakingMotionLoop(emotion);
            return;
        }
        void playFirstAvailableMotion(buildEmotionMotionQueue(emotion, 'idle'));
    }
    function startSpeaking(emotion?: EmotionType) {
        const activeEmotion = emotion || currentEmotion;
        speaking = true;
        currentEmotion = activeEmotion;
        expressionPlugin?.setEmotion(activeEmotion);
        expressionPlugin?.setSpeaking(true);
        clearIdleMotionLoop();
        restartSpeakingMotionLoop(activeEmotion);
    }
    function stopSpeaking() {
        speaking = false;
        expressionPlugin?.setSpeaking(false);
        clearSpeakingMotionLoop();
        void playFirstAvailableMotion(buildEmotionMotionQueue(currentEmotion, 'idle'));
        restartIdleMotionLoop();
    }
    function feedAudio(analyser: AnalyserNode, lipSyncStream?: LipSyncStream | null) {
        lipSyncPlugin?.feedAnalyser(analyser);
        lipSyncPlugin?.attachLipSyncStream(lipSyncStream);
    }
    function stopAudio() {
        lipSyncPlugin?.stopAnalyser();
    }
    function handleTap(clientX: number, clientY: number) {
        const activeModel = model;
        if (!activeModel || !canvasEl)
            return;
        const rect = canvasEl.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        activeModel.tap(x, y);
        void playFirstAvailableMotion(buildEmotionMotionQueue(currentEmotion, 'tap'));
    }
    function setViewportScale(multiplier: number) {
        viewportScale = Math.min(2.8, Math.max(0.8, multiplier));
        const viewport = getViewportSize();
        if ((viewport.width || 0) > 0 && (viewport.height || 0) > 0) {
            applyModelLayout(viewport.width, viewport.height);
        }
    }
    function setViewportOffsetX(offsetPx: number) {
        const viewport = getViewportSize();
        const width = viewport.width || app?.screen.width || 0;
        const height = viewport.height || app?.screen.height || 0;
        viewportOffsetX = clampViewportOffsetX(offsetPx, width, height);
        if ((viewport.width || 0) > 0 && (viewport.height || 0) > 0) {
            applyModelLayout(viewport.width, viewport.height);
        }
    }
    function setViewportOffsetY(offsetPx: number) {
        const viewport = getViewportSize();
        const width = viewport.width || app?.screen.width || 0;
        const height = viewport.height || app?.screen.height || 0;
        viewportOffsetY = clampViewportOffset(offsetPx, width, height);
        if ((viewport.width || 0) > 0 && (viewport.height || 0) > 0) {
            applyModelLayout(viewport.width, viewport.height);
        }
    }
    function resize(width: number, height: number) {
        if (!app || !model)
            return;
        const resolution = Math.min((typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1), 2);
        app.renderer.resolution = resolution;
        app.renderer.resize(width, height);
        const viewport = getViewportSize();
        applyModelLayout(viewport.width || width, viewport.height || height);
    }
    function pauseBackgroundWork() {
        clearIdleMotionLoop();
        clearSpeakingMotionLoop();
        animCtrl?.pause();
    }
    function resumeBackgroundWork() {
        animCtrl?.resume();
        if (speaking) {
            restartSpeakingMotionLoop(currentEmotion);
        }
        else {
            restartIdleMotionLoop();
        }
    }
    function destroy() {
        clearIdleMotionLoop();
        clearSpeakingMotionLoop();
        speaking = false;
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
        setViewportScale,
        setViewportOffsetX,
        setViewportOffsetY,
        resize,
        pauseBackgroundWork,
        resumeBackgroundWork,
        destroy,
    };
}
