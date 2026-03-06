import type { LocalChatTarget, LocalChatMemoryRecallResult } from '../../data/index.js';
import { recallLocalChatMemoryForPrompt } from '../../data/index.js';
import {
  getLocalChatRunningSummary,
  lexicalRecallLocalChatSession,
  listLocalChatDurableMemoryEntries,
  listLocalChatExactHistoryBundles,
  type LocalChatContextPacket,
  type LocalChatDurableMemoryEntry,
  type LocalChatTurnBundle,
} from '../../state/index.js';

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
} {
  const profile = asRecord(target.agentProfile);
  const metadata = asRecord(target.agentMetadata);
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
      '保持自然、像朋友发微信一样交流。',
      '需要分条时最多 3 条，节奏可以变化。',
    ].filter(Boolean),
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
    userInput: input.text,
    diagnostics: {
      selectedBundleSeqs: recentBundles.map((bundle) => bundle.seq),
      runningSummaryWatermark: runningSummary?.lastSummarizedBundleSeq || 0,
      sessionRecallCount: recallDocs.length,
      durableMemoryCountsByType: countDurableMemoryByType(selectedDurableMemory),
    },
  };
}
