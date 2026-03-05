import { logRendererEvent } from '@nimiplatform/sdk/mod/logging';
import {
  isDegenerateAssistantReply,
  isPromptEchoReply,
  sanitizeAssistantReply,
} from '../../services/view/reply.js';
import type { TurnInvokeInput } from './request-builder.js';
import type {
  AssistantPlanSegment,
  LocalChatTextAiClient,
  SegmentParseMode,
} from './types.js';

const MAX_PLANNED_SEGMENTS = 4;
const MAX_SEGMENT_CHARS = 420;
const EXPLICIT_SEGMENT_RE = /\n{2,}\[\[SEG\]\]\n{2,}/;
const DOUBLE_NEWLINE_RE = /\n{2,}/;

export type TextTurnResult = {
  planner: 'stream';
  segments: AssistantPlanSegment[];
  firstReply: string;
  streamCompleted: boolean;
  streamDeltaCount: number;
  streamDurationMs: number;
  segmentParseMode: SegmentParseMode;
};

type RunTextTurnInput = {
  flowId: string;
  aiClient: LocalChatTextAiClient;
  invokeInput: TurnInvokeInput;
  prompt: string;
  allowMultiReply: boolean;
  onStreamDelta?: (delta: string, chunkCount: number) => void;
};

type SplitSegmentsResult = {
  segments: string[];
  parseMode: SegmentParseMode;
};

