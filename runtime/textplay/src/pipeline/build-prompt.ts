import { TEXTPLAY_REASON } from '../contracts.js';
import { TextplayPipelineError } from './error.js';
import type { TextplayNormalizedRenderInput, TextplayProjectionEvent } from '../types.js';

const BANNED_CLICHE_PHRASES = [
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

const CLICHE_REPLACEMENT_EXAMPLES = [
  '双目微眯 -> 瞳孔骤然收缩成一线',
  '面色微变 -> 额角青筋轻轻跳动了两下',
  '嘴角微扬 -> 唇线先绷紧再缓缓放松',
] as const;

const EVENT_TYPE_RENDERING_GUIDANCE: Record<string, string> = {
  'dialogue': '对白：写自然话语，嵌入语气/肢体/呼吸节奏，避免纯台词罗列。',
  'action': '动作：写肢体运动链，突出因果冲击和物理后果。',
  'scene-beat': '场景节拍：写环境氛围建立镜头，强调感官细节。',
  'state-change': '状态变化：用环境或角色微表情暗示变化，不要直述。',
  'thought': '内心独白：用意识流笔法写玩家内心，可碎片化、可自问自答。',
  'decision': '抉择时刻：铺设选项的重量感和后果暗示。',
  'discovery': '发现/揭示：用感官细节层层递进揭开，制造认知冲击。',
  'relation-shift': '关系变化：通过行为/态度/称呼变化体现，不要明说。',
  'emotion': '情绪：化为身体反应（心跳/呼吸/肌肉），绝不写抽象标签。',
  'observation': '感知：写角色五感接收到的信息流，避免旁白化。',
  'memory': '记忆闪回：用碎片化感官意象呈现，区别于当前时间线的叙事节奏。',
  'gravity': '世界级事件：写大尺度环境变化的冲击波及，角色是见证者不是旁白者。',
  'timeskip': '时间跳跃：用简洁过渡句衔接，落笔在新时间点的第一个感官印象。',
  'branch-point': '分支点：铺设两难困境的张力，让每个选项都有明确代价和诱惑。',
  'system': '系统标记：简洁描述系统级变化对角色可感知的影响。',
};

function buildPacingConstraints(band: 'HIGH' | 'MODERATE' | 'LOW'): string[] {
  if (band === 'HIGH') {
    return [
      '- HIGH tension: 短促有力的句子，快节奏，每个字推进或升级。',
    ];
  }
  if (band === 'MODERATE') {
    return [
      '- MODERATE tension: 自由变化句长，动作与氛围交替。',
    ];
  }
  return [
    '- LOW tension: 流畅描写，感官细节丰富，建立环境和角色内心。',
  ];
}

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

function formatEvents(events: TextplayProjectionEvent[]): string {
  if (events.length === 0) {
    return 'No visible narrative events for this turn.';
  }

  return events
    .map((event, index) => {
      const typeTag = event.type ? `[${event.type}]` : '';
      const guidance = EVENT_TYPE_RENDERING_GUIDANCE[event.type] || '';
      const suffix = guidance ? `\n   Rendering hint: ${guidance}` : '';
      return `${index + 1}. ${typeTag}[${event.visibility}] ${event.content}${suffix}`;
    })
    .join('\n');
}

export function buildTextplayPrompt(input: {
  normalized: TextplayNormalizedRenderInput;
  visibleEvents: TextplayProjectionEvent[];
}): string {
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
    '- Consume only provided narrative projection facts.',
    '- Do not invent or rewrite narrative facts.',
    '- Keep output immersive and concise for interactive play.',
    '- If Player Name is provided, address the player by that name naturally; do not expose internal IDs in dialogue.',
    '- If Player Identity is provided, keep identity portrayal consistent; do not arbitrarily rewrite class/faction/background.',
    '- Third-person limited camera: narration must stay within what the player can perceive in-scene.',
    '- Never write NPC hidden inner thoughts, omniscient mind-reading, or unrevealed secret motives.',
    '- Keep continuity with visible events; no contradiction with already established facts.',
    '- For each turn, produce clear cause->effect progression and keep at least one unresolved tension for next turn.',
    '- Do not resolve central conflict too quickly unless visible events explicitly provide resolution facts.',
    '- Keep long-arc conflict alive; avoid wrapping major storyline in a single response.',
    '- Ensure each response advances the scene while preserving at least one unresolved tension.',
    '- NPC/agent should show autonomy and react by their own motives instead of passively yielding.',
    '- Avoid repetitive canned gestures and cliché wording; prefer concrete, contextual sensory/action details.',
    `- Banned cliché phrases (never use verbatim): ${BANNED_CLICHE_PHRASES.join(' / ')}`,
    `- Replacement style examples: ${CLICHE_REPLACEMENT_EXAMPLES.join(' ; ')}`,
  ];

  if (triggerSource !== 'UserTurn') {
    constraints.push(
      '- Non-user trigger: focus on world/NPC-driven development; player may witness or be affected but should not become forced driver.',
    );
  }

  // Tension-driven pacing constraints
  const pacingBand = input.normalized.pacingContext?.tensionBand;
  if (pacingBand) {
    constraints.push(...buildPacingConstraints(pacingBand));
  }

  if (isStoryStart) {
    if (openingEntryMode === 'PRE_EVENT') {
      constraints.push(
        '- Opening mode: this is the pre-event threshold; the selected target event has NOT happened yet in this run.',
        '- Opening mode: establish only past-and-present context, with no future spoilers.',
        '- Opening mode: do not narrate the target event as already completed, even if canonical metadata says PAST or ONGOING.',
      );
    }
    if (targetEventMaterialOnly) {
      constraints.push(
        '- Opening mode: selected target-event title/summary/cause/process/result/timeRef are reference materials only, not proof that those beats already happened on-screen.',
        '- Opening mode: player input and later visible events decide whether and how the story converges toward the selected target event.',
      );
    }
    constraints.push(
      '- Explain why the player is here and what the player currently knows.',
      '- Weave player role/background into scene narration naturally, not as metadata dump.',
      '- Do not reveal hidden outcomes or end-state conclusions in opening narration.',
      '- Keep uncertainty alive; opening should hook action, not close conflict.',
    );
  }

  const promptLines = [
    'You are TextPlay narrative renderer.',
    'Constraints:',
    ...constraints,
    '',
    `Story ID: ${input.normalized.storyId}`,
    `Turn ID: ${input.normalized.turnId}`,
    `Trigger Source: ${triggerSource || '(unknown)'}`,
    `Player ID: ${input.normalized.playerId}`,
    `Player Name: ${playerName || '(unspecified)'}`,
    `Player Identity: ${firstNonEmpty([playerIdentity, openingPlayerIdentity, openingPlayerRole]) || '(unspecified)'}`,
    `Opening Mode: ${openingMode || 'normal'}`,
    `Opening Entry Mode: ${openingEntryMode || '(unspecified)'}`,
    `Opening Horizon: ${openingHorizon || '(unspecified)'}`,
    `Opening No-Spoiler: ${openingNoSpoiler}`,
    `Target Event Material Only: ${targetEventMaterialOnly}`,
    `Player Role: ${openingPlayerRole || '(unspecified)'}`,
    `Player Background: ${openingPlayerBackground || '(unspecified)'}`,
    `Opening Situation: ${openingSituation || '(unspecified)'}`,
    `Opening Instruction: ${openingInstruction || '(none)'}`,
    `Scene: ${sceneSummary}`,
    `Agent Context: ${agentSummary}`,
    `World Style: ${worldStyleSummary}`,
    '',
    'Visible Narrative Events:',
    formatEvents(input.visibleEvents),
    '',
    `Player Input: ${playerInput || '(none)'}`,
    '',
    'Output:',
    '- Return plain text narrative response only.',
    '- 120-320 Chinese characters preferred.',
    '- Include concrete sensory/action details, not abstract summary only.',
    '- End with a playable next-action hook instead of hard-ending the scene.',
    '- Keep one explicit unresolved thread or immediate pressure for the next turn.',
    '- Avoid formulaic repeated sentence patterns across turns.',
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
