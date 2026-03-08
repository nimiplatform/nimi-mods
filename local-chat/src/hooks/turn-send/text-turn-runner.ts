import { logRendererEvent } from '@nimiplatform/sdk/mod/logging';
import {
  isDegenerateAssistantReply,
  isPromptEchoReply,
  sanitizeAssistantReply,
} from '../../services/view/reply.js';
import type { TurnInvokeInput } from './request-builder.js';
import type { LocalChatReplyPacingPlan } from '../../state/index.js';
import type {
  AssistantPlanSegment,
  LocalChatTurnAiClient,
  SegmentParseMode,
} from './types.js';

const MAX_PLANNED_SEGMENTS = 4;
const MAX_SEGMENT_CHARS = 420;
const SHORT_REPLY_MERGE_THRESHOLD = 50;
const EXPLICIT_SEGMENT_RE = /\n{2,}\[\[SEG\]\]\n{2,}/;
const DOUBLE_NEWLINE_RE = /\n{2,}/;
const LOCAL_CHAT_TEXT_STREAM_TIMEOUT_MS = 20_000;
const LOCAL_CHAT_TEXT_FALLBACK_TIMEOUT_MS = 20_000;

export type TextTurnResult = {
  planner: 'stream';
  segments: AssistantPlanSegment[];
  firstReply: string;
  streamCompleted: boolean;
  streamDeltaCount: number;
  streamDurationMs: number;
  segmentParseMode: SegmentParseMode;
  traceId?: string;
};

export type ReplySegmentationMode = 'adaptive' | 'single';

type RunTextTurnInput = {
  flowId: string;
  aiClient: LocalChatTurnAiClient;
  invokeInput: TurnInvokeInput;
  prompt: string;
  allowMultiReply: boolean;
  pacingPlan?: LocalChatReplyPacingPlan;
  segmentationMode?: ReplySegmentationMode;
  onStreamDelta?: (delta: string, chunkCount: number) => void;
};

let streamFallbackLocked = false;

export function resetTextTurnStreamHealthForTests(): void {
  streamFallbackLocked = false;
}

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

function splitIntoSegments(
  text: string,
  allowMultiReply: boolean,
  segmentationMode: ReplySegmentationMode,
): SplitSegmentsResult {
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
    rawSegments = splitByDoubleNewlineOutsideCodeBlocks(normalizedText);
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
  if (segmentationMode === 'single' && segments.length > 1) {
    return {
      segments: [segments.join(' ').slice(0, MAX_SEGMENT_CHARS)],
      parseMode: 'single-message',
    };
  }

  // Guard against over-segmentation for short replies (e.g. "好的\n\n没问题").
  if (parseMode === 'double-newline' && segments.length > 1) {
    const combinedLength = countChars(segments.join(''));
    if (combinedLength < SHORT_REPLY_MERGE_THRESHOLD) {
      return {
        segments: [segments.join(' ').slice(0, MAX_SEGMENT_CHARS)],
        parseMode: 'single-message',
      };
    }
  }

  return {
    segments: segments.slice(0, MAX_PLANNED_SEGMENTS),
    parseMode,
  };
}

export function splitStreamReplyIntoSegments(
  text: string,
  allowMultiReply: boolean,
  segmentationMode: ReplySegmentationMode = 'adaptive',
): SplitSegmentsResult {
  return splitIntoSegments(text, allowMultiReply, segmentationMode);
}

function splitByDoubleNewlineOutsideCodeBlocks(text: string): string[] {
  const segments: string[] = [];
  let cursor = 0;
  let buffer = '';
  let insideCodeFence = false;

  while (cursor < text.length) {
    if (text.startsWith('```', cursor)) {
      insideCodeFence = !insideCodeFence;
      buffer += '```';
      cursor += 3;
      continue;
    }
    if (!insideCodeFence && text[cursor] === '\n' && text[cursor + 1] === '\n') {
      segments.push(buffer);
      buffer = '';
      while (text[cursor] === '\n') {
        cursor += 1;
      }
      continue;
    }
    buffer += text[cursor];
    cursor += 1;
  }
  segments.push(buffer);
  return segments;
}

