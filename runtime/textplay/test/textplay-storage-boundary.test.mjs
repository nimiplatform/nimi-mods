import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function walkFiles(rootDir) {
  const files = [];
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
      continue;
    }
    if (entry.isFile() && /\.(ts|tsx|js|mjs)$/i.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function hasForbiddenBrowserStorage(sourceText) {
  return /(?:localStorage|sessionStorage|indexedDB|window\.localStorage|window\.sessionStorage|window\.indexedDB)/.test(sourceText);
}

test('textplay and narrative-engine keep browser storage apis out of source layer', () => {
  const textplaySrc = path.resolve(import.meta.dirname, '../src');
  const narrativeEngineSrc = path.resolve(import.meta.dirname, '../../../modules/narrative-engine/src');
  const allFiles = [
    ...walkFiles(textplaySrc),
    ...walkFiles(narrativeEngineSrc),
  ];

  const offenders = [];
  for (const filePath of allFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    if (hasForbiddenBrowserStorage(content)) {
      offenders.push(filePath);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Forbidden browser storage APIs detected:\n${offenders.join('\n')}`,
  );
});
