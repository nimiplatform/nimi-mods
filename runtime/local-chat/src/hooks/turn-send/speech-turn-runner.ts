import type { ChatMessageMeta } from '../../types.js';
import { localChatMessage } from '../../i18n/messages.js';
import { resolveAssistantSegmentKind } from './channel-policy.js';
import type { AssistantPlanSegment } from './types.js';

const MAX_SEGMENT_DELAY_MS = 8_000;
const MAX_SEGMENT_COUNT = 4;

function clampDelayMs(value: number, index: number): number {
  if (index === 0) return 0;
  if (!Number.isFinite(value) || value < 0) return 1_000;
  return Math.min(MAX_SEGMENT_DELAY_MS, Math.round(value));
}

type BuildAssistantMessagesInput = {
  segments: AssistantPlanSegment[];
  enableVoice: boolean;
  autoPlayVoiceReplies: boolean;
  planId: string;
};

export type AssistantDelivery = {
  id: string;
  kind: 'text' | 'voice';
  content: string;
  delayMs: number;
  meta: ChatMessageMeta;
};

export function buildAssistantMessagesAndTurns(input: BuildAssistantMessagesInput): {
  planId: string;
  deliveries: AssistantDelivery[];
  followupSent: boolean;
  segmentCount: number;
  textSegments: number;
  voiceSegments: number;
  schedulerTotalDelayMs: number;
} {
  const fallbackSegment: AssistantPlanSegment = {
    id: `seg-${Date.now().toString(36)}-0`,
    content: localChatMessage(
      'TurnFeedback.noReplyAvailable',
      'Sorry, I do not have a usable reply right now. Please try again.',
    ),
    delayMs: 0,
    channel: 'text',
    intent: 'answer',
    reason: 'empty-plan-fallback',
  };

  const normalizedSegments = (input.segments.length > 0
    ? input.segments
    : [fallbackSegment]).slice(0, MAX_SEGMENT_COUNT);

  let textSegments = 0;
  let voiceSegments = 0;
  let schedulerTotalDelayMs = 0;
  const segmentCount = normalizedSegments.length;

  const deliveries = normalizedSegments.map((segment, index) => {
    const kind = resolveAssistantSegmentKind({
      segment,
      settings: {
        enableVoice: input.enableVoice,
      },
    });
    if (kind === 'voice') {
      voiceSegments += 1;
    } else {
      textSegments += 1;
    }
    const delayMs = clampDelayMs(segment.delayMs, index);
    schedulerTotalDelayMs += delayMs;

    return {
      id: `msg-${Date.now().toString(36)}-${index}`,
      kind,
      content: segment.content,
      delayMs,
      meta: {
        autoPlayVoice: kind === 'voice' && input.autoPlayVoiceReplies,
        planId: input.planId,
        segmentId: segment.id,
        segmentIndex: index + 1,
        segmentCount,
        intent: segment.intent,
        scheduledDelayMs: delayMs,
        channelDecision: kind,
      },
    } satisfies AssistantDelivery;
  });

  return {
    planId: input.planId,
    deliveries,
    followupSent: deliveries.length > 1,
    segmentCount: deliveries.length,
    textSegments,
    voiceSegments,
    schedulerTotalDelayMs,
  };
}
