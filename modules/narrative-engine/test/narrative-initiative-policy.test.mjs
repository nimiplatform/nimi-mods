import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateNarrativeInitiativePolicy,
  recordNarrativeInitiativeFired,
  recordNarrativeNonInitiativeTurn,
  resetNarrativeInitiativePolicyForTests,
} from '../src/initiative/policy.ts';

test.beforeEach(() => {
  resetNarrativeInitiativePolicyForTests();
});

test('initiative blocks when no open thread is available', () => {
  const decision = evaluateNarrativeInitiativePolicy({
    storyId: 'story-initiative-1',
    triggerSource: 'AgentInitiative',
    presence: 'idle',
    nowMs: Date.parse('2026-03-03T01:00:00.000Z'),
    openThreadCount: 0,
    sceneFingerprint: 'scene-a',
  });
  assert.equal(decision.shouldProcessTurn, false);
});

test('initiative blocks same scene fingerprint after previous initiative', () => {
  const nowMs = Date.parse('2026-03-03T01:10:00.000Z');
  recordNarrativeInitiativeFired({
    storyId: 'story-initiative-2',
    nowMs,
    sceneFingerprint: 'scene-a',
  });
  const decision = evaluateNarrativeInitiativePolicy({
    storyId: 'story-initiative-2',
    triggerSource: 'AgentInitiative',
    presence: 'idle',
    nowMs: nowMs + 181_000,
    openThreadCount: 1,
    sceneFingerprint: 'scene-a',
  });
  assert.equal(decision.shouldProcessTurn, false);
  assert.match(decision.actionHint, /Scene state unchanged/i);
});

test('initiative enforces max consecutive proactive turns', () => {
  const base = Date.parse('2026-03-03T01:20:00.000Z');
  recordNarrativeInitiativeFired({ storyId: 'story-initiative-3', nowMs: base, sceneFingerprint: 'scene-a' });
  recordNarrativeInitiativeFired({ storyId: 'story-initiative-3', nowMs: base + 200_000, sceneFingerprint: 'scene-b' });
  recordNarrativeInitiativeFired({ storyId: 'story-initiative-3', nowMs: base + 400_000, sceneFingerprint: 'scene-c' });

  const decision = evaluateNarrativeInitiativePolicy({
    storyId: 'story-initiative-3',
    triggerSource: 'AgentInitiative',
    presence: 'idle',
    nowMs: base + 800_000,
    openThreadCount: 1,
    sceneFingerprint: 'scene-d',
    maxConsecutive: 3,
  });
  assert.equal(decision.shouldProcessTurn, false);
  assert.match(decision.actionHint, /Max consecutive initiative ticks reached/i);
});

test('non-initiative turn resets consecutive pressure', () => {
  const base = Date.parse('2026-03-03T01:30:00.000Z');
  recordNarrativeInitiativeFired({ storyId: 'story-initiative-4', nowMs: base, sceneFingerprint: 'scene-a' });
  recordNarrativeInitiativeFired({ storyId: 'story-initiative-4', nowMs: base + 220_000, sceneFingerprint: 'scene-b' });
  recordNarrativeNonInitiativeTurn({ storyId: 'story-initiative-4', sceneFingerprint: 'scene-c' });

  const decision = evaluateNarrativeInitiativePolicy({
    storyId: 'story-initiative-4',
    triggerSource: 'AgentInitiative',
    presence: 'idle',
    nowMs: base + 500_000,
    openThreadCount: 1,
    sceneFingerprint: 'scene-c',
    maxConsecutive: 2,
  });
  assert.equal(decision.shouldProcessTurn, true);
});
