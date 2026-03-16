import { TEXTPLAY_REASON } from '../contracts.js';
import { describeTextplayLanguage } from '../language.js';
import { TextplayPipelineError } from './error.js';
import type {
  TextplayLanguage,
  TextplayNormalizedRenderInput,
  TextplayProjectionEvent,
} from '../types.js';

const BANNED_CLICHE_PHRASES_ZH = [
  '双目微眯',
  '袖袍下手指扣紧',
  '嘴角微扬',
  '心中一动',
  '面色微变',
  '淡淡一笑',
  '微微一笑',
  '嘴角勾起一抹弧度',
  '不由自主',
  '心头一震',
] as const;

const CLICHE_REPLACEMENT_EXAMPLES_ZH = [
  '双目微眯 -> 瞳孔骤然收缩成一线',
  '面色微变 -> 额角青筋轻轻跳动了两下',
  '嘴角微扬 -> 唇线先绷紧再缓缓放松',
] as const;

const EVENT_TYPE_RENDERING_GUIDANCE: Record<TextplayLanguage, Record<string, string>> = {
  en: {
    dialogue: 'Dialogue: write natural speech and embed tone, body language, and breathing rhythm instead of listing pure lines.',
    action: 'Action: write a physical motion chain and emphasize causal impact and physical consequence.',
    'scene-beat': 'Scene beat: establish atmosphere and framing through sensory detail.',
    'state-change': 'State change: imply the shift through environment or micro-expression instead of blunt exposition.',
    thought: 'Thought: use a stream-of-consciousness style for the player inner voice; fragments and self-questioning are allowed.',
    decision: 'Decision point: stage the weight of the choice and foreshadow consequences.',
    discovery: 'Discovery/reveal: peel the reveal forward through layered sensory detail and cognitive shock.',
    'relation-shift': 'Relationship shift: show change through behavior, tone, or forms of address instead of naming it outright.',
    emotion: 'Emotion: translate feeling into body reactions like heartbeat, breath, or muscle tension; avoid abstract labels.',
    observation: 'Observation: write the incoming sensory stream rather than detached exposition.',
    memory: 'Memory flashback: render it as fragmented sensory imagery with a rhythm distinct from the present timeline.',
    gravity: 'World-scale event: show the shockwave of large-scale change through embodied witnesses rather than omniscient summary.',
    timeskip: 'Timeskip: bridge with a concise transition and land on the first sensory impression in the new moment.',
    'branch-point': 'Branch point: frame a dilemma where each option carries a clear cost and temptation.',
    system: 'System marker: describe only the player-perceivable impact of a systemic change.',
  },
  zh: {
    dialogue: '对白：写自然话语，嵌入语气、肢体与呼吸节奏，避免纯台词罗列。',
    action: '动作：写肢体运动链，突出因果冲击和物理后果。',
    'scene-beat': '场景节拍：写环境氛围建立镜头，强调感官细节。',
    'state-change': '状态变化：用环境或角色微表情暗示变化，不要直述。',
    thought: '内心独白：用意识流笔法写玩家内心，可碎片化、可自问自答。',
    decision: '抉择时刻：铺设选项的重量感和后果暗示。',
    discovery: '发现/揭示：用感官细节层层递进揭开，制造认知冲击。',
    'relation-shift': '关系变化：通过行为、态度或称呼变化体现，不要明说。',
    emotion: '情绪：化为身体反应，如心跳、呼吸、肌肉紧绷，绝不写抽象标签。',
    observation: '感知：写角色五感接收到的信息流，避免旁白化。',
    memory: '记忆闪回：用碎片化感官意象呈现，区别于当前时间线的叙事节奏。',
    gravity: '世界级事件：写大尺度环境变化的冲击波及，角色是见证者不是旁白者。',
    timeskip: '时间跳跃：用简洁过渡句衔接，落笔在新时间点的第一个感官印象。',
    'branch-point': '分支点：铺设两难困境的张力，让每个选项都有明确代价和诱惑。',
    system: '系统标记：简洁描述系统级变化对角色可感知的影响。',
  },
};

