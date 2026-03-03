import { TEXTPLAY_REASON } from '../contracts.js';
import { TextplayPipelineError } from './error.js';
import type { TextplayNormalizedRenderInput, TextplayProjectionEvent } from '../types.js';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as Record<string, unknown>;
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
  const sceneSummary = String(input.normalized.sceneSummary || '').trim();
  const agentSummary = String(input.normalized.agentSummary || '').trim();
  const worldStyleSummary = String(input.normalized.worldStyleSummary || '').trim();
  const openingPayload = asRecord(asRecord(input.normalized.systemPayload)?.opening);
  const openingMode = String(openingPayload?.mode || '').trim();
  const isStoryStart = openingMode === 'story-start';
  const openingInstruction = String(openingPayload?.instruction || '').trim();
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
  ];

  if (isStoryStart) {
    constraints.push(
      '- Opening mode: establish only past-and-present context, with no future spoilers.',
      '- Explain why the player is here and what the player currently knows.',
      '- Weave player role/background into scene narration naturally, not as metadata dump.',
      '- Do not reveal hidden outcomes or end-state conclusions in opening narration.',
    );
  }

  const promptLines = [
    'You are TextPlay narrative renderer.',
    'Constraints:',
    ...constraints,
    '',
    `Story ID: ${input.normalized.storyId}`,
    `Turn ID: ${input.normalized.turnId}`,
    `Trigger Source: ${input.normalized.triggerSource}`,
    `Player ID: ${input.normalized.playerId}`,
    `Player Name: ${playerName || '(unspecified)'}`,
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
    '- Minimum 50 characters.',
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
