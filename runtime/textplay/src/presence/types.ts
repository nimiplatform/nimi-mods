import type { TextplayPresenceReport, TextplayPresenceState } from '../types.js';

export type TextplayPresenceEvent =
  | 'onUserComposing'
  | 'onUserPaused'
  | 'onUserActive'
  | 'idleTimeout'
  | 'awayTimeout'
  | 'onInitiativeReceived';

export type TextplayPresenceConfig = {
  idleTimeoutSeconds: number;
  awayTimeoutSeconds: number;
  initialState?: TextplayPresenceState;
};

export type TextplayPresenceTransition = {
  previousState: TextplayPresenceState;
  nextState: TextplayPresenceState;
  event: TextplayPresenceEvent;
  atMs: number;
  atIso: string;
};

// Presence listeners are part of the machine's synchronous state propagation path.
// They must finish synchronously and must not return a Promise or schedule awaited work
// before any dependent refs have been updated.
export type TextplayPresenceTransitionListener = (transition: TextplayPresenceTransition) => void;

export type TextplayPresenceMachine = {
  getState: () => TextplayPresenceState;
  dispatch: (event: TextplayPresenceEvent) => TextplayPresenceState;
  subscribe: (listener: TextplayPresenceTransitionListener) => () => void;
  mark: () => number;
  collectSince: (mark: number) => TextplayPresenceReport[];
  getAllReports: () => TextplayPresenceReport[];
  resetTimers: () => void;
  pauseTimers: () => void;
  destroy: () => void;
};
