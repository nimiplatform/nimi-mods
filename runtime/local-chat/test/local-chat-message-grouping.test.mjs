import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMessageVisualGroups } from '../src/components/layout/message-grouping.ts';

function createMessage(input) {
  return {
    id: input.id,
    role: input.role,
    kind: input.kind || 'text',
    content: input.content || '',
    timestamp: new Date(input.timestamp),
  };
}

test('groups continuous same-role messages within 180s', () => {
  const messages = [
    createMessage({ id: 'm1', role: 'assistant', timestamp: '2026-03-01T10:00:00.000Z' }),
    createMessage({ id: 'm2', role: 'assistant', timestamp: '2026-03-01T10:01:30.000Z' }),
    createMessage({ id: 'm3', role: 'assistant', timestamp: '2026-03-01T10:02:00.000Z' }),
  ];

  const groups = buildMessageVisualGroups(messages);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].items.length, 3);
  assert.equal(groups[0].items[0].showAvatar, true);
  assert.equal(groups[0].items[1].showAvatar, false);
  assert.equal(groups[0].items[2].showAvatar, true);
  assert.equal(groups[0].items[0].showTimestamp, false);
  assert.equal(groups[0].items[2].showTimestamp, true);
});

test('splits group when time gap exceeds 180s', () => {
  const messages = [
    createMessage({ id: 'm1', role: 'assistant', timestamp: '2026-03-01T10:00:00.000Z' }),
    createMessage({ id: 'm2', role: 'assistant', timestamp: '2026-03-01T10:03:01.000Z' }),
  ];

  const groups = buildMessageVisualGroups(messages);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].items[0].position, 'single');
  assert.equal(groups[1].items[0].position, 'single');
});

test('always splits at streaming boundary', () => {
  const messages = [
    createMessage({ id: 'm1', role: 'assistant', kind: 'text', timestamp: '2026-03-01T10:00:00.000Z' }),
    createMessage({ id: 'm2', role: 'assistant', kind: 'streaming', timestamp: '2026-03-01T10:00:10.000Z' }),
    createMessage({ id: 'm3', role: 'assistant', kind: 'text', timestamp: '2026-03-01T10:00:20.000Z' }),
  ];

  const groups = buildMessageVisualGroups(messages);
  assert.equal(groups.length, 3);
  assert.equal(groups[1].items[0].message.kind, 'streaming');
});
