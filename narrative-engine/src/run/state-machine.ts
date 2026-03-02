import type { NarrativeRunState } from '../types.js';

const RUN_STATE_TRANSITIONS: Record<NarrativeRunState, NarrativeRunState[]> = {
  RUNNING: ['PAUSE_REQUESTED', 'CANCEL_REQUESTED', 'FAILED', 'COMPLETED'],
  PAUSE_REQUESTED: ['PAUSED', 'RUNNING', 'FAILED'],
  PAUSED: ['RUNNING', 'CANCEL_REQUESTED', 'FAILED'],
  CANCEL_REQUESTED: ['CANCELED', 'FAILED'],
  CANCELED: [],
  FAILED: [],
  COMPLETED: [],
};

export function canTransitionNarrativeRunState(from: NarrativeRunState, to: NarrativeRunState): boolean {
  if (from === to) {
    return true;
  }
  return RUN_STATE_TRANSITIONS[from].includes(to);
}

export function ensureNarrativeRunStateTransition(from: NarrativeRunState, to: NarrativeRunState): NarrativeRunState {
  if (!canTransitionNarrativeRunState(from, to)) {
    return from;
  }
  return to;
}

export function isNarrativeRunTerminalState(state: NarrativeRunState): boolean {
  return state === 'CANCELED' || state === 'FAILED' || state === 'COMPLETED';
}
