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
