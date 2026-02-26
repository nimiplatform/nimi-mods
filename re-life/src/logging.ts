import { emitRuntimeLog } from '@nimiplatform/sdk/mod/logging';

export function createReLifeFlowId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emitReLifeLog(options: {
  level?: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  flowId?: string;
  source?: string;
  costMs?: number;
  details?: Record<string, unknown>;
}): void {
  const { level = 'info', message, flowId, source, costMs, details } = options;
  try {
    emitRuntimeLog({
      level,
      area: 're-life',
      message,
      flowId,
      source,
      costMs,
      details,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error || '');
    if (errorMessage.includes('MOD_SDK_HOST_NOT_READY')) {
      return;
    }
    throw error;
  }
}
