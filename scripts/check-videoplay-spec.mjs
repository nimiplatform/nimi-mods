#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modsRoot = path.resolve(__dirname, '..');
const videoplayRoot = path.join(modsRoot, 'videoplay');
const specRoot = path.join(videoplayRoot, 'spec');
const specIndexPath = path.join(specRoot, 'index.yaml');
const ssotPath = path.join(videoplayRoot, 'SSOT.md');

function readYaml(absolutePath) {
  if (!existsSync(absolutePath)) {
    throw new Error(`Missing file: ${absolutePath}`);
  }
  const raw = readFileSync(absolutePath, 'utf8');
  const parsed = parseYaml(raw);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`YAML root must be object: ${absolutePath}`);
  }
  return parsed;
}

function readFrontMatterVersion(absolutePath) {
  const raw = readFileSync(absolutePath, 'utf8');
  const match = raw.match(/\nversion:\s*([^\n]+)/);
  if (!match) {
    throw new Error(`Cannot find version in SSOT front matter: ${absolutePath}`);
  }
  return String(match[1]).trim();
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function normalizeReasonCodesFromValue(value, acc) {
  if (Array.isArray(value)) {
    for (const item of value) {
      normalizeReasonCodesFromValue(item, acc);
    }
    return;
  }
  if (!value || typeof value !== 'object') {
    return;
  }

  for (const [key, nested] of Object.entries(value)) {
    if ((key === 'reasonCode' || key === 'reasonCodeOnMismatch') && typeof nested === 'string') {
      acc.add(nested);
    }
    normalizeReasonCodesFromValue(nested, acc);
  }
}

function main() {
  const specIndex = readYaml(specIndexPath);
  const ssotVersion = readFrontMatterVersion(ssotPath);

  assert(Array.isArray(specIndex.imports), 'spec/index.yaml imports must be an array');
  assert(specIndex.imports.length > 0, 'spec/index.yaml imports must not be empty');
  assert(typeof specIndex.ssotVersion === 'string', 'spec/index.yaml ssotVersion is required');
  assert(specIndex.ssotVersion.trim() === ssotVersion, `ssotVersion mismatch: index=${specIndex.ssotVersion} ssot=${ssotVersion}`);

  const requiredImportIds = new Set([
    'fact-projection',
    'pipeline',
    'episode-segmentation',
    'edit-compose',
    'model-routing',
    'quality-gates',
    'error-codes',
    'golden-cases',
  ]);

  const importsById = new Map();
  for (const item of specIndex.imports) {
    assert(item && typeof item === 'object', 'each import entry must be object');
    const id = String(item.id || '').trim();
    const relPath = String(item.path || '').trim();
    assert(id.length > 0, 'import.id is required');
    assert(relPath.length > 0, `import.path is required for id=${id}`);
    assert(!importsById.has(id), `duplicate import.id: ${id}`);
    const absolutePath = path.resolve(specRoot, relPath);
    importsById.set(id, {
      absolutePath,
      parsed: readYaml(absolutePath),
    });
  }

  for (const requiredId of requiredImportIds) {
    assert(importsById.has(requiredId), `missing required import id: ${requiredId}`);
  }

  const pipeline = importsById.get('pipeline')?.parsed;
  assert(Array.isArray(pipeline.execution_chain), 'pipeline.execution_chain must be an array');
  const expectedChain = [
    'narrative-ingest',
    'episode-segmentation',
    'screenplay',
    'storyboard',
    'asset-render',
    'edit-compose',
    'qc-gate',
    'release-package',
  ];
  assert(
    JSON.stringify(pipeline.execution_chain) === JSON.stringify(expectedChain),
    `pipeline.execution_chain mismatch: expected ${expectedChain.join(' -> ')}`,
  );

  const errors = importsById.get('error-codes')?.parsed;
  assert(Array.isArray(errors.codes), 'error-codes.codes must be an array');
  const errorCodeSet = new Set();
  for (const row of errors.codes) {
    assert(row && typeof row === 'object', 'error-codes entry must be object');
    const code = String(row.code || '').trim();
    assert(code.length > 0, 'error code must not be empty');
    assert(!errorCodeSet.has(code), `duplicate error code: ${code}`);
    errorCodeSet.add(code);
  }

  const quality = importsById.get('quality-gates')?.parsed;
  const weightedComponents = quality?.visual_attraction_formula?.weighted_components;
  assert(Array.isArray(weightedComponents), 'quality weighted components must be array');
  const sum = weightedComponents.reduce((acc, item) => acc + Number(item?.weight || 0), 0);
  assert(Math.abs(sum - 1) < 1e-6, `visual_attraction weights must sum to 1, got ${sum}`);

  const gatedCodes = [];
  for (const gate of Object.values(quality.gates || {})) {
    if (gate && typeof gate === 'object' && typeof gate.fail_code === 'string') {
      gatedCodes.push(gate.fail_code);
    }
  }
  for (const code of gatedCodes) {
    assert(errorCodeSet.has(code), `quality gate fail_code not declared in error-codes: ${code}`);
  }

  const routing = importsById.get('model-routing')?.parsed;
  assert(Array.isArray(routing.stages), 'model-routing.stages must be array');
  for (const stage of routing.stages) {
    const failCode = String(stage?.fail_code_when_both_unavailable || '').trim();
    assert(failCode.length > 0, 'routing stage missing fail_code_when_both_unavailable');
    assert(errorCodeSet.has(failCode), `routing fail code not declared in error-codes: ${failCode}`);
  }

  const golden = importsById.get('golden-cases')?.parsed;
  assert(Array.isArray(golden.cases), 'golden.cases must be an array');
  const referencedReasonCodes = new Set();
  normalizeReasonCodesFromValue(golden.cases, referencedReasonCodes);
  for (const code of referencedReasonCodes) {
    assert(errorCodeSet.has(code), `golden references undefined reason code: ${code}`);
  }

  process.stdout.write('[check-videoplay-spec] ok: imports, cross-reference, thresholds\n');
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[check-videoplay-spec] ${message}\n`);
  process.exit(1);
}
