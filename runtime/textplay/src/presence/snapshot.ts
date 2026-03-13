import type { TextplayPresenceState } from '../types.js';
import type { TextplayPresenceTransition } from './types.js';

export type TextplayPresenceSnapshot = {
  state: TextplayPresenceState;
  stateSinceMs: number;
  pausedSinceMs: number | null;
};

export function createTextplayPresenceSnapshot(input: {
  state: TextplayPresenceState;
  atMs: number;
}): TextplayPresenceSnapshot {
  return {
    state: input.state,
    stateSinceMs: input.atMs,
    pausedSinceMs: input.state === 'paused' ? input.atMs : null,
  };
}

export function reduceTextplayPresenceSnapshot(
  snapshot: TextplayPresenceSnapshot,
  transition: TextplayPresenceTransition,
): TextplayPresenceSnapshot {
  const stateSinceMs = transition.event === 'onInitiativeReceived' || transition.nextState !== transition.previousState
    ? transition.atMs
    : snapshot.stateSinceMs;

  let pausedSinceMs = snapshot.pausedSinceMs;
  if (transition.nextState === 'paused') {
    pausedSinceMs = transition.atMs;
  } else if (transition.previousState === 'paused') {
    pausedSinceMs = null;
  }

  return {
    state: transition.nextState,
    stateSinceMs,
    pausedSinceMs,
  };
}
