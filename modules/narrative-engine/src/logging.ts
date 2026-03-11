import { emitRuntimeLog } from '@nimiplatform/sdk/mod/logging';

export function createNarrativeFlowId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emitNarrativeLog(input: {
  level?: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  flowId?: string;
  source?: string;
  costMs?: number;
  details?: Record<string, unknown>;
}): void {
  const { level = 'info', message, flowId, source, costMs, details } = input;
  try {
    emitRuntimeLog({
      level,
      area: 'narrative-engine',
      message,
      flowId,
      source,
      costMs,
      details,
    });
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error || '');
    const code = (
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: unknown }).code || '')
        : ''
    );
    if (
      code === 'SDK_MOD_HOST_MISSING'
      || text.includes('MOD_SDK_HOST_NOT_READY')
      || text.includes('mod SDK host is not ready')
    ) {
      return;
    }
    throw error;
  }
}
