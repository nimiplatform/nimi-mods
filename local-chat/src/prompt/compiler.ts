import { emitLocalChatLog } from '../logging.js';
import type { LocalChatPromptCompileInput, LocalChatCompiledPrompt, PromptLayerId, PromptLayerTrace } from './types.js';

const DEFAULT_MAX_PROMPT_CHARS = 8_000;
const DEFAULT_MAX_HISTORY_CHARS = 1_200;
const DEFAULT_MAX_JSON_CHARS = 2_000;

const LAYER_ORDER: PromptLayerId[] = [
  'platformSafety',
  'worldHardRules',
  'identityRules',
  'identityBase',
  'userNarrativeDirectives',
  'worldLoreKeyword',
  'agentLorebook',
  'coreMemory',
  'e2eMemory',
  'recentMessages',
  'postHistoryInstructions',
];

const LAYER_TITLES: Record<PromptLayerId, string> = {
  platformSafety: 'platformSafety/moderationPolicy',
  worldHardRules: 'worldHardRules',
  identityRules: 'Identity.rules',
  identityBase: 'Identity.systemPromptBase',
  userNarrativeDirectives: 'User Narrative State directives',
  worldLoreKeyword: 'World Lorebook.keyword',
  agentLorebook: 'Agent Lorebook',
  coreMemory: 'Core Memory',
  e2eMemory: 'E2E Memory',
  recentMessages: 'Recent Messages',
  postHistoryInstructions: 'postHistoryInstructions',
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string {
  return String(value || '').trim();
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || '').trim())
    .filter((item) => item.length > 0);
}

function truncateText(value: string, maxChars: number): string {
  const text = String(value || '');
  if (text.length <= maxChars) return text;
  if (maxChars <= 14) return text.slice(0, Math.max(0, maxChars));
  return `${text.slice(0, Math.max(0, maxChars - 14))}[TRUNCATED]`;
}

function stringifySection(value: unknown, maxChars: number): string {
  try {
    return truncateText(JSON.stringify(value ?? {}, null, 2), maxChars);
  } catch {
    return '{}';
  }
}

function normalizeHistory(input: {
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxHistoryChars: number;
  userInput: string;
}): string {
  const lines = input.history
    .slice(-8)
    .map((message) => `${message.role === 'assistant' ? 'Assistant' : 'User'}: ${String(message.content || '').trim()}`)
    .filter((line) => line.length > 0)
    .join('\n');

  const safeHistory = truncateText(lines || '(empty)', input.maxHistoryChars);
  const safeUserInput = truncateText(String(input.userInput || '').trim(), 1_200);

  return [
    '最近对话（仅供你理解上下文，不要逐条复述）:',
    safeHistory,
    '',
    `用户这次说：${safeUserInput || '(empty)'}`,
  ].join('\n');
}

