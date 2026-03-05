import test from 'node:test';
import assert from 'node:assert/strict';
import { splitStreamReplyIntoSegments } from '../src/hooks/turn-send/text-turn-runner.ts';

test('stream parser prefers explicit [[SEG]] delimiter', () => {
  const result = splitStreamReplyIntoSegments(
    '第一段。\n\n[[SEG]]\n\n第二段。\n\n[[SEG]]\n\n第三段。',
    true,
  );
  assert.equal(result.parseMode, 'explicit-delimiter');
  assert.deepEqual(result.segments, ['第一段。', '第二段。', '第三段。']);
});

test('stream parser falls back to double-newline splitting', () => {
  const result = splitStreamReplyIntoSegments(
    '第一段。\n\n第二段。\n\n第三段。',
    true,
  );
  assert.equal(result.parseMode, 'double-newline');
  assert.deepEqual(result.segments, ['第一段。', '第二段。', '第三段。']);
});

test('stream parser merges to single message when multi-reply is disabled', () => {
  const result = splitStreamReplyIntoSegments(
    '第一段。\n\n第二段。',
    false,
  );
  assert.equal(result.parseMode, 'single-message');
  assert.equal(result.segments.length, 1);
  assert.equal(result.segments[0], '第一段。 第二段。');
});

test('stream parser caps at 4 segments', () => {
  const result = splitStreamReplyIntoSegments(
    '第一段\n\n[[SEG]]\n\n第二段\n\n[[SEG]]\n\n第三段\n\n[[SEG]]\n\n第四段\n\n[[SEG]]\n\n第五段',
    true,
  );
  assert.equal(result.segments.length, 4);
  assert.deepEqual(result.segments, ['第一段', '第二段', '第三段', '第四段']);
});
