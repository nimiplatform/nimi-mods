import { logRendererEvent } from '@nimiplatform/sdk/mod/logging';
import {
  isDegenerateAssistantReply,
  isPromptEchoReply,
  sanitizeAssistantReply,
} from '../../services/view/reply.js';
import type { LocalChatReplyPacingPlan } from '../../state/index.js';
import type { TurnInvokeInput } from './request-builder.js';
import type {
  AssistantPlanSegment,
  LocalChatTurnAiClient,
  SegmentParseMode,
} from './types.js';

const STREAM_HEALTH_TTL_MS = 3 * 60 * 1000;
const STREAM_DEGRADATION_REASON_CODES = new Set([
  'AI_INPUT_INVALID',
  'AI_STREAM_BROKEN',
]);
const MAX_PLANNED_SEGMENTS = 4;
const MAX_SEGMENT_CHARS = 420;
const SHORT_REPLY_MERGE_THRESHOLD = 50;
const EXPLICIT_SEGMENT_RE = /\n{2,}\[\[SEG\]\]\n{2,}/;
const DOUBLE_NEWLINE_RE = /\n{2,}/;
const streamHealthByRoute = new Map<string, {
  reasonCode: string;
  failureCount: number;
  expiresAt: number;
}>();

export type TextTurnResult = {
  planner: 'stream';
  segments: AssistantPlanSegment[];
  firstReply: string;
  streamCompleted: boolean;
  streamDeltaCount: number;
  streamDurationMs: number;
  segmentParseMode: SegmentParseMode;
};

export type ReplySegmentationMode = 'adaptive' | 'single';

type RunTextTurnInput = {
  flowId: string;
  aiClient: LocalChatTurnAiClient;
  invokeInput: TurnInvokeInput;
  prompt: string;
  allowMultiReply: boolean;
  pacingPlan: LocalChatReplyPacingPlan;
  segmentationMode?: ReplySegmentationMode;
  onStreamDelta?: (delta: string, chunkCount: number) => void;
};

type SplitSegmentsResult = {
  segments: string[];
  parseMode: SegmentParseMode;
};

type ResolvedTextRoute = Awaited<ReturnType<LocalChatTurnAiClient['resolveRoute']>>;

function createDefaultPacingPlan(): LocalChatReplyPacingPlan {
  return {
    mode: 'single',
    maxSegments: 1,
    energy: 'low',
    reason: 'default-single',
  };
}

function readObjectReasonCode(input: unknown): string {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return '';
  }
  const record = input as Record<string, unknown>;
  return String(record.reasonCode || '').trim();
}

function readObjectMessage(input: unknown): string {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return '';
  }
  const record = input as Record<string, unknown>;
  const directMessage = String(record.message || '').trim();
  if (directMessage) {
    return directMessage;
  }
  const nested = record.error;
  if (!nested || typeof nested !== 'object' || Array.isArray(nested)) {
    return '';
  }
  const nestedRecord = nested as Record<string, unknown>;
  return String(nestedRecord.message || '').trim();
}

function extractStreamFailureReasonCode(error: unknown): string {
  const fromObject = readObjectReasonCode(error);
  if (fromObject) {
    return fromObject;
  }
  const message = String(
    error instanceof Error
      ? error.message
      : readObjectMessage(error) || error || '',
  ).trim();
  if (!message) {
    return '';
  }
  const matched = message.match(/\b(AI_[A-Z_]+)\b/);
  return matched?.[1] || '';
}

function buildStreamHealthRouteKey(route: ResolvedTextRoute): string {
  const connectorId = String(route.source === 'token-api' ? route.connectorId || '' : '').trim();
  const localModelId = String(route.source === 'local-runtime' ? route.localModelId || '' : '').trim();
  const model = String(route.model || '').trim();
  return [
    route.source,
    connectorId,
    localModelId,
    model,
  ].join('|');
}

function toPinnedRouteOverride(route: ResolvedTextRoute): NonNullable<TurnInvokeInput['routeOverride']> {
  if (route.source === 'token-api') {
    return {
      source: 'token-api',
      connectorId: String(route.connectorId || '').trim(),
      model: String(route.model || '').trim(),
    };
  }
  return {
    source: 'local-runtime',
    connectorId: '',
    localModelId: String(route.localModelId || '').trim() || undefined,
    model: String(route.model || '').trim(),
    engine: String(route.engine || '').trim() || undefined,
  };
}

function readActiveStreamHealthReasonCode(routeKey: string): string {
  const entry = streamHealthByRoute.get(routeKey);
  if (!entry) {
    return '';
  }
  if (entry.expiresAt <= Date.now()) {
    streamHealthByRoute.delete(routeKey);
    return '';
  }
  return entry.reasonCode;
}

