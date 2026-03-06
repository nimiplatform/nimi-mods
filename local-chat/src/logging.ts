import { emitRuntimeLog } from '@nimiplatform/sdk/mod/logging';

export function createLocalChatFlowId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function emitLocalChatLog(options: {
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
      area: 'local-chat',
      message,
      flowId,
      source,
      costMs,
      details,
    });
  } catch (error) {
    const errorCode = typeof error === 'object' && error && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : '';
    const errorMessage = error instanceof Error ? error.message : String(error || '');
    if (
      errorCode === 'SDK_MOD_HOST_MISSING'
      || errorMessage.includes('MOD_SDK_HOST_NOT_READY')
      || errorMessage.includes('SDK_MOD_HOST_MISSING')
      || errorMessage.includes('mod SDK host is not ready')
    ) {
      return;
    }
    throw error;
  }
}
