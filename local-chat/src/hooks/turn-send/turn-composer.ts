import { logRendererEvent } from '@nimiplatform/sdk/mod/logging';
import type {
  InteractionBeat,
  InteractionTurnPlan,
  LocalChatContextPacket,
  LocalChatTurnMode,
} from '../../state/index.js';
import { createUlid } from '../../utils/ulid.js';
import type { LocalChatTurnAiClient } from './types.js';
import type { TurnInvokeInput } from './request-builder.js';
import { runTextTurn } from './text-turn-runner.js';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asString(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeBeatIntent(value: unknown): InteractionBeat['intent'] {
  const normalized = asString(value).toLowerCase();
  if (normalized === 'clarify' || normalized === 'checkin' || normalized === 'comfort' || normalized === 'tease' || normalized === 'invite' || normalized === 'media') {
    return normalized;
  }
  return 'answer';
}

function normalizePauseMs(value: unknown, index: number): number {
  if (index === 0) return 0;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 600;
  return Math.max(180, Math.min(2400, Math.round(numeric)));
}

function clampBeatCount(turnMode: LocalChatTurnMode): number {
  if (turnMode === 'information') return 2;
  if (turnMode === 'checkin') return 2;
  return 4;
}

function parsePlanObject(input: {
  object: Record<string, unknown>;
  turnId: string;
  turnMode: LocalChatTurnMode;
}): InteractionTurnPlan {
  const planId = `plan_${createUlid()}`;
  const rawBeats = Array.isArray(input.object.beats) ? input.object.beats : [];
  const beats: InteractionBeat[] = [];
  rawBeats
    .slice(0, clampBeatCount(input.turnMode))
    .forEach((item, index, list) => {
      const record = asRecord(item);
      const text = asString(record.text || record.content);
      if (!text) {
        return;
      }
      const kind = asString(asRecord(record.assetRequest).kind);
      const prompt = asString(asRecord(record.assetRequest).prompt);
      beats.push({
        beatId: `beat_${createUlid()}`,
        turnId: input.turnId,
        beatIndex: index,
        beatCount: list.length || 1,
        intent: normalizeBeatIntent(record.intent),
        relationMove: asString(record.relationMove || record.relation_move || input.turnMode),
        sceneMove: asString(record.sceneMove || record.scene_move || input.turnMode),
        modality: 'text',
        text,
        pauseMs: normalizePauseMs(record.pauseMs || record.pause_ms, index),
        assetRequest: kind === 'image' || kind === 'video'
          ? {
            kind,
            prompt: prompt || text,
            confidence: 0.74,
            nsfwIntent: /nsfw|暧昧|亲密|裸|吻/u.test(prompt || text) ? 'suggested' : 'none',
          }
          : undefined,
        cancellationScope: index === 0 ? 'turn' : 'tail',
      });
    });

  const normalizedBeats = beats.length > 0
    ? beats.map((beat, index) => ({
      ...beat,
      beatIndex: index,
      beatCount: beats.length,
    }))
    : [];

  return {
    planId,
    turnId: input.turnId,
    turnMode: input.turnMode,
    firstBeatLocked: false,
    planFirstBeatText: normalizedBeats[0]?.text || '',
    beats: normalizedBeats,
    fallbackPolicy: 'legacy-stream-text',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
}

export async function composeInteractionTurnPlan(input: {
  aiClient: LocalChatTurnAiClient;
  invokeInput: TurnInvokeInput;
  contextPacket: LocalChatContextPacket;
  userText: string;
  turnId: string;
  turnMode: LocalChatTurnMode;
}): Promise<InteractionTurnPlan> {
  const prompt = [
    input.invokeInput.prompt,
    '',
    '请规划这轮对话的完整 beat 计划，仅返回一个 JSON 对象，不要有任何其它文字。',
    '',
    '严格按照以下 JSON 格式：',
    '```json',
    '{"beats":[{"text":"一句完整的话","intent":"answer","relationMove":"friendly","sceneMove":"日常","pauseMs":650}]}',
    '```',
    '',
    '字段说明：',
    '- text: 必须是完整的句子，不能断在半截，不能是空字符串',
    '- intent: 只能是 answer/clarify/checkin/comfort/tease/invite/media 之一',
    '- relationMove: 描述这句话对关系的推进（如 friendly/warm/comfort/tease/closer）',
    '- sceneMove: 描述场景变化（如 日常/深入/安慰/调侃）',
    '- pauseMs: 这句话前的停顿毫秒数（第 1 条固定 0，后续 300-2000）',
    '- assetRequest: 可选，仅在需要生图/视频时添加 {"kind":"image|video","prompt":"描述"}',
    '',
    '规则：',
    '- beats 数量 1-4 条，不要超过 4 条',
    '- information 模式默认 1-2 条；emotional/intimate/playful/checkin 可以 2-4 条',
    '- 第 1 条 beat 是最先接住用户的回应，要短、快、完整',
    '- 后续 beat 逐步展开，不要重复第 1 条的内容',
    '- 不要使用 markdown 格式、不要代码块、不要解释',
    '- 整个输出只能是一个 JSON 对象，以 { 开头，以 } 结尾',
    '',
    '示例（emotional 模式，用户说"好累"）：',
    '{"beats":[{"text":"怎么了，今天很辛苦吗？","intent":"comfort","relationMove":"warm","sceneMove":"安慰","pauseMs":0},{"text":"跟我说说，我听着呢。","intent":"invite","relationMove":"closer","sceneMove":"深入","pauseMs":800}]}',
    '',
    `turnMode=${input.turnMode}`,
    `deliveryStyle=${input.contextPacket.target.interactionProfile.expression.pacingBias}`,
    `voiceConversationMode=${input.contextPacket.voiceConversationMode || 'off'}`,
    `userText=${input.userText}`,
  ].join('\n');

  try {
    console.log('[turn-composer] generateObject: calling...', { turnMode: input.turnMode });
    const result = await input.aiClient.generateObject({
      ...input.invokeInput,
      prompt,
      maxTokens: 1200,
      temperature: 0.5,
    });
    const rawBeats = (result.object as Record<string, unknown>)?.beats;
    console.log('[turn-composer] generateObject: success', {
      beatCount: Array.isArray(rawBeats) ? rawBeats.length : 'non-array',
      turnMode: input.turnMode,
      rawText: result.text?.slice(0, 200),
    });
    const plan = parsePlanObject({
      object: result.object,
      turnId: input.turnId,
      turnMode: input.turnMode,
    });
    if (plan.beats.length > 0) {
      console.log('[turn-composer] plan accepted:', plan.beats.length, 'beats');
      return plan;
    }
    console.warn('[turn-composer] generateObject: parsed but 0 valid beats', { turnMode: input.turnMode });
  } catch (err) {
    console.error('[turn-composer] generateObject: FAILED', {
      error: err instanceof Error ? err.message : String(err),
      turnMode: input.turnMode,
    });
  }
  const fallback = await runTextTurn({
    flowId: `fallback_${input.turnId}`,
    aiClient: input.aiClient,
    invokeInput: input.invokeInput,
    prompt: input.invokeInput.prompt,
    allowMultiReply: input.turnMode !== 'information',
    segmentationMode: 'adaptive',
    pacingPlan: input.contextPacket.pacingPlan,
  });
  return parsePlanObject({
    object: {
      beats: fallback.segments.map((segment) => ({
        text: segment.content,
        intent: 'answer',
        relationMove: input.turnMode,
        sceneMove: input.turnMode,
        pauseMs: segment.delayMs,
      })),
    },
    turnId: input.turnId,
    turnMode: input.turnMode,
  });
}
