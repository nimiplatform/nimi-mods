import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateNsfwMediaPolicy,
  isMediaGenerationAllowed,
  isPromptLikelyNsfw,
} from '../src/services/policy/nsfw-media-policy.ts';

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

test('nsfw media generation gate follows strict tri-state policy', () => {
  assert.equal(isMediaGenerationAllowed({
    policy: 'disabled',
    routeSource: 'token-api',
    prompt: 'A sunny mountain landscape.',
  }), true);
  assert.equal(isMediaGenerationAllowed({
    policy: 'disabled',
    routeSource: 'local-runtime',
    prompt: 'NSFW nude portrait',
  }), false);
  assert.equal(isMediaGenerationAllowed({
    policy: 'local-runtime-only',
    routeSource: 'token-api',
    prompt: 'adult erotic character art',
  }), false);
  assert.equal(isMediaGenerationAllowed({
    policy: 'local-runtime-only',
    routeSource: 'local-runtime',
    prompt: 'adult erotic character art',
  }), true);
  assert.equal(isMediaGenerationAllowed({
    policy: 'allowed',
    routeSource: 'token-api',
    prompt: 'adult erotic character art',
  }), true);
});

test('nsfw prompt detector keeps explicit prompts only', () => {
  assert.equal(isPromptLikelyNsfw('A detailed city skyline at sunset.'), false);
  assert.equal(isPromptLikelyNsfw('nsfw lingerie portrait, 18+'), true);
});