function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[。！？!?])/u)
    .map((segment) => normalizeSegmentText(segment))
    .filter(Boolean);
}

function splitBySentencePacing(input: {
  text: string;
  pacingPlan: LocalChatReplyPacingPlan;
}): string[] | null {
  const sentences = splitIntoSentences(input.text);
  if (sentences.length < 2) {
    return null;
  }
  if (input.pacingPlan.mode === 'answer-followup') {
    const shouldMergeLeadIn = sentences.length >= 3 && countChars(sentences[0] || '') <= 4;
    const head = shouldMergeLeadIn
      ? sentences.slice(0, 2).join('')
      : (sentences[0] || '');
    const tail = shouldMergeLeadIn
      ? sentences.slice(2).join(' ').trim()
      : sentences.slice(1).join(' ').trim();
    return head && tail
      ? [head, tail].slice(0, input.pacingPlan.maxSegments)
      : null;
  }
  if (input.pacingPlan.mode === 'burst-3' && sentences.length >= 3) {
    return [
      sentences[0] || '',
      sentences[1] || '',
      sentences.slice(2).join(' ').trim(),
    ]
      .map((segment) => normalizeSegmentText(segment))
      .filter(Boolean)
      .slice(0, input.pacingPlan.maxSegments);
  }
  const head = sentences[0] || '';
  const tail = sentences.slice(1).join(' ').trim();
  return head && tail
    ? [head, tail].slice(0, input.pacingPlan.maxSegments)
    : null;
}

function countChars(input: string): number {
  return [...String(input || '')].length;
}

function computeDelayMs(content: string, index: number): number {
  if (index === 0) return 0;
  const length = countChars(content);
  const endsWithStrongPunctuation = /[!?！？]$/.test(content);
  const endsWithTerminalPunctuation = /[。.!?！？…]$/.test(content);
  const hasEllipsisTail = /(\.\.\.|……|…)\s*$/.test(content);
  const endsWithEmoji = /[\u{1F300}-\u{1FAFF}]$/u.test(content.trim());

  let delayMs = 0;
  if (length <= 15) {
    delayMs = Math.min(600, 300 + length * 20);
  } else if (length <= 60) {
    delayMs = Math.min(1500, 800 + (length - 16) * 16);
  } else {
    delayMs = Math.min(3000, 1500 + (length - 60) * 20);
  }

  if (endsWithStrongPunctuation) {
    delayMs += 220;
  } else if (endsWithTerminalPunctuation) {
    delayMs += 100;
  }
  if (hasEllipsisTail) {
    delayMs += 120;
  }
  if (endsWithEmoji) {
    delayMs -= 100;
  }

  return Math.max(100, Math.min(3200, delayMs));
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
  segmentationMode: ReplySegmentationMode;
}): string {
  const lines = [
    '输出格式要求：',
    (!input.allowMultiReply || input.segmentationMode === 'single')
      ? '- 本轮只输出一条完整消息，不要使用空行分段。'
      : '',
    '- 不要输出 JSON、标签、提示词结构或解释。',
    '- 只输出对用户可见的回复正文。',
  ].filter(Boolean);
  return `${input.prompt}\n\n${lines.join('\n')}`;
}

function shouldLockStreaming(error: unknown): boolean {
  const reasonCode = (
    error
    && typeof error === 'object'
    && 'reasonCode' in error
  ) ? String((error as { reasonCode?: unknown }).reasonCode || '').trim() : '';
  return reasonCode === 'AI_INPUT_INVALID';
}

