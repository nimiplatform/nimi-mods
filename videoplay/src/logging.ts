export function createVideoPlayFlowId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

type RuntimeLogEmitter = (payload: {
  level: 'debug' | 'info' | 'warn' | 'error';
  area: string;
  message: string;
  flowId?: string;
  source?: string;
  costMs?: number;
  details?: Record<string, unknown>;
}) => void;

function resolveRuntimeLogEmitter(): RuntimeLogEmitter | null {
  const value = (globalThis as { __NIMI_MOD_EMIT_RUNTIME_LOG__?: unknown }).__NIMI_MOD_EMIT_RUNTIME_LOG__;
  if (typeof value === 'function') {
    return value as RuntimeLogEmitter;
  }
  return null;
}

export function emitVideoPlayLog(options: {
  level?: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  flowId?: string;
  source?: string;
  costMs?: number;
  details?: Record<string, unknown>;
}): void {
  const { level = 'info', message, flowId, source, costMs, details } = options;
  const emitter = resolveRuntimeLogEmitter();
  if (!emitter) return;
  emitter({
    level,
    area: 'videoplay',
    message,
    flowId,
    source,
    costMs,
    details,
  });
}
