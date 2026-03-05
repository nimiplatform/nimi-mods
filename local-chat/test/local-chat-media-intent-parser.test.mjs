import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMediaIntent } from '../src/hooks/turn-send/media-intent-parser.ts';

test('media intent parser extracts IMG and VID tags and strips markers', () => {
  const parsed = parseMediaIntent({
    text: '给你一张图 [[IMG:cinematic portrait, warm light]] 然后一个视频 [[VID:slow pan over neon city]]',
    userText: '来点赛博朋克',
    triggerMode: 'marker_plus_heuristic',
  });
  assert.equal(parsed.intents.length, 2);
  assert.equal(parsed.intents[0]?.type, 'image');
  assert.equal(parsed.intents[1]?.type, 'video');
  assert.equal(parsed.cleanedText.includes('[[IMG:'), false);
  assert.equal(parsed.cleanedText.includes('[[VID:'), false);
});

test('media intent parser supports escaped marker literal', () => {
  const parsed = parseMediaIntent({
    text: '\\[[IMG:literal marker]]',
    triggerMode: 'marker_only',
  });
  assert.equal(parsed.intents.length, 0);
  assert.equal(parsed.cleanedText, '[[IMG:literal marker]]');
});

test('media intent parser supports image heuristic fallback', () => {
  const parsed = parseMediaIntent({
    text: '我来给你生成一张图，氛围感拉满。',
    userText: '想看海边夜景',
    triggerMode: 'marker_plus_heuristic',
  });
  assert.equal(parsed.intents.length, 1);
  assert.equal(parsed.intents[0]?.type, 'image');
  assert.equal(parsed.intents[0]?.triggerSource, 'heuristic');
});

test('media intent parser treats malformed tag as invalid and keeps literal text', () => {
  const parsed = parseMediaIntent({
    text: '这里有个坏标记 [[IMG:still-open',
    triggerMode: 'marker_only',
  });
  assert.equal(parsed.intents.length, 0);
  assert.equal(parsed.invalidTagCount, 1);
  assert.equal(parsed.cleanedText.includes('[[IMG:still-open'), true);
});

test('media intent parser auto-builds prompt for empty markers', () => {
  const parsed = parseMediaIntent({
    text: '[[IMG:]] [[IMG:cinematic lake at dawn]] [[IMG:   ]]',
    userText: '我想看清晨湖面',
    triggerMode: 'marker_only',
  });
  assert.equal(parsed.intents.length, 3);
  assert.equal(parsed.intents.every((intent) => intent.type === 'image'), true);
  assert.equal(parsed.intents.some((intent) => intent.prompt === 'cinematic lake at dawn'), true);
  assert.equal(parsed.intents.every((intent) => intent.prompt.length > 0), true);
  assert.equal(parsed.invalidTagCount, 0);
});

test('media intent parser supports multiple markers of the same type', () => {
  const parsed = parseMediaIntent({
    text: '[[IMG:cat portrait]] 然后 [[IMG:dog portrait]]',
    triggerMode: 'marker_only',
  });
  assert.equal(parsed.intents.length, 2);
  assert.equal(parsed.intents[0]?.prompt, 'cat portrait');
  assert.equal(parsed.intents[1]?.prompt, 'dog portrait');
});

test('media intent parser keeps marker_only mode strict', () => {
  const parsed = parseMediaIntent({
    text: '我来给你生成一张图，马上好。',
    triggerMode: 'marker_only',
  });
  assert.equal(parsed.intents.length, 0);
});

test('media intent parser does not trigger heuristic on broad illustration nouns', () => {
  const parsed = parseMediaIntent({
    text: 'The book has beautiful illustrations and design.',
    triggerMode: 'marker_plus_heuristic',
  });
  assert.equal(parsed.intents.length, 0);
});
