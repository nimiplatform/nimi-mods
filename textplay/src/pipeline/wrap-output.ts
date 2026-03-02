import { TEXTPLAY_REASON } from '../contracts.js';
import { TextplayPipelineError } from './error.js';
import type { TextplayWrapOutputInput, TextplayWrapOutputResult } from './types.js';

export function wrapTextplayOutput(input: TextplayWrapOutputInput): TextplayWrapOutputResult {
  const text = String(input.generated.text || '').trim();
  if (!text) {
    throw new TextplayPipelineError({
      reasonCode: TEXTPLAY_REASON.RENDER_EMPTY_RESPONSE,
      actionHint: 'Tighten output floor or change model route.',
      message: 'TEXTPLAY_WRAP_EMPTY_TEXT',
      stage: 'wrap-output',
      retryClass: 'non-retryable',
    });
  }

  const promptTraceId = String(input.generated.promptTraceId || '').trim();
  if (!promptTraceId) {
    throw new TextplayPipelineError({
      reasonCode: TEXTPLAY_REASON.RENDER_EMPTY_RESPONSE,
      actionHint: 'Tighten output floor or change model route.',
      message: 'TEXTPLAY_WRAP_PROMPT_TRACE_MISSING',
      stage: 'wrap-output',
      retryClass: 'non-retryable',
    });
  }

  return {
    text,
    meta: {
      storyId: input.normalized.storyId,
      turnId: input.normalized.turnId,
      runId: input.normalized.runId,
      traceId: input.normalized.traceId,
      promptTraceId,
      route: input.generated.route,
      sourceEventIds: input.sourceEventIds,
      warnings: input.warnings,
      presenceReports: input.presenceReports,
      runSnapshot: input.runSnapshot,
    },
  };
}
