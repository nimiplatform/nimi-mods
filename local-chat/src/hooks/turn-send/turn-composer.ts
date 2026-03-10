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
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return index === 0 ? 650 : 600;
  return Math.max(180, Math.min(2400, Math.round(numeric)));
}

function clampBeatCount(turnMode: LocalChatTurnMode): number {
  if (turnMode === 'information') return 2;
  if (turnMode === 'checkin') return 2;
  return 4;
}

function toBigrams(text: string): Set<string> {
  const chars = text.replace(/\s+/g, '');
  const bigrams = new Set<string>();
  for (let i = 0; i < chars.length - 1; i++) {
    bigrams.add(chars.slice(i, i + 2));
  }
  return bigrams;
}

function bigramOverlap(a: string, b: string): number {
  const bigramsA = toBigrams(a);
  const bigramsB = toBigrams(b);
  if (bigramsA.size === 0 || bigramsB.size === 0) return 0;
  let intersection = 0;
  for (const bigram of bigramsA) {
    if (bigramsB.has(bigram)) intersection++;
  }
  const union = new Set([...bigramsA, ...bigramsB]).size;
  return union === 0 ? 0 : intersection / union;
}

function isSemanticallyDuplicate(a: string, b: string): boolean {
  return bigramOverlap(a, b) > 0.6;
}

function isCrossTurnDuplicate(text: string, recentBeatTexts: string[]): boolean {
  const normalized = asString(text);
  if (!normalized || recentBeatTexts.length === 0) return false;
  return recentBeatTexts.some((candidate) => {
    const previous = asString(candidate);
    if (!previous) return false;
    if (normalized === previous) return true;
    if (normalized.length < 8 || previous.length < 8) {
      return bigramOverlap(normalized, previous) > 0.82;
    }
    return bigramOverlap(normalized, previous) > 0.7;
  });
}

const INTIMACY_RANK: Record<string, number> = {
  friendly: 1,
  warm: 2,
  intimate: 3,
};

const INTIMATE_RELATION_MOVE_RE = /intimate|kiss|hug|closer|暧昧|亲密|依赖|撒娇|表白/u;
const WARM_RELATION_MOVE_RE = /warm|comfort|陪伴|温柔|抱抱/u;

function clampRelationMove(relationMove: string, intimacyCeiling?: string): string {
  if (!intimacyCeiling) return relationMove;
  const ceilingRank = INTIMACY_RANK[intimacyCeiling] || 1;
  if (INTIMATE_RELATION_MOVE_RE.test(relationMove) && ceilingRank < 3) {
    return ceilingRank >= 2 ? 'warm' : 'friendly';
  }
  if (WARM_RELATION_MOVE_RE.test(relationMove) && ceilingRank < 2) {
    return 'friendly';
  }
  return relationMove;
}

