import {
  NARRATIVE_INITIATIVE_DEFAULTS,
  NARRATIVE_REASON_CODES,
} from '../contracts.js';
import type { NarrativeReasonCode } from '../contracts.js';
import type { NarrativeInitiativeStateSnapshot } from '../types.js';

type InitiativeState = {
  lastFiredAtByStoryId: Record<string, number>;
  consecutiveByStoryId: Record<string, number>;
  lastSceneFingerprintByStoryId: Record<string, string>;
};

let initiativeState: InitiativeState = {
  lastFiredAtByStoryId: {},
  consecutiveByStoryId: {},
  lastSceneFingerprintByStoryId: {},
};

function loadInitiativeState(): InitiativeState {
  return initiativeState;
}

function saveInitiativeState(state: InitiativeState): void {
  const source = state.lastFiredAtByStoryId || {};
  const consecutiveSource = state.consecutiveByStoryId || {};
  const sceneFingerprintSource = state.lastSceneFingerprintByStoryId || {};
  const next: Record<string, number> = {};
  const nextConsecutive: Record<string, number> = {};
  const nextSceneFingerprint: Record<string, string> = {};
  for (const [storyId, firedAt] of Object.entries(source)) {
    const normalizedStoryId = String(storyId || '').trim();
    const numericFiredAt = Number(firedAt);
    if (!normalizedStoryId || !Number.isFinite(numericFiredAt)) {
      continue;
    }
    next[normalizedStoryId] = numericFiredAt;
  }
  for (const [storyId, consecutive] of Object.entries(consecutiveSource)) {
    const normalizedStoryId = String(storyId || '').trim();
    const numericConsecutive = Number(consecutive);
    if (!normalizedStoryId || !Number.isFinite(numericConsecutive)) {
      continue;
    }
    nextConsecutive[normalizedStoryId] = Math.max(0, Math.floor(numericConsecutive));
  }
  for (const [storyId, fingerprint] of Object.entries(sceneFingerprintSource)) {
    const normalizedStoryId = String(storyId || '').trim();
    const normalizedFingerprint = String(fingerprint || '').trim();
    if (!normalizedStoryId || !normalizedFingerprint) {
      continue;
    }
    nextSceneFingerprint[normalizedStoryId] = normalizedFingerprint;
  }
  initiativeState = {
    lastFiredAtByStoryId: next,
    consecutiveByStoryId: nextConsecutive,
    lastSceneFingerprintByStoryId: nextSceneFingerprint,
  };
}

export function resetNarrativeInitiativePolicyForTests(): void {
  initiativeState = {
    lastFiredAtByStoryId: {},
    consecutiveByStoryId: {},
    lastSceneFingerprintByStoryId: {},
  };
}

export function readNarrativeInitiativeStoryState(storyId: string): NarrativeInitiativeStateSnapshot {
  const normalizedStoryId = String(storyId || '').trim();
  const state = loadInitiativeState();
  return {
    lastFiredAt: normalizedStoryId ? (state.lastFiredAtByStoryId[normalizedStoryId] || null) : null,
    consecutive: normalizedStoryId ? (state.consecutiveByStoryId[normalizedStoryId] || 0) : 0,
    lastSceneFingerprint: normalizedStoryId ? (state.lastSceneFingerprintByStoryId[normalizedStoryId] || null) : null,
  };
}

export function hydrateNarrativeInitiativeStoryState(input: {
  storyId: string;
  state: NarrativeInitiativeStateSnapshot;
}): void {
  const storyId = String(input.storyId || '').trim();
  if (!storyId) {
    return;
  }
  const state = loadInitiativeState();
  const lastFiredAt = Number(input.state.lastFiredAt);
  if (Number.isFinite(lastFiredAt) && lastFiredAt > 0) {
    state.lastFiredAtByStoryId[storyId] = lastFiredAt;
  } else {
    delete state.lastFiredAtByStoryId[storyId];
  }
  const consecutive = Number(input.state.consecutive);
  if (Number.isFinite(consecutive) && consecutive > 0) {
    state.consecutiveByStoryId[storyId] = Math.max(0, Math.floor(consecutive));
  } else {
    delete state.consecutiveByStoryId[storyId];
  }
  const lastSceneFingerprint = String(input.state.lastSceneFingerprint || '').trim();
  if (lastSceneFingerprint) {
    state.lastSceneFingerprintByStoryId[storyId] = lastSceneFingerprint;
  } else {
    delete state.lastSceneFingerprintByStoryId[storyId];
  }
  saveInitiativeState(state);
}

export function resetNarrativeInitiativeStoryState(storyId: string): void {
  const normalizedStoryId = String(storyId || '').trim();
  if (!normalizedStoryId) {
    return;
  }
  const state = loadInitiativeState();
  delete state.lastFiredAtByStoryId[normalizedStoryId];
  delete state.consecutiveByStoryId[normalizedStoryId];
  delete state.lastSceneFingerprintByStoryId[normalizedStoryId];
  saveInitiativeState(state);
}

export type InitiativeDecision = {
  shouldProcessTurn: boolean;
  reasonCode: NarrativeReasonCode | null;
  actionHint: string;
};

