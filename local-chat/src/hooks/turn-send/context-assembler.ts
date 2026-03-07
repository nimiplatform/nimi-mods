import type { LocalChatTarget, LocalChatMemoryRecallResult } from '../../data/index.js';
import { recallLocalChatMemoryForPrompt } from '../../data/index.js';
import {
  getLocalChatRunningSummary,
  lexicalRecallLocalChatSession,
  listLocalChatDurableMemoryEntries,
  listLocalChatExactHistoryBundles,
  type LocalChatContinuityHealth,
  type LocalChatContextPacket,
  type LocalChatDurableMemoryEntry,
  type LocalChatReplyPacingPlan,
  type LocalChatReplyStyleProfile,
  type LocalChatTurnBundle,
} from '../../state/index.js';
import { getLocalChatContinuityHealth } from './continuity-maintenance.js';

export type AssembleLocalChatContextPacketInput = {
  text: string;
  viewerId: string;
  viewerDisplayName: string;
  selectedTarget: LocalChatTarget;
  selectedSessionId: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asString(value: unknown): string {
  return String(value || '').trim();
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function lexicalScore(haystack: string, query: string): number {
  const normalizedHaystack = haystack.toLowerCase();
  const tokens = query
    .toLowerCase()
    .split(/[\s,.;:!?/\\|()[\]{}"'`]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
  if (!tokens.length) {
    return normalizedHaystack.includes(query.toLowerCase()) ? 1 : 0;
  }
  let hits = 0;
  for (const token of tokens) {
    if (normalizedHaystack.includes(token)) hits += 1;
  }
  return hits / tokens.length;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readNestedRecord(record: unknown, path: string[]): Record<string, unknown> {
  let current = asRecord(record);
  for (const key of path) {
    current = asRecord(current[key]);
  }
  return current;
}

function normalizeResponseLength(value: unknown): LocalChatReplyStyleProfile['responseLength'] {
  const normalized = asString(value).toLowerCase();
  if (normalized === 'short' || normalized === 'long') return normalized;
  return 'medium';
}

function normalizeFormality(value: unknown): LocalChatReplyStyleProfile['formality'] {
  const normalized = asString(value).toLowerCase();
  if (normalized === 'formal' || normalized === 'slang') return normalized;
  return 'casual';
}

function normalizeSentiment(value: unknown): LocalChatReplyStyleProfile['sentiment'] {
  const normalized = asString(value).toLowerCase();
  if (normalized === 'positive' || normalized === 'cynical') return normalized;
  return 'neutral';
}

function compactLines(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function deriveReplyStyleProfile(target: LocalChatTarget): LocalChatReplyStyleProfile {
  const profile = asRecord(target.agentProfile);
  const metadata = asRecord(target.agentMetadata);
  const dna = readNestedRecord(profile, ['dna']);
  const dnaCommunication = readNestedRecord(dna, ['communication']);
  const dnaPersonality = readNestedRecord(dna, ['personality']);
  const postHistoryInstructions = compactLines(asString(profile.postHistoryInstructions || metadata.postHistoryInstructions));
  const exampleDialogue = compactLines(asString(profile.exampleDialogue || metadata.exampleDialogue));
  const dnaPrimary = asString(profile.dnaPrimary || metadata.dnaPrimary);
  const dnaSecondary = [
    ...asArray(profile.dnaSecondary),
    ...asArray(metadata.dnaSecondary),
  ].map((item) => asString(item).toUpperCase()).filter(Boolean);
  const relationshipMode = asString(dnaPersonality.relationshipMode || profile.relationshipMode || metadata.relationshipMode) || 'friendly';
  const responseLength = normalizeResponseLength(
    dnaCommunication.responseLength
    || profile.responseLength
    || metadata.responseLength
    || (exampleDialogue.length > 260 ? 'long' : exampleDialogue.length > 120 ? 'medium' : 'short'),
  );
  const formality = normalizeFormality(
    dnaCommunication.formality
    || profile.formality
    || metadata.formality
    || (/\bformal\b|正式|克制/u.test(postHistoryInstructions) ? 'formal' : 'casual'),
  );
  const sentiment = normalizeSentiment(
    dnaCommunication.sentiment
    || profile.sentiment
    || metadata.sentiment
    || (/\bcynical\b|冷淡|讽刺|阴阳怪气/u.test(postHistoryInstructions) ? 'cynical' : 'neutral'),
  );
  const normalizedRelationshipMode = relationshipMode.toLowerCase();
  const intimateRelationship = /(romantic|intimate|flirty|lover|partner|close|亲密|暧昧|恋人|伴侣)/u.test(normalizedRelationshipMode);
  const warmRelationship = intimateRelationship || /(friendly|gentle|warm|supportive|陪伴|温柔|朋友|治愈)/u.test(normalizedRelationshipMode);
  const warmSignal = warmRelationship || dnaSecondary.includes('GENTLE') || dnaSecondary.includes('ROMANTIC');
  const energeticSignal = dnaSecondary.includes('PLAYFUL') || dnaSecondary.includes('CHAOTIC') || dnaSecondary.includes('BOLD');
  const reservedSignal = formality === 'formal' || sentiment === 'cynical' || dnaPrimary === 'INTELLECTUAL' || dnaSecondary.includes('TSUNDERE');
  const pacingStyle: LocalChatReplyStyleProfile['pacingStyle'] = reservedSignal
    ? 'reserved'
    : energeticSignal || (responseLength === 'short' && warmSignal)
      ? 'bursty'
      : 'balanced';
  const followupStyle: LocalChatReplyStyleProfile['followupStyle'] = reservedSignal
    ? 'rare'
    : intimateRelationship || warmSignal || responseLength === 'long'
      ? 'eager'
      : 'situational';
  const warmth: LocalChatReplyStyleProfile['warmth'] = intimateRelationship
    ? 'intimate'
    : sentiment === 'cynical'
      ? 'cool'
      : warmSignal
        ? 'warm'
        : 'cool';
  const signals = [
    dnaPrimary ? `dnaPrimary:${dnaPrimary}` : '',
    dnaSecondary.length > 0 ? `dnaSecondary:${dnaSecondary.join('/')}` : '',
    relationshipMode ? `relationship:${relationshipMode}` : '',
    postHistoryInstructions ? 'postHistoryInstructions' : '',
    exampleDialogue ? 'exampleDialogue' : '',
  ].filter(Boolean);

  return {
    responseLength,
    formality,
    sentiment,
    relationshipMode,
    pacingStyle,
    followupStyle,
    warmth,
    signals,
  };
}

const GREETING_RE = /^(?:hi|hello|hey|yo|你好|嗨|哈喽|在吗|早安|晚安|想你了|在不在|喂)[\s!,.?？！，。~]*$/iu;
const QUESTION_RE = /[?？]|为什么|怎么|如何|能不能|可不可以|是什么|什么意思|怎样|要不要/u;
const EMOTIONAL_RE = /难过|好累|很累|烦|崩溃|想哭|孤单|害怕|抱抱|安慰|委屈|想你/u;
const EXCITED_RE = /(?:[!！]{2,}|哈哈|hh+|lol|好耶|太好了|天啊|卧槽|真的耶|笑死)/iu;

function derivePacingPlan(input: {
  text: string;
  profile: LocalChatReplyStyleProfile;
}): LocalChatReplyPacingPlan {
  const text = compactLines(input.text);
  const normalized = text.toLowerCase();
  const isGreeting = GREETING_RE.test(text);
  const isQuestion = QUESTION_RE.test(text);
  const isEmotional = EMOTIONAL_RE.test(text);
  const isExcited = EXCITED_RE.test(text);
  const intimate = input.profile.warmth === 'intimate';
  const energetic = input.profile.pacingStyle === 'bursty';
  const eagerFollowup = input.profile.followupStyle === 'eager';

  if (isEmotional || (isQuestion && eagerFollowup && input.profile.responseLength !== 'short')) {
    return {
      mode: 'answer-followup',
      maxSegments: 2,
      energy: isEmotional ? 'low' : 'medium',
      reason: isEmotional ? 'comfort-needs-soft-followup' : 'question-needs-main-answer-and-followup',
    };
  }
  if (isExcited && energetic) {
    return {
      mode: input.profile.responseLength === 'short' ? 'burst-3' : 'burst-2',
      maxSegments: input.profile.responseLength === 'short' ? 3 : 2,
      energy: 'high',
      reason: 'high-energy-turn',
    };
  }
  if (isGreeting && (intimate || eagerFollowup || energetic)) {
    return {
      mode: 'burst-2',
      maxSegments: 2,
      energy: intimate ? 'medium' : 'high',
      reason: 'greeting-turn-with-warmth',
    };
  }
  if (input.profile.pacingStyle === 'reserved' || input.profile.formality === 'formal') {
    return {
      mode: 'single',
      maxSegments: 1,
      energy: 'low',
      reason: 'reserved-style',
    };
  }
  if (isQuestion && input.profile.followupStyle !== 'rare' && normalized.length <= 48) {
    return {
      mode: 'answer-followup',
      maxSegments: 2,
      energy: 'medium',
      reason: 'short-question-followup',
    };
  }
  return {
    mode: energetic && input.profile.responseLength === 'short' ? 'burst-2' : 'single',
    maxSegments: energetic && input.profile.responseLength === 'short' ? 2 : 1,
    energy: energetic ? 'medium' : 'low',
    reason: energetic && input.profile.responseLength === 'short' ? 'bursty-short-style' : 'default-single',
  };
}

function summarizeWorld(target: LocalChatTarget): string[] {
  const world = asRecord(target.world);
  const worldview = asRecord(target.worldview);
  const worldName = asString(world.name || world.title);
  const worldSummary = asString(world.summary || world.description);
  const worldviewName = asString(worldview.name || worldview.title);
  const worldviewSummary = asString(worldview.summary || worldview.description);
  const rules = asStringArray(worldview.rules);
  return [
    worldName ? `World: ${worldName}` : '',
    worldSummary ? `World Summary: ${worldSummary}` : '',
    worldviewName ? `Worldview: ${worldviewName}` : '',
    worldviewSummary ? `Worldview Summary: ${worldviewSummary}` : '',
    ...rules.slice(0, 4).map((rule) => `World Rule: ${rule}`),
  ].filter(Boolean);
}

function summarizeIdentity(target: LocalChatTarget): {
  identityLines: string[];
  rulesLines: string[];
  replyStyleLines: string[];
  replyStyleProfile: LocalChatReplyStyleProfile;
} {
  const profile = asRecord(target.agentProfile);
  const metadata = asRecord(target.agentMetadata);
  const replyStyleProfile = deriveReplyStyleProfile(target);
  const rules = [
    ...asStringArray(profile.rules),
    ...asStringArray(metadata.rules),
  ].slice(0, 8);
  const postHistoryInstructions = asString(profile.postHistoryInstructions || metadata.postHistoryInstructions);
  const systemPromptBase = asString(profile.systemPromptBase || metadata.systemPromptBase);
  const persona = asString(profile.persona || asRecord(profile.dna).persona || metadata.persona);
  return {
    identityLines: [
      `Display Name: ${target.displayName}`,
      `Handle: ${target.handle}`,
      target.bio ? `Bio: ${target.bio}` : '',
      persona ? `Persona: ${persona}` : '',
      systemPromptBase ? `System Base: ${systemPromptBase}` : '',
    ].filter(Boolean),
    rulesLines: rules,
    replyStyleLines: [
      postHistoryInstructions,
      `建议节奏：${replyStyleProfile.pacingStyle}；补句倾向：${replyStyleProfile.followupStyle}；关系模式：${replyStyleProfile.relationshipMode}。`,
      '保持自然、像朋友发微信一样交流。',
      '需要分条时最多 3 条，节奏可以变化。',
    ].filter(Boolean),
    replyStyleProfile,
  };
}

function recentBundleLines(bundle: LocalChatTurnBundle): string[] {
  return bundle.segments
    .map((segment) => {
      const summary = String(segment.semanticSummary || '').trim();
      const contextText = String(segment.contextText || '').trim();
      return summary && summary !== contextText
        ? `${contextText} (${summary})`
        : contextText;
    })
    .filter(Boolean);
}

function selectDurableMemory(entries: LocalChatDurableMemoryEntry[], query: string): LocalChatDurableMemoryEntry[] {
  const alwaysOnTypes = new Set(['relationship-state', 'boundary', 'assistant-commitment', 'open-loop']);
  const alwaysOn = entries
    .filter((entry) => alwaysOnTypes.has(entry.type))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 8);
  const alwaysOnIds = new Set(alwaysOn.map((entry) => entry.id));
  const scored = entries
    .filter((entry) => !alwaysOnIds.has(entry.id))
    .map((entry) => ({
      entry,
      score: lexicalScore(entry.content, query),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => (
      right.score - left.score
      || right.entry.importance - left.entry.importance
      || right.entry.updatedAt.localeCompare(left.entry.updatedAt)
    ))
    .slice(0, 6)
    .map((item) => item.entry);
  return [...alwaysOn, ...scored];
}

function countDurableMemoryByType(entries: LocalChatDurableMemoryEntry[]): LocalChatContextPacket['diagnostics']['durableMemoryCountsByType'] {
  const counts: LocalChatContextPacket['diagnostics']['durableMemoryCountsByType'] = {};
  for (const entry of entries) {
    counts[entry.type] = (counts[entry.type] || 0) + 1;
  }
  return counts;
}

function shouldReadPlatformWarmStart(input: {
  recentBundles: LocalChatTurnBundle[];
  runningSummary: LocalChatContextPacket['runningSummary'];
  durableMemory: LocalChatDurableMemoryEntry[];
}): boolean {
  return !input.runningSummary
    && input.durableMemory.length === 0
    && input.recentBundles.length <= 1;
}

function toWarmStartMemory(result: LocalChatMemoryRecallResult | null): LocalChatContextPacket['platformWarmStart'] {
  if (!result) return null;
  if (result.coreMemory.length === 0 && result.e2eMemory.length === 0) return null;
  return {
    core: [...result.coreMemory],
    e2e: [...result.e2eMemory],
    recallSource: result.recallSource,
    entityId: result.entityId,
  };
}

export async function assembleLocalChatContextPacket(input: AssembleLocalChatContextPacketInput): Promise<LocalChatContextPacket> {
  const [recentBundles, runningSummary, recallDocs, durableMemory] = await Promise.all([
    listLocalChatExactHistoryBundles(input.selectedSessionId, input.viewerId),
    getLocalChatRunningSummary(input.selectedSessionId),
    lexicalRecallLocalChatSession({
      conversationId: input.selectedSessionId,
      query: input.text,
      topK: 6,
    }),
    listLocalChatDurableMemoryEntries({
      targetId: input.selectedTarget.id,
      viewerId: input.viewerId,
    }),
  ]);

  const warmStart = shouldReadPlatformWarmStart({
    recentBundles,
    runningSummary,
    durableMemory,
  })
    ? await recallLocalChatMemoryForPrompt({
      target: input.selectedTarget,
      viewerId: input.viewerId,
      userInput: input.text,
      topK: 6,
    }).catch(() => null)
    : null;

  const selectedDurableMemory = selectDurableMemory(durableMemory, input.text);
  const identity = summarizeIdentity(input.selectedTarget);
  const pacingPlan = derivePacingPlan({
    text: input.text,
    profile: identity.replyStyleProfile,
  });
  const continuityHealth = getLocalChatContinuityHealth(input.selectedSessionId);

  return {
    conversationId: input.selectedSessionId,
    viewer: {
      id: input.viewerId,
      displayName: input.viewerDisplayName,
    },
    target: {
      id: input.selectedTarget.id,
      handle: input.selectedTarget.handle,
      displayName: input.selectedTarget.displayName,
      bio: input.selectedTarget.bio,
      identityLines: identity.identityLines,
      rulesLines: identity.rulesLines,
      replyStyleLines: identity.replyStyleLines,
      replyStyleProfile: identity.replyStyleProfile,
    },
    world: {
      worldId: input.selectedTarget.worldId,
      lines: summarizeWorld(input.selectedTarget),
    },
    platformWarmStart: toWarmStartMemory(warmStart),
    runningSummary,
    durableMemory: selectedDurableMemory,
    sessionRecall: recallDocs.map((doc) => ({
      id: doc.id,
      text: doc.text,
      sourceKind: doc.sourceKind,
      sourceBundleSeq: doc.sourceBundleSeq,
    })),
    recentBundles: recentBundles.map((bundle) => ({
      id: bundle.id,
      seq: bundle.seq,
      role: bundle.role,
      lines: recentBundleLines(bundle),
    })),
    pacingPlan,
    userInput: input.text,
    diagnostics: {
      selectedBundleSeqs: recentBundles.map((bundle) => bundle.seq),
      runningSummaryWatermark: runningSummary?.lastSummarizedBundleSeq || 0,
      sessionRecallCount: recallDocs.length,
      durableMemoryCountsByType: countDurableMemoryByType(selectedDurableMemory),
      continuityHealth,
    },
  };
}
