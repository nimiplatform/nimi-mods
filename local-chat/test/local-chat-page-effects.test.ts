import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMessageTailKey,
  resolveAutoScrollBehavior,
} from '../src/hooks/controller/use-local-chat-page-effects.ts';

test('buildMessageTailKey captures last message identity and content length', () => {
  assert.equal(
    buildMessageTailKey([
      { id: 'm1', kind: 'text', content: 'hello' },
      { id: 'm2', kind: 'voice', content: 'world!' },
    ]),
    '2:m2:voice:6',
  );
});

test('resolveAutoScrollBehavior uses auto for first stable render', () => {
  assert.equal(
    resolveAutoScrollBehavior({
      loadingSessions: false,
      previous: null,
      next: {
        targetId: 'target-1',
        sessionId: 'session-1',
        messageTailKey: '1:m1:text:5',
        pendingState: 'settled',
      },
    }),
    'auto',
  );
});

test('resolveAutoScrollBehavior uses auto when target or session changes', () => {
  assert.equal(
    resolveAutoScrollBehavior({
      loadingSessions: false,
      previous: {
        targetId: 'target-1',
        sessionId: 'session-1',
        messageTailKey: '2:m2:text:8',
        pendingState: 'settled',
      },
      next: {
        targetId: 'target-2',
        sessionId: 'session-2',
        messageTailKey: '10:m9:text:12',
        pendingState: 'settled',
      },
    }),
    'auto',
  );
});

test('resolveAutoScrollBehavior uses auto for new message arrival in same thread', () => {
  assert.equal(
    resolveAutoScrollBehavior({
      loadingSessions: false,
      previous: {
        targetId: 'target-1',
        sessionId: 'session-1',
        messageTailKey: '2:m2:text:8',
        pendingState: 'settled',
      },
      next: {
        targetId: 'target-1',
        sessionId: 'session-1',
        messageTailKey: '3:m3:text:12',
        pendingState: 'settled',
      },
    }),
    'auto',
  );
});

test('resolveAutoScrollBehavior uses auto when current-turn card settles in same thread', () => {
  assert.equal(
    resolveAutoScrollBehavior({
      loadingSessions: false,
      previous: {
        targetId: 'target-1',
        sessionId: 'session-1',
        messageTailKey: '3:m3:voice:0',
        pendingState: 'pending',
      },
      next: {
        targetId: 'target-1',
        sessionId: 'session-1',
        messageTailKey: '3:m3:voice:0',
        pendingState: 'settled',
      },
    }),
    'auto',
  );
});

test('resolveAutoScrollBehavior skips when nothing relevant changed', () => {
  assert.equal(
    resolveAutoScrollBehavior({
      loadingSessions: false,
      previous: {
        targetId: 'target-1',
        sessionId: 'session-1',
        messageTailKey: '2:m2:text:8',
        pendingState: 'settled',
      },
      next: {
        targetId: 'target-1',
        sessionId: 'session-1',
        messageTailKey: '2:m2:text:8',
        pendingState: 'settled',
      },
    }),
    'skip',
  );
});

test('resolveAutoScrollBehavior skips while sessions are still loading', () => {
  assert.equal(
    resolveAutoScrollBehavior({
      loadingSessions: true,
      previous: {
        targetId: 'target-1',
        sessionId: 'session-1',
        messageTailKey: '2:m2:text:8',
        pendingState: 'settled',
      },
      next: {
        targetId: 'target-1',
        sessionId: 'session-1',
        messageTailKey: '3:m3:text:12',
        pendingState: 'settled',
      },
    }),
    'skip',
  );
});
