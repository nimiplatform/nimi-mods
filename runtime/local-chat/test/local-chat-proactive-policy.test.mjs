import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateLocalChatProactivePolicy,
  PROACTIVE_IDLE_MIN_MS,
} from '../src/proactive/policy.ts';

const BASE_INPUT = {
  allowProactiveContact: true,
  wakeStrategy: 'PROACTIVE',
  targetId: '',
  sessionId: 'session-1',
  idleMs: PROACTIVE_IDLE_MIN_MS + 1,
  nowMs: Date.now(),
};

test('local-chat proactive policy blocks when allowProactiveContact is disabled', () => {
  const result = evaluateLocalChatProactivePolicy({
    ...BASE_INPUT,
    allowProactiveContact: false,
    targetId: `target-disabled-${Date.now().toString(36)}`,
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reasonCode, 'LOCAL_CHAT_PROACTIVE_DISABLED_BY_USER_SETTING');
  assert.equal(result.actionHint, 'toggle-allow-proactive-contact');
});

test('local-chat proactive policy allows eligible target when wake strategy and idle window are valid', () => {
  const result = evaluateLocalChatProactivePolicy({
    ...BASE_INPUT,
    targetId: `target-allowed-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    nowMs: 1_736_352_000_000, // 2025-01-10T00:00:00.000Z
  });

  assert.equal(result.allowed, true);
  assert.equal(result.reasonCode, 'LOCAL_CHAT_PROACTIVE_ALLOWED');
  assert.equal(result.actionHint, 'policy-gate-passed');
});
