import test from 'node:test';
import assert from 'node:assert/strict';

import { formatUpdatedAt, triggerSourceLabel } from '../src/ui-format.ts';

test('formatUpdatedAt follows english locale instead of forcing zh-CN', () => {
  const value = '2026-03-13T09:05:00.000Z';
  const formatted = formatUpdatedAt(value, 'en');
  assert.match(formatted, /\d/);
  assert.ok(!formatted.includes('年'));
  assert.ok(!formatted.includes('月'));
});

test('triggerSourceLabel is driven by translation keys', () => {
  const t = (key) => ({
    'timeline.triggerOpening': '开场',
    'timeline.triggerWorldEvent': '世界推进',
    'timeline.triggerNarrativeTurn': '叙事回合',
  }[key] || key);

  assert.equal(triggerSourceLabel('SystemEvent', t), '开场');
  assert.equal(triggerSourceLabel('AgentInitiative', t), '世界推进');
  assert.equal(triggerSourceLabel('UserTurn', t), '叙事回合');
});
