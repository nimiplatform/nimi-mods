import type { LocalChatTurnMode } from '../../types.js';
import type { InteractionSnapshot, RelationMemorySlot } from '../../state/index.js';
import type { LocalChatTurnAiClient } from './types.js';
import type { TurnInvokeInput } from './request-builder.js';

export type TurnPerceptionResult = {
  turnMode: LocalChatTurnMode;
  emotionalState: {
    detected: string;
    cause: string;
    suggestedApproach: string;
  } | null;
  relevantMemoryIds: string[];
  conversationDirective: string | null;
};

const PERCEPTION_PROMPT_TEMPLATE = `你是一个对话感知模块。分析以下用户消息和对话上下文，返回 JSON。

用户消息：
{userText}

{snapshotContext}

{memoryContext}

请返回以下 JSON，不要有任何其它文本：
{"turnMode":"information|emotional|playful|intimate|checkin|explicit-media|explicit-voice","emotionalState":null 或 {"detected":"情绪名","cause":"原因","suggestedApproach":"建议回应方式"},"relevantMemoryIds":["相关记忆ID列表"],"conversationDirective":"给下一轮AI的1-2句方向指引，如果不需要则为null"}

turnMode 判定规则：
- information：用户在提问或寻求信息
- emotional：用户在表达情绪（难过、焦虑、疲惫、孤独等），需要共情
- playful：用户在开玩笑、撒娇、逗趣
- intimate：用户在推进亲密关系（表白、暧昧、亲密互动）
- checkin：简单问候、打招呼、早安晚安
- explicit-media：用户明确要求发图片或视频
- explicit-voice：用户明确要求语音回复
- 注意区分"我想抱歉"（emotional）和"我想抱你"（intimate）
- 注意"怎么回事啊哈哈"优先是 playful 而非 information

emotionalState 判定规则：
- 仅当用户明显带有情绪时填写，日常对话返回 null
- cause 要基于上下文推断真正原因，不只看表面词汇
- suggestedApproach 指导后续 AI 如何回应（如 "empathize-first", "lighten-mood", "be-supportive"）

relevantMemoryIds：
- 从提供的记忆列表中选出与当前对话相关的 ID
- 只选真正相关的，不要全选

conversationDirective：
- 基于当前对话走向，给出 1-2 句简短指引
- 例如："用户刚分享了工作烦恼，继续深入关心，不要急着转话题"
- 如果是简单问候或信息查询，返回 null`;

function buildSnapshotContext(snapshot: InteractionSnapshot | null): string {
  if (!snapshot) return '当前对话状态：新对话，没有历史上下文。';
  const parts = [
    `关系状态：${snapshot.relationshipState}`,
    `情绪温度：${snapshot.emotionalTemperature}`,
  ];
  if (snapshot.topicThreads.length > 0) {
    parts.push(`近期话题：${snapshot.topicThreads.slice(0, 4).join('；')}`);
  }
  if (snapshot.openLoops.length > 0) {
    parts.push(`未完成事项：${snapshot.openLoops.slice(0, 3).join('；')}`);
  }
  if (snapshot.userPrefs.length > 0) {
    parts.push(`用户偏好：${snapshot.userPrefs.slice(0, 3).join('；')}`);
  }
  if (snapshot.assistantCommitments.length > 0) {
    parts.push(`助手承诺：${snapshot.assistantCommitments.slice(0, 3).join('；')}`);
  }
  return `当前对话状态：\n${parts.join('\n')}`;
}

function buildMemoryContext(slots: RelationMemorySlot[]): string {
  if (slots.length === 0) return '可用记忆：无';
  const lines = slots.map((slot) => `- [${slot.id}] (${slot.slotType}) ${slot.key}: ${slot.value}`);
  return `可用记忆（从中选出相关的 ID）：\n${lines.join('\n')}`;
}

function buildPerceptionPrompt(input: {
  userText: string;
  snapshot: InteractionSnapshot | null;
  memorySlots: RelationMemorySlot[];
}): string {
  return PERCEPTION_PROMPT_TEMPLATE
    .replace('{userText}', input.userText)
    .replace('{snapshotContext}', buildSnapshotContext(input.snapshot))
    .replace('{memoryContext}', buildMemoryContext(input.memorySlots));
}

