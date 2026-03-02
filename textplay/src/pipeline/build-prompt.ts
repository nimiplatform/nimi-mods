import { TEXTPLAY_REASON } from '../contracts.js';
import { TextplayPipelineError } from './error.js';
import type { TextplayNormalizedRenderInput, TextplayProjectionEvent } from '../types.js';

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
  const sceneSummary = String(input.normalized.sceneSummary || '').trim();
  const agentSummary = String(input.normalized.agentSummary || '').trim();
  const worldStyleSummary = String(input.normalized.worldStyleSummary || '').trim();

  if (!sceneSummary || !agentSummary || !worldStyleSummary) {
    throw new TextplayPipelineError({
      reasonCode: TEXTPLAY_REASON.PROMPT_BUILD_FAILED,
      actionHint: 'Repair prompt template and normalized inputs.',
      message: 'TEXTPLAY_PROMPT_CONTEXT_INVALID',
      stage: 'build-prompt',
      retryClass: 'non-retryable',
    });
  }

  const prompt = [
    'You are TextPlay narrative renderer.',
    'Constraints:',
    '- Consume only provided narrative projection facts.',
    '- Do not invent or rewrite narrative facts.',
    '- Keep output immersive and concise for interactive play.',
    '',
    `Story ID: ${input.normalized.storyId}`,
    `Turn ID: ${input.normalized.turnId}`,
    `Trigger Source: ${input.normalized.triggerSource}`,
    `Player ID: ${input.normalized.playerId}`,
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
  ].join('\n');

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
