import test from 'node:test';
import assert from 'node:assert/strict';
import { NARRATIVE_REASON_CODES } from '../src/contracts.ts';
import { runNarrativeStep3Guard } from '../src/pipeline/step3-guard.ts';

function makeBaseOutput(text) {
  return {
    spineEvents: [
      {
        id: 'evt-new-1',
        type: 'scene-beat',
        visibility: 'public',
        payload: {
          description: text,
        },
      },
    ],
    stateChanges: {},
    metrics: {
      coherence: 0.8,
      groundedRatio: 0.85,
      tension: 0.6,
    },
  };
}

test('step3 rejects semantic retcon/reversal against recent spine events', () => {
  const guard = runNarrativeStep3Guard({
    coreOutput: makeBaseOutput('其实城门前的伤亡从未发生，一切都是幻觉。'),
    recentSpineEvents: [
      {
        id: 'evt-old-1',
        type: 'scene-beat',
        visibility: 'public',
        payload: {
          description: '城门前的伤亡已经发生，守军正在封锁街道。',
        },
      },
    ],
  });

  assert.equal(guard.status, 'REJECTED');
  assert.equal(guard.reasonCode, NARRATIVE_REASON_CODES.NARRATIVE_SEMANTIC_CONTRADICTION);
});

test('step3 allows explicit retcon when event payload marks allowRetcon=true', () => {
  const output = makeBaseOutput('其实城门前的伤亡从未发生，一切都是幻觉。');
  output.spineEvents[0].payload.allowRetcon = true;
  const guard = runNarrativeStep3Guard({
    coreOutput: output,
    recentSpineEvents: [
      {
        id: 'evt-old-1',
        type: 'scene-beat',
        visibility: 'public',
        payload: {
          description: '城门前的伤亡已经发生，守军正在封锁街道。',
        },
      },
    ],
  });

  assert.equal(guard.status === 'APPROVED' || guard.status === 'ADJUSTED', true);
});

test('step3 rejects keyword contradiction pair (alive vs dead) with token overlap', () => {
  const guard = runNarrativeStep3Guard({
    coreOutput: makeBaseOutput('The guard captain is now dead, slain in the ambush at the gate.'),
    recentSpineEvents: [
      {
        id: 'evt-old-2',
        type: 'scene-beat',
        visibility: 'public',
        payload: {
          description: 'The guard captain is alive and commands the gate garrison.',
        },
      },
    ],
  });

  assert.equal(guard.status, 'REJECTED');
  assert.equal(guard.reasonCode, NARRATIVE_REASON_CODES.NARRATIVE_SEMANTIC_CONTRADICTION);
});

test('step3 rejects causal retcon pattern (Chinese)', () => {
  const guard = runNarrativeStep3Guard({
    coreOutput: makeBaseOutput('事实上城门守将从来没有受过伤。'),
    recentSpineEvents: [
      {
        id: 'evt-old-3',
        type: 'action',
        visibility: 'public',
        payload: {
          description: '守将在城门战斗中受了重伤。',
        },
      },
    ],
  });

  assert.equal(guard.status, 'REJECTED');
  assert.equal(guard.reasonCode, NARRATIVE_REASON_CODES.NARRATIVE_SEMANTIC_CONTRADICTION);
});

test('step3 rejects causal retcon pattern (English)', () => {
  const guard = runNarrativeStep3Guard({
    coreOutput: makeBaseOutput('Actually the merchant was never poisoned at all.'),
    recentSpineEvents: [
      {
        id: 'evt-old-4',
        type: 'scene-beat',
        visibility: 'public',
        payload: {
          description: 'The merchant collapsed after drinking the poisoned wine.',
        },
      },
    ],
  });

  assert.equal(guard.status, 'REJECTED');
  assert.equal(guard.reasonCode, NARRATIVE_REASON_CODES.NARRATIVE_SEMANTIC_CONTRADICTION);
});

test('step3 does not false-positive keyword pair when no token overlap (different subjects)', () => {
  const guard = runNarrativeStep3Guard({
    coreOutput: makeBaseOutput('村庄药师依然活着，正在救治伤员。'),
    recentSpineEvents: [
      {
        id: 'evt-old-5',
        type: 'action',
        visibility: 'public',
        payload: {
          description: '山匪头目已死，被巡逻队斩杀。',
        },
      },
    ],
  });

  assert.equal(guard.status === 'APPROVED' || guard.status === 'ADJUSTED', true);
});

test('step3 skips keyword/retcon checks when allowRetcon is true', () => {
  const output = makeBaseOutput('事实上城门守将从来没有受过伤。');
  output.spineEvents[0].payload.allowRetcon = true;
  const guard = runNarrativeStep3Guard({
    coreOutput: output,
    recentSpineEvents: [
      {
        id: 'evt-old-6',
        type: 'action',
        visibility: 'public',
        payload: {
          description: '守将在城门战斗中受了重伤。',
        },
      },
    ],
  });

  assert.equal(guard.status === 'APPROVED' || guard.status === 'ADJUSTED', true);
});
