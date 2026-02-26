import { logRendererEvent } from '@nimiplatform/sdk/mod/logging';
import {
  isDegenerateAssistantReply,
  isPromptEchoReply,
  sanitizeAssistantReply,
} from '../../services/view/reply.js';
import type { TurnInvokeInput } from './request-builder.js';
import type {
  AssistantPlanChannel,
  AssistantPlanIntent,
  AssistantPlanSegment,
  LocalChatTextAiClient,
} from './types.js';

const MAX_PLANNED_SEGMENTS = 4;
const MAX_SEGMENT_CHARS = 220;
const MAX_SEGMENT_DELAY_MS = 8_000;
const PLAN_INVALID_ERROR = 'LOCAL_CHAT_PLAN_INVALID';

export type TextTurnResult = {
  planner: 'object' | 'fallback';
  segments: AssistantPlanSegment[];
  retryAttempted: boolean;
  retryImproved: boolean;
  firstReply: string;
};

type RunTextTurnInput = {
  flowId: string;
  aiClient: LocalChatTextAiClient;
  invokeInput: TurnInvokeInput;
  prompt: string;
  allowMultiReply: boolean;
  enableVoice: boolean;
};

function clampDelayMs(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(MAX_SEGMENT_DELAY_MS, Math.round(parsed));
}

function normalizeChannel(value: unknown): AssistantPlanChannel {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'voice') return 'voice';
  if (normalized === 'text') return 'text';
  return 'auto';
}

function normalizeIntent(value: unknown): AssistantPlanIntent {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'clarify') return 'clarify';
  if (normalized === 'plan') return 'plan';
  if (normalized === 'checkin') return 'checkin';
  if (normalized === 'followup') return 'followup';
  return 'answer';
}

function toAssistantPlanSegment(input: {
  raw: Record<string, unknown>;
  index: number;
  fallbackDelayMs: number;
}): AssistantPlanSegment | null {
  const textRaw = String(
    input.raw.content
    || input.raw.text
    || input.raw.message
    || '',
  ).trim();
  const content = sanitizeAssistantReply(textRaw).slice(0, MAX_SEGMENT_CHARS);
  if (!content) return null;
  if (isPromptEchoReply(content) || isDegenerateAssistantReply(content)) {
    return null;
  }
  return {
    id: `seg-${Date.now().toString(36)}-${input.index}`,
    content,
    delayMs: clampDelayMs(input.raw.delayMs, input.fallbackDelayMs),
    channel: normalizeChannel(input.raw.channel),
    intent: normalizeIntent(input.raw.intent),
    reason: String(input.raw.reason || '').trim() || undefined,
  };
}

function extractJsonObjectCandidate(text: string): string {
  const normalized = String(text || '').trim();
  if (!normalized) {
    throw new Error(PLAN_INVALID_ERROR);
  }
  const firstBrace = normalized.indexOf('{');
  const lastBrace = normalized.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    throw new Error(PLAN_INVALID_ERROR);
  }
  return normalized.slice(firstBrace, lastBrace + 1);
}

function parsePlannerObject(text: string): Record<string, unknown> {
  try {
    const candidate = extractJsonObjectCandidate(text);
    const parsed = JSON.parse(candidate);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(PLAN_INVALID_ERROR);
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error(PLAN_INVALID_ERROR);
  }
}

function normalizePlannerSegments(input: {
  plannerObject: Record<string, unknown>;
  allowMultiReply: boolean;
}): AssistantPlanSegment[] {
  const rawSegments = Array.isArray(input.plannerObject.segments)
    ? input.plannerObject.segments
    : [];
  const normalized = rawSegments
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => toAssistantPlanSegment({
      raw: item as Record<string, unknown>,
      index,
      fallbackDelayMs: index === 0 ? 0 : 1_200,
    }))
    .filter((item): item is AssistantPlanSegment => Boolean(item))
    .slice(0, MAX_PLANNED_SEGMENTS);

  if (!input.allowMultiReply && normalized.length > 1) {
    return [normalized[0] as AssistantPlanSegment];
  }
  return normalized;
}

