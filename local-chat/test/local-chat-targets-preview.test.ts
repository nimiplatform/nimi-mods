import test from 'node:test';
import assert from 'node:assert/strict';

import { areTargetsRenderEquivalent } from '../src/hooks/use-local-chat-targets.ts';

test('areTargetsRenderEquivalent returns true for identical render-facing target data', () => {
  assert.equal(
    areTargetsRenderEquivalent(
      [{
        id: 'target-1',
        displayName: 'Ziling',
        handle: '~ziling',
        avatarUrl: null,
        bio: 'bio',
        latestLocalMessage: 'hello',
        latestLocalMessageAt: '2026-03-09T10:00:00.000Z',
      }],
      [{
        id: 'target-1',
        displayName: 'Ziling',
        handle: '~ziling',
        avatarUrl: null,
        bio: 'bio',
        latestLocalMessage: 'hello',
        latestLocalMessageAt: '2026-03-09T10:00:00.000Z',
      }],
    ),
    true,
  );
});

test('areTargetsRenderEquivalent returns false when preview text changes', () => {
  assert.equal(
    areTargetsRenderEquivalent(
      [{
        id: 'target-1',
        displayName: 'Ziling',
        handle: '~ziling',
        latestLocalMessage: 'old',
        latestLocalMessageAt: '2026-03-09T10:00:00.000Z',
      }],
      [{
        id: 'target-1',
        displayName: 'Ziling',
        handle: '~ziling',
        latestLocalMessage: 'new',
        latestLocalMessageAt: '2026-03-09T10:00:00.000Z',
      }],
    ),
    false,
  );
});
