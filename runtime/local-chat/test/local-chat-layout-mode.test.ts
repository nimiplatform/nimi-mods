import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LOCAL_CHAT_DESKTOP_LAYOUT_BREAKPOINT_PX,
  resolveLocalChatLayoutMode,
} from '../src/components/layout/local-chat-layout-mode.ts';

test('resolveLocalChatLayoutMode keeps compact layout below desktop breakpoint', () => {
  assert.equal(resolveLocalChatLayoutMode(LOCAL_CHAT_DESKTOP_LAYOUT_BREAKPOINT_PX - 1), 'compact');
});

test('resolveLocalChatLayoutMode switches to desktop layout at breakpoint and above', () => {
  assert.equal(resolveLocalChatLayoutMode(LOCAL_CHAT_DESKTOP_LAYOUT_BREAKPOINT_PX), 'desktop');
  assert.equal(resolveLocalChatLayoutMode(1440), 'desktop');
});

test('resolveLocalChatLayoutMode falls back to compact layout when width is missing', () => {
  assert.equal(resolveLocalChatLayoutMode(null), 'compact');
  assert.equal(resolveLocalChatLayoutMode(undefined), 'compact');
});
