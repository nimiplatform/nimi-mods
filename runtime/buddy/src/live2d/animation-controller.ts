import type { Live2DModel } from 'pixi-live2d-display/cubism4';

export interface AnimationPlugin {
  readonly id: string;
  readonly priority: number;
  update(dt: number, setParam: ParamSetter): void;
  destroy?(): void;
}

export type ParamSetter = (id: string, value: number) => void;

/**
 * 帧级别动画控制器 — 按优先级执行注册的动画插件。
 * 每帧通过 requestAnimationFrame 调用所有插件的 update()。
 */
export class AnimationController {
  private plugins: AnimationPlugin[] = [];
  private rafId: number | null = null;
  private lastTime = 0;
  private model: Live2DModel;

  constructor(model: Live2DModel) {
    this.model = model;
  }

  register(plugin: AnimationPlugin) {
    this.plugins.push(plugin);
    this.plugins.sort((a, b) => a.priority - b.priority);
  }

  start() {
    if (this.rafId !== null) return;
    this.lastTime = performance.now();
    this.tick();
  }

  pause() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  resume() {
    if (this.rafId !== null) return;
    if (this.plugins.length === 0) return;
    this.lastTime = performance.now();
    this.tick();
  }

  private tick = () => {
    const now = performance.now();
    const dt = (now - this.lastTime) / 1000; // seconds
    this.lastTime = now;

    const coreModel = (this.model.internalModel as any)?.coreModel;
    if (!coreModel) {
      this.rafId = requestAnimationFrame(this.tick);
      return;
    }

    const setParam: ParamSetter = (id, value) => {
      const index = coreModel.getParameterIndex(id);
      if (index >= 0) {
        coreModel.setParameterValueByIndex(index, value);
      }
    };

    for (const plugin of this.plugins) {
      plugin.update(dt, setParam);
    }

    this.rafId = requestAnimationFrame(this.tick);
  };

  destroy() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    for (const plugin of this.plugins) {
      plugin.destroy?.();
    }
    this.plugins = [];
  }
}