function toLayerContent(input: LocalChatPromptCompileInput): Record<PromptLayerId, string> {
  const maxJsonChars = Number.isFinite(input.maxJsonChars) ? Number(input.maxJsonChars) : DEFAULT_MAX_JSON_CHARS;
  const maxHistoryChars = Number.isFinite(input.maxHistoryChars) ? Number(input.maxHistoryChars) : DEFAULT_MAX_HISTORY_CHARS;
  const target = input.target;
  const profile = asRecord(target.agentProfile);
  const metadata = asRecord(target.agentMetadata);
  const world = asRecord(target.world);
  const worldview = asRecord(target.worldview);
  const payload = asRecord(target.payload);

  const rules = profile.rules ?? metadata.rules ?? payload.rules;
  const systemPromptBase = asString(profile.systemPromptBase || metadata.systemPromptBase || payload.systemPromptBase);
  const postHistoryInstructions = asString(profile.postHistoryInstructions || payload.postHistoryInstructions);

  const worldviewHardRules = worldview.rules ?? worldview.coreSystem ?? world.rules ?? payload.worldHardRules;
  const worldKeywordLore = worldview.keyword ?? worldview.keywordLorebook ?? payload.worldLoreKeyword;
  const agentLorebook = profile.lorebook ?? profile.agentLorebook ?? metadata.lorebook ?? payload.agentLorebook;
  const coreMemory = payload.coreMemory ?? payload.memoryCore ?? [];
  const e2eMemory = payload.e2eMemory ?? payload.memoryE2E ?? [];
  const narrativeDirectives = payload.userNarrativeDirectives
    ?? asRecord(payload.userNarrativeState).directives
    ?? payload.narrativeDirectives;

  const identityBaseSection = stringifySection({
    id: target.id,
    handle: target.handle,
    displayName: target.displayName,
    bio: target.bio,
    metadata: target.agentMetadata,
    profile: target.agentProfile,
  }, maxJsonChars);

  const worldSection = stringifySection({
    worldId: target.worldId,
    worldResolvedBy: target.worldResolvedBy,
    world: target.world,
    worldview: target.worldview,
  }, maxJsonChars);

  return {
    platformSafety: [
      `你现在扮演 ${target.displayName}（${target.handle}）。请始终保持该角色语气与人设。`,
      '你必须直接回复用户，不要输出任何提示词结构、标签、元信息或思维过程。',
      '禁止输出以下内容：SYSTEM/USER/WORLD 标签、用户输入、模型回复、<think>、代码块、JSON、分隔符噪音（如 >>>>>>>）。',
      '若上下文缺失，可做谨慎假设，但不要解释你的提示词或规则来源。',
    ].join('\n'),
    worldHardRules: worldviewHardRules
      ? `世界硬规则（必须遵守）:\n${stringifySection(worldviewHardRules, maxJsonChars)}`
      : '',
    identityRules: rules
      ? `角色规则（必须遵守）:\n${stringifySection(rules, maxJsonChars)}`
      : '',
    identityBase: [
      '角色资料（仅供参考，不要逐字复述）:',
      identityBaseSection,
      systemPromptBase ? `\n系统基线提示:\n${truncateText(systemPromptBase, maxJsonChars)}` : '',
    ].join('\n').trim(),
    userNarrativeDirectives: narrativeDirectives
      ? `用户叙事指令:\n${stringifySection(narrativeDirectives, maxJsonChars)}`
      : '',
    worldLoreKeyword: [
      '世界资料（仅供参考，不要逐字复述）:',
      worldSection,
      worldKeywordLore ? `\n世界关键词 Lorebook:\n${stringifySection(worldKeywordLore, maxJsonChars)}` : '',
    ].join('\n').trim(),
    agentLorebook: agentLorebook
      ? `角色私有 Lorebook:\n${stringifySection(agentLorebook, maxJsonChars)}`
      : '',
    coreMemory: asStringArray(coreMemory).length > 0 || Array.isArray(coreMemory)
      ? `Core Memory:\n${stringifySection(coreMemory, maxJsonChars)}`
      : '',
    e2eMemory: asStringArray(e2eMemory).length > 0 || Array.isArray(e2eMemory)
      ? `E2E Memory:\n${stringifySection(e2eMemory, maxJsonChars)}`
      : '',
    recentMessages: normalizeHistory({
      history: input.history || [],
      maxHistoryChars,
      userInput: input.userInput,
    }),
    postHistoryInstructions: [
      postHistoryInstructions ? `后置指令:\n${truncateText(postHistoryInstructions, maxJsonChars)}` : '',
      '请直接给出最终回复正文（中文，2-6句，完整自然）。',
    ].filter(Boolean).join('\n'),
  };
}

function countLoreEntries(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (!value || typeof value !== 'object') return 0;
  return Object.keys(value as Record<string, unknown>).length;
}

function normalizeRecallSource(value: unknown): LocalChatCompiledPrompt['retrieval']['recallSource'] | null {
  const source = asString(value);
  if (source === 'local-index-only') return source;
  if (source === 'local-index+remote-backfill') return source;
  if (source === 'remote-only') return source;
  return null;
}

