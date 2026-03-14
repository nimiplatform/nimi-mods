import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORLD_STUDIO_CAPABILITIES } from '../src/contracts/capabilities.ts';
import { WORLD_STUDIO_MANIFEST } from '../src/manifest.ts';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const modDir = path.resolve(testDir, '..');

test('world-studio runtime capabilities include image generation used by the mod', () => {
  assert.ok(
    WORLD_STUDIO_CAPABILITIES.includes('runtime.media.image.generate'),
    'WORLD_STUDIO_CAPABILITIES must include runtime.media.image.generate',
  );
  assert.ok(
    WORLD_STUDIO_CAPABILITIES.includes('data.query.data-api.creator.agents.get'),
    'WORLD_STUDIO_CAPABILITIES must include creator.agents.get',
  );
  assert.ok(
    WORLD_STUDIO_CAPABILITIES.includes('data.query.data-api.creator.agents.update'),
    'WORLD_STUDIO_CAPABILITIES must include creator.agents.update',
  );
  assert.ok(
    WORLD_STUDIO_CAPABILITIES.includes('data.query.data-api.world.media-bindings.list'),
    'WORLD_STUDIO_CAPABILITIES must include world.media-bindings.list',
  );
});

test('world-studio manifest capabilities stay aligned with runtime registration capabilities', () => {
  assert.deepEqual(
    [...WORLD_STUDIO_MANIFEST.capabilities],
    [...WORLD_STUDIO_CAPABILITIES],
  );
});

test('world-studio constants use media-bindings naming and drop legacy visual-bindings constants', () => {
  const constantsSource = readFileSync(path.join(modDir, 'src/contracts/constants.ts'), 'utf8');
  assert.match(constantsSource, /WORLD_STUDIO_DATA_API_MEDIA_BINDINGS_LIST/);
  assert.doesNotMatch(constantsSource, /WORLD_STUDIO_DATA_API_VISUAL_BINDINGS_LIST/);
});
