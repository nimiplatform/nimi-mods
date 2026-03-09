import { z } from 'zod';
import type { RuntimeRouteBinding } from '@nimiplatform/sdk/mod/runtime-route';
import type { LocalChatTarget } from '../../data/index.js';
import type { LocalChatPromptTrace } from '../../state/index.js';
import type { NsfwMediaPolicy } from '../../services/policy/nsfw-media-policy.js';
import type { LocalChatTurnAiClient } from './types.js';

export type MediaPlannerTrigger =
  | 'user-explicit'
  | 'assistant-offer'
  | 'scene-enhancement'
  | 'none'
  | 'marker-override';

export type MediaPlannerDecision = {
  kind: 'none' | 'image' | 'video';
  trigger: Exclude<MediaPlannerTrigger, 'user-explicit' | 'marker-override'>;
  confidence: number;
  subject: string;
  scene: string;
  styleIntent: string;
  mood: string;
  hints?: {
    composition?: string;
    negativeCues?: string[];
    continuityRefs?: string[];
  };
  reason: string;
  nsfwIntent: 'none' | 'suggested';
};

export type MediaPlannerResult =
  | {
      status: 'ok';
      decision: MediaPlannerDecision;
      traceId: string;
      routeSource: 'local' | 'cloud';
      routeModel?: string;
    }
  | {
      status: 'failed';
      reason: string;
      traceId?: string;
    };

const MEDIA_PLANNER_TIMEOUT_MS = 2_500;
const MEDIA_PLANNER_MAX_TOKENS = 420;
const MEDIA_PLANNER_TEMPERATURE = 0.1;

const mediaPlannerDecisionSchema = z.object({
  kind: z.enum(['none', 'image', 'video']),
  trigger: z.enum(['assistant-offer', 'scene-enhancement', 'none']),
  confidence: z.number().min(0).max(1),
  subject: z.string().max(280).default(''),
  scene: z.string().max(320).default(''),
  styleIntent: z.string().max(240).default(''),
  mood: z.string().max(120).default(''),
  hints: z.object({
    composition: z.string().max(240).optional(),
    negativeCues: z.array(z.string().max(120)).max(6).optional(),
    continuityRefs: z.array(z.string().max(120)).max(6).optional(),
  }).optional(),
  reason: z.string().max(240).default(''),
  nsfwIntent: z.enum(['none', 'suggested']).default('none'),
});

function parseStrictJsonObject(text: string): Record<string, unknown> {
  const normalized = String(text || '').trim();
  if (!normalized.startsWith('{') || !normalized.endsWith('}')) {
    throw new Error('LOCAL_CHAT_MEDIA_PLANNER_INVALID_JSON');
  }
  const parsed = JSON.parse(normalized);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('LOCAL_CHAT_MEDIA_PLANNER_INVALID_OBJECT');
  }
  return parsed as Record<string, unknown>;
}

function parseMediaPlannerDecision(text: string): Record<string, unknown> {
  const parsed = parseStrictJsonObject(text);
  const result = mediaPlannerDecisionSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error('LOCAL_CHAT_MEDIA_PLANNER_SCHEMA_INVALID');
  }
  const decision = result.data;
  return {
    kind: decision.kind,
    trigger: decision.kind === 'none' ? 'none' : decision.trigger,
    confidence: Number(decision.confidence),
    subject: String(decision.subject || '').trim(),
    scene: String(decision.scene || '').trim(),
    styleIntent: String(decision.styleIntent || '').trim(),
    mood: String(decision.mood || '').trim(),
    hints: decision.hints
      ? {
        ...(String(decision.hints.composition || '').trim()
          ? { composition: String(decision.hints.composition || '').trim() }
          : {}),
        ...(Array.isArray(decision.hints.negativeCues) && decision.hints.negativeCues.length > 0
          ? { negativeCues: decision.hints.negativeCues.map((value) => String(value || '').trim()).filter(Boolean) }
          : {}),
        ...(Array.isArray(decision.hints.continuityRefs) && decision.hints.continuityRefs.length > 0
          ? { continuityRefs: decision.hints.continuityRefs.map((value) => String(value || '').trim()).filter(Boolean) }
          : {}),
      }
      : undefined,
    reason: String(decision.reason || '').trim(),
    nsfwIntent: decision.nsfwIntent,
  };
}

