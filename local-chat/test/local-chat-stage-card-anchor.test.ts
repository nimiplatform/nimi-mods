import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveStageCardAnchorOffset } from '../src/components/layout/stage-card-anchor.ts';

test('resolveStageCardAnchorOffset aligns to avatar center when center is within stage bounds', () => {
  const offset = resolveStageCardAnchorOffset({
    avatarRect: { top: 200, height: 180 },
    stageRect: { top: 100, height: 700 },
  });

  assert.equal(offset, 190);
});

test('resolveStageCardAnchorOffset clamps to a safe upper bound near the top edge', () => {
  const offset = resolveStageCardAnchorOffset({
    avatarRect: { top: 90, height: 120 },
    stageRect: { top: 100, height: 700 },
  });

  assert.equal(offset, 126);
});

test('resolveStageCardAnchorOffset clamps to a safe lower bound near the bottom edge', () => {
  const offset = resolveStageCardAnchorOffset({
    avatarRect: { top: 940, height: 180 },
    stageRect: { top: 100, height: 700 },
  });

  assert.equal(offset, 574);
});