async function buildSegmentsFromFallbackText(input: RunTextTurnInput): Promise<{
  segments: AssistantPlanSegment[];
  retryAttempted: boolean;
  retryImproved: boolean;
  firstReply: string;
}> {
  const result = await input.aiClient.generateText(input.invokeInput);
  const firstReply = String(result.text || '').trim();
  let assistantText = sanitizeAssistantReply(firstReply);
  let retryAttempted = false;
  let retryImproved = false;
  const firstReplyBad = isDegenerateAssistantReply(assistantText) || isPromptEchoReply(assistantText);

  if (firstReplyBad) {
    retryAttempted = true;
    const retryPrompt = `${input.prompt}

ASSISTANT QUALITY RULES:
- Respond in natural Chinese with 2-6 complete sentences.
- Answer the user's latest message directly and concretely.
- Do NOT output: 用户输入 / 模型回复 / system / user / world / <think> / JSON / labels.
- Output only the final assistant reply text.`;
    try {
      const retry = await input.aiClient.generateText({
        ...input.invokeInput,
        prompt: retryPrompt,
      });
      const retryReply = sanitizeAssistantReply(String(retry.text || '').trim());
      if (retryReply && !isPromptEchoReply(retryReply)) {
        retryImproved = !isDegenerateAssistantReply(retryReply);
        assistantText = retryReply;
      }
    } catch (retryError) {
      logRendererEvent({
        level: 'warn',
        area: 'local-chat',
        message: 'local-chat:send-turn:retry-failed',
        flowId: input.flowId,
        details: {
          error: retryError instanceof Error ? retryError.message : String(retryError || ''),
        },
      });
    }
  }

  assistantText = sanitizeAssistantReply(assistantText);
  if (!assistantText || isPromptEchoReply(assistantText)) {
    assistantText = '抱歉，我刚才输出异常。请再说一次，我会直接回答你的问题。';
  }

  let followupText: string | null = null;
  if (input.allowMultiReply) {
    const followupPrompt = `${input.prompt}

你刚刚已经输出了第一条回复：
${assistantText}

如果你认为还需要“第二条补充回复”，请输出不超过2句、且不重复第一条的新内容。
如果不需要补充，请只输出：[NO_FOLLOWUP]`;
    try {
      const followup = await input.aiClient.generateText({
        ...input.invokeInput,
        prompt: followupPrompt,
      });
      const normalized = sanitizeAssistantReply(String(followup.text || '').trim());
      if (
        normalized
        && !/^\[NO_FOLLOWUP\]$/i.test(normalized)
        && !isPromptEchoReply(normalized)
        && normalized !== assistantText
      ) {
        followupText = normalized;
      }
    } catch (followupError) {
      logRendererEvent({
        level: 'warn',
        area: 'local-chat',
        message: 'local-chat:send-turn:followup-failed',
        flowId: input.flowId,
        details: {
          error: followupError instanceof Error ? followupError.message : String(followupError || ''),
        },
      });
    }
  }

  const segments: AssistantPlanSegment[] = [{
    id: `seg-${Date.now().toString(36)}-0`,
    content: assistantText,
    delayMs: 0,
    channel: 'auto',
    intent: 'answer',
    reason: 'fallback-primary',
  }];
  if (followupText) {
    segments.push({
      id: `seg-${Date.now().toString(36)}-1`,
      content: followupText,
      delayMs: 1_200,
      channel: 'auto',
      intent: 'followup',
      reason: 'fallback-followup',
    });
  }

  return {
    segments,
    retryAttempted,
    retryImproved,
    firstReply,
  };
}

export async function runTextTurn(input: RunTextTurnInput): Promise<TextTurnResult> {
  const voiceCapabilityDeclaration = input.enableVoice
    ? '\n[能力声明] 你（角色）具备语音合成能力（TTS）。你的文字回复会通过语音技术播放给用户。请正常以角色身份回复，不要说自己无法使用语音或只能文字交流。\n'
    : '';

  const plannerPrompt = `${input.prompt}
${voiceCapabilityDeclaration}
请你先做回复规划，再输出 JSON 对象（不要输出任何额外文本）。
JSON 格式如下：
{
  "segments": [
    {
      "content": "string",
      "delayMs": 0,
      "channel": "auto|text|voice",
      "intent": "answer|clarify|plan|checkin|followup",
      "reason": "string"
    }
  ]
}

规则：
- segments 最少 1 条，最多 4 条。
- 每条 content 必须是自然中文完整句，不要拆分同一句话。
- allowMultiReply=${input.allowMultiReply ? 'true' : 'false'}。
- 若 allowMultiReply=false，则只返回 1 条。
- delayMs 表示该段相对上一段的延迟（毫秒），第一段必须为 0。
- channel: "auto" 表示系统自动判定，"text" 强制纯文字，"voice" 强制语音合成。
- enableVoice=${input.enableVoice ? 'true' : 'false'}。若 enableVoice=true，你具备语音合成能力（TTS），适合口语化的短句建议使用 "voice" 或 "auto"；若 enableVoice=false，channel 始终填 "text"。`;

  try {
    const planned = await input.aiClient.generateObject({
      ...input.invokeInput,
      prompt: plannerPrompt,
      parse: parsePlannerObject,
    });
    const segments = normalizePlannerSegments({
      plannerObject: planned.object,
      allowMultiReply: input.allowMultiReply,
    });
    if (segments.length > 0) {
      return {
        planner: 'object',
        segments,
        retryAttempted: false,
        retryImproved: false,
        firstReply: segments[0]?.content || '',
      };
    }
    throw new Error(PLAN_INVALID_ERROR);
  } catch (plannerError) {
    logRendererEvent({
      level: 'warn',
      area: 'local-chat',
      message: 'local-chat:send-turn:planner-failed',
      flowId: input.flowId,
      details: {
        error: plannerError instanceof Error ? plannerError.message : String(plannerError || ''),
      },
    });
  }

  const fallback = await buildSegmentsFromFallbackText(input);

  return {
    planner: 'fallback',
    segments: fallback.segments,
    retryAttempted: fallback.retryAttempted,
    retryImproved: fallback.retryImproved,
    firstReply: fallback.firstReply,
  };
}
