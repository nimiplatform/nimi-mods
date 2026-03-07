import { emitLocalChatLog } from '../logging.js';
import type { LocalChatContextLaneId } from '../state/ledger-types.js';
import type {
  LocalChatCompiledPrompt,
  LocalChatPromptCompileInput,
  PromptLayerId,
  PromptLayerTrace,
} from './types.js';

const DEFAULT_MAX_PROMPT_CHARS = 24_000;
const PROMPT_FORMAT_RESERVE_CHARS = 1_200;

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

const LAYER_TO_LANE: Partial<Record<PromptLayerId, LocalChatContextLaneId>> = {
  identity: 'identity',
  world: 'world',
  platformWarmStart: 'platformWarmStart',
  durableMemory: 'durableMemory',
  runningSummary: 'runningSummary',
  sessionRecall: 'sessionRecall',
  recentBundles: 'recentBundles',
  userInput: 'userInput',
  replyStyle: 'replyStyle',
};

const LANE_ORDER: LocalChatContextLaneId[] = [
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

const LANE_BUDGET_CONFIG: Record<LocalChatContextLaneId, {
  share: number;
  minChars: number;
  maxChars: number;
}> = {
  identity: { share: 0.1, minChars: 900, maxChars: 2_400 },
  world: { share: 0.08, minChars: 400, maxChars: 1_900 },
  platformWarmStart: { share: 0.08, minChars: 400, maxChars: 1_900 },
  durableMemory: { share: 0.14, minChars: 1_100, maxChars: 3_400 },
  runningSummary: { share: 0.16, minChars: 1_200, maxChars: 3_900 },
  sessionRecall: { share: 0.12, minChars: 600, maxChars: 3_000 },
  recentBundles: { share: 0.2, minChars: 1_000, maxChars: 5_200 },
  userInput: { share: 0.06, minChars: 280, maxChars: 1_500 },
  replyStyle: { share: 0.06, minChars: 520, maxChars: 1_500 },
};

const REDUCTION_ORDER: LocalChatContextLaneId[] = [
  'recentBundles',
  'sessionRecall',
  'world',
  'platformWarmStart',
  'durableMemory',
  'runningSummary',
  'replyStyle',
  'identity',
  'userInput',
];

const EXPANSION_ORDER: LocalChatContextLaneId[] = [
  'recentBundles',
  'runningSummary',
  'durableMemory',
  'sessionRecall',
  'world',
  'platformWarmStart',
  'replyStyle',
  'identity',
  'userInput',
];

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

function formatReplyStyleProfile(input: LocalChatPromptCompileInput['contextPacket']['target']['replyStyleProfile']): string {
  return joinLines('回复风格画像', [
    `responseLength=${input.responseLength}`,
    `formality=${input.formality}`,
    `sentiment=${input.sentiment}`,
    `relationshipMode=${input.relationshipMode}`,
    `pacingStyle=${input.pacingStyle}`,
    `followupStyle=${input.followupStyle}`,
    `warmth=${input.warmth}`,
  ]);
}

function formatPacingPlan(input: LocalChatPromptCompileInput['contextPacket']['pacingPlan']): string {
  return joinLines('本轮节奏计划', [
    `mode=${input.mode}`,
    `energy=${input.energy}`,
    `maxSegments=${input.maxSegments}`,
    `reason=${input.reason}`,
  ]);
}

function buildPacingInstructions(input: LocalChatPromptCompileInput['contextPacket']['pacingPlan']): string[] {
  switch (input.mode) {
    case 'burst-2':
      return [
        '本轮优先拆成两条短消息，用一个空行分隔；不要超过两条。',
        '第一条偏即时反应，第二条补充推进。',
      ];
    case 'answer-followup':
      return [
        '本轮优先给一条主回答，再补一条短 follow-up，用一个空行分隔；不要超过两条。',
      ];
    case 'burst-3':
      return [
        '本轮如语义确实需要，可以用两到三条短消息递进表达；用一个空行分隔，不要超过三条。',
      ];
    case 'single':
    default:
      return [
        '本轮优先只输出一条完整消息，不要为了像真人而硬拆。',
      ];
  }
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
      formatReplyStyleProfile(packet.target.replyStyleProfile),
      formatPacingPlan(packet.pacingPlan),
      [
        '输出风格要求：',
        '- 像朋友发微信一样自然回复，节奏可以有变化。',
        ...buildPacingInstructions(packet.pacingPlan).map((line) => `- ${line}`),
        '- 不要每次都固定条数；只有语义真的需要时才分条。',
      ].join('\n'),
    ].filter(Boolean).join('\n\n'),
  };
}

