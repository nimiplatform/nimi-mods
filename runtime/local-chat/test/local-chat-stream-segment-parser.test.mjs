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

test('stream parser falls back to double-newline splitting for long replies', () => {
  const first = '第一段内容较长，继续展开。'.repeat(16);
  const second = '第二段继续补充细节。'.repeat(16);
  const third = '第三段做总结收束。'.repeat(16);
  const result = splitStreamReplyIntoSegments(
    `${first}\n\n${second}\n\n${third}`,
    true,
    'adaptive',
  );
  assert.equal(result.parseMode, 'double-newline');
  assert.equal(result.segments.length, 3);
});

test('stream parser merges short double-newline replies back to single message', () => {
  const result = splitStreamReplyIntoSegments(
    '好的。\n\n没问题。',
    true,
    'adaptive',
  );
  assert.equal(result.parseMode, 'single-message');
  assert.equal(result.segments.length, 1);
  assert.equal(result.segments[0], '好的。 没问题。');
});

test('stream parser merges to single message when multi-reply is disabled', () => {
  const result = splitStreamReplyIntoSegments(
    '第一段。\n\n第二段。',
    false,
    'adaptive',
  );
  assert.equal(result.parseMode, 'single-message');
  assert.equal(result.segments.length, 1);
  assert.equal(result.segments[0], '第一段。 第二段。');
});

test('stream parser caps at 4 segments', () => {
  const result = splitStreamReplyIntoSegments(
    '第一段\n\n[[SEG]]\n\n第二段\n\n[[SEG]]\n\n第三段\n\n[[SEG]]\n\n第四段\n\n[[SEG]]\n\n第五段',
    true,
    'adaptive',
  );
  assert.equal(result.segments.length, 4);
  assert.deepEqual(result.segments, ['第一段', '第二段', '第三段', '第四段']);
});

test('stream parser does not split double newlines inside code fence', () => {
  const intro = '先说一句。'.repeat(40);
  const outro = '再补一句。'.repeat(40);
  const result = splitStreamReplyIntoSegments(
    `${intro}\n\n\`\`\`ts\nconst a = 1;\n\nconst b = 2;\n\`\`\`\n\n${outro}`,
    true,
    'adaptive',
  );
  assert.equal(result.parseMode, 'double-newline');
  assert.equal(result.segments.length, 3);
  assert.equal(result.segments.join('\n').includes('const b = 2;'), true);
});

test('stream parser can be forced to single mode', () => {
  const result = splitStreamReplyIntoSegments(
    '第一段。\n\n第二段。\n\n第三段。',
    true,
    'single',
  );
  assert.equal(result.parseMode, 'single-message');
  assert.equal(result.segments.length, 1);
});

test('stream parser keeps single-message long reply when no explicit split markers', () => {
  const text = [
    '我今天一路走到山脚下时，风特别轻，天也很蓝。',
    '后来想起你前几天说过的话，突然觉得心里安稳了不少。',
    '如果你这会儿也在看晚霞，我猜你会笑着说这天色刚刚好。',
    '等你有空的时候，我们再慢慢聊，把今天的细节都讲给你听。',
  ].join('');
  const result = splitStreamReplyIntoSegments(text, true, 'adaptive');
  assert.equal(result.parseMode, 'single-message');
  assert.equal(result.segments.length, 1);
});

test('stream parser keeps short multi-message when combined length reaches threshold', () => {
  const result = splitStreamReplyIntoSegments(
    '哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈。\n\n你太搞笑了哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈。',
    true,
    'adaptive',
  );
  assert.equal(result.parseMode, 'double-newline');
  assert.equal(result.segments.length, 2);
});
