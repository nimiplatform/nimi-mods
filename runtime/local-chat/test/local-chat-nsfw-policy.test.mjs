import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateNsfwMediaPolicy,
  isMediaGenerationAllowed,
  isPromptLikelyNsfw,
} from '../src/services/policy/nsfw-media-policy.ts';

test('nsfw policy keeps cloud on safe boundary by default', () => {
  assert.equal(
    evaluateNsfwMediaPolicy({
      routeSource: 'local',
      visualComfortLevel: 'restrained-visuals',
    }),
    'disabled',
  );
  assert.equal(
    evaluateNsfwMediaPolicy({
      routeSource: 'cloud',
      visualComfortLevel: 'natural-visuals',
    }),
    'local-only',
  );
});

test('nsfw policy is local-only on cloud even for close natural visuals', () => {
  assert.equal(
    evaluateNsfwMediaPolicy({
      routeSource: 'cloud',
      visualComfortLevel: 'natural-visuals',
    }),
    'local-only',
  );
});

test('nsfw policy is allowed for local runtime with natural visuals', () => {
  assert.equal(
    evaluateNsfwMediaPolicy({
      routeSource: 'local',
      visualComfortLevel: 'natural-visuals',
    }),
    'allowed',
  );
});

test('nsfw media generation gate follows strict tri-state policy', () => {
  assert.equal(isMediaGenerationAllowed({
    policy: 'disabled',
    routeSource: 'cloud',
    prompt: 'A sunny mountain landscape.',
  }), true);
  assert.equal(isMediaGenerationAllowed({
    policy: 'disabled',
    routeSource: 'local',
    prompt: 'NSFW nude portrait',
  }), false);
  assert.equal(isMediaGenerationAllowed({
    policy: 'local-only',
    routeSource: 'cloud',
    prompt: 'adult erotic character art',
  }), false);
  assert.equal(isMediaGenerationAllowed({
    policy: 'local-only',
    routeSource: 'local',
    prompt: 'adult erotic character art',
  }), true);
  assert.equal(isMediaGenerationAllowed({
    policy: 'allowed',
    routeSource: 'cloud',
    prompt: 'adult erotic character art',
  }), true);
});

test('nsfw prompt detector keeps explicit prompts only', () => {
  assert.equal(isPromptLikelyNsfw('A detailed city skyline at sunset.'), false);
  assert.equal(isPromptLikelyNsfw('nsfw lingerie portrait, 18+'), true);
  assert.equal(isPromptLikelyNsfw('topless explicit adult portrait'), true);
  assert.equal(isPromptLikelyNsfw('半裸情色写真，带呻吟和高潮暗示'), true);
  assert.equal(isPromptLikelyNsfw('今晚一起散步吧，抱一下就好。'), false);
});