function summarizeWorld(target: LocalChatTarget): string {
  const worldName = String((target.world as Record<string, unknown> | null)?.name || '').trim();
  const worldviewName = String((target.worldview as Record<string, unknown> | null)?.name || '').trim();
  if (worldName && worldviewName) {
    return `${worldName} / ${worldviewName}`;
  }
  return worldName || worldviewName || '-';
}

function summarizeTarget(target: LocalChatTarget): string {
  const bio = String(target.bio || '').trim();
  const identity = `${target.displayName} (@${target.handle})`;
  return bio ? `${identity} - ${bio}` : identity;
}

function formatPromptTraceHints(trace: LocalChatPromptTrace | null | undefined): string {
  if (!trace) return '-';
  return [
    `segments=${trace.planSegments ?? '-'}`,
    `parse=${trace.segmentParseMode || '-'}`,
    `nsfw=${trace.nsfwPolicy || '-'}`,
  ].join(', ');
}

function buildMediaPlannerPrompt(input: {
  userText: string;
  assistantText: string;
  target: LocalChatTarget;
  nsfwPolicy: NsfwMediaPolicy;
  imageReady: boolean;
  videoReady: boolean;
  imageDependencyStatus: string;
  videoDependencyStatus: string;
  recentMediaSummary: string;
  promptTrace: LocalChatPromptTrace | null;
  visualAnchorSummary: string;
  recentTurnSummary: string;
  continuitySummary: string;
}): string {
  return [
    '你是 local-chat 的媒体触发 planner。',
    '任务：判断这一轮聊天是否应该额外发送一个媒体内容来增强陪伴感。',
    '要求：如果没有非常明确的价值，就返回 none。',
    '规则：',
    '- 只能返回一个动作：none / image / video。',
    '- image 比较常规；video 必须更谨慎，只在画面感、镜头感或动态效果明显更合适时选择。',
    '- 只有在动作变化、镜头推进、表情变化或连续动态本身很重要时，才允许选择 video。',
    '- 只有在文本已经自然成立的前提下，媒体才是补充；不要为了炫技而发媒体。',
    '- 如果对应能力未就绪，不要选择该媒体类型。',
    '- 如果语境可能偏 NSFW，只有在策略允许时才可建议；不确定时宁可返回 none。',
    '- 严格输出 JSON，不要输出解释。',
    '',
    '输出 JSON 格式：',
    '{"kind":"none|image|video","trigger":"assistant-offer|scene-enhancement|none","confidence":0.0,"subject":"string","scene":"string","styleIntent":"string","mood":"string","hints":{"composition":"string?","negativeCues":["string"],"continuityRefs":["string"]},"reason":"string","nsfwIntent":"none|suggested"}',
    '',
    `角色摘要: ${summarizeTarget(input.target)}`,
    `世界摘要: ${summarizeWorld(input.target)}`,
    `角色视觉锚点: ${input.visualAnchorSummary || '-'}`,
    `用户本轮输入: ${input.userText || '-'}`,
    `助手本轮正文: ${input.assistantText || '-'}`,
    `最近对话摘要: ${input.recentTurnSummary || '-'}`,
    `连续性参考: ${input.continuitySummary || '-'}`,
    `对话诊断提示: ${formatPromptTraceHints(input.promptTrace)}`,
    `NSFW 策略: ${input.nsfwPolicy}`,
    `图片可用: ${input.imageReady ? 'yes' : 'no'} (dependency=${input.imageDependencyStatus})`,
    `视频可用: ${input.videoReady ? 'yes' : 'no'} (dependency=${input.videoDependencyStatus})`,
    `最近媒体历史: ${input.recentMediaSummary}`,
    '',
    '决策准则：',
    '- assistant-offer: 助手正文已经明显在“提出/承诺/准备给用户看某个画面或视频”，例如“我给你发一张”“我拍给你看”。',
    '- scene-enhancement: 当前话题本身具有很强画面感，补一个媒体会明显更贴切。',
    '- kind=none 时 trigger 必须是 none，subject/scene/styleIntent/mood 置空。',
    '- subject 只写媒体主体，不要写长句。',
    '- scene 写具体画面或镜头情境。',
    '- styleIntent 写视觉风格倾向。',
    '- mood 写情绪基调。',
  ].join('\n');
}

