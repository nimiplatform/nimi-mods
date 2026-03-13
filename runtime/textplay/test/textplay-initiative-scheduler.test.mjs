import test from 'node:test';
import assert from 'node:assert/strict';
import { selectTextplayInitiativeScheduleDecision } from '../src/hooks/initiative-scheduler.ts';

function createPolicy(overrides = {}) {
  return {
    enabled: true,
    tickSeconds: 10,
    cooldownSeconds: 180,
    maxConsecutive: 3,
    idleSeconds: 120,
    pausedSeconds: 180,
    highTensionIdleSeconds: 180,
    awaySeconds: 300,
    highTensionThreshold: 0.7,
    blockedPresenceStates: ['active', 'composing'],
    ...overrides,
  };
}

test('scheduler triggers idle initiative after idle threshold', () => {
  const decision = selectTextplayInitiativeScheduleDecision({
    status: 'active',
    presenceState: 'idle',
    presenceElapsedMs: 121_000,
    pausedElapsedMs: 0,
    tension: 0.4,
    policy: createPolicy(),
  });

  assert.deepEqual(decision, {
    triggerSource: 'AgentInitiative',
    reason: 'idle-threshold',
  });
});

test('scheduler upgrades to high-tension initiative when tension stays elevated', () => {
  const decision = selectTextplayInitiativeScheduleDecision({
    status: 'active',
    presenceState: 'idle',
    presenceElapsedMs: 181_000,
    pausedElapsedMs: 0,
    tension: 0.82,
    policy: createPolicy(),
  });

  assert.deepEqual(decision, {
    triggerSource: 'AgentInitiative',
    reason: 'high-tension-idle-threshold',
  });
});

test('scheduler triggers paused initiative after paused threshold', () => {
  const decision = selectTextplayInitiativeScheduleDecision({
    status: 'paused',
    presenceState: 'paused',
    presenceElapsedMs: 0,
    pausedElapsedMs: 181_000,
    tension: 0.5,
    policy: createPolicy(),
  });

  assert.deepEqual(decision, {
    triggerSource: 'AgentInitiative',
    reason: 'paused-threshold',
  });
});

test('scheduler triggers system event when away threshold is crossed', () => {
  const decision = selectTextplayInitiativeScheduleDecision({
    status: 'active',
    presenceState: 'away',
    presenceElapsedMs: 301_000,
    pausedElapsedMs: 0,
    tension: 0.2,
    policy: createPolicy(),
  });

  assert.deepEqual(decision, {
    triggerSource: 'SystemEvent',
    reason: 'away-threshold',
  });
});

test('scheduler respects blocked presence states and disabled policy', () => {
  assert.equal(selectTextplayInitiativeScheduleDecision({
    status: 'active',
    presenceState: 'idle',
    presenceElapsedMs: 600_000,
    pausedElapsedMs: 0,
    tension: 0.9,
    policy: createPolicy({ enabled: false }),
  }), null);

  assert.equal(selectTextplayInitiativeScheduleDecision({
    status: 'active',
    presenceState: 'idle',
    presenceElapsedMs: 600_000,
    pausedElapsedMs: 0,
    tension: 0.9,
    policy: createPolicy({ blockedPresenceStates: ['idle'] }),
  }), null);
});
