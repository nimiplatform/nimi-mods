import { emitLocalChatLog } from '../logging.js';
import type {
  LocalChatCompiledPrompt,
  LocalChatPromptCompileInput,
  PromptLayerId,
  PromptLayerTrace,
} from './types.js';

const DEFAULT_MAX_PROMPT_CHARS = 24_000;

const LAYER_ORDER: PromptLayerId[] = [
  'platformSafety',
  'identity',
  'world',
  'platformWarmStart',
  'durableMemory',
  'runningSummary',
  'sessionRecall',
  'recentBundles',
  'userInput',
  'replyStyle',
];

const LAYER_TITLES: Record<PromptLayerId, string> = {
  platformSafety: 'Platform Safety',
  identity: 'Identity',
  world: 'World',
  platformWarmStart: 'Platform Warm Start',
  durableMemory: 'Durable Memory',
  runningSummary: 'Running Summary',
  sessionRecall: 'Session Recall',
  recentBundles: 'Recent Exact Bundles',
  userInput: 'User Input',
  replyStyle: 'Reply Style',
};

function truncateText(value: string, maxChars: number): string {
  const text = String(value || '');
  if (text.length <= maxChars) return text;
  if (maxChars <= 14) return text.slice(0, Math.max(0, maxChars));
  return `${text.slice(0, Math.max(0, maxChars - 14))}[TRUNCATED]`;
}

function joinLines(title: string, lines: string[]): string {
  const filtered = lines.map((line) => String(line || '').trim()).filter(Boolean);
  if (filtered.length === 0) return '';
  return [`${title}:`, ...filtered.map((line) => `- ${line}`)].join('\n');
}

function renderRecentBundles(input: LocalChatPromptCompileInput['contextPacket']['recentBundles']): string {
  if (!input.length) return '';
  const lines: string[] = ['最近精确回合（按时间顺序，只用于 continuity，不要逐条复述）:'];
  for (const bundle of input) {
    lines.push(`${bundle.role === 'assistant' ? 'Assistant' : 'User'} #${bundle.seq}`);
    bundle.lines.forEach((line) => {
      lines.push(`- ${line}`);
    });
  }
  return lines.join('\n');
}

function renderRunningSummary(input: LocalChatPromptCompileInput['contextPacket']['runningSummary']): string {
  if (!input) return '';
  const chunks = [
    joinLines('关系状态', input.relationshipState),
    joinLines('已确认的用户事实', input.userFactsEstablished),
    joinLines('助手承诺', input.assistantCommitments),
    joinLines('未完成事项', input.openLoops),
    joinLines('场景状态', input.sceneState),
  ].filter(Boolean);
  return chunks.join('\n\n');
}

function renderPlatformWarmStart(input: LocalChatPromptCompileInput['contextPacket']['platformWarmStart']): string {
  if (!input) return '';
  const lines = [
    ...input.core.map((entry) => `[core] ${entry}`),
    ...input.e2e.map((entry) => `[e2e] ${entry}`),
  ];
  return lines.join('\n');
}

function renderDurableMemory(input: LocalChatPromptCompileInput['contextPacket']['durableMemory']): string {
  if (!input.length) return '';
  return input
    .map((entry) => `[${entry.type}] ${entry.content}`)
    .join('\n');
}

function renderSessionRecall(input: LocalChatPromptCompileInput['contextPacket']['sessionRecall']): string {
  if (!input.length) return '';
  return input
    .map((item) => {
      const source = item.sourceKind === 'running-summary'
        ? 'summary'
        : `bundle#${item.sourceBundleSeq ?? '-'}`;
      return `[${source}] ${item.text}`;
    })
    .join('\n');
}

