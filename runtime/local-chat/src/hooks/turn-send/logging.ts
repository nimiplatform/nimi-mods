import { logRendererEvent } from '@nimiplatform/sdk/mod/logging';
import type { LocalChatTarget } from '../../data/index.js';
import type { SegmentParseMode } from './types.js';

export function logTurnSendStart(input: {
  flowId: string;
  target: LocalChatTarget;
  sessionId: string;
  turnTxnId: string;
}) {
  logRendererEvent({
    level: 'info',
    area: 'local-chat',
    message: 'local-chat:send-turn:start',
    flowId: input.flowId,
    details: {
      targetId: input.target.id,
      worldId: input.target.worldId,
      sessionId: input.sessionId,
      turnTxnId: input.turnTxnId,
    },
  });
}

export function logTurnSendDone(input: {
  flowId: string;
  target: LocalChatTarget;
  latencyMs: number;
  turnTxnId: string;
  planId: string;
  followupSent: boolean;
  segmentCount: number;
  textSegments: number;
  voiceSegments: number;
  schedulerTotalDelayMs: number;
  streamDeltaCount: number;
  streamDurationMs: number;
  segmentParseMode: SegmentParseMode;
}) {
  logRendererEvent({
    level: 'info',
    area: 'local-chat',
    message: 'local-chat:send-turn:done',
    flowId: input.flowId,
    details: {
      targetId: input.target.id,
      worldId: input.target.worldId,
      latencyMs: input.latencyMs,
      turnTxnId: input.turnTxnId,
      planId: input.planId,
      planner: 'stream',
      followupSent: input.followupSent,
      segmentCount: input.segmentCount,
      textSegments: input.textSegments,
      voiceSegments: input.voiceSegments,
      schedulerTotalDelayMs: input.schedulerTotalDelayMs,
      streamDeltaCount: input.streamDeltaCount,
      streamDurationMs: input.streamDurationMs,
      segmentParseMode: input.segmentParseMode,
    },
  });
}

export function logTurnScheduleCancelled(input: {
  flowId: string;
  target: LocalChatTarget;
  turnTxnId: string;
  planId: string;
  segmentCount: number;
  textSegments: number;
  voiceSegments: number;
  schedulerTotalDelayMs: number;
  cancelReason: string;
  deliveredCount: number;
  pendingCount: number;
}) {
  logRendererEvent({
    level: 'info',
    area: 'local-chat',
    message: 'local-chat:send-turn:schedule-cancelled',
    flowId: input.flowId,
    details: {
      targetId: input.target.id,
      worldId: input.target.worldId,
      turnTxnId: input.turnTxnId,
      planId: input.planId,
      segmentCount: input.segmentCount,
      textSegments: input.textSegments,
      voiceSegments: input.voiceSegments,
      schedulerTotalDelayMs: input.schedulerTotalDelayMs,
      cancelReason: input.cancelReason,
      deliveredCount: input.deliveredCount,
      pendingCount: input.pendingCount,
    },
  });
}

export function logTurnSendFailed(flowId: string, message: string) {
  logRendererEvent({
    level: 'error',
    area: 'local-chat',
    message: 'local-chat:send-turn:failed',
    flowId,
    details: { error: message },
  });
}
