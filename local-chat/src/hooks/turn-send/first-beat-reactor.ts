import type { FirstBeatResult, LocalChatContextPacket } from '../../state/index.js';
import { emitLocalChatLog } from '../../logging.js';
import type { LocalChatTurnAiClient } from './types.js';
import type { TurnInvokeInput } from './request-builder.js';
import {
  DEFAULT_STREAM_END_MARKER,
  findTrailingEndMarkerFragmentLength,
  stripTrailingEndMarkerFragment,
} from './stream-end-marker.js';

export const FIRST_BEAT_END_MARKER = DEFAULT_STREAM_END_MARKER;
const FIRST_BEAT_MAX_TOKENS = 1024;
const FIRST_BEAT_REPAIR_MAX_TOKENS = 1024;
const FIRST_BEAT_FALLBACK_MAX_TOKENS = 1024;
const FIRST_BEAT_UNAVAILABLE_ERROR = 'LOCAL_CHAT_FIRST_BEAT_UNAVAILABLE';
const FIRST_BEAT_DEBUG_RECORD_LIMIT = 200;

type FirstBeatDebugContext = {
  flowId?: string;
  turnTxnId?: string;
  targetId?: string;
  sessionId?: string;
  entry?: 'send-flow' | 'proactive';
};

function persistFirstBeatDebugRecord(record: Record<string, unknown>): void {
  try {
    const runtimeWindow = window as typeof window & {
      __LOCAL_CHAT_FIRST_BEAT_DEBUG__?: Array<Record<string, unknown>>;
      __LOCAL_CHAT_FIRST_BEAT_DEBUG_LATEST__?: Record<string, unknown>;
    };
    const existing = Array.isArray(runtimeWindow.__LOCAL_CHAT_FIRST_BEAT_DEBUG__)
      ? [...runtimeWindow.__LOCAL_CHAT_FIRST_BEAT_DEBUG__]
      : [];
    existing.push(record);
    if (existing.length > FIRST_BEAT_DEBUG_RECORD_LIMIT) {
      existing.splice(0, existing.length - FIRST_BEAT_DEBUG_RECORD_LIMIT);
    }
    runtimeWindow.__LOCAL_CHAT_FIRST_BEAT_DEBUG__ = existing;
    runtimeWindow.__LOCAL_CHAT_FIRST_BEAT_DEBUG_LATEST__ = record;
  } catch {
    // ignore debug persistence failures
  }
}

