import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLD_STUDIO_CAPABILITIES } from '../src/contracts/capabilities.ts';
import { WORLD_STUDIO_MANIFEST } from '../src/manifest.ts';

test('world-studio runtime capabilities include image generation used by the mod', () => {
  assert.ok(
    WORLD_STUDIO_CAPABILITIES.includes('runtime.media.image.generate'),
    'WORLD_STUDIO_CAPABILITIES must include runtime.media.image.generate',
  );
});

test('world-studio manifest capabilities stay aligned with runtime registration capabilities', () => {
  assert.deepEqual(
    [...WORLD_STUDIO_MANIFEST.capabilities],
    [...WORLD_STUDIO_CAPABILITIES],
  );
});
