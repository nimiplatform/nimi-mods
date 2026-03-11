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

export type TextplayPresenceMachine = {
  getState: () => TextplayPresenceState;
  dispatch: (event: TextplayPresenceEvent) => TextplayPresenceState;
  mark: () => number;
  collectSince: (mark: number) => TextplayPresenceReport[];
  getAllReports: () => TextplayPresenceReport[];
  resetTimers: () => void;
  destroy: () => void;
};