function parsePlanObject(input: {
  object: Record<string, unknown>;
  turnId: string;
  turnMode: LocalChatTurnMode;
  intimacyCeiling?: string;
  recentBeatTexts?: string[];
  sealedFirstBeatText: string;
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
      if (isSemanticallyDuplicate(text, input.sealedFirstBeatText)) {
        return;
      }
      const kind = asString(asRecord(record.assetRequest).kind);
      const prompt = asString(asRecord(record.assetRequest).prompt);
      const rawRelationMove = asString(record.relationMove || record.relation_move || input.turnMode);
      const allowAssetRequest = input.turnMode === 'explicit-media';
      beats.push({
        beatId: `beat_${createUlid()}`,
        turnId: input.turnId,
        beatIndex: index + 1,
        beatCount: list.length || 1,
        intent: normalizeBeatIntent(record.intent),
        relationMove: clampRelationMove(rawRelationMove, input.intimacyCeiling),
        sceneMove: asString(record.sceneMove || record.scene_move || input.turnMode),
        modality: 'text',
        text,
        pauseMs: normalizePauseMs(record.pauseMs || record.pause_ms, index),
        assetRequest: allowAssetRequest && (kind === 'image' || kind === 'video')
          ? {
            kind,
            prompt: prompt || text,
            confidence: 0.74,
            nsfwIntent: /nsfw|暧昧|亲密|裸|吻/u.test(prompt || text) ? 'suggested' : 'none',
          }
          : undefined,
        cancellationScope: 'tail',
      });
    });

  // Semantic dedup: skip beats too similar to already accepted ones
  const dedupedBeats: InteractionBeat[] = [];
  const recentBeatTexts = (input.recentBeatTexts || []).map((value) => asString(value)).filter(Boolean);
  for (const beat of beats) {
    const isDuplicate = dedupedBeats.some((accepted) => isSemanticallyDuplicate(beat.text, accepted.text));
    const isRepeatedFromRecentTurn = isCrossTurnDuplicate(beat.text, recentBeatTexts);
    if (!isDuplicate && !isRepeatedFromRecentTurn) {
      dedupedBeats.push(beat);
    }
  }

  // Tail beat pruning: remove low-information-gain trailing beat
  if (dedupedBeats.length > 1) {
    const lastBeat = dedupedBeats[dedupedBeats.length - 1]!;
    const prevBeat = dedupedBeats[dedupedBeats.length - 2]!;
    const isLowGain = bigramOverlap(lastBeat.text, prevBeat.text) > 0.4;
    const isInviteOrOpen = /[?？…]/.test(lastBeat.text)
      || lastBeat.intent === 'comfort'
      || lastBeat.intent === 'invite'
      || lastBeat.intent === 'media';
    if (isLowGain && !isInviteOrOpen) {
      dedupedBeats.pop();
    }
  }

  const normalizedBeats = dedupedBeats.length > 0
    ? dedupedBeats.map((beat, index) => ({
      ...beat,
      beatIndex: index + 1,
      beatCount: dedupedBeats.length + 1,
    }))
    : [];

  return {
    planId,
    turnId: input.turnId,
    turnMode: input.turnMode,
    beats: normalizedBeats,
    fallbackPolicy: 'first-beat-only',
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
  deliveryStyle?: 'natural' | 'compact';
  emotionalState?: string;
  directive?: string;
  intimacyCeiling?: string;
  recentBeatTexts?: string[];
  sealedFirstBeatText: string;
}): Promise<InteractionTurnPlan> {
  const perceptionLines: string[] = [];
  if (input.emotionalState) {
    perceptionLines.push(`emotionalState=${input.emotionalState}`);
  }
  if (input.directive) {
    perceptionLines.push(`directive=${input.directive}`);
  }
  if (input.intimacyCeiling) {
    perceptionLines.push(`intimacyCeiling=${input.intimacyCeiling}`);
  }
  if (input.recentBeatTexts && input.recentBeatTexts.length > 0) {
    perceptionLines.push('');
    perceptionLines.push('以下是最近的回复，新 beat 不要重复类似的内容或句式：');
    perceptionLines.push(input.recentBeatTexts.join(' | '));
  }

  const prompt = [
    input.invokeInput.prompt,
    '',
    '请规划这轮对话在首拍之后的 tail beat 计划，仅返回一个 JSON 对象，不要有任何其它文字。',
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
    '- pauseMs: 这条 tail beat 相对上一拍的停顿毫秒数（建议 300-2000）',
    '- assetRequest: 可选，但只允许 explicit-media 模式输出 {"kind":"image|video","prompt":"描述"}',
    '',
    '规则：',
    '- beats 数量 0-4 条，不要超过 4 条',
    '- information 模式可以直接返回空 beats',
    '- 这些都是首拍之后的补充 beat，不要重写、重复、解释或微调首拍',
    '- 后续 beat 必须带来新信息、新情绪动作或新关系推进，不能只是换个说法重复首拍或上一条',
    '- 非 explicit-media 模式不要输出 assetRequest，也不要暗示系统会自动发图/发视频',
    '- 不要使用 markdown 格式、不要代码块、不要解释',
    '- 整个输出只能是一个 JSON 对象，以 { 开头，以 } 结尾',
    '',
    `已经封口的首拍：${input.sealedFirstBeatText}`,
    '',
    '示例（emotional 模式，用户说"好累"）：',
    '{"beats":[{"text":"先别一个人硬撑，把最压你的那件事丢给我。","intent":"invite","relationMove":"warm","sceneMove":"深入","pauseMs":750}]}',
    '',
    `turnMode=${input.turnMode}`,
    `deliveryStyle=${input.deliveryStyle || 'natural'}`,
    `voiceConversationMode=${input.contextPacket.voiceConversationMode || 'off'}`,
    `userText=${input.userText}`,
    ...perceptionLines,
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
      intimacyCeiling: input.intimacyCeiling,
      recentBeatTexts: input.recentBeatTexts,
      sealedFirstBeatText: input.sealedFirstBeatText,
    });
    if (plan.beats.length > 0) {
      console.log('[turn-composer] plan accepted:', plan.beats.length, 'beats');
      return plan;
    }
    console.warn('[turn-composer] generateObject: parsed but 0 valid tail beats', { turnMode: input.turnMode });
  } catch (err) {
    console.error('[turn-composer] generateObject: FAILED', {
      error: err instanceof Error ? err.message : String(err),
      turnMode: input.turnMode,
    });
  }
  return {
    planId: `plan_${createUlid()}`,
    turnId: input.turnId,
    turnMode: input.turnMode,
    beats: [],
    fallbackPolicy: 'first-beat-only',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
}
