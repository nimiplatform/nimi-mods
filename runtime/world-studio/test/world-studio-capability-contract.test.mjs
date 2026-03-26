import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORLD_STUDIO_CAPABILITIES } from '../src/contracts/capabilities.ts';
import { WORLD_STUDIO_MANIFEST } from '../src/manifest.ts';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const modDir = path.resolve(testDir, '..');

function readManifestCapabilities() {
  const source = readFileSync(path.join(modDir, 'mod.manifest.yaml'), 'utf8');
  const sectionMatch = source.match(/^capabilities:\n([\s\S]*?)^(?:[a-z][^:\n]*:|\Z)/m);
  assert.ok(sectionMatch, 'mod.manifest.yaml must declare a capabilities section');
  return sectionMatch[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim());
}

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
    WORLD_STUDIO_CAPABILITIES.includes('data.query.data-api.world.bindings.list'),
    'WORLD_STUDIO_CAPABILITIES must include world.bindings.list',
  );
  assert.ok(
    WORLD_STUDIO_CAPABILITIES.includes('data.query.data-api.world.state.get'),
    'WORLD_STUDIO_CAPABILITIES must include world.state.get',
  );
  assert.ok(
    WORLD_STUDIO_CAPABILITIES.includes('data.query.data-api.core.worldview.by-id.get'),
    'WORLD_STUDIO_CAPABILITIES must include core.worldview.by-id.get',
  );
});

test('world-studio yaml manifest capabilities stay aligned with runtime registration capabilities', () => {
  const yamlCapabilities = readManifestCapabilities();
  assert.deepEqual(
    [...yamlCapabilities],
    [...WORLD_STUDIO_CAPABILITIES],
  );
});

test('world-studio runtime manifest object stays aligned with yaml manifest capabilities', () => {
  const yamlCapabilities = readManifestCapabilities();
  assert.deepEqual(
    [...WORLD_STUDIO_MANIFEST.capabilities],
    [...yamlCapabilities],
  );
});

test('world-studio constants use canonical bindings naming and drop legacy visual-bindings constants', () => {
  const constantsSource = readFileSync(path.join(modDir, 'src/contracts/constants.ts'), 'utf8');
  assert.match(constantsSource, /WORLD_STUDIO_DATA_API_BINDINGS_LIST/);
  assert.doesNotMatch(constantsSource, /WORLD_STUDIO_DATA_API_VISUAL_BINDINGS_LIST/);
});
