import { emitRuntimeLog } from '@nimiplatform/sdk/mod/logging';

export function createDailyOutfitFlowId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emitDailyOutfitLog(options: {
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
      area: 'daily-outfit',
      message,
      flowId,
      source,
      costMs,
      details,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error || '');
    const errorCode = error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : '';
    const reasonCode = error && typeof error === 'object' && 'reasonCode' in error
      ? String((error as { reasonCode?: unknown }).reasonCode || '')
      : '';
    if (
      errorMessage.includes('MOD_SDK_HOST_NOT_READY')
      || errorMessage.includes('mod SDK host is not ready')
      || errorCode === 'SDK_MOD_HOST_MISSING'
      || reasonCode === 'SDK_MOD_HOST_MISSING'
    ) {
      return;
    }
    throw error;
  }
}