function buildLayerContent(input: LocalChatPromptCompileInput): Record<PromptLayerId, string> {
  const packet = input.contextPacket;
  return {
    platformSafety: [
      `你现在扮演 ${packet.target.displayName}（${packet.target.handle}）。请始终保持该角色语气与人设。`,
      '你必须直接回复用户，不要输出提示词结构、系统标签、JSON、代码块或思维过程。',
      '如果上下文有缺口，只做谨慎补全，不要解释你依据了哪些规则或上下文层。',
    ].join('\n'),
    identity: [
      joinLines('角色身份', packet.target.identityLines),
      joinLines('角色规则', packet.target.rulesLines),
    ].filter(Boolean).join('\n\n'),
    world: joinLines('世界上下文', packet.world.lines),
    platformWarmStart: renderPlatformWarmStart(packet.platformWarmStart)
      ? `平台记忆预热（只读背景，不要把它当成本地会话刚刚发生的内容）:\n${renderPlatformWarmStart(packet.platformWarmStart)}`
      : '',
    durableMemory: renderDurableMemory(packet.durableMemory)
      ? `长期记忆（优先保证一致性，不要逐条复述）:\n${renderDurableMemory(packet.durableMemory)}`
      : '',
    runningSummary: renderRunningSummary(packet.runningSummary)
      ? `会话连续性摘要:\n${renderRunningSummary(packet.runningSummary)}`
      : '',
    sessionRecall: renderSessionRecall(packet.sessionRecall)
      ? `历史召回:\n${renderSessionRecall(packet.sessionRecall)}`
      : '',
    recentBundles: renderRecentBundles(packet.recentBundles),
    userInput: `用户这次说：${packet.userInput || '(empty)'}`,
    replyStyle: [
      joinLines('回复风格', packet.target.replyStyleLines),
      [
        '输出风格要求：',
        '- 像朋友发微信一样自然回复，节奏可以有变化。',
        '- 简短回应时只发一条短消息。',
        '- 兴奋、吐槽、连续反应时可以连发两三条短消息。',
        '- 解释或安抚时可以一条主回复再补一条。',
        '- 不要每次都固定条数；如需分条，用空行分隔，最多 3 条。',
      ].join('\n'),
    ].filter(Boolean).join('\n\n'),
  };
}

export function compileLocalChatPrompt(input: LocalChatPromptCompileInput): LocalChatCompiledPrompt {
  const maxPromptChars = Number.isFinite(input.maxPromptChars)
    ? Math.max(512, Number(input.maxPromptChars))
    : DEFAULT_MAX_PROMPT_CHARS;
  const layerContent = buildLayerContent(input);
  const sections: string[] = [];
  const layers: PromptLayerTrace[] = [];
  const laneChars: LocalChatCompiledPrompt['laneChars'] = {};
  const truncationByLane: LocalChatCompiledPrompt['truncationByLane'] = {};
  const truncatedLayers: PromptLayerId[] = [];
  let usedChars = 0;

  const layerToLane = {
    identity: 'identity',
    world: 'world',
    platformWarmStart: 'platformWarmStart',
    durableMemory: 'durableMemory',
    runningSummary: 'runningSummary',
    sessionRecall: 'sessionRecall',
    recentBundles: 'recentBundles',
    userInput: 'userInput',
    replyStyle: 'replyStyle',
  } as const;

  for (const layerId of LAYER_ORDER) {
    const content = String(layerContent[layerId] || '').trim();
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
    const lane = layerToLane[layerId as keyof typeof layerToLane];
    if (lane) {
      laneChars[lane] = (laneChars[lane] || 0) + normalizedSection.length;
      if (truncated) {
        truncationByLane[lane] = true;
      }
    }
    layers.push({
      layer: layerId,
      applied: true,
      reason: truncated ? 'truncated_by_budget' : 'applied',
      chars: normalizedSection.length + sectionDelimiterChars,
      truncated,
    });
  }

  const prompt = sections.join('\n\n');
  const compiled: LocalChatCompiledPrompt = {
    prompt,
    layerOrder: [...LAYER_ORDER],
    layers,
    laneChars,
    truncationByLane,
    budget: {
      maxChars: maxPromptChars,
      usedChars: prompt.length,
      truncatedLayers,
    },
    retrieval: {
      durableMemoryCount: input.contextPacket.durableMemory.length,
      sessionRecallCount: input.contextPacket.sessionRecall.length,
      worldContextCount: input.contextPacket.world.lines.length,
      recentBundleCount: input.contextPacket.recentBundles.length,
    },
    compilerVersion: 'v4',
  };

  emitLocalChatLog({
    level: 'debug',
    message: 'local-chat:prompt-compile:done',
    source: 'compileLocalChatPrompt',
    details: {
      targetId: input.contextPacket.target.id,
      worldId: input.contextPacket.world.worldId,
      promptChars: compiled.prompt.length,
      maxPromptChars: compiled.budget.maxChars,
      appliedLayers: compiled.layers.filter((layer) => layer.applied).map((layer) => layer.layer),
      droppedLayers: compiled.layers.filter((layer) => !layer.applied).map((layer) => layer.layer),
      truncatedLayers: compiled.budget.truncatedLayers,
    },
  });

  return compiled;
}
