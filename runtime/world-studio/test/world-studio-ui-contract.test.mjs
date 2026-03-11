import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const modDir = path.resolve(testDir, '..');

function readModFile(relativePath) {
  return readFileSync(path.join(modDir, relativePath), 'utf8');
}

test('world-studio manifest declares css entry for UI runtime shell', () => {
  const manifest = readModFile('mod.manifest.yaml');
  assert.match(manifest, /^styles:\s*$/m);
  assert.match(manifest, /^\s*-\s+\.\/dist\/mods\/world-studio\/index\.css\s*$/m);
});

test('world-studio page root keeps the required mod root marker', () => {
  const pageSource = readModFile('src/world-studio-page.tsx');
  assert.match(pageSource, /data-nimi-mod-root="world-studio"/);
});
