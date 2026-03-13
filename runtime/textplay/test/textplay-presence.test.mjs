import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { createTextplayPresenceMachine } from '../src/presence/state-machine.ts';
import { createTextplayPresenceSnapshot, reduceTextplayPresenceSnapshot } from '../src/presence/snapshot.ts';
import { selectTextplayInitiativeScheduleDecision } from '../src/hooks/initiative-scheduler.ts';

test('presence transitions idle -> away with fixed timeout policy', async () => {
  const machine = createTextplayPresenceMachine({
    idleTimeoutSeconds: 0.02,
    awayTimeoutSeconds: 0.03,
    initialState: 'active',
  });

  try {
    await delay(40);
    assert.equal(machine.getState(), 'idle');

    await delay(60);
    assert.equal(machine.getState(), 'away');

    const reports = machine.getAllReports();
    assert.equal(reports.some((report) => report.toState === 'idle'), true);
    assert.equal(reports.some((report) => report.toState === 'away'), true);
  } finally {
    machine.destroy();
  }
});

test('onInitiativeReceived resets timers without forcing state transition', async () => {
  const machine = createTextplayPresenceMachine({
    idleTimeoutSeconds: 0.04,
    awayTimeoutSeconds: 0.08,
    initialState: 'active',
  });

  try {
    await delay(20);
    machine.dispatch('onInitiativeReceived');
    assert.equal(machine.getState(), 'active');

    await delay(25);
    assert.equal(machine.getState(), 'active');

    await delay(30);
    assert.equal(machine.getState(), 'idle');
  } finally {
    machine.destroy();
  }
});

test('presence machine subscriptions receive timeout and initiative events', async () => {
  const machine = createTextplayPresenceMachine({
    idleTimeoutSeconds: 0.02,
    awayTimeoutSeconds: 0.05,
    initialState: 'active',
  });
  const transitions = [];
  const unsubscribe = machine.subscribe((transition) => {
    transitions.push(transition);
  });

  try {
    machine.dispatch('onInitiativeReceived');
    await delay(40);

    assert.equal(transitions[0].event, 'onInitiativeReceived');
    assert.equal(transitions[0].previousState, 'active');
    assert.equal(transitions[0].nextState, 'active');
    assert.equal(transitions.some((transition) => transition.event === 'idleTimeout'), true);
  } finally {
    unsubscribe();
    machine.destroy();
  }
});

test('presence snapshot reducer keeps scheduler state in sync with machine timeouts', async () => {
  const policy = {
    enabled: true,
    tickSeconds: 10,
    cooldownSeconds: 180,
    maxConsecutive: 3,
    idleSeconds: 0.01,
    pausedSeconds: 0.05,
    highTensionIdleSeconds: 0.01,
    awaySeconds: 0.03,
    highTensionThreshold: 0.7,
    blockedPresenceStates: ['active'],
  };
  const machine = createTextplayPresenceMachine({
    idleTimeoutSeconds: policy.idleSeconds,
    awayTimeoutSeconds: policy.awaySeconds,
    initialState: 'active',
  });
  let snapshot = createTextplayPresenceSnapshot({
    state: 'active',
    atMs: Date.now(),
  });
  const unsubscribe = machine.subscribe((transition) => {
    snapshot = reduceTextplayPresenceSnapshot(snapshot, transition);
  });

  try {
    await delay(25);
    const nowMs = Date.now();
    const idleDecision = selectTextplayInitiativeScheduleDecision({
      status: 'active',
      presenceState: snapshot.state,
      presenceElapsedMs: nowMs - snapshot.stateSinceMs,
      pausedElapsedMs: 0,
      tension: 0.8,
      policy,
    });
    assert.equal(snapshot.state, 'idle');
    assert.equal(idleDecision?.reason, 'high-tension-idle-threshold');

    await delay(120);
    const awayNowMs = Date.now();
    const awayDecision = selectTextplayInitiativeScheduleDecision({
      status: 'active',
      presenceState: snapshot.state,
      presenceElapsedMs: awayNowMs - snapshot.stateSinceMs,
      pausedElapsedMs: 0,
      tension: 0.2,
      policy,
    });
    assert.equal(snapshot.state, 'away');
    assert.equal(awayDecision?.reason, 'away-threshold');
  } finally {
    unsubscribe();
    machine.destroy();
  }
});

test('presence machine rejects async subscription listeners', () => {
  const machine = createTextplayPresenceMachine({
    idleTimeoutSeconds: 60,
    awayTimeoutSeconds: 300,
    initialState: 'active',
  });

  try {
    machine.subscribe(async () => {});
    assert.throws(
      () => {
        machine.dispatch('onUserActive');
      },
      /TEXTPLAY_PRESENCE_LISTENER_MUST_BE_SYNC/,
    );
  } finally {
    machine.destroy();
  }
});
