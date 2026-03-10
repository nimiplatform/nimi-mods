import type { FirstBeatResult, LocalChatContextPacket } from '../../state/index.js';
import type { LocalChatTurnAiClient } from './types.js';
import type { TurnInvokeInput } from './request-builder.js';

export const FIRST_BEAT_END_MARKER = '|END|';
const FIRST_BEAT_MAX_TOKENS = 384;
const FIRST_BEAT_REPAIR_MAX_TOKENS = 512;
const FIRST_BEAT_FALLBACK_MAX_TOKENS = 512;
const FIRST_BEAT_UNAVAILABLE_ERROR = 'LOCAL_CHAT_FIRST_BEAT_UNAVAILABLE';

function normalizeWhitespace(value: string): string {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function normalizePreview(value: string): string {
  return normalizeWhitespace(value)
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function extractMarkedFirstBeat(value: string): string {
  const raw = String(value || '');
  const markerIndex = raw.indexOf(FIRST_BEAT_END_MARKER);
  if (markerIndex < 0) {
    return '';
  }
  const trailing = raw.slice(markerIndex + FIRST_BEAT_END_MARKER.length).trim();
  if (trailing) {
    return '';
  }
  return normalizePreview(raw.slice(0, markerIndex));
}

function longestTrailingMarkerPrefix(value: string): number {
  const raw = String(value || '');
  for (let size = FIRST_BEAT_END_MARKER.length - 1; size >= 2; size -= 1) {
    if (raw.endsWith(FIRST_BEAT_END_MARKER.slice(0, size))) {
      return size;
    }
  }
  return 0;
}

function extractStablePreview(value: string): string {
  const marked = extractMarkedFirstBeat(value);
  if (marked) {
    return marked;
  }
  const prefixSize = longestTrailingMarkerPrefix(value);
  if (prefixSize <= 0) {
    return '';
  }
  return normalizePreview(String(value || '').slice(0, -prefixSize));
}

function extractUnmarkedCompleteFirstBeat(value: string): string {
  const normalized = normalizePreview(value);
  if (!normalized) return '';
  if (/[，,、：:；;（(]$/u.test(normalized)) return '';
  if (/(?:\.\.\.|…)$/.test(normalized)) return '';
  return normalized;
}

function buildFirstBeatRepairPrompt(input: {
  prompt: string;
  contextPacket: LocalChatContextPacket;
  userText: string;
  partialText: string;
}): string {
  return [
    buildFirstBeatPrompt({
      prompt: input.prompt,
      contextPacket: input.contextPacket,
      userText: input.userText,
    }),
    '',
    '刚才的首拍没有正确结束。',
    `上次输出：${input.partialText || '(空)'}`,
    `请重新只输出一句完整、自然、已经说完的话，并在句子结束后立刻追加结束标记 ${FIRST_BEAT_END_MARKER}`,
    `除了首拍正文和结束标记 ${FIRST_BEAT_END_MARKER} 之外，不要输出任何额外内容。`,
  ].join('\n');
}

function buildFirstBeatFallbackPrompt(input: {
  prompt: string;
  contextPacket: LocalChatContextPacket;
  userText: string;
}): string {
  return [
    buildFirstBeatPrompt({
      prompt: input.prompt,
      contextPacket: input.contextPacket,
      userText: input.userText,
    }),
    '',
    '刚才的首拍生成失败了。',
    `现在请重新直接输出一句和用户当前这句话紧密相关的完整首句，并在句子结束后立刻追加结束标记 ${FIRST_BEAT_END_MARKER}。`,
    `除了首拍正文和结束标记 ${FIRST_BEAT_END_MARKER} 之外，不要输出任何额外内容。`,
  ].join('\n');
}

function buildFirstBeatPrompt(input: {
  prompt: string;
  contextPacket: LocalChatContextPacket;
  userText: string;
}): string {
  const restrainedLines = (() => {
    const hint = input.contextPacket.contentBoundaryHint;
    if (!hint) return [];
    if (hint.visualComfortLevel === 'text-only') {
      return [
        '- 用户当前选择 text-only。不要展开外貌、身体、穿着或镜头式视觉描写。',
        '- 不要输出色情、裸露、性暗示或明确性行为相关内容。',
      ];
    }
    if (hint.visualComfortLevel === 'restrained-visuals') {
      return [
        '- 用户当前选择克制风格。不要输出色情、裸露、性暗示或明确性行为相关内容。',
      ];
    }
    return [];
  })();
  return [
    input.prompt,
    '',
    '你现在只负责生成首拍 firstBeat。',
    '规则：',
    '- 只输出一句完整、自然、已经说完的话，并在句子结束后立刻追加结束标记。',
    '- 目标是先接住用户，不要急着把整轮信息说完。',
    '- 如果你还没拿到完整深度判断，就先做保守承接，不要抢着下结论。',
    '- 不要分段，不要 JSON，不要项目符号，不要解释。',
    '- 不要输出系统词、动作标签、括号舞台提示。',
    '- 不要总是落成“怎么了 / 我在 / 跟我说说”这种固定模板。',
    '- 即使用户显式要语音，也先用文字把首句说完。',
    '- 不要主动推进关系，不要做承诺，不要承诺马上发图或发视频。',
    '- 不要引用你没把握的记忆；拿不准时，只顺着用户当前这句话自然接住。',
    ...restrainedLines,
    `- 结束标记固定为 ${FIRST_BEAT_END_MARKER}，必须原样输出在首句最后。`,
    `- 除了首拍正文和结束标记 ${FIRST_BEAT_END_MARKER} 之外，不要输出任何别的内容。`,
    `- 示例：我还在听${FIRST_BEAT_END_MARKER}`,
    `当前 turnMode=${input.contextPacket.turnMode || 'information'}`,
    `firstBeatStyle=${input.contextPacket.target.interactionProfile.expression.firstBeatStyle}`,
    `voiceConversationMode=${input.contextPacket.voiceConversationMode || 'off'}`,
    `用户输入=${input.userText}`,
  ].join('\n');
}

export async function runFirstBeatReactor(input: {
  aiClient: LocalChatTurnAiClient;
  invokeInput: TurnInvokeInput;
  contextPacket: LocalChatContextPacket;
  userText: string;
  transientMessageId: string;
  abortSignal?: AbortSignal;
  onPreview?: (preview: string) => void;
}): Promise<FirstBeatResult> {
  const startedAt = performance.now();
  const prompt = buildFirstBeatPrompt({
    prompt: input.invokeInput.prompt,
    contextPacket: input.contextPacket,
    userText: input.userText,
  });
  let buffer = '';
  let preview = '';
  let traceId: string | null = null;
  let finishReason: string | null = null;
  let streamDeltaCount = 0;
  let streamFailed = false;

  try {
    for await (const event of input.aiClient.streamText({
      ...input.invokeInput,
      prompt,
      maxTokens: FIRST_BEAT_MAX_TOKENS,
      temperature: 0.82,
      abortSignal: input.abortSignal,
    })) {
      if (event.type === 'text_delta') {
        buffer += event.textDelta;
        streamDeltaCount += 1;
        const nextPreview = extractStablePreview(buffer);
        if (nextPreview && nextPreview !== preview) {
          preview = nextPreview;
          input.onPreview?.(nextPreview);
        }
        const sealed = extractMarkedFirstBeat(buffer);
        if (sealed) {
          return {
            text: sealed,
            transientMessageId: input.transientMessageId,
            traceId,
            latencyMs: Math.round(performance.now() - startedAt),
            streamDeltaCount,
            streamDurationMs: Math.round(performance.now() - startedAt),
          };
        }
        continue;
      }
      if (event.type === 'done') {
        traceId = String(event.traceId || '').trim() || null;
        finishReason = String(event.finishReason || '').trim() || null;
      }
    }
  } catch (error) {
    if (input.abortSignal?.aborted) {
      throw error;
    }
    streamFailed = true;
  }

  const partialText = normalizePreview(buffer);
  const finalText = extractMarkedFirstBeat(buffer);
  if (!streamFailed && finishReason !== null && finalText) {
    return {
      text: finalText,
      transientMessageId: input.transientMessageId,
      traceId,
      latencyMs: Math.round(performance.now() - startedAt),
      streamDeltaCount,
      streamDurationMs: Math.round(performance.now() - startedAt),
    };
  }

  try {
    const repaired = await input.aiClient.generateText({
      ...input.invokeInput,
      prompt: buildFirstBeatRepairPrompt({
        prompt: input.invokeInput.prompt,
        contextPacket: input.contextPacket,
        userText: input.userText,
        partialText,
      }),
      maxTokens: FIRST_BEAT_REPAIR_MAX_TOKENS,
      temperature: 0.55,
    });
    const repairedText = extractMarkedFirstBeat(String(repaired.text || ''))
      || extractUnmarkedCompleteFirstBeat(String(repaired.text || ''));
    if (repairedText) {
      return {
        text: repairedText,
        transientMessageId: input.transientMessageId,
        traceId: String(repaired.traceId || '').trim() || traceId,
        latencyMs: Math.round(performance.now() - startedAt),
        streamDeltaCount,
        streamDurationMs: Math.round(performance.now() - startedAt),
      };
    }
  } catch (error) {
    if (input.abortSignal?.aborted) {
      throw error;
    }
  }

  try {
    const regenerated = await input.aiClient.generateText({
      ...input.invokeInput,
      prompt: buildFirstBeatFallbackPrompt({
        prompt: input.invokeInput.prompt,
        contextPacket: input.contextPacket,
        userText: input.userText,
      }),
      maxTokens: FIRST_BEAT_FALLBACK_MAX_TOKENS,
      temperature: 0.45,
    });
    const regeneratedText = extractMarkedFirstBeat(String(regenerated.text || ''))
      || extractUnmarkedCompleteFirstBeat(String(regenerated.text || ''));
    if (regeneratedText) {
      return {
        text: regeneratedText,
        transientMessageId: input.transientMessageId,
        traceId: String(regenerated.traceId || '').trim() || traceId,
        latencyMs: Math.round(performance.now() - startedAt),
        streamDeltaCount,
        streamDurationMs: Math.round(performance.now() - startedAt),
      };
    }
  } catch (error) {
    if (input.abortSignal?.aborted) {
      throw error;
    }
  }

  throw new Error(FIRST_BEAT_UNAVAILABLE_ERROR);
}
