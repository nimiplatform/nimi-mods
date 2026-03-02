import { loadLocalStorageJson, saveLocalStorageJson } from '@nimiplatform/sdk/mod/utils';
import {
  NARRATIVE_INITIATIVE_DEFAULTS,
  NARRATIVE_REASON_CODES,
} from '../contracts.js';
import type { NarrativeReasonCode } from '../contracts.js';

type InitiativeState = {
  lastFiredAtByStoryId: Record<string, number>;
};

const INITIATIVE_STATE_KEY = 'nimi.narrative-engine.initiative-state.v1';

function loadInitiativeState(): InitiativeState {
  return loadLocalStorageJson<InitiativeState>(
    INITIATIVE_STATE_KEY,
    {
      lastFiredAtByStoryId: {},
    },
    (value) => {
      const record = value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
      const raw = record.lastFiredAtByStoryId;
      const source = raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};
      const next: Record<string, number> = {};
      for (const [storyId, firedAt] of Object.entries(source)) {
        const normalizedStoryId = String(storyId || '').trim();
        const numericFiredAt = Number(firedAt);
        if (!normalizedStoryId || !Number.isFinite(numericFiredAt)) {
          continue;
        }
        next[normalizedStoryId] = numericFiredAt;
      }
      return {
        lastFiredAtByStoryId: next,
      };
    },
  );
}

function saveInitiativeState(state: InitiativeState): void {
  saveLocalStorageJson(INITIATIVE_STATE_KEY, state);
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
  const cooldownMs = NARRATIVE_INITIATIVE_DEFAULTS.cooldownWindowSeconds * 1000;

  if (lastFiredAt > 0 && nowMs - lastFiredAt < cooldownMs) {
    return {
      shouldProcessTurn: false,
      reasonCode: NARRATIVE_REASON_CODES.NARRATIVE_INITIATIVE_COOLDOWN_ACTIVE,
      actionHint: 'Wait for cooldown window before next initiative tick.',
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
}): void {
  const state = loadInitiativeState();
  state.lastFiredAtByStoryId[input.storyId] = Number.isFinite(input.nowMs) ? input.nowMs : Date.now();
  saveInitiativeState(state);
}