function parsePerceptionResult(object: Record<string, unknown>): TurnPerceptionResult {
  const turnMode = parseTurnMode(object.turnMode);
  const emotionalState = parseEmotionalState(object.emotionalState);
  const relevantMemoryIds = parseStringArray(object.relevantMemoryIds);
  const conversationDirective = typeof object.conversationDirective === 'string'
    ? object.conversationDirective.trim() || null
    : null;
  return { turnMode, emotionalState, relevantMemoryIds, conversationDirective };
}

function parseTurnMode(value: unknown): LocalChatTurnMode {
  const str = String(value || '').trim().toLowerCase();
  const valid: LocalChatTurnMode[] = [
    'information', 'emotional', 'playful', 'intimate',
    'checkin', 'explicit-media', 'explicit-voice',
  ];
  return valid.includes(str as LocalChatTurnMode) ? (str as LocalChatTurnMode) : 'information';
}

function parseEmotionalState(value: unknown): TurnPerceptionResult['emotionalState'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const detected = String(record.detected || '').trim();
  if (!detected) return null;
  return {
    detected,
    cause: String(record.cause || '').trim(),
    suggestedApproach: String(record.suggestedApproach || '').trim(),
  };
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

/**
 * Hardcoded overrides that don't need AI — instant return for unambiguous cases.
 * Returns null if AI perception is needed.
 */
function tryHardcodedOverride(input: {
  userText: string;
  proactive?: boolean;
  voiceConversationMode?: string;
}): LocalChatTurnMode | null {
  if (input.proactive) return 'checkin';
  if (input.voiceConversationMode === 'on') return 'explicit-voice';
  // Explicit media/voice keywords that are completely unambiguous
  const text = input.userText.trim();
  if (/^(发图|来张图|发一张|给我看看你|发个视频|来个视频)\b/u.test(text)) return 'explicit-media';
  if (/^(用语音|语音回复|读给我听)\b/u.test(text)) return 'explicit-voice';
  return null;
}

export async function perceiveTurn(input: {
  aiClient: LocalChatTurnAiClient;
  invokeInput: TurnInvokeInput;
  userText: string;
  snapshot: InteractionSnapshot | null;
  memorySlots: RelationMemorySlot[];
  proactive?: boolean;
  voiceConversationMode?: string;
  regexFallbackTurnMode?: LocalChatTurnMode;
}): Promise<TurnPerceptionResult> {
  // Fast path: unambiguous cases don't need AI
  const hardcoded = tryHardcodedOverride({
    userText: input.userText,
    proactive: input.proactive,
    voiceConversationMode: input.voiceConversationMode,
  });
  if (hardcoded) {
    return {
      turnMode: hardcoded,
      emotionalState: null,
      relevantMemoryIds: [],
      conversationDirective: null,
    };
  }

  const prompt = buildPerceptionPrompt({
    userText: input.userText,
    snapshot: input.snapshot,
    memorySlots: input.memorySlots,
  });

  try {
    console.log('[turn-perception] generateObject: calling...');
    const result = await input.aiClient.generateObject({
      ...input.invokeInput,
      prompt,
      maxTokens: 1024,
      temperature: 0.3,
    });
    const parsed = parsePerceptionResult(result.object);
    console.log('[turn-perception] generateObject: success', {
      turnMode: parsed.turnMode,
      emotionalState: parsed.emotionalState?.detected || null,
      rawText: result.text?.slice(0, 200),
    });
    return parsed;
  } catch (err) {
    console.error('[turn-perception] generateObject: FAILED', {
      error: err instanceof Error ? err.message : String(err),
      fallback: input.regexFallbackTurnMode || 'information',
    });
    // Fallback: use regex-based turnMode instead of hardcoded 'information'
    return {
      turnMode: input.regexFallbackTurnMode || 'information',
      emotionalState: null,
      relevantMemoryIds: [],
      conversationDirective: null,
    };
  }
}
