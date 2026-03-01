#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modsRoot = path.resolve(__dirname, '..');
const modRoot = path.join(modsRoot, 'textplay');
const specRoot = path.join(modRoot, 'spec');
const specIndexPath = path.join(specRoot, 'index.yaml');
const ssotPath = path.join(modRoot, 'SSOT.md');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readYaml(absolutePath) {
  if (!existsSync(absolutePath)) {
    throw new Error(`Missing file: ${absolutePath}`);
  }
  const parsed = parseYaml(readFileSync(absolutePath, 'utf8'));
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`YAML root must be object: ${absolutePath}`);
  }
  return parsed;
}

function readFrontMatterVersion(absolutePath) {
  const raw = readFileSync(absolutePath, 'utf8');
  const match = raw.match(/\nversion:\s*([^\n]+)/);
  if (!match) {
    throw new Error(`Cannot find version in front matter: ${absolutePath}`);
  }
  return String(match[1]).trim();
}

function collectReasonCodes(value, out) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectReasonCodes(item, out);
    }
    return;
  }
  if (!value || typeof value !== 'object') {
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if ((key === 'reasonCode' || key === 'reasonCodeOnMismatch') && typeof nested === 'string') {
      out.add(nested);
    }
    collectReasonCodes(nested, out);
  }
}

function main() {
  const index = readYaml(specIndexPath);
  const ssotVersion = readFrontMatterVersion(ssotPath);

  assert(index.modId === 'world.nimi.textplay', 'spec.modId must be world.nimi.textplay');
  assert(index.ssotVersion === ssotVersion, `ssotVersion mismatch: ${index.ssotVersion} vs ${ssotVersion}`);
  assert(Array.isArray(index.imports) && index.imports.length > 0, 'imports must be non-empty array');

  const requiredIds = new Set([
    'fact-projection',
    'pipeline',
    'io-schema',
    'visibility-pov',
    'presence-state',
    'error-codes',
    'golden-cases',
  ]);

  const importsById = new Map();
  for (const item of index.imports) {
    const id = String(item?.id || '').trim();
    const relPath = String(item?.path || '').trim();
    assert(id.length > 0, 'import.id is required');
    assert(relPath.length > 0, `import.path required for ${id}`);
    assert(!importsById.has(id), `duplicate import id: ${id}`);
    importsById.set(id, readYaml(path.resolve(specRoot, relPath)));
  }

  for (const id of requiredIds) {
    assert(importsById.has(id), `missing import id: ${id}`);
  }

  const pipeline = importsById.get('pipeline');
  const expectedChain = ['received', 'normalize', 'filter-visibility', 'build-prompt', 'generate', 'wrap-output', 'persist-best-effort'];
  assert(
    JSON.stringify(pipeline.execution_chain) === JSON.stringify(expectedChain),
    `pipeline.execution_chain mismatch: expected ${expectedChain.join(' -> ')}`,
  );

  const ioSchema = importsById.get('io-schema');
  const presenceStates = ioSchema?.enums?.PresenceState;
  assert(Array.isArray(presenceStates), 'io-schema PresenceState must be array');
  const requiredStates = ['composing', 'paused', 'active', 'idle', 'away'];
  for (const state of requiredStates) {
    assert(presenceStates.includes(state), `missing PresenceState: ${state}`);
  }

  const visibilityPov = importsById.get('visibility-pov');
  assert(visibilityPov.constraints?.visibility_filter_must_apply === true, 'visibility filter must apply');
  assert(visibilityPov.constraints?.pov_constraint_must_apply === true, 'pov constraint must apply');

  const presenceContract = importsById.get('presence-state');
  assert(Array.isArray(presenceContract.states), 'presence-state.states must be array');
  for (const state of requiredStates) {
    assert(presenceContract.states.includes(state), `presence-state missing state: ${state}`);
  }

  const errors = importsById.get('error-codes');
  assert(Array.isArray(errors.codes), 'error-codes.codes must be array');
  const codeSet = new Set();
  for (const row of errors.codes) {
    const code = String(row?.code || '').trim();
    assert(code.length > 0, 'error code must not be empty');
    assert(!codeSet.has(code), `duplicate error code: ${code}`);
    codeSet.add(code);
  }

  const golden = importsById.get('golden-cases');
  assert(golden.modId === 'world.nimi.textplay', 'golden modId must be world.nimi.textplay');
  assert(Array.isArray(golden.cases), 'golden cases must be array');
  const referencedCodes = new Set();
  collectReasonCodes(golden.cases, referencedCodes);
  for (const code of referencedCodes) {
    assert(codeSet.has(code), `golden references undefined reason code: ${code}`);
  }

  process.stdout.write('[check-textplay-spec] ok: imports, cross-reference, invariants\n');
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[check-textplay-spec] ${message}\n`);
  process.exit(1);
}
