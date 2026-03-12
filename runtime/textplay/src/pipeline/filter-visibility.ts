import { TEXTPLAY_REASON } from '../contracts.js';
import { TextplayPipelineError } from './error.js';
import type { TextplayNormalizedRenderInput, TextplayProjectionEvent } from '../types.js';

const ACTOR_PRIORITY: Array<keyof Pick<TextplayProjectionEvent, 'thinker' | 'decider' | 'experiencer' | 'owner'>> = [
  'thinker',
  'decider',
  'experiencer',
  'owner',
];

function isInternalVisibleToPlayer(input: {
  event: TextplayProjectionEvent;
  userId: string;
}): boolean {
  for (const field of ACTOR_PRIORITY) {
    const actorId = String(input.event[field] || '').trim();
    if (!actorId) continue;
    return actorId === input.userId;
  }
  return false;
}

export function filterTextplayVisibility(input: {
  normalized: TextplayNormalizedRenderInput;
}): {
  visibleEvents: TextplayProjectionEvent[];
  sourceEventIds: string[];
} {
  const visibleEvents: TextplayProjectionEvent[] = [];

  for (const event of input.normalized.events) {
    if (event.visibility === 'public' || event.visibility === 'sensory') {
      visibleEvents.push(event);
      continue;
    }

    if (event.visibility === 'internal') {
      if (isInternalVisibleToPlayer({
        event,
        userId: input.normalized.userId,
      })) {
        visibleEvents.push(event);
      }
      continue;
    }

    throw new TextplayPipelineError({
      reasonCode: TEXTPLAY_REASON.POV_VIOLATION_DETECTED,
      actionHint: 'Enforce POV constraints and rerun render.',
      message: `TEXTPLAY_VISIBILITY_INVALID:${event.visibility}`,
      stage: 'visibility-pov',
      retryClass: 'non-retryable',
    });
  }

  const sourceEventIds = Array.from(new Set(
    visibleEvents.flatMap((event) => event.sourceEventIds.length > 0 ? event.sourceEventIds : [event.eventId]),
  ));

  return {
    visibleEvents,
    sourceEventIds,
  };
}
