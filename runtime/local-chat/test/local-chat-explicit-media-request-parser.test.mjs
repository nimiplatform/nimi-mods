import test from 'node:test';
import assert from 'node:assert/strict';
import { parseExplicitMediaRequest } from '../src/hooks/turn-send/explicit-media-request-parser.ts';

test('explicit media request parser detects Chinese image request', () => {
  const parsed = parseExplicitMediaRequest('帮我生成一张海边夜景图片');
  assert.ok(parsed);
  assert.equal(parsed?.kind, 'image');
  assert.equal(parsed?.prompt.includes('海边夜景'), true);
});

test('explicit media request parser detects English video request', () => {
  const parsed = parseExplicitMediaRequest('Please make me a short video of that moment');
  assert.ok(parsed);
  assert.equal(parsed?.kind, 'video');
});

test('explicit media request parser prefers video when both image and video are mentioned', () => {
  const parsed = parseExplicitMediaRequest('给我来张图，再顺手做个视频');
  assert.ok(parsed);
  assert.equal(parsed?.kind, 'video');
});

test('explicit media request parser keeps photo requests as image when prompt mentions looking at the camera', () => {
  const parsed = parseExplicitMediaRequest('给我发一张你坐在床边看着镜头的照片');
  assert.ok(parsed);
  assert.equal(parsed?.kind, 'image');
});

test('explicit media request parser ignores negative requests', () => {
  const parsed = parseExplicitMediaRequest('先别发图，也不要做视频');
  assert.equal(parsed, null);
});

test('explicit media request parser ignores non-request mentions', () => {
  const parsed = parseExplicitMediaRequest('这段对话很有画面感，像一部电影。');
  assert.equal(parsed, null);
});