export function evaluateNarrativeInitiativePolicy(input: {
  storyId: string;
  triggerSource: 'UserTurn' | 'AgentInitiative' | 'SystemEvent';
  presence: string;
  nowMs: number;
  openThreadCount?: number;
  sceneFingerprint?: string;
  maxConsecutive?: number;
  cooldownWindowSeconds?: number;
}): InitiativeDecision {
  if (input.triggerSource !== 'AgentInitiative') {
    return {
      shouldProcessTurn: true,
      reasonCode: null,
      actionHint: 'initiative-not-applicable',
    };
  }

  const presence = String(input.presence || '').trim().toLowerCase();
  if (NARRATIVE_INITIATIVE_DEFAULTS.blockedPresenceStates.includes(presence as 'composing' | 'active')) {
    return {
      shouldProcessTurn: false,
      reasonCode: NARRATIVE_REASON_CODES.NARRATIVE_INITIATIVE_COOLDOWN_ACTIVE,
      actionHint: 'Wait for cooldown window before next initiative tick.',
    };
  }

  const state = loadInitiativeState();
  const nowMs = Number.isFinite(input.nowMs) ? input.nowMs : Date.now();
  const lastFiredAt = state.lastFiredAtByStoryId[input.storyId] || 0;
  const cooldownWindowSeconds = Number.isFinite(input.cooldownWindowSeconds)
    ? Math.max(0, Number(input.cooldownWindowSeconds))
    : NARRATIVE_INITIATIVE_DEFAULTS.cooldownWindowSeconds;
  const cooldownMs = cooldownWindowSeconds * 1000;
  const maxConsecutive = Number.isFinite(input.maxConsecutive)
    ? Math.max(1, Math.floor(Number(input.maxConsecutive)))
    : NARRATIVE_INITIATIVE_DEFAULTS.maxConsecutive;
  const openThreadCount = Number.isFinite(input.openThreadCount)
    ? Math.max(0, Math.floor(Number(input.openThreadCount)))
    : 0;
  const consecutive = state.consecutiveByStoryId[input.storyId] || 0;
  const sceneFingerprint = String(input.sceneFingerprint || '').trim();
  const lastSceneFingerprint = state.lastSceneFingerprintByStoryId[input.storyId] || '';

  if (NARRATIVE_INITIATIVE_DEFAULTS.requireOpenThreadForInitiative && openThreadCount <= 0) {
    return {
      shouldProcessTurn: false,
      reasonCode: NARRATIVE_REASON_CODES.NARRATIVE_INITIATIVE_COOLDOWN_ACTIVE,
      actionHint: 'No open narrative thread. Skip proactive initiative until a thread is established.',
    };
  }

  if (lastFiredAt > 0 && nowMs - lastFiredAt < cooldownMs) {
    return {
      shouldProcessTurn: false,
      reasonCode: NARRATIVE_REASON_CODES.NARRATIVE_INITIATIVE_COOLDOWN_ACTIVE,
      actionHint: 'Wait for cooldown window before next initiative tick.',
    };
  }

  if (consecutive >= maxConsecutive) {
    return {
      shouldProcessTurn: false,
      reasonCode: NARRATIVE_REASON_CODES.NARRATIVE_INITIATIVE_COOLDOWN_ACTIVE,
      actionHint: 'Max consecutive initiative ticks reached. Wait for player/world state change.',
    };
  }

  if (sceneFingerprint && lastSceneFingerprint && sceneFingerprint === lastSceneFingerprint && consecutive > 0) {
    return {
      shouldProcessTurn: false,
      reasonCode: NARRATIVE_REASON_CODES.NARRATIVE_INITIATIVE_COOLDOWN_ACTIVE,
      actionHint: 'Scene state unchanged since last initiative. Skip repetitive proactive turn.',
    };
  }

  return {
    shouldProcessTurn: true,
    reasonCode: null,
    actionHint: 'initiative-policy-passed',
  };
}

export function recordNarrativeInitiativeFired(input: {
  storyId: string;
  nowMs: number;
  sceneFingerprint?: string;
}): void {
  const state = loadInitiativeState();
  const storyId = String(input.storyId || '').trim();
  if (!storyId) {
    return;
  }
  const sceneFingerprint = String(input.sceneFingerprint || '').trim();
  state.lastFiredAtByStoryId[storyId] = Number.isFinite(input.nowMs) ? input.nowMs : Date.now();
  state.consecutiveByStoryId[storyId] = (state.consecutiveByStoryId[storyId] || 0) + 1;
  if (sceneFingerprint) {
    state.lastSceneFingerprintByStoryId[storyId] = sceneFingerprint;
  }
  saveInitiativeState(state);
}

export function recordNarrativeNonInitiativeTurn(input: {
  storyId: string;
  sceneFingerprint?: string;
}): void {
  const state = loadInitiativeState();
  const storyId = String(input.storyId || '').trim();
  if (!storyId) {
    return;
  }
  state.consecutiveByStoryId[storyId] = 0;
  const sceneFingerprint = String(input.sceneFingerprint || '').trim();
  if (sceneFingerprint) {
    state.lastSceneFingerprintByStoryId[storyId] = sceneFingerprint;
  }
  saveInitiativeState(state);
}
