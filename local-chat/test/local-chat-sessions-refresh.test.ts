import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveSessionUpdateRefreshMode } from '../src/hooks/use-local-chat-sessions.ts';

test('session update refresh mode skips unrelated target updates', () => {
  assert.equal(resolveSessionUpdateRefreshMode({
    selectedTargetId: 'target-a',
    selectedSessionId: 'session-a',
    eventTargetId: 'target-b',
    eventSessionId: 'session-a',
  }), 'skip');
});

test('session update refresh mode skips mismatched session updates', () => {
  assert.equal(resolveSessionUpdateRefreshMode({
    selectedTargetId: 'target-a',
    selectedSessionId: 'session-a',
    eventTargetId: 'target-a',
    eventSessionId: 'session-b',
  }), 'skip');
});

test('session update refresh mode keeps current session on artifact-only refresh', () => {
  assert.equal(resolveSessionUpdateRefreshMode({
    selectedTargetId: 'target-a',
    selectedSessionId: 'session-a',
    eventTargetId: 'target-a',
    eventSessionId: 'session-a',
  }), 'artifacts');
});