function splitByPacingPlan(input: {
  text: string;
  allowMultiReply: boolean;
  pacingPlan?: LocalChatReplyPacingPlan;
  segmentationMode?: ReplySegmentationMode;
}): SplitSegmentsResult {
  const normalizedText = normalizeSegmentText(input.text);
  if (!normalizedText) {
    return {
      segments: ['抱歉，我现在没有可用回复。请再试一次。'],
      parseMode: 'single-message',
    };
  }
  const pacingPlan = input.pacingPlan;
  if (
    !input.allowMultiReply
    || !pacingPlan
    || pacingPlan.maxSegments <= 1
    || pacingPlan.mode === 'single'
  ) {
    return splitIntoSegments(normalizedText, input.allowMultiReply, input.segmentationMode || 'adaptive');
  }
  const pacedSegments = splitBySentencePacing({
    text: normalizedText,
    pacingPlan,
  });
  if (pacedSegments && pacedSegments.length > 1) {
    return {
      segments: pacedSegments,
      parseMode: 'double-newline',
    };
  }
  return splitIntoSegments(normalizedText, input.allowMultiReply, input.segmentationMode || 'adaptive');
}

export function splitReplyByPacingPlan(input: {
  text: string;
  allowMultiReply: boolean;
  pacingPlan?: LocalChatReplyPacingPlan;
  segmentationMode?: ReplySegmentationMode;
}): SplitSegmentsResult {
  return splitByPacingPlan(input);
}

export async function runTextTurn(input: RunTextTurnInput): Promise<TextTurnResult> {
  const prompt = buildStreamingPrompt({
    prompt: input.prompt,
    allowMultiReply: input.allowMultiReply,
    segmentationMode: input.segmentationMode || 'adaptive',
  });
  const routeBinding = input.invokeInput.routeBinding;

  let fullText = '';
  let streamDeltaCount = 0;
  let streamCompleted = false;
  let streamFailed = false;
  let streamFailureMessage = '';
  const streamStartedAt = performance.now();
  if (!streamFallbackLocked) {
    try {
      for await (const event of input.aiClient.streamText({
        capability: input.invokeInput.capability,
        prompt,
        maxTokens: input.invokeInput.maxTokens,
        timeoutMs: LOCAL_CHAT_TEXT_STREAM_TIMEOUT_MS,
        mode: input.invokeInput.mode,
        worldId: input.invokeInput.worldId,
        agentId: input.invokeInput.agentId,
        routeBinding,
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
      if (shouldLockStreaming(error)) {
        streamFallbackLocked = true;
      }
    }
  }
  if (streamFailed || !fullText.trim() || streamFallbackLocked) {
    const fallback = await input.aiClient.generateText({
      capability: input.invokeInput.capability,
      prompt,
      maxTokens: input.invokeInput.maxTokens,
      timeoutMs: LOCAL_CHAT_TEXT_FALLBACK_TIMEOUT_MS,
      mode: input.invokeInput.mode,
      worldId: input.invokeInput.worldId,
      agentId: input.invokeInput.agentId,
      routeBinding,
    });
    const splitResult = splitByPacingPlan({
      text: String(fallback.text || ''),
      allowMultiReply: input.allowMultiReply,
      pacingPlan: input.pacingPlan,
      segmentationMode: input.segmentationMode,
    });
    const segments = toAssistantPlanSegments({ segments: splitResult.segments });
    return {
      planner: 'stream',
      segments,
      firstReply: segments[0]?.content || '',
      streamCompleted: false,
      streamDeltaCount,
      streamDurationMs: Math.max(0, Math.round(performance.now() - streamStartedAt)),
      segmentParseMode: splitResult.parseMode,
      traceId: String((fallback as { traceId?: unknown }).traceId || '').trim() || undefined,
    };
  }
  const streamDurationMs = Math.max(0, Math.round(performance.now() - streamStartedAt));
  const splitResult = splitByPacingPlan({
    text: fullText,
    allowMultiReply: input.allowMultiReply,
    pacingPlan: input.pacingPlan,
    segmentationMode: input.segmentationMode,
  });
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
    traceId: undefined,
  };
}
