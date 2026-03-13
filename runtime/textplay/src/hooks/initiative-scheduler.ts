import type { TextplayDraftStatus, TextplayPresenceState, TextplayStartupPolicy } from '../types.js';

export type TextplayInitiativeScheduleDecision = {
  triggerSource: 'AgentInitiative' | 'SystemEvent';
  reason: 'paused-threshold' | 'away-threshold' | 'high-tension-idle-threshold' | 'idle-threshold';
};

function toFiniteSeconds(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function toFiniteRatio(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export function selectTextplayInitiativeScheduleDecision(input: {
  status: TextplayDraftStatus;
  presenceState: TextplayPresenceState;
  presenceElapsedMs: number;
  pausedElapsedMs: number;
  tension: number;
  policy: TextplayStartupPolicy['initiative'];
}): TextplayInitiativeScheduleDecision | null {
  if (!input.policy.enabled) {
    return null;
  }

  const blocked = new Set(input.policy.blockedPresenceStates || []);
  const idleThresholdMs = toFiniteSeconds(input.policy.idleSeconds, 120) * 1000;
  const pausedThresholdMs = toFiniteSeconds(input.policy.pausedSeconds, 180) * 1000;
  const highTensionIdleThresholdMs = toFiniteSeconds(input.policy.highTensionIdleSeconds, 180) * 1000;
  const awayThresholdMs = toFiniteSeconds(input.policy.awaySeconds, 300) * 1000;
  const highTensionThreshold = toFiniteRatio(input.policy.highTensionThreshold, 0.7);

  if (
    input.status === 'paused'
    && !blocked.has('paused')
    && input.pausedElapsedMs >= pausedThresholdMs
  ) {
    return {
      triggerSource: 'AgentInitiative',
      reason: 'paused-threshold',
    };
  }

  if (
    input.presenceState === 'away'
    && !blocked.has('away')
    && input.presenceElapsedMs >= awayThresholdMs
  ) {
    return {
      triggerSource: 'SystemEvent',
      reason: 'away-threshold',
    };
  }

  if (input.presenceState !== 'idle' || blocked.has('idle')) {
    return null;
  }

  if (
    input.tension > highTensionThreshold
    && input.presenceElapsedMs >= highTensionIdleThresholdMs
  ) {
    return {
      triggerSource: 'AgentInitiative',
      reason: 'high-tension-idle-threshold',
    };
  }

  if (input.presenceElapsedMs >= idleThresholdMs) {
    return {
      triggerSource: 'AgentInitiative',
      reason: 'idle-threshold',
    };
  }

  return null;
}
