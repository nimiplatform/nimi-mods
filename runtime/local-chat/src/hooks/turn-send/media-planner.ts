import { z } from 'zod';
import type { RuntimeRouteBinding } from '@nimiplatform/sdk/mod/runtime-route';
import type { LocalChatTarget } from '../../data/index.js';
import type { LocalChatPromptTrace } from '../../state/index.js';
import type { NsfwMediaPolicy } from '../../services/policy/nsfw-media-policy.js';
import type { LocalChatTurnAiClient } from './types.js';
import { pt, type PromptLocale } from '../../prompt/prompt-locale.js';

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
  promptLocale?: PromptLocale;
}): string {
  const locale = input.promptLocale || 'en';
  return [
    pt(locale, 'planner.role'),
    pt(locale, 'planner.task'),
    pt(locale, 'planner.require'),
    pt(locale, 'planner.rulesHeader'),
    pt(locale, 'planner.rule1'),
    pt(locale, 'planner.rule2'),
    pt(locale, 'planner.rule3'),
    pt(locale, 'planner.rule4'),
    pt(locale, 'planner.rule5'),
    pt(locale, 'planner.rule6'),
    pt(locale, 'planner.rule7'),
    '',
    pt(locale, 'planner.outputFormat'),
    '{“kind”:”none|image|video”,”trigger”:”assistant-offer|scene-enhancement|none”,”confidence”:0.0,”subject”:”string”,”scene”:”string”,”styleIntent”:”string”,”mood”:”string”,”hints”:{“composition”:”string?”,”negativeCues”:[“string”],”continuityRefs”:[“string”]},”reason”:”string”,”nsfwIntent”:”none|suggested”}',
    '',
    pt(locale, 'planner.targetSummary', { value: summarizeTarget(input.target) }),
    pt(locale, 'planner.worldSummary', { value: summarizeWorld(input.target) }),
    pt(locale, 'planner.visualAnchor', { value: input.visualAnchorSummary || '-' }),
    pt(locale, 'planner.userInput', { value: input.userText || '-' }),
    pt(locale, 'planner.assistantText', { value: input.assistantText || '-' }),
    pt(locale, 'planner.recentTurns', { value: input.recentTurnSummary || '-' }),
    pt(locale, 'planner.continuity', { value: input.continuitySummary || '-' }),
    pt(locale, 'planner.diagnostics', { value: formatPromptTraceHints(input.promptTrace) }),
    pt(locale, 'planner.nsfwPolicy', { value: input.nsfwPolicy }),
    pt(locale, 'planner.imageReady', { ready: input.imageReady ? 'yes' : 'no', status: input.imageDependencyStatus }),
    pt(locale, 'planner.videoReady', { ready: input.videoReady ? 'yes' : 'no', status: input.videoDependencyStatus }),
    pt(locale, 'planner.recentMedia', { value: input.recentMediaSummary }),
    '',
    pt(locale, 'planner.decisionHeader'),
    pt(locale, 'planner.decisionOffer'),
    pt(locale, 'planner.decisionScene'),
    pt(locale, 'planner.decisionNone'),
    pt(locale, 'planner.decisionSubject'),
    pt(locale, 'planner.decisionSceneDesc'),
    pt(locale, 'planner.decisionStyle'),
    pt(locale, 'planner.decisionMood'),
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
  promptLocale?: PromptLocale;
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
        promptLocale: input.promptLocale,
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
