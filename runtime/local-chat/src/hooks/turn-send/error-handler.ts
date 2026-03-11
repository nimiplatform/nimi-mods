import type { LocalChatTarget } from '../../data/index.js';
import type { ChatMessage } from '../../types.js';
import { buildTurnAudit } from './diagnostics.js';

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || '');
}

export function buildErrorTurnPayload(input: {
  selectedTarget: LocalChatTarget;
  error: unknown;
  latencyMs: number;
}): {
  message: string;
  errorMessage: ChatMessage;
  turnAudit: ReturnType<typeof buildTurnAudit>;
} {
  const message = toErrorMessage(input.error);
  return {
    message,
    errorMessage: {
      id: `msg-${Date.now().toString(36)}-error`,
      role: 'assistant',
      kind: 'text',
      content: `Error: ${message}`,
      timestamp: new Date(),
    },
    turnAudit: buildTurnAudit({
      selectedTarget: input.selectedTarget,
      latencyMs: input.latencyMs,
      error: message,
    }),
  };
}
