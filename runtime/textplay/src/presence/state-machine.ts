import type { TextplayPresenceReport, TextplayPresenceState } from '../types.js';
import type {
  TextplayPresenceConfig,
  TextplayPresenceEvent,
  TextplayPresenceMachine,
  TextplayPresenceTransitionListener,
  TextplayPresenceTransition,
} from './types.js';
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
  const listeners = new Set<TextplayPresenceTransitionListener>();

  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let awayTimer: ReturnType<typeof setTimeout> | null = null;

  const assertSynchronousListenerResult = (value: unknown) => {
    if (value && typeof value === 'object' && typeof (value as { then?: unknown }).then === 'function') {
      throw new Error('TEXTPLAY_PRESENCE_LISTENER_MUST_BE_SYNC');
    }
  };

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
    atIso: string,
  ) => {
    reports.push({
      id: createUlid(),
      at: atIso,
      fromState,
      toState,
      event,
    });
  };

  const emitTransition = (transition: TextplayPresenceTransition) => {
    for (const listener of listeners) {
      assertSynchronousListenerResult(listener(transition));
    }
  };

  const dispatch = (event: TextplayPresenceEvent): TextplayPresenceState => {
    const previous = state;
    const atMs = Date.now();
    const atIso = new Date(atMs).toISOString();

    if (event === 'onInitiativeReceived') {
      resetTimers();
      emitTransition({
        previousState: previous,
        nextState: state,
        event,
        atMs,
        atIso,
      });
      return state;
    }

    const nextState = resolveNextState(state, event);
    if (nextState !== previous) {
      state = nextState;
      pushReport(previous, nextState, event, atIso);
    }

    resetTimers();
    emitTransition({
      previousState: previous,
      nextState: state,
      event,
      atMs,
      atIso,
    });
    return state;
  };

  resetTimers();

  return {
    getState: () => state,
    dispatch,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    mark: () => reports.length,
    collectSince: (mark: number) => reports.slice(Math.max(0, mark)),
    getAllReports: () => [...reports],
    resetTimers,
    pauseTimers: () => {
      clearTimers();
    },
    destroy: () => {
      listeners.clear();
      clearTimers();
    },
  };
}
