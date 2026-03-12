import type { TextplayPresenceReport, TextplayPresenceState } from '../types.js';
import type { TextplayPresenceConfig, TextplayPresenceEvent, TextplayPresenceMachine } from './types.js';
import { createUlid } from '../utils/ulid.js';

function nowIso(): string {
  return new Date().toISOString();
}

function sanitizeTimeoutSeconds(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

function canTransitionToIdle(state: TextplayPresenceState): boolean {
  return state === 'composing' || state === 'paused' || state === 'active';
}

function resolveNextState(
  state: TextplayPresenceState,
  event: TextplayPresenceEvent,
): TextplayPresenceState {
  if (event === 'onUserComposing') return 'composing';
  if (event === 'onUserPaused') return 'paused';
  if (event === 'onUserActive') return 'active';

  if (event === 'idleTimeout' && canTransitionToIdle(state)) {
    return 'idle';
  }

  if (event === 'awayTimeout' && state === 'idle') {
    return 'away';
  }

  return state;
}

export function createTextplayPresenceMachine(config?: Partial<TextplayPresenceConfig>): TextplayPresenceMachine {
  const idleTimeoutSeconds = sanitizeTimeoutSeconds(config?.idleTimeoutSeconds || 60, 60);
  const awayTimeoutSeconds = sanitizeTimeoutSeconds(config?.awayTimeoutSeconds || 300, 300);

  let state: TextplayPresenceState = config?.initialState || 'active';
  const reports: TextplayPresenceReport[] = [];

  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let awayTimer: ReturnType<typeof setTimeout> | null = null;

  const clearTimers = () => {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    if (awayTimer) {
      clearTimeout(awayTimer);
      awayTimer = null;
    }
  };

  const scheduleTimers = () => {
    if (canTransitionToIdle(state)) {
      idleTimer = setTimeout(() => {
        dispatch('idleTimeout');
      }, idleTimeoutSeconds * 1000);
      return;
    }
    if (state === 'idle') {
      awayTimer = setTimeout(() => {
        dispatch('awayTimeout');
      }, awayTimeoutSeconds * 1000);
    }
  };

  const resetTimers = () => {
    clearTimers();
    scheduleTimers();
  };

  const pushReport = (
    fromState: TextplayPresenceState,
    toState: TextplayPresenceState,
    event: TextplayPresenceEvent,
  ) => {
    reports.push({
      id: createUlid(),
      at: nowIso(),
      fromState,
      toState,
      event,
    });
  };

  const dispatch = (event: TextplayPresenceEvent): TextplayPresenceState => {
    if (event === 'onInitiativeReceived') {
      resetTimers();
      return state;
    }

    const nextState = resolveNextState(state, event);
    const previous = state;
    if (nextState !== previous) {
      state = nextState;
      pushReport(previous, nextState, event);
    }

    resetTimers();
    return state;
  };

  resetTimers();

  return {
    getState: () => state,
    dispatch,
    mark: () => reports.length,
    collectSince: (mark: number) => reports.slice(Math.max(0, mark)),
    getAllReports: () => [...reports],
    resetTimers,
    pauseTimers: () => {
      clearTimers();
    },
    destroy: () => {
      clearTimers();
    },
  };
}