function emitFirstBeatDebugLog(input: {
  event: string;
  context?: FirstBeatDebugContext;
  details?: Record<string, unknown>;
}): void {
  const record = {
    ts: new Date().toISOString(),
    event: input.event,
    ...(input.context || {}),
    ...(input.details || {}),
  };
  persistFirstBeatDebugRecord(record);
  emitLocalChatLog({
    level: 'debug',
    message: `local-chat:first-beat:${input.event}`,
    flowId: input.context?.flowId,
    source: 'runFirstBeatReactor',
    details: record,
  });
  try {
    console.info(`[local-chat:first-beat] ${input.event}`, record);
  } catch {
    // ignore console failures
  }
}

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
  const size = findTrailingEndMarkerFragmentLength(value, FIRST_BEAT_END_MARKER);
  return size >= FIRST_BEAT_END_MARKER.length ? 0 : size;
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
  const normalized = normalizePreview(stripTrailingEndMarkerFragment(value, FIRST_BEAT_END_MARKER));
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
  debugContext?: FirstBeatDebugContext;
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
  const routeBinding = input.invokeInput.routeBinding;

  emitFirstBeatDebugLog({
    event: 'start',
    context: input.debugContext,
    details: {
      transientMessageId: input.transientMessageId,
      userText: input.userText,
      promptChars: prompt.length,
      prompt,
      routeSource: routeBinding?.source || null,
      routeModel: routeBinding?.model || null,
      targetFirstBeatStyle: input.contextPacket.target.interactionProfile.expression.firstBeatStyle,
      turnMode: input.contextPacket.turnMode || null,
      voiceConversationMode: input.contextPacket.voiceConversationMode || null,
      temperature: 0.82,
      maxTokens: FIRST_BEAT_MAX_TOKENS,
      endMarker: FIRST_BEAT_END_MARKER,
      visualComfortLevel: input.contextPacket.contentBoundaryHint?.visualComfortLevel || null,
    },
  });

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
        const prefixSize = longestTrailingMarkerPrefix(buffer);
        const nextPreview = extractStablePreview(buffer);
        const sealedCandidate = extractMarkedFirstBeat(buffer);
        emitFirstBeatDebugLog({
          event: 'stream-delta',
          context: input.debugContext,
          details: {
            transientMessageId: input.transientMessageId,
            deltaIndex: streamDeltaCount,
            textDelta: event.textDelta,
            buffer,
            bufferChars: buffer.length,
            previewCandidate: nextPreview || null,
            previewChanged: Boolean(nextPreview && nextPreview !== preview),
            sealedCandidate: sealedCandidate || null,
            markerSeen: buffer.includes(FIRST_BEAT_END_MARKER),
            trailingMarkerPrefixSize: prefixSize,
          },
        });
        if (nextPreview && nextPreview !== preview) {
          preview = nextPreview;
          emitFirstBeatDebugLog({
            event: 'preview-update',
            context: input.debugContext,
            details: {
              transientMessageId: input.transientMessageId,
              deltaIndex: streamDeltaCount,
              preview,
              buffer,
            },
          });
          input.onPreview?.(nextPreview);
        }
        const sealed = sealedCandidate;
        if (sealed) {
          emitFirstBeatDebugLog({
            event: 'stream-sealed',
            context: input.debugContext,
            details: {
              transientMessageId: input.transientMessageId,
              text: sealed,
              buffer,
              streamDeltaCount,
              traceId,
              finishReason,
              latencyMs: Math.round(performance.now() - startedAt),
            },
          });
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
        emitFirstBeatDebugLog({
          event: 'stream-done',
          context: input.debugContext,
          details: {
            transientMessageId: input.transientMessageId,
            traceId,
            finishReason,
            streamDeltaCount,
            buffer,
            partialText: normalizePreview(buffer),
            sealedCandidate: extractMarkedFirstBeat(buffer) || null,
          },
        });
      }
    }
  } catch (error) {
    if (input.abortSignal?.aborted) {
      throw error;
    }
    streamFailed = true;
    emitFirstBeatDebugLog({
      event: 'stream-error',
      context: input.debugContext,
      details: {
        transientMessageId: input.transientMessageId,
        error: error instanceof Error ? error.message : String(error || ''),
        streamDeltaCount,
        buffer,
        partialText: normalizePreview(buffer),
      },
    });
  }

  const partialText = normalizePreview(buffer);
  const finalText = extractMarkedFirstBeat(buffer);
  emitFirstBeatDebugLog({
    event: 'post-stream-eval',
    context: input.debugContext,
    details: {
      transientMessageId: input.transientMessageId,
      streamFailed,
      traceId,
      finishReason,
      streamDeltaCount,
      buffer,
      partialText,
      finalText: finalText || null,
    },
  });
  if (!streamFailed && finishReason !== null && finalText) {
    emitFirstBeatDebugLog({
      event: 'return-stream-final',
      context: input.debugContext,
      details: {
        transientMessageId: input.transientMessageId,
        text: finalText,
        traceId,
        finishReason,
        streamDeltaCount,
        latencyMs: Math.round(performance.now() - startedAt),
      },
    });
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
    emitFirstBeatDebugLog({
      event: 'repair-start',
      context: input.debugContext,
      details: {
        transientMessageId: input.transientMessageId,
        partialText,
        partialChars: partialText.length,
        prompt: buildFirstBeatRepairPrompt({
          prompt: input.invokeInput.prompt,
          contextPacket: input.contextPacket,
          userText: input.userText,
          partialText,
        }),
        maxTokens: FIRST_BEAT_REPAIR_MAX_TOKENS,
        temperature: 0.55,
      },
    });
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
    emitFirstBeatDebugLog({
      event: 'repair-result',
      context: input.debugContext,
      details: {
        transientMessageId: input.transientMessageId,
        rawText: String(repaired.text || ''),
        extractedText: repairedText || null,
        traceId: String(repaired.traceId || '').trim() || null,
      },
    });
    if (repairedText) {
      emitFirstBeatDebugLog({
        event: 'return-repair',
        context: input.debugContext,
        details: {
          transientMessageId: input.transientMessageId,
          text: repairedText,
          traceId: String(repaired.traceId || '').trim() || traceId,
          streamDeltaCount,
          latencyMs: Math.round(performance.now() - startedAt),
        },
      });
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
    emitFirstBeatDebugLog({
      event: 'repair-error',
      context: input.debugContext,
      details: {
        transientMessageId: input.transientMessageId,
        error: error instanceof Error ? error.message : String(error || ''),
      },
    });
  }

  try {
    emitFirstBeatDebugLog({
      event: 'fallback-start',
      context: input.debugContext,
      details: {
        transientMessageId: input.transientMessageId,
        prompt: buildFirstBeatFallbackPrompt({
          prompt: input.invokeInput.prompt,
          contextPacket: input.contextPacket,
          userText: input.userText,
        }),
        maxTokens: FIRST_BEAT_FALLBACK_MAX_TOKENS,
        temperature: 0.45,
      },
    });
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
    emitFirstBeatDebugLog({
      event: 'fallback-result',
      context: input.debugContext,
      details: {
        transientMessageId: input.transientMessageId,
        rawText: String(regenerated.text || ''),
        extractedText: regeneratedText || null,
        traceId: String(regenerated.traceId || '').trim() || null,
      },
    });
    if (regeneratedText) {
      emitFirstBeatDebugLog({
        event: 'return-fallback',
        context: input.debugContext,
        details: {
          transientMessageId: input.transientMessageId,
          text: regeneratedText,
          traceId: String(regenerated.traceId || '').trim() || traceId,
          streamDeltaCount,
          latencyMs: Math.round(performance.now() - startedAt),
        },
      });
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
    emitFirstBeatDebugLog({
      event: 'fallback-error',
      context: input.debugContext,
      details: {
        transientMessageId: input.transientMessageId,
        error: error instanceof Error ? error.message : String(error || ''),
      },
    });
  }

  emitFirstBeatDebugLog({
    event: 'unavailable',
    context: input.debugContext,
    details: {
      transientMessageId: input.transientMessageId,
      streamDeltaCount,
      traceId,
      finishReason,
      partialText,
      buffer,
    },
  });
  throw new Error(FIRST_BEAT_UNAVAILABLE_ERROR);
}