function normalizeReason(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  const reasonCode = (
    error
    && typeof error === 'object'
    && 'reasonCode' in error
  ) ? String((error as { reasonCode?: unknown }).reasonCode || '').trim() : '';
  if (reasonCode) return reasonCode;
  return String(error || 'LOCAL_CHAT_MEDIA_PLANNER_FAILED');
}

export async function planMediaTurn(input: {
  aiClient: Pick<LocalChatTurnAiClient, 'generateObject'>;
  routeBinding: RuntimeRouteBinding | null;
  userText: string;
  assistantText: string;
  target: LocalChatTarget;
  worldId?: string | null;
  nsfwPolicy: NsfwMediaPolicy;
  imageReady: boolean;
  videoReady: boolean;
  imageDependencyStatus: string;
  videoDependencyStatus: string;
  recentMediaSummary: string;
  promptTrace: LocalChatPromptTrace | null;
  visualAnchorSummary: string;
  recentTurnSummary: string;
  continuitySummary: string;
}): Promise<MediaPlannerResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, MEDIA_PLANNER_TIMEOUT_MS);
  try {
    const result = await input.aiClient.generateObject({
      capability: 'text.generate',
      routeBinding: input.routeBinding || undefined,
      mode: 'STORY',
      worldId: input.worldId || undefined,
      agentId: input.target.id,
      prompt: buildMediaPlannerPrompt({
        userText: input.userText,
        assistantText: input.assistantText,
        target: input.target,
        nsfwPolicy: input.nsfwPolicy,
        imageReady: input.imageReady,
        videoReady: input.videoReady,
        imageDependencyStatus: input.imageDependencyStatus,
        videoDependencyStatus: input.videoDependencyStatus,
        recentMediaSummary: input.recentMediaSummary,
        promptTrace: input.promptTrace,
        visualAnchorSummary: input.visualAnchorSummary,
        recentTurnSummary: input.recentTurnSummary,
        continuitySummary: input.continuitySummary,
      }),
      maxTokens: MEDIA_PLANNER_MAX_TOKENS,
      temperature: MEDIA_PLANNER_TEMPERATURE,
      abortSignal: controller.signal,
      parse: parseMediaPlannerDecision,
    });
    const decisionResult = mediaPlannerDecisionSchema.safeParse(result.object);
    if (!decisionResult.success) {
      return {
        status: 'failed',
        reason: 'LOCAL_CHAT_MEDIA_PLANNER_SCHEMA_INVALID',
        traceId: String(result.traceId || '').trim() || undefined,
      };
    }
    const decision = decisionResult.data;
    return {
      status: 'ok',
      decision: {
        kind: decision.kind,
        trigger: decision.kind === 'none' ? 'none' : decision.trigger,
        confidence: decision.confidence,
        subject: String(decision.subject || '').trim(),
        scene: String(decision.scene || '').trim(),
        styleIntent: String(decision.styleIntent || '').trim(),
        mood: String(decision.mood || '').trim(),
        hints: decision.hints
          ? {
            ...(String(decision.hints.composition || '').trim()
              ? { composition: String(decision.hints.composition || '').trim() }
              : {}),
            ...(Array.isArray(decision.hints.negativeCues) && decision.hints.negativeCues.length > 0
              ? { negativeCues: decision.hints.negativeCues.map((value) => String(value || '').trim()).filter(Boolean) }
              : {}),
            ...(Array.isArray(decision.hints.continuityRefs) && decision.hints.continuityRefs.length > 0
              ? { continuityRefs: decision.hints.continuityRefs.map((value) => String(value || '').trim()).filter(Boolean) }
              : {}),
          }
          : undefined,
        reason: String(decision.reason || '').trim(),
        nsfwIntent: decision.nsfwIntent,
      },
      traceId: String(result.traceId || '').trim(),
      routeSource: result.route.source === 'cloud' ? 'cloud' : 'local',
      routeModel: String(result.route.model || '').trim() || undefined,
    };
  } catch (error) {
    return {
      status: 'failed',
      reason: normalizeReason(error),
      traceId: (
        error
        && typeof error === 'object'
        && 'traceId' in error
      ) ? String((error as { traceId?: unknown }).traceId || '').trim() || undefined : undefined,
    };
  } finally {
    clearTimeout(timeout);
  }
}
