import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveOnlineBadgeState, resolveUnreadBadge } from '../src/components/layout/local-chat-target-pane.tsx';

test('target pane hides online and unread indicators when values are missing', () => {
  assert.equal(resolveOnlineBadgeState(undefined), null);
  assert.equal(resolveUnreadBadge(undefined), null);
  assert.equal(resolveUnreadBadge(0), null);
});

test('target pane shows online/offline and unread badge when values exist', () => {
  assert.equal(resolveOnlineBadgeState(true), 'online');
  assert.equal(resolveOnlineBadgeState(false), 'offline');
  assert.equal(resolveUnreadBadge(3), '3');
  assert.equal(resolveUnreadBadge(120), '99+');
});
