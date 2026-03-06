import { createLocalChatFlowId, emitLocalChatLog } from './logging.js';
import type { LocalChatReadContext } from './data/index.js';
import { runLocalChatProactiveHeartbeatCycle } from './proactive/engine.js';
import { startLocalChatProactiveScheduler } from './proactive/scheduler.js';
import type { LocalChatProactiveAuditEvent } from './proactive/types.js';
import type { LocalChatAiClient } from './runtime-ai-client.js';

let stopProactiveHeartbeatScheduler: (() => void) | null = null;

function toErrorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error || '');
}

function emitProactiveSchedulerError(error: unknown): void {
  emitLocalChatLog({
    level: 'warn',
    message: 'action:proactive-heartbeat:tick-failed',
    flowId: createLocalChatFlowId('local-chat-proactive-heartbeat'),
    source: 'startLocalChatProactiveHeartbeat',
    details: {
      error: toErrorText(error),
    },
  });
}

export async function runLocalChatProactiveHeartbeatOnce(input: {
  aiClient: Pick<LocalChatAiClient, 'generateObject'>;
  getReadContext: () => LocalChatReadContext;
  nowMs?: () => number;
  onAuditEvent?: (event: LocalChatProactiveAuditEvent) => void;
}): Promise<void> {
  await runLocalChatProactiveHeartbeatCycle(input);
}

export function stopLocalChatProactiveHeartbeat(): void {
  if (!stopProactiveHeartbeatScheduler) return;
  stopProactiveHeartbeatScheduler();
  stopProactiveHeartbeatScheduler = null;
}

export function startLocalChatProactiveHeartbeat(input: {
  aiClient: Pick<LocalChatAiClient, 'generateObject'>;
  getReadContext: () => LocalChatReadContext;
}): void {
  stopLocalChatProactiveHeartbeat();
  stopProactiveHeartbeatScheduler = startLocalChatProactiveScheduler({
    runCycle: () => runLocalChatProactiveHeartbeatCycle(input),
    onTickFailed: emitProactiveSchedulerError,
  });
}