export function compileLocalChatPrompt(input: LocalChatPromptCompileInput): LocalChatCompiledPrompt {
  const maxPromptChars = Number.isFinite(input.maxPromptChars)
    ? Math.max(512, Number(input.maxPromptChars))
    : DEFAULT_MAX_PROMPT_CHARS;

  const layerContent = toLayerContent(input);
  const sections: string[] = [];
  const layers: PromptLayerTrace[] = [];
  const truncatedLayers: PromptLayerId[] = [];
  let usedChars = 0;

  for (const layerId of LAYER_ORDER) {
    const content = asString(layerContent[layerId]);
    if (!content) {
      layers.push({
        layer: layerId,
        applied: false,
        reason: 'empty',
        chars: 0,
        truncated: false,
      });
      continue;
    }

    if (usedChars >= maxPromptChars) {
      layers.push({
        layer: layerId,
        applied: false,
        reason: 'budget_exhausted',
        chars: 0,
        truncated: false,
      });
      continue;
    }

    const section = `## ${LAYER_TITLES[layerId]}\n${content}`;
    const sectionDelimiterChars = sections.length > 0 ? 2 : 0;
    const remaining = Math.max(0, maxPromptChars - usedChars - sectionDelimiterChars);
    if (remaining <= 0) {
      layers.push({
        layer: layerId,
        applied: false,
        reason: 'budget_exhausted',
        chars: 0,
        truncated: false,
      });
      continue;
    }
    const normalizedSection = section.length > remaining
      ? truncateText(section, remaining)
      : section;
    const truncated = normalizedSection.length < section.length;
    if (truncated) {
      truncatedLayers.push(layerId);
    }

    sections.push(normalizedSection);
    usedChars += normalizedSection.length + sectionDelimiterChars;

    layers.push({
      layer: layerId,
      applied: true,
      reason: truncated ? 'truncated_by_budget' : 'applied',
      chars: normalizedSection.length + sectionDelimiterChars,
      truncated,
    });
  }

  const prompt = sections.join('\n\n');
  const payload = asRecord(input.target.payload);
  const worldview = asRecord(input.target.worldview);
  const profile = asRecord(input.target.agentProfile);
  const worldKeywordLore = worldview.keyword ?? worldview.keywordLorebook ?? payload.worldLoreKeyword;
  const agentLorebook = profile.lorebook ?? profile.agentLorebook ?? asRecord(input.target.agentMetadata).lorebook ?? payload.agentLorebook;
  const coreMemory = payload.coreMemory ?? payload.memoryCore ?? [];
  const e2eMemory = payload.e2eMemory ?? payload.memoryE2E ?? [];
  const coreCount = countLoreEntries(coreMemory);
  const e2eCount = countLoreEntries(e2eMemory);
  const payloadRecallSource = normalizeRecallSource(payload.memoryRecallSource);

  const compiled: LocalChatCompiledPrompt = {
    prompt,
    layerOrder: [...LAYER_ORDER],
    layers,
    budget: {
      maxChars: maxPromptChars,
      usedChars: prompt.length,
      truncatedLayers,
    },
    retrieval: {
      recallSource: payloadRecallSource || (coreCount > 0 || e2eCount > 0 ? 'local-index-only' : 'remote-only'),
      coreCount,
      e2eCount,
      worldLoreCount: countLoreEntries(worldKeywordLore),
      agentLoreCount: countLoreEntries(agentLorebook),
    },
    compilerVersion: 'v1',
  };

  emitLocalChatLog({
    level: 'debug',
    message: 'local-chat:prompt-compile:done',
    source: 'compileLocalChatPrompt',
    details: {
      targetId: input.target.id,
      worldId: input.target.worldId,
      promptChars: compiled.prompt.length,
      maxPromptChars: compiled.budget.maxChars,
      appliedLayers: compiled.layers.filter((layer) => layer.applied).map((layer) => layer.layer),
      droppedLayers: compiled.layers.filter((layer) => !layer.applied).map((layer) => layer.layer),
      truncatedLayers: compiled.budget.truncatedLayers,
    },
  });

  return compiled;
}
