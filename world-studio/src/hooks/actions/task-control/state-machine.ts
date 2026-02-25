import type { WorldStudioTaskStatus } from '../../../contracts.js';

const TRANSITIONS: Record<WorldStudioTaskStatus, WorldStudioTaskStatus[]> = {
  RUNNING: ['PAUSE_REQUESTED', 'CANCEL_REQUESTED', 'FAILED', 'COMPLETED'],
  PAUSE_REQUESTED: ['PAUSED', 'CANCEL_REQUESTED', 'FAILED', 'COMPLETED'],
  PAUSED: ['RUNNING', 'CANCEL_REQUESTED', 'FAILED'],
  CANCEL_REQUESTED: ['CANCELED', 'FAILED'],
  CANCELED: [],
  FAILED: [],
  COMPLETED: [],
};

export function canTransitionTaskStatus(
  from: WorldStudioTaskStatus,
  to: WorldStudioTaskStatus,
): boolean {
  if (from === to) return true;
  return TRANSITIONS[from].includes(to);
}

export function ensureTaskStatusTransition(
  from: WorldStudioTaskStatus,
  to: WorldStudioTaskStatus,
): WorldStudioTaskStatus {
  if (!canTransitionTaskStatus(from, to)) {
    return from;
  }
  return to;
}

export function isTaskTerminalStatus(status: WorldStudioTaskStatus): boolean {
  return status === 'CANCELED' || status === 'FAILED' || status === 'COMPLETED';
}

export function isTaskBlockingStatus(status: WorldStudioTaskStatus): boolean {
  return status === 'RUNNING' || status === 'PAUSE_REQUESTED' || status === 'CANCEL_REQUESTED';
}