function createInitialLaneBudgets(pool: number): LocalChatCompiledPrompt['budget']['laneBudgets'] {
  const laneBudgets: LocalChatCompiledPrompt['budget']['laneBudgets'] = {};
  for (const lane of LANE_ORDER) {
    const config = LANE_BUDGET_CONFIG[lane];
    laneBudgets[lane] = {
      maxChars: Math.min(config.maxChars, Math.max(config.minChars, Math.floor(pool * config.share))),
      usedChars: 0,
      truncated: false,
    };
  }
  return laneBudgets;
}

function fitLaneBudgets(input: {
  maxPromptChars: number;
}): LocalChatCompiledPrompt['budget']['laneBudgets'] {
  const lanePool = Math.max(512, input.maxPromptChars - PROMPT_FORMAT_RESERVE_CHARS);
  const laneBudgets = createInitialLaneBudgets(lanePool);
  let allocated = LANE_ORDER.reduce((sum, lane) => sum + (laneBudgets[lane]?.maxChars || 0), 0);
  let overflow = Math.max(0, allocated - lanePool);
  if (overflow > 0) {
    for (const lane of REDUCTION_ORDER) {
      const current = laneBudgets[lane];
      if (!current) continue;
      const reducible = Math.max(0, current.maxChars - LANE_BUDGET_CONFIG[lane].minChars);
      if (reducible <= 0) continue;
      const reduceBy = Math.min(reducible, overflow);
      current.maxChars -= reduceBy;
      overflow -= reduceBy;
      if (overflow <= 0) break;
    }
  }
  allocated = LANE_ORDER.reduce((sum, lane) => sum + (laneBudgets[lane]?.maxChars || 0), 0);
  let remaining = Math.max(0, lanePool - allocated);
  if (remaining > 0) {
    for (const lane of EXPANSION_ORDER) {
      const current = laneBudgets[lane];
      if (!current) continue;
      const expandable = Math.max(0, LANE_BUDGET_CONFIG[lane].maxChars - current.maxChars);
      if (expandable <= 0) continue;
      const addBy = Math.min(expandable, remaining);
      current.maxChars += addBy;
      remaining -= addBy;
      if (remaining <= 0) break;
    }
  }
  return laneBudgets;
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
  const laneBudgets = fitLaneBudgets({ maxPromptChars });
  const truncatedLayers: PromptLayerId[] = [];
  let usedChars = 0;

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

    const lane = LAYER_TO_LANE[layerId];
    const laneBudget = lane ? laneBudgets[lane] : null;
    const normalizedContent = laneBudget && layerId !== 'platformSafety'
      ? truncateText(content, laneBudget.maxChars)
      : content;
    const laneTruncated = normalizedContent.length < content.length;
    if (laneBudget) {
      laneBudget.usedChars = normalizedContent.length;
      laneBudget.truncated = laneTruncated;
      laneChars[lane!] = normalizedContent.length;
      if (laneTruncated) {
        truncationByLane[lane!] = true;
      }
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

    const section = `## ${LAYER_TITLES[layerId]}\n${normalizedContent}`;
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
      if (laneBudget) {
        laneBudget.truncated = true;
        truncationByLane[lane!] = true;
        const sectionHeader = `## ${LAYER_TITLES[layerId]}\n`;
        laneBudget.usedChars = Math.max(0, normalizedSection.length - sectionHeader.length);
        laneChars[lane!] = laneBudget.usedChars;
      }
    }

    sections.push(normalizedSection);
    usedChars += normalizedSection.length + sectionDelimiterChars;
    layers.push({
      layer: layerId,
      applied: true,
      reason: truncated || laneTruncated
        ? 'truncated_by_lane_budget'
        : 'applied',
      chars: normalizedSection.length + sectionDelimiterChars,
      truncated: truncated || laneTruncated,
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
      laneBudgets,
    },
    retrieval: {
      durableMemoryCount: input.contextPacket.durableMemory.length,
      sessionRecallCount: input.contextPacket.sessionRecall.length,
      worldContextCount: input.contextPacket.world.lines.length,
      recentBundleCount: input.contextPacket.recentBundles.length,
    },
    compilerVersion: 'v5',
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
      laneBudgets: compiled.budget.laneBudgets,
    },
  });

  return compiled;
}