const PROMPT_COPY = {
  en: {
    rendererTitle: 'You are TextPlay narrative renderer.',
    constraintsHeading: 'Constraints:',
    visibleEventsHeading: 'Visible Narrative Events:',
    playerInputLabel: 'Player Input',
    outputHeading: 'Output:',
    renderingHintLabel: 'Rendering hint',
    noEvents: 'No visible narrative events for this turn.',
    unspecified: '(unspecified)',
    none: '(none)',
    unknown: '(unknown)',
    constraintLines: [
      'Consume only the provided narrative projection facts.',
      'Do not invent or rewrite narrative facts.',
      'Keep output immersive and concise for interactive play.',
      'If Player Name is provided, address the player naturally by that name and do not expose internal IDs in dialogue.',
      'If Player Identity is provided, keep the identity portrayal consistent and do not arbitrarily rewrite class, faction, or background.',
      'Use third-person limited camera and stay within what the player can perceive in-scene.',
      'Never write NPC hidden inner thoughts, omniscient mind-reading, or unrevealed secret motives.',
      'Keep continuity with visible events and avoid contradiction with established facts.',
      'For each turn, produce clear cause-to-effect progression and preserve at least one unresolved tension for the next turn.',
      'Do not resolve the central conflict too quickly unless visible events explicitly provide resolution facts.',
      'Keep the long-arc conflict alive and avoid wrapping the major storyline in a single response.',
      'Advance the scene while preserving at least one unresolved tension.',
      'NPC or agent behavior must remain autonomous rather than passively yielding to the player.',
      'Avoid repetitive canned gestures and cliché wording; prefer concrete, contextual sensory and action detail.',
    ],
    zhClicheBanLabel: 'Banned cliché phrases (never use verbatim)',
    zhClicheReplacementLabel: 'Replacement style examples',
    genericStyleWarning: 'Avoid stock reaction phrases, empty melodrama, and repeated sentence molds.',
    nonUserTrigger: 'Non-user trigger: focus on world- or NPC-driven development; the player may witness or be affected but should not become the forced driver.',
    pacing: {
      HIGH: 'HIGH tension: use short, forceful sentences. Keep the pace fast and let every line advance or escalate.',
      MODERATE: 'MODERATE tension: vary sentence length freely and alternate motion with atmosphere.',
      LOW: 'LOW tension: write in a flowing cadence with rich sensory detail to build environment and inner response.',
    },
    openingConstraints: {
      preEvent: [
        'Opening mode: this is the pre-event threshold; the selected target event has not happened yet in this run.',
        'Opening mode: establish only past-and-present context, with no future spoilers.',
        'Opening mode: do not narrate the target event as already completed, even if canonical metadata says PAST or ONGOING.',
      ],
      materialOnly: [
        'Opening mode: selected target-event title, summary, cause, process, result, and time reference are reference materials only, not proof that those beats already happened on-screen.',
        'Opening mode: player input and later visible events decide whether and how the story converges toward the selected target event.',
      ],
      general: [
        'Explain why the player is here and what the player currently knows.',
        'Weave player role and background into scene narration naturally instead of dumping metadata.',
        'Do not reveal hidden outcomes or end-state conclusions in the opening narration.',
        'Keep uncertainty alive; the opening should hook action rather than close conflict.',
      ],
    },
    fieldLabels: {
      storyId: 'Story ID',
      turnId: 'Turn ID',
      triggerSource: 'Trigger Source',
      userId: 'User ID',
      playerName: 'Player Name',
      playerIdentity: 'Player Identity',
      openingMode: 'Opening Mode',
      openingEntryMode: 'Opening Entry Mode',
      openingHorizon: 'Opening Horizon',
      openingNoSpoiler: 'Opening No-Spoiler',
      targetEventMaterialOnly: 'Target Event Material Only',
      playerRole: 'Player Role',
      playerBackground: 'Player Background',
      openingSituation: 'Opening Situation',
      openingInstruction: 'Opening Instruction',
      scene: 'Scene',
      agentContext: 'Agent Context',
      worldStyle: 'World Style',
    },
    outputLines: {
      languageLock: (language: string) => `All player-facing narrative output must be written in ${language}.`,
      zhLength: 'Prefer roughly 120-320 Chinese characters.',
      enLength: 'Prefer roughly 90-220 English words.',
      sensory: 'Include concrete sensory and action detail instead of abstract summary only.',
      hook: 'End with a playable next-action hook rather than a hard stop.',
      unresolved: 'Keep one explicit unresolved thread or immediate pressure for the next turn.',
      antiFormula: 'Avoid formulaic repeated sentence patterns across turns.',
    },
  },
  zh: {
    rendererTitle: '你是 TextPlay 叙事渲染器。',
    constraintsHeading: '约束：',
    visibleEventsHeading: '可见叙事事件：',
    playerInputLabel: '玩家输入',
    outputHeading: '输出要求：',
    renderingHintLabel: '渲染提示',
    noEvents: '本轮没有可见叙事事件。',
    unspecified: '（未指定）',
    none: '（无）',
    unknown: '（未知）',
    constraintLines: [
      '只能消费已提供的 narrative projection 事实。',
      '不得编造、篡改或重写叙事事实。',
      '输出要保持沉浸感，并适合交互式游玩场景。',
      '若给出了玩家姓名，要自然地以该姓名称呼玩家，不得在对白中暴露内部 ID。',
      '若给出了玩家身份，要保持身份描写一致，不得随意改写职业、阵营或背景。',
      '使用第三人称受限视角，叙事必须停留在玩家在场可感知的范围内。',
      '不得描写 NPC 的隐藏心声、全知读心或尚未揭示的秘密动机。',
      '保持与可见事件连续，不得与已建立事实冲突。',
      '每一轮都要形成清晰的因果推进，并至少保留一条未解决张力供下一轮承接。',
      '除非可见事件明确给出解决事实，否则不要过快收束核心冲突。',
      '维持长线冲突，不要在单次回复中包圆主要剧情。',
      '推进场景时，必须保留至少一个未解决压力点。',
      'NPC 或 agent 必须保持自主性，而不是被动顺从玩家。',
      '避免套路化动作与陈词滥调，优先使用具体、贴场景的感官与行动细节。',
    ],
    zhClicheBanLabel: '禁用陈词滥调（不得原样出现）',
    zhClicheReplacementLabel: '替换风格示例',
    genericStyleWarning: '避免套路化反应词、空泛煽情和重复句式。',
    nonUserTrigger: '非玩家触发：聚焦世界或 NPC 驱动的发展；玩家可以见证或受影响，但不应被强行写成唯一推动者。',
    pacing: {
      HIGH: '高张力：句子要短促有力，节奏要快，每一句都推动或升级局势。',
      MODERATE: '中张力：句长可自由变化，动作推进与氛围描写交替出现。',
      LOW: '低张力：行文流畅，感官细节更丰富，用于建立环境与角色内在反应。',
    },
    openingConstraints: {
      preEvent: [
        '开场模式：当前处于目标事件发生前的临界阶段，本次运行里目标事件尚未发生。',
        '开场模式：只能建立过去与现在的处境，不得剧透未来。',
        '开场模式：即使 canonical 元数据标成 PAST 或 ONGOING，也不得把目标事件写成已经完成。',
      ],
      materialOnly: [
        '开场模式：目标事件的标题、摘要、起因、过程、结果与时间锚点仅是素材参考，不证明这些拍点已经在画面中发生。',
        '开场模式：是否以及如何走向目标事件，必须由玩家输入与后续可见事件共同决定。',
      ],
      general: [
        '要说明玩家为什么会出现在这里，以及玩家当前知道什么。',
        '把玩家角色和背景自然织入场景，而不是堆元数据。',
        '开场叙事不得提前揭露隐藏结果或终局判断。',
        '保持不确定性，让开场勾出行动，而不是关闭冲突。',
      ],
    },
    fieldLabels: {
      storyId: '故事 ID',
      turnId: '回合 ID',
      triggerSource: '触发来源',
      userId: '用户 ID',
      playerName: '玩家姓名',
      playerIdentity: '玩家身份',
      openingMode: '开场模式',
      openingEntryMode: '开场入口模式',
      openingHorizon: '目标事件视界',
      openingNoSpoiler: '禁止剧透',
      targetEventMaterialOnly: '目标事件仅作素材',
      playerRole: '玩家角色',
      playerBackground: '玩家背景',
      openingSituation: '开场处境',
      openingInstruction: '开场指令',
      scene: '场景摘要',
      agentContext: '角色上下文',
      worldStyle: '世界风格',
    },
    outputLines: {
      languageLock: (language: string) => `所有面向玩家的叙事正文必须使用${language}输出。`,
      zhLength: '正文以约 120-320 个中文字符为宜。',
      enLength: '正文以约 90-220 个英文单词为宜。',
      sensory: '必须包含具体的感官与行动细节，不能只给抽象概述。',
      hook: '结尾要留下可游玩的下一步行动钩子，而不是硬收场。',
      unresolved: '必须保留一条明确未解线索或即时压力，供下一轮承接。',
      antiFormula: '避免各轮之间重复公式化句式。',
    },
  },
} satisfies Record<TextplayLanguage, {
  rendererTitle: string;
  constraintsHeading: string;
  visibleEventsHeading: string;
  playerInputLabel: string;
  outputHeading: string;
  renderingHintLabel: string;
  noEvents: string;
  unspecified: string;
  none: string;
  unknown: string;
  constraintLines: string[];
  zhClicheBanLabel: string;
  zhClicheReplacementLabel: string;
  genericStyleWarning: string;
  nonUserTrigger: string;
  pacing: Record<'HIGH' | 'MODERATE' | 'LOW', string>;
  openingConstraints: Record<'preEvent' | 'materialOnly' | 'general', string[]>;
  fieldLabels: Record<
    | 'storyId'
    | 'turnId'
    | 'triggerSource'
    | 'userId'
    | 'playerName'
    | 'playerIdentity'
    | 'openingMode'
    | 'openingEntryMode'
    | 'openingHorizon'
    | 'openingNoSpoiler'
    | 'targetEventMaterialOnly'
    | 'playerRole'
    | 'playerBackground'
    | 'openingSituation'
    | 'openingInstruction'
    | 'scene'
    | 'agentContext'
    | 'worldStyle',
    string
  >;
  outputLines: {
    languageLock: (language: string) => string;
    zhLength: string;
    enLength: string;
    sensory: string;
    hook: string;
    unresolved: string;
    antiFormula: string;
  };
}>;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as Record<string, unknown>;
}

