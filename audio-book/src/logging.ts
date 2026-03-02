import { createRendererFlowId, logRendererEvent } from '@nimiplatform/sdk/mod/logging';

export function createAudioBookFlowId(prefix: string): string {
  return createRendererFlowId(prefix.startsWith('audio-book') ? prefix : `audio-book-${prefix}`);
}

export function emitAudioBookLog(input: {
  level?: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  flowId?: string;
  source?: string;
  costMs?: number;
  details?: Record<string, unknown>;
}) {
  logRendererEvent({
    level: input.level || 'info',
    area: 'audio-book',
    message: input.message,
    flowId: input.flowId,
    source: input.source,
    costMs: input.costMs,
    details: input.details,
  });
}
