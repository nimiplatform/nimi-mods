import { emitLocalChatLog } from '../logging.js';
import type { LocalChatProactiveAuditEvent } from './types.js';

export function emitLocalChatProactiveAuditEvent(event: LocalChatProactiveAuditEvent): void {
  emitLocalChatLog({
    level: event.level || 'info',
    message: 'action:proactive-heartbeat:audit',
    flowId: event.flowId,
    source: event.source,
    details: {
      targetId: event.targetId,
      sessionId: event.sessionId,
      reasonCode: event.reasonCode,
      actionHint: event.actionHint,
      ...(event.details || {}),
    },
  });
}
