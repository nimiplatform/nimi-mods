import type { LocalChatTurnMode } from '../../types.js';
import type { InteractionSnapshot, RelationMemorySlot } from '../../state/index.js';
import type { LocalChatTurnAiClient } from './types.js';
import type { TurnInvokeInput } from './request-builder.js';
import { pt, type PromptLocale } from '../../prompt/prompt-locale.js';

export type TurnPerceptionResult = {
  turnMode: LocalChatTurnMode;
  emotionalState: {
    detected: string;
    cause: string;
    suggestedApproach: string;
  } | null;
  relevantMemoryIds: string[];
  conversationDirective: string | null;
  intimacyCeiling: 'friendly' | 'warm' | 'intimate';
};

function getPerceptionPromptTemplate(locale: PromptLocale): string {
  return pt(locale, 'perception.template');
}

function buildSnapshotContext(snapshot: InteractionSnapshot | null, locale: PromptLocale): string {
  if (!snapshot) return pt(locale, 'perception.snapshotNew');
  const parts = [
    pt(locale, 'perception.relationship', { value: snapshot.relationshipState }),
    pt(locale, 'perception.emotionalTemp', { value: snapshot.emotionalTemperature }),
  ];
  if (snapshot.topicThreads.length > 0) {
    parts.push(pt(locale, 'perception.recentTopics', { value: snapshot.topicThreads.slice(0, 4).join('；') }));
  }
  if (snapshot.openLoops.length > 0) {
    parts.push(pt(locale, 'perception.openLoops', { value: snapshot.openLoops.slice(0, 3).join('；') }));
  }
  if (snapshot.userPrefs.length > 0) {
    parts.push(pt(locale, 'perception.userPrefs', { value: snapshot.userPrefs.slice(0, 3).join('；') }));
  }
  if (snapshot.assistantCommitments.length > 0) {
    parts.push(pt(locale, 'perception.commitments', { value: snapshot.assistantCommitments.slice(0, 3).join('；') }));
  }
  return `${pt(locale, 'perception.snapshotPrefix')}\n${parts.join('\n')}`;
}

function buildMemoryContext(slots: RelationMemorySlot[], locale: PromptLocale): string {
  if (slots.length === 0) return pt(locale, 'perception.memoryNone');
  const lines = slots.map((slot) => `- [${slot.id}] (${slot.slotType}) ${slot.key}: ${slot.value}`);
  return `${pt(locale, 'perception.memoryHeader')}\n${lines.join('\n')}`;
}

function buildRecentTurnsContext(recentTurns: Array<{ role: string; text: string }>, locale: PromptLocale): string {
  if (recentTurns.length === 0) return pt(locale, 'perception.turnsNone');
  const lines = recentTurns.map((turn) => `- ${turn.role}: ${turn.text}`);
  return `${pt(locale, 'perception.turnsHeader')}\n${lines.join('\n')}`;
}

function buildPerceptionPrompt(input: {
  userText: string;
  snapshot: InteractionSnapshot | null;
  memorySlots: RelationMemorySlot[];
  recentTurns: Array<{ role: string; text: string }>;
  promptLocale: PromptLocale;
}): string {
  return getPerceptionPromptTemplate(input.promptLocale)
    .replace('{userText}', input.userText)
    .replace('{recentTurnsContext}', buildRecentTurnsContext(input.recentTurns, input.promptLocale))
    .replace('{snapshotContext}', buildSnapshotContext(input.snapshot, input.promptLocale))
    .replace('{memoryContext}', buildMemoryContext(input.memorySlots, input.promptLocale));
}

function parseIntimacyCeiling(value: unknown, fallback: 'friendly' | 'warm' | 'intimate'): TurnPerceptionResult['intimacyCeiling'] {
  const str = String(value || '').trim().toLowerCase();
  if (str === 'friendly' || str === 'warm' || str === 'intimate') return str;
  return fallback;
}

function parsePerceptionResult(object: Record<string, unknown>, currentRelationship?: string): TurnPerceptionResult {
  const turnMode = parseTurnMode(object.turnMode);
  const emotionalState = parseEmotionalState(object.emotionalState);
  const relevantMemoryIds = parseStringArray(object.relevantMemoryIds);
  const conversationDirective = typeof object.conversationDirective === 'string'
    ? object.conversationDirective.trim() || null
    : null;
  const defaultCeiling: TurnPerceptionResult['intimacyCeiling'] =
    currentRelationship === 'intimate' ? 'intimate'
      : currentRelationship === 'warm' ? 'warm'
        : 'friendly';
  const intimacyCeiling = parseIntimacyCeiling(object.intimacyCeiling, defaultCeiling);
  return { turnMode, emotionalState, relevantMemoryIds, conversationDirective, intimacyCeiling };
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
}): LocalChatTurnMode | null {
  if (input.proactive) return 'checkin';
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
  recentTurns?: Array<{ role: string; text: string }>;
  proactive?: boolean;
  regexFallbackTurnMode?: LocalChatTurnMode;
  promptLocale?: PromptLocale;
}): Promise<TurnPerceptionResult> {
  const currentRelationship = input.snapshot?.relationshipState || 'new';
  const defaultCeiling: TurnPerceptionResult['intimacyCeiling'] =
    currentRelationship === 'intimate' ? 'intimate'
      : currentRelationship === 'warm' ? 'warm'
        : 'friendly';

  // Fast path: unambiguous cases don't need AI
  const hardcoded = tryHardcodedOverride({
    userText: input.userText,
    proactive: input.proactive,
  });
  if (hardcoded) {
    return {
      turnMode: hardcoded,
      emotionalState: null,
      relevantMemoryIds: [],
      conversationDirective: null,
      intimacyCeiling: defaultCeiling,
    };
  }

  const prompt = buildPerceptionPrompt({
    userText: input.userText,
    snapshot: input.snapshot,
    memorySlots: input.memorySlots,
    recentTurns: (input.recentTurns || []).slice(-5),
    promptLocale: input.promptLocale || 'en',
  });

  try {
    console.log('[turn-perception] generateObject: calling...');
    const result = await input.aiClient.generateObject({
      ...input.invokeInput,
      prompt,
      maxTokens: 1024,
      temperature: 0.3,
    });
    const parsed = parsePerceptionResult(result.object, currentRelationship);
    console.log('[turn-perception] generateObject: success', {
      turnMode: parsed.turnMode,
      emotionalState: parsed.emotionalState?.detected || null,
      intimacyCeiling: parsed.intimacyCeiling,
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
      intimacyCeiling: defaultCeiling,
    };
  }
}
