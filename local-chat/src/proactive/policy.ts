import type { LocalChatTarget } from '../data/index.js';
import { markProactiveContactSent, readProactivePolicyTargetState } from './policy-store.js';
import type {
  LocalChatProactiveGateInput,
  LocalChatProactivePolicyResult,
  LocalChatWakeStrategy,
} from './types.js';
import { ReasonCode } from '@nimiplatform/sdk/types';

export const PROACTIVE_IDLE_MIN_MS = 120 * 60 * 1000;
export const PROACTIVE_IDLE_MAX_MS = 7 * 24 * 60 * 60 * 1000;
export const PROACTIVE_COOLDOWN_MS = 6 * 60 * 60 * 1000;
export const PROACTIVE_DAILY_CAP = 3;

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function readWakeStrategyText(record: Record<string, unknown>): string {
  return String(record.wakeStrategy || record.wake_strategy || '').trim().toUpperCase();
}

function normalizeWakeStrategy(value: string): LocalChatWakeStrategy {
  if (value === 'PROACTIVE') return 'PROACTIVE';
  if (value === 'PASSIVE') return 'PASSIVE';
  return null;
}

export function resolveLocalChatWakeStrategy(target: LocalChatTarget): LocalChatWakeStrategy {
  const agentMetadata = asRecord(target.agentMetadata);
  const agentProfile = asRecord(target.agentProfile);
  const payload = asRecord(target.payload);
  const payloadAgent = asRecord(payload.agent);
  const payloadProfile = asRecord(payload.agentProfile);

  const candidates = [
    readWakeStrategyText(agentMetadata),
    readWakeStrategyText(agentProfile),
    readWakeStrategyText(payloadAgent),
    readWakeStrategyText(payloadProfile),
    readWakeStrategyText(payload),
  ];

  for (const candidate of candidates) {
    const normalized = normalizeWakeStrategy(candidate);
    if (normalized) return normalized;
  }
  return null;
}

function buildPolicyResult(
  reasonCode: LocalChatProactivePolicyResult['reasonCode'],
  actionHint: string,
): LocalChatProactivePolicyResult {
  return {
    allowed: reasonCode === ReasonCode.LOCAL_CHAT_PROACTIVE_ALLOWED,
    reasonCode,
    actionHint,
  };
}

export function evaluateLocalChatProactivePolicy(
  input: LocalChatProactiveGateInput,
): LocalChatProactivePolicyResult {
  if (!input.allowProactiveContact) {
    return buildPolicyResult(
      'LOCAL_CHAT_PROACTIVE_DISABLED_BY_USER_SETTING',
      'toggle-allow-proactive-contact',
    );
  }

  if (input.wakeStrategy !== 'PROACTIVE') {
    return buildPolicyResult(
      'LOCAL_CHAT_PROACTIVE_DISABLED_BY_WAKE_STRATEGY',
      'agent-wake-strategy-not-proactive',
    );
  }

  if (input.idleMs < PROACTIVE_IDLE_MIN_MS || input.idleMs > PROACTIVE_IDLE_MAX_MS) {
    return buildPolicyResult(
      'LOCAL_CHAT_PROACTIVE_SOCIAL_PRECONDITION_FAILED',
      'idle-window-not-satisfied',
    );
  }

  try {
    const state = readProactivePolicyTargetState({
      targetId: input.targetId,
      nowMs: input.nowMs,
    });
    if (state.lastSentAtMs > 0 && input.nowMs - state.lastSentAtMs < PROACTIVE_COOLDOWN_MS) {
      return buildPolicyResult(
        'LOCAL_CHAT_PROACTIVE_COOLDOWN_ACTIVE',
        'wait-cooldown-window',
      );
    }
    if (state.dailyCount >= PROACTIVE_DAILY_CAP) {
      return buildPolicyResult(
        'LOCAL_CHAT_PROACTIVE_DAILY_CAP_REACHED',
        'wait-next-day-window',
      );
    }
  } catch {
    return buildPolicyResult(
      'LOCAL_CHAT_PROACTIVE_POLICY_UNAVAILABLE',
      'policy-state-unavailable',
    );
  }

  return buildPolicyResult(
    'LOCAL_CHAT_PROACTIVE_ALLOWED',
    'policy-gate-passed',
  );
}

export function recordLocalChatProactiveContact(input: {
  targetId: string;
  atMs: number;
}): void {
  try {
    markProactiveContactSent(input);
  } catch {
    // Proactive policy persistence failure must not break chat flow.
  }
}
