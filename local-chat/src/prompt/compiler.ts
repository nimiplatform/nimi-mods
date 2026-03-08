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
  'turnMode',
  'interactionProfile',
  'interactionState',
  'relationMemory',
  'platformWarmStart',
  'sessionRecall',
  'recentTurns',
  'userInput',
];

const LAYER_TITLES: Record<PromptLayerId, string> = {
  platformSafety: 'Platform Safety',
  identity: 'Identity',
  world: 'World',
  turnMode: 'Turn Mode',
  interactionProfile: 'Interaction Profile',
  interactionState: 'Interaction State',
  relationMemory: 'Relation Memory',
  platformWarmStart: 'Platform Warm Start',
  sessionRecall: 'Session Recall',
  recentTurns: 'Recent Exact Turns',
  userInput: 'User Input',
};

const LAYER_TO_LANE: Partial<Record<PromptLayerId, LocalChatContextLaneId>> = {
  identity: 'identity',
  world: 'world',
  turnMode: 'turnMode',
  interactionProfile: 'interactionProfile',
  interactionState: 'interactionState',
  relationMemory: 'relationMemory',
  platformWarmStart: 'platformWarmStart',
  sessionRecall: 'sessionRecall',
  recentTurns: 'recentTurns',
  userInput: 'userInput',
};

const LANE_ORDER: LocalChatContextLaneId[] = [
  'identity',
  'world',
  'turnMode',
  'interactionProfile',
  'interactionState',
  'relationMemory',
  'platformWarmStart',
  'sessionRecall',
  'recentTurns',
  'userInput',
];

const LANE_BUDGET_CONFIG: Record<LocalChatContextLaneId, {
  share: number;
  minChars: number;
  maxChars: number;
}> = {
  identity: { share: 0.1, minChars: 900, maxChars: 2_400 },
  world: { share: 0.08, minChars: 400, maxChars: 1_900 },
  turnMode: { share: 0.04, minChars: 180, maxChars: 600 },
  interactionProfile: { share: 0.1, minChars: 600, maxChars: 2_000 },
  interactionState: { share: 0.12, minChars: 700, maxChars: 2_400 },
  relationMemory: { share: 0.12, minChars: 700, maxChars: 2_400 },
  platformWarmStart: { share: 0.08, minChars: 400, maxChars: 1_900 },
  sessionRecall: { share: 0.12, minChars: 600, maxChars: 3_000 },
  recentTurns: { share: 0.2, minChars: 1_000, maxChars: 5_200 },
  userInput: { share: 0.06, minChars: 280, maxChars: 1_500 },
};

const REDUCTION_ORDER: LocalChatContextLaneId[] = [
  'recentTurns',
  'sessionRecall',
  'relationMemory',
  'interactionState',
  'world',
  'platformWarmStart',
  'interactionProfile',
  'turnMode',
  'identity',
  'userInput',
];

