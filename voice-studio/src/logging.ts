import { createRendererFlowId, logRendererEvent } from '@nimiplatform/sdk/mod/logging';

export function createVoiceStudioFlowId(prefix: string): string {
  return createRendererFlowId(prefix.startsWith('voice-studio') ? prefix : `voice-studio-${prefix}`);
}

export function emitVoiceStudioLog(input: {
  level?: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  flowId?: string;
  source?: string;
  costMs?: number;
  details?: Record<string, unknown>;
}) {
  logRendererEvent({
    level: input.level || 'info',
    area: 'voice-studio',
    message: input.message,
    flowId: input.flowId,
    source: input.source,
    costMs: input.costMs,
    details: input.details,
  });
}
