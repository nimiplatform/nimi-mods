import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateNsfwMediaPolicy } from '../src/services/policy/nsfw-media-policy.ts';

test('nsfw policy defaults to disabled when setting is false', () => {
  assert.equal(
    evaluateNsfwMediaPolicy({
      allowNsfwMedia: false,
      routeSource: 'local-runtime',
    }),
    'disabled',
  );
  assert.equal(
    evaluateNsfwMediaPolicy({
      allowNsfwMedia: false,
      routeSource: 'token-api',
    }),
    'disabled',
  );
});

test('nsfw policy is local-runtime-only when enabled but route is not local runtime', () => {
  assert.equal(
    evaluateNsfwMediaPolicy({
      allowNsfwMedia: true,
      routeSource: 'token-api',
    }),
    'local-runtime-only',
  );
});

test('nsfw policy is allowed only when enabled on local runtime', () => {
  assert.equal(
    evaluateNsfwMediaPolicy({
      allowNsfwMedia: true,
      routeSource: 'local-runtime',
    }),
    'allowed',
  );
});