const EXPANSION_ORDER: LocalChatContextLaneId[] = [
  'recentTurns',
  'interactionState',
  'relationMemory',
  'sessionRecall',
  'world',
  'platformWarmStart',
  'interactionProfile',
  'turnMode',
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

function renderRecentTurns(input: LocalChatPromptCompileInput['contextPacket']['recentTurns']): string {
  if (!input.length) return '';
  const lines: string[] = ['最近精确回合（按时间顺序，只用于 continuity，不要逐条复述）:'];
  for (const turn of input) {
    lines.push(`${turn.role === 'assistant' ? 'Assistant' : 'User'} #${turn.seq}`);
    turn.lines.forEach((line: string) => {
      lines.push(`- ${line}`);
    });
  }
  return lines.join('\n');
}

function renderPlatformWarmStart(input: LocalChatPromptCompileInput['contextPacket']['platformWarmStart']): string {
  if (!input) return '';
  const lines = [
    ...input.core.map((entry) => `[core] ${entry}`),
    ...input.e2e.map((entry) => `[e2e] ${entry}`),
  ];
  return lines.join('\n');
}

function renderSessionRecall(input: LocalChatPromptCompileInput['contextPacket']['sessionRecall']): string {
  if (!input.length) return '';
  return input
    .map((item) => {
      const source = item.sourceKind === 'recall-index'
        ? 'recall-index'
        : `turn#${item.sourceTurnId ?? '-'}`;
      return `[${source}] ${item.text}`;
    })
    .join('\n');
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

function describeExpression(profile: LocalChatPromptCompileInput['contextPacket']['target']['interactionProfile']): string[] {
  const expr = profile.expression;
  const rel = profile.relationship;
  const lines: string[] = [];
  const lengthMap: Record<typeof expr.responseLength, string> = {
    short: '偏短句，不要写长段落',
    medium: '适中长度，自然展开',
    long: '可以展开说，但不要啰嗦',
  };
  const formalityMap: Record<typeof expr.formality, string> = {
    casual: '口语化，像朋友发消息',
    formal: '略正式，但保持亲和',
    slang: '更松弛随性，可以带一点俚语感',
  };
  const sentimentMap: Record<typeof expr.sentiment, string> = {
    positive: '整体语气偏积极明亮',
    neutral: '整体语气自然平稳',
    cynical: '允许一点嘴硬和冷感，但不要攻击用户',
  };
  const warmthMap: Record<typeof rel.warmth, string> = {
    cool: '情感表达克制一些',
    warm: '温暖友善，有关心感',
    intimate: '亲密自然，像很熟的人',
  };
  lines.push(lengthMap[expr.responseLength]);
  lines.push(formalityMap[expr.formality]);
  lines.push(sentimentMap[expr.sentiment]);
  lines.push(warmthMap[rel.warmth]);
  if (expr.firstBeatStyle === 'playful') lines.push('开场语气偏活泼俏皮');
  if (expr.firstBeatStyle === 'gentle') lines.push('开场语气偏温柔体贴');
  if (rel.flirtAffinity === 'high') lines.push('可以带一点暧昧和撩拨');
  if (expr.pacingBias === 'bursty') lines.push('喜欢连发短消息，节奏快');
  return lines;
}

function renderInteractionProfile(input: LocalChatPromptCompileInput['contextPacket']): string {
  const profile = input.target.interactionProfile;
  const naturalLines = describeExpression(profile);
  return joinLines('交流画像', [
    ...naturalLines,
    ...((input.target.interactionProfileLines || []).slice(0, 4)),
  ]);
}

function renderInteractionState(input: LocalChatPromptCompileInput['contextPacket']): string {
  const snapshot = input.interactionSnapshot;
  if (!snapshot) return '';
  return [
    joinLines('关系状态', [snapshot.relationshipState]),
    joinLines('场景', snapshot.activeScene),
    joinLines('情绪温度', [snapshot.emotionalTemperature]),
    joinLines('助手承诺', snapshot.assistantCommitments),
    joinLines('用户偏好', snapshot.userPrefs),
    joinLines('未完成事项', snapshot.openLoops),
    joinLines('话题线程', snapshot.topicThreads),
    snapshot.conversationDirective ? joinLines('对话方向指引', [snapshot.conversationDirective]) : '',
  ].filter(Boolean).join('\n\n');
}

function renderRelationMemory(input: LocalChatPromptCompileInput['contextPacket']): string {
  const slots = input.relationMemorySlots || [];
  if (slots.length === 0) return '';
  return slots
    .map((slot) => `[${slot.slotType}] ${slot.key}: ${slot.value}`)
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
      joinLines('交流风格', packet.target.replyStyleLines),
    ].filter(Boolean).join('\n\n'),
    world: joinLines('世界上下文', packet.world.lines),
    turnMode: joinLines('当前交流模式', [
      `turnMode=${packet.turnMode || 'information'}`,
      `voiceConversationMode=${packet.voiceConversationMode || 'off'}`,
      `pacing=${packet.pacingPlan.mode}/${packet.pacingPlan.energy}`,
      ...buildPacingInstructions(packet.pacingPlan),
    ]),
    interactionProfile: renderInteractionProfile(packet),
    interactionState: renderInteractionState(packet)
      ? `最近交流状态（优先保持一致性，不要逐条复述）:\n${renderInteractionState(packet)}`
      : '',
    relationMemory: renderRelationMemory(packet)
      ? `关系槽位记忆（只用于保持稳定边界与偏好）:\n${renderRelationMemory(packet)}`
      : '',
    platformWarmStart: renderPlatformWarmStart(packet.platformWarmStart)
      ? `平台记忆预热（只读背景，不要把它当成本地会话刚刚发生的内容）:\n${renderPlatformWarmStart(packet.platformWarmStart)}`
      : '',
    sessionRecall: renderSessionRecall(packet.sessionRecall)
      ? `历史召回:\n${renderSessionRecall(packet.sessionRecall)}`
      : '',
    recentTurns: renderRecentTurns(packet.recentTurns),
    userInput: `用户这次说：${packet.userInput || '(empty)'}`,
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
      durableMemoryCount: (input.contextPacket.relationMemorySlots || []).length,
      sessionRecallCount: input.contextPacket.sessionRecall.length,
      worldContextCount: input.contextPacket.world.lines.length,
      recentTurnCount: input.contextPacket.recentTurns.length,
    },
    compilerVersion: 'v6',
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
