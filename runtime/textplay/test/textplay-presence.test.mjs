import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { createTextplayPresenceMachine } from '../src/presence/state-machine.ts';

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