function firstNonEmpty(values: unknown[]): string {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) {
      return text;
    }
  }
  return '';
}

function buildPacingConstraints(locale: TextplayLanguage, band: 'HIGH' | 'MODERATE' | 'LOW'): string[] {
  return [PROMPT_COPY[locale].pacing[band]];
}

function formatEvents(locale: TextplayLanguage, events: TextplayProjectionEvent[]): string {
  const copy = PROMPT_COPY[locale];
  if (events.length === 0) {
    return copy.noEvents;
  }

  return events
    .map((event, index) => {
      const typeTag = event.type ? `[${event.type}]` : '';
      const guidance = EVENT_TYPE_RENDERING_GUIDANCE[locale][event.type] || '';
      const suffix = guidance ? `\n   ${copy.renderingHintLabel}: ${guidance}` : '';
      return `${index + 1}. ${typeTag}[${event.visibility}] ${event.content}${suffix}`;
    })
    .join('\n');
}

function buildOutputLengthLine(input: {
  promptLanguage: TextplayLanguage;
  storyLanguage: TextplayLanguage;
}): string {
  const copy = PROMPT_COPY[input.promptLanguage];
  return input.storyLanguage === 'zh' ? copy.outputLines.zhLength : copy.outputLines.enLength;
}

export function buildTextplayPrompt(input: {
  normalized: TextplayNormalizedRenderInput;
  visibleEvents: TextplayProjectionEvent[];
}): string {
  const promptLanguage = input.normalized.promptLanguage;
  const storyLanguage = input.normalized.storyLanguage;
  const copy = PROMPT_COPY[promptLanguage];
  const playerInput = String(input.normalized.userMessage || '').trim();
  const playerName = String(input.normalized.playerName || '').trim();
  const playerIdentity = String(input.normalized.playerIdentity || '').trim();
  const triggerSource = String(input.normalized.triggerSource || '').trim();
  const sceneSummary = String(input.normalized.sceneSummary || '').trim();
  const agentSummary = String(input.normalized.agentSummary || '').trim();
  const worldStyleSummary = String(input.normalized.worldStyleSummary || '').trim();
  const openingPayload = asRecord(asRecord(input.normalized.systemPayload)?.opening);
  const openingMode = String(openingPayload?.mode || '').trim();
  const isStoryStart = openingMode === 'story-start';
  const openingInstruction = String(openingPayload?.instruction || '').trim();
  const openingEntryMode = String(openingPayload?.entryMode || 'PRE_EVENT').trim().toUpperCase();
  const openingHorizon = String(openingPayload?.entryEventHorizon || '').trim().toUpperCase();
  const targetEventMaterialOnly = Boolean(openingPayload?.targetEventMaterialOnly);
  const openingPlayerIdentity = String(openingPayload?.playerIdentity || '').trim();
  const openingPlayerRole = String(openingPayload?.playerRole || '').trim();
  const openingPlayerBackground = String(openingPayload?.playerBackground || '').trim();
  const openingSituation = String(openingPayload?.currentSituation || '').trim();
  const openingNoSpoiler = Boolean(openingPayload?.noSpoiler);

  if (!sceneSummary || !agentSummary || !worldStyleSummary) {
    throw new TextplayPipelineError({
      reasonCode: TEXTPLAY_REASON.PROMPT_BUILD_FAILED,
      actionHint: 'Repair prompt template and normalized inputs.',
      message: 'TEXTPLAY_PROMPT_CONTEXT_INVALID',
      stage: 'build-prompt',
      retryClass: 'non-retryable',
    });
  }

  const constraints = [
    ...copy.constraintLines.map((line) => `- ${line}`),
  ];

  if (storyLanguage === 'zh') {
    constraints.push(`- ${copy.zhClicheBanLabel}: ${BANNED_CLICHE_PHRASES_ZH.join(' / ')}`);
    constraints.push(`- ${copy.zhClicheReplacementLabel}: ${CLICHE_REPLACEMENT_EXAMPLES_ZH.join(' ; ')}`);
  } else {
    constraints.push(`- ${copy.genericStyleWarning}`);
  }

  if (triggerSource !== 'UserTurn') {
    constraints.push(`- ${copy.nonUserTrigger}`);
  }

  const pacingBand = input.normalized.pacingContext?.tensionBand;
  if (pacingBand) {
    constraints.push(...buildPacingConstraints(promptLanguage, pacingBand).map((line) => `- ${line}`));
  }

  if (isStoryStart) {
    if (openingEntryMode === 'PRE_EVENT') {
      constraints.push(...copy.openingConstraints.preEvent.map((line) => `- ${line}`));
    }
    if (targetEventMaterialOnly) {
      constraints.push(...copy.openingConstraints.materialOnly.map((line) => `- ${line}`));
    }
    constraints.push(...copy.openingConstraints.general.map((line) => `- ${line}`));
  }

  const storyLanguageLabel = describeTextplayLanguage(storyLanguage, promptLanguage);
  const promptLines = [
    copy.rendererTitle,
    copy.constraintsHeading,
    ...constraints,
    '',
    `${copy.fieldLabels.storyId}: ${input.normalized.storyId}`,
    `${copy.fieldLabels.turnId}: ${input.normalized.turnId}`,
    `${copy.fieldLabels.triggerSource}: ${triggerSource || copy.unknown}`,
    `${copy.fieldLabels.userId}: ${input.normalized.userId}`,
    `${copy.fieldLabels.playerName}: ${playerName || copy.unspecified}`,
    `${copy.fieldLabels.playerIdentity}: ${firstNonEmpty([playerIdentity, openingPlayerIdentity, openingPlayerRole]) || copy.unspecified}`,
    `${copy.fieldLabels.openingMode}: ${openingMode || 'normal'}`,
    `${copy.fieldLabels.openingEntryMode}: ${openingEntryMode || copy.unspecified}`,
    `${copy.fieldLabels.openingHorizon}: ${openingHorizon || copy.unspecified}`,
    `${copy.fieldLabels.openingNoSpoiler}: ${openingNoSpoiler}`,
    `${copy.fieldLabels.targetEventMaterialOnly}: ${targetEventMaterialOnly}`,
    `${copy.fieldLabels.playerRole}: ${openingPlayerRole || copy.unspecified}`,
    `${copy.fieldLabels.playerBackground}: ${openingPlayerBackground || copy.unspecified}`,
    `${copy.fieldLabels.openingSituation}: ${openingSituation || copy.unspecified}`,
    `${copy.fieldLabels.openingInstruction}: ${openingInstruction || copy.none}`,
    `${copy.fieldLabels.scene}: ${sceneSummary}`,
    `${copy.fieldLabels.agentContext}: ${agentSummary}`,
    `${copy.fieldLabels.worldStyle}: ${worldStyleSummary}`,
    '',
    copy.visibleEventsHeading,
    formatEvents(promptLanguage, input.visibleEvents),
    '',
    `${copy.playerInputLabel}: ${playerInput || copy.none}`,
    '',
    copy.outputHeading,
    `- ${copy.outputLines.languageLock(storyLanguageLabel)}`,
    `- ${buildOutputLengthLine({ promptLanguage, storyLanguage })}`,
    `- ${copy.outputLines.sensory}`,
    `- ${copy.outputLines.hook}`,
    `- ${copy.outputLines.unresolved}`,
    `- ${copy.outputLines.antiFormula}`,
  ];

  const prompt = promptLines.join('\n');

  if (!prompt.trim()) {
    throw new TextplayPipelineError({
      reasonCode: TEXTPLAY_REASON.PROMPT_BUILD_FAILED,
      actionHint: 'Repair prompt template and normalized inputs.',
      message: 'TEXTPLAY_PROMPT_EMPTY',
      stage: 'build-prompt',
      retryClass: 'non-retryable',
    });
  }

  return prompt;
}