function clearStreamHealth(routeKey: string): void {
  streamHealthByRoute.delete(routeKey);
}

function markStreamUnhealthy(routeKey: string, reasonCode: string): void {
  const previous = streamHealthByRoute.get(routeKey);
  streamHealthByRoute.set(routeKey, {
    reasonCode,
    failureCount: (previous?.failureCount || 0) + 1,
    expiresAt: Date.now() + STREAM_HEALTH_TTL_MS,
  });
}

export function resetTextTurnStreamHealthForTests(): void {
  streamHealthByRoute.clear();
}

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
  pacingPlan: LocalChatReplyPacingPlan,
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

  const pacedSegments = applyPacingPlan({
    text: normalizedText,
    segments,
    parseMode,
    pacingPlan,
  });
  segments = pacedSegments.segments;
  parseMode = pacedSegments.parseMode;

  // Guard against over-segmentation for short replies (e.g. "好的\n\n没问题").
  if (
    parseMode === 'double-newline'
    && segments.length > 1
    && pacingPlan.mode === 'single'
  ) {
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
  pacingPlanOrSegmentationMode: LocalChatReplyPacingPlan | ReplySegmentationMode = createDefaultPacingPlan(),
  segmentationMode: ReplySegmentationMode = 'adaptive',
): SplitSegmentsResult {
  const pacingPlan = typeof pacingPlanOrSegmentationMode === 'string'
    ? createDefaultPacingPlan()
    : pacingPlanOrSegmentationMode;
  const resolvedSegmentationMode = typeof pacingPlanOrSegmentationMode === 'string'
    ? pacingPlanOrSegmentationMode
    : segmentationMode;
  return splitIntoSegments(text, allowMultiReply, pacingPlan, resolvedSegmentationMode);
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

function countChars(input: string): number {
  return [...String(input || '')].length;
}

function splitBySentenceBoundaries(text: string): string[] {
  const normalized = String(text || '').trim();
  if (!normalized) return [];
  const parts = normalized.match(/[^。！？!?]+[。！？!?…]*|[^。！？!?…]+$/gu) || [];
  return parts
    .map((part) => normalizeSegmentText(part))
    .filter((part) => countChars(part) >= 4);
}

function mergeTailSegments(segments: string[], maxSegments: number): string[] {
  if (segments.length <= maxSegments) return segments;
  const head = segments.slice(0, maxSegments - 1);
  const tail = segments.slice(maxSegments - 1).join(' ');
  return [...head, tail];
}

function applyPacingPlan(input: {
  text: string;
  segments: string[];
  parseMode: SegmentParseMode;
  pacingPlan: LocalChatReplyPacingPlan;
}): SplitSegmentsResult {
  if (input.pacingPlan.maxSegments <= 1) {
    return {
      segments: [input.segments.join(' ').slice(0, MAX_SEGMENT_CHARS)],
      parseMode: 'single-message',
    };
  }
  let nextSegments = mergeTailSegments(input.segments, input.pacingPlan.maxSegments);
  let nextParseMode = input.parseMode;
  if (nextSegments.length === 1) {
    const sentenceSegments = splitBySentenceBoundaries(input.text);
    if (sentenceSegments.length > 1) {
      if (input.pacingPlan.mode === 'answer-followup') {
        nextSegments = mergeTailSegments([
          sentenceSegments[0] || input.text,
          sentenceSegments.slice(1).join(' '),
        ].filter(Boolean), input.pacingPlan.maxSegments);
      } else if (input.pacingPlan.mode === 'burst-2') {
        nextSegments = mergeTailSegments([
          sentenceSegments[0] || input.text,
          sentenceSegments.slice(1).join(' '),
        ].filter(Boolean), 2);
      } else if (input.pacingPlan.mode === 'burst-3') {
        nextSegments = mergeTailSegments(sentenceSegments, 3);
      }
      if (nextSegments.length > 1) {
        nextParseMode = 'double-newline';
      }
    }
  }
  return {
    segments: nextSegments,
    parseMode: nextParseMode,
  };
}

function computeDelayMs(content: string, index: number, pacingPlan: LocalChatReplyPacingPlan): number {
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
  if (pacingPlan.energy === 'high') {
    delayMs -= 180;
  } else if (pacingPlan.energy === 'low') {
    delayMs += 180;
  }
  if (pacingPlan.mode === 'answer-followup' && index > 0) {
    delayMs += 220;
  }

  return Math.max(100, Math.min(3200, delayMs));
}

function toAssistantPlanSegments(input: {
  segments: string[];
  pacingPlan: LocalChatReplyPacingPlan;
}): AssistantPlanSegment[] {
  return input.segments.map((segment, index) => ({
    id: `seg-${Date.now().toString(36)}-${index}`,
    content: segment,
    delayMs: computeDelayMs(segment, index, input.pacingPlan),
    channel: 'auto',
    intent: index === 0 ? 'answer' : 'followup',
    reason: `pacing-plan:${input.pacingPlan.mode}`,
  }));
}

function buildStreamingPrompt(input: {
  prompt: string;
  allowMultiReply: boolean;
  pacingPlan: LocalChatReplyPacingPlan;
  segmentationMode: ReplySegmentationMode;
}): string {
  const lines = [
    '输出格式要求：',
    (!input.allowMultiReply || input.segmentationMode === 'single')
      ? '- 本轮只输出一条完整消息，不要使用空行分段。'
      : '',
    input.allowMultiReply && input.segmentationMode !== 'single'
      ? input.pacingPlan.mode === 'single'
        ? '- 本轮优先只输出一条完整消息，不要为了像真人而硬拆。'
        : input.pacingPlan.mode === 'answer-followup'
          ? '- 本轮优先输出 2 条消息：先主回答，再补一句 follow-up；用一个空行分隔，不要超过 2 条。'
          : input.pacingPlan.mode === 'burst-2'
            ? '- 本轮优先输出 2 条短消息，用一个空行分隔；不要超过 2 条。'
            : '- 本轮如语义确实需要，可以输出 2-3 条短消息，用一个空行分隔；不要超过 3 条。'
      : '',
    '- 不要输出 JSON、标签、提示词结构或解释。',
    '- 只输出对用户可见的回复正文。',
  ].filter(Boolean);
  return `${input.prompt}\n\n${lines.join('\n')}`;
}

export async function runTextTurn(input: RunTextTurnInput): Promise<TextTurnResult> {
  const prompt = buildStreamingPrompt({
    prompt: input.prompt,
    allowMultiReply: input.allowMultiReply,
    pacingPlan: input.pacingPlan,
    segmentationMode: input.segmentationMode || 'adaptive',
  });
  const resolvedRoute = await input.aiClient.resolveRoute({
    routeHint: input.invokeInput.routeHint,
    routeOverride: input.invokeInput.routeOverride,
  });
  const pinnedRouteOverride = toPinnedRouteOverride(resolvedRoute);
  const streamHealthRouteKey = buildStreamHealthRouteKey(resolvedRoute);
  const streamSkippedReasonCode = readActiveStreamHealthReasonCode(streamHealthRouteKey);

  let fullText = '';
  let streamDeltaCount = 0;
  let streamCompleted = false;
  let streamFailed = false;
  let streamFailureMessage = '';
  let streamFailureReasonCode = '';
  const streamStartedAt = performance.now();
  if (!streamSkippedReasonCode) {
    try {
      for await (const event of input.aiClient.streamText({
        routeHint: input.invokeInput.routeHint,
        prompt,
        maxTokens: input.invokeInput.maxTokens,
        mode: input.invokeInput.mode,
        worldId: input.invokeInput.worldId,
        agentId: input.invokeInput.agentId,
        routeOverride: pinnedRouteOverride,
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
      streamFailureReasonCode = extractStreamFailureReasonCode(error);
      if (STREAM_DEGRADATION_REASON_CODES.has(streamFailureReasonCode)) {
        markStreamUnhealthy(streamHealthRouteKey, streamFailureReasonCode);
      }
    }
    if (!streamFailed && streamCompleted && fullText.trim()) {
      clearStreamHealth(streamHealthRouteKey);
    }
  }
  if (streamSkippedReasonCode || streamFailed || !fullText.trim()) {
    const textResult = await input.aiClient.generateText({
      routeHint: input.invokeInput.routeHint,
      prompt,
      maxTokens: input.invokeInput.maxTokens,
      mode: input.invokeInput.mode,
      worldId: input.invokeInput.worldId,
      agentId: input.invokeInput.agentId,
      routeOverride: pinnedRouteOverride,
    });
    fullText = String(textResult.text || '').trim();
    streamCompleted = false;
  }
  const streamDurationMs = Math.max(0, Math.round(performance.now() - streamStartedAt));
  const splitResult = splitIntoSegments(
    fullText,
    input.allowMultiReply,
    input.pacingPlan,
    input.segmentationMode || 'adaptive',
  );
  const segments = toAssistantPlanSegments({
    segments: splitResult.segments,
    pacingPlan: input.pacingPlan,
  });

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
      streamFailureReasonCode: streamFailureReasonCode || undefined,
      streamSkippedReasonCode: streamSkippedReasonCode || undefined,
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
