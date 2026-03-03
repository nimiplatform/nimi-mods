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
    .map((event, index) => `${index + 1}. [${event.visibility}] ${event.content}`)
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

  if (isStoryStart) {
    constraints.push(
      '- Opening mode: this is the pre-event threshold; entry event outcome has NOT happened yet.',
      '- Opening mode: establish only past-and-present context, with no future spoilers.',
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
    `Opening No-Spoiler: ${openingNoSpoiler}`,
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