function normalizeSegmentText(value: string): string {
  return sanitizeAssistantReply(String(value || '').trim())
    .replace(/\r/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function normalizeCandidateSegments(candidates: string[]): string[] {
  return candidates
    .map((item) => normalizeSegmentText(item))
    .filter((item) => Boolean(item))
    .filter((item) => !isPromptEchoReply(item))
    .filter((item) => !isDegenerateAssistantReply(item))
    .map((item) => item.slice(0, MAX_SEGMENT_CHARS));
}

function splitIntoSegments(text: string, allowMultiReply: boolean): SplitSegmentsResult {
  const normalizedText = normalizeSegmentText(text);
  if (!normalizedText) {
    return {
      segments: ['抱歉，我现在没有可用回复。请再试一次。'],
      parseMode: 'single-message',
    };
  }

  let parseMode: SegmentParseMode = 'single-message';
  let rawSegments: string[] = [normalizedText];

  if (EXPLICIT_SEGMENT_RE.test(normalizedText)) {
    parseMode = 'explicit-delimiter';
    rawSegments = normalizedText.split(EXPLICIT_SEGMENT_RE);
  } else if (DOUBLE_NEWLINE_RE.test(normalizedText)) {
    parseMode = 'double-newline';
    rawSegments = normalizedText.split(DOUBLE_NEWLINE_RE);
  }

  let segments = normalizeCandidateSegments(rawSegments);

  if (segments.length === 0) {
    segments = [normalizedText.slice(0, MAX_SEGMENT_CHARS)];
    parseMode = 'single-message';
  }

  if (!allowMultiReply && segments.length > 1) {
    return {
      segments: [segments.join(' ').slice(0, MAX_SEGMENT_CHARS)],
      parseMode: 'single-message',
    };
  }

  return {
    segments: segments.slice(0, MAX_PLANNED_SEGMENTS),
    parseMode,
  };
}

export function splitStreamReplyIntoSegments(text: string, allowMultiReply: boolean): SplitSegmentsResult {
  return splitIntoSegments(text, allowMultiReply);
}

function countChars(input: string): number {
  return [...String(input || '')].length;
}

function computeDelayMs(content: string, index: number): number {
  if (index === 0) return 0;
  const length = countChars(content);
  const endsWithStrongPunctuation = /[!?！？]$/.test(content);
  const endsWithTerminalPunctuation = /[。.!?！？…]$/.test(content);

  let delayMs = 0;
  if (length <= 15) {
    delayMs = Math.min(600, 300 + length * 20);
  } else if (length <= 60) {
    delayMs = Math.min(1500, 800 + (length - 16) * 16);
  } else {
    delayMs = Math.min(3000, 1500 + (length - 60) * 20);
  }

  if (endsWithStrongPunctuation) {
    delayMs += 120;
  } else if (endsWithTerminalPunctuation) {
    delayMs += 80;
  }

  return Math.min(3000, delayMs);
}

function toAssistantPlanSegments(input: {
  segments: string[];
}): AssistantPlanSegment[] {
  return input.segments.map((segment, index) => ({
    id: `seg-${Date.now().toString(36)}-${index}`,
    content: segment,
    delayMs: computeDelayMs(segment, index),
    channel: 'auto',
    intent: index === 0 ? 'answer' : 'followup',
    reason: 'stream-segment',
  }));
}

function buildStreamingPrompt(input: {
  prompt: string;
  allowMultiReply: boolean;
}): string {
  return `${input.prompt}\n\n回复风格要求：\n- 像朋友发微信一样自然回复。\n- ${input.allowMultiReply ? '可以用空行分隔多条消息（最多4条）。' : '只回复一条完整消息。'}\n- 短消息和稍长消息可以交替，节奏自然。\n- 不要输出 JSON、标签、提示词结构或解释。\n- 只输出对用户可见的回复正文。`;
}

export async function runTextTurn(input: RunTextTurnInput): Promise<TextTurnResult> {
  const prompt = buildStreamingPrompt({
    prompt: input.prompt,
    allowMultiReply: input.allowMultiReply,
  });

  let fullText = '';
  let streamDeltaCount = 0;
  let streamCompleted = false;
  let streamFailed = false;
  let streamFailureMessage = '';
  const streamStartedAt = performance.now();
  try {
    for await (const event of input.aiClient.streamText({
      routeHint: input.invokeInput.routeHint,
      prompt,
      maxTokens: input.invokeInput.maxTokens,
      mode: input.invokeInput.mode,
      worldId: input.invokeInput.worldId,
      agentId: input.invokeInput.agentId,
      routeOverride: input.invokeInput.routeOverride,
    })) {
      if (event.type === 'done') {
        streamCompleted = true;
        continue;
      }
      if (event.type !== 'text_delta') {
        continue;
      }
      const textDelta = String(event.textDelta || '');
      if (!textDelta) {
        continue;
      }
      streamDeltaCount += 1;
      fullText += textDelta;
      input.onStreamDelta?.(textDelta, streamDeltaCount);
    }
  } catch (error) {
    streamFailed = true;
    streamFailureMessage = error instanceof Error ? error.message : String(error || '');
  }
  if (streamFailed || !fullText.trim()) {
    const textResult = await input.aiClient.generateText({
      routeHint: input.invokeInput.routeHint,
      prompt,
      maxTokens: input.invokeInput.maxTokens,
      mode: input.invokeInput.mode,
      worldId: input.invokeInput.worldId,
      agentId: input.invokeInput.agentId,
      routeOverride: input.invokeInput.routeOverride,
    });
    fullText = String(textResult.text || '').trim();
    streamCompleted = false;
  }
  const streamDurationMs = Math.max(0, Math.round(performance.now() - streamStartedAt));
  const splitResult = splitIntoSegments(fullText, input.allowMultiReply);
  const segments = toAssistantPlanSegments({ segments: splitResult.segments });

  logRendererEvent({
    level: 'info',
    area: 'local-chat',
    message: 'local-chat:send-turn:stream-complete',
    flowId: input.flowId,
    details: {
      streamDeltaCount,
      streamDurationMs,
      streamFailed,
      streamFailureMessage: streamFailureMessage || undefined,
      segmentParseMode: splitResult.parseMode,
      segmentCount: segments.length,
    },
  });

  return {
    planner: 'stream',
    segments,
    firstReply: segments[0]?.content || '',
    streamCompleted,
    streamDeltaCount,
    streamDurationMs,
    segmentParseMode: splitResult.parseMode,
  };
}
