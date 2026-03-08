import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateNsfwMediaPolicy,
  isMediaGenerationAllowed,
  isPromptLikelyNsfw,
} from '../src/services/policy/nsfw-media-policy.ts';

test('nsfw policy keeps token-api on safe boundary by default', () => {
  assert.equal(
    evaluateNsfwMediaPolicy({
      routeSource: 'local-runtime',
      relationshipBoundaryPreset: 'balanced',
      visualComfortLevel: 'soft-visuals',
    }),
    'disabled',
  );
  assert.equal(
    evaluateNsfwMediaPolicy({
      routeSource: 'token-api',
      relationshipBoundaryPreset: 'close',
      visualComfortLevel: 'natural-visuals',
    }),
    'local-runtime-only',
  );
});

test('nsfw policy is local-runtime-only on token-api even for close natural visuals', () => {
  assert.equal(
    evaluateNsfwMediaPolicy({
      routeSource: 'token-api',
      relationshipBoundaryPreset: 'close',
      visualComfortLevel: 'natural-visuals',
    }),
    'local-runtime-only',
  );
});

test('nsfw policy is allowed only for local runtime with close natural visuals', () => {
  assert.equal(
    evaluateNsfwMediaPolicy({
      routeSource: 'local-runtime',
      relationshipBoundaryPreset: 'close',
      visualComfortLevel: 'natural-visuals',
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
