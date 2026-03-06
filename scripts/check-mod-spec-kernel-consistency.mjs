#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { getConfig } from './spec-kernel-config.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const modsRoot = path.resolve(scriptDir, '..');
const CAPABILITY_KEY_RE = /^(runtime|event|action|llm|data|ui|turn|inter-mod|hook|audit|meta)\./;

function parseArgs(argv) {
  let mod = '';
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--mod') {
      mod = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }
  if (!mod) {
    throw new Error('missing --mod');
  }
  return { mod };
}

function fail(message) {
  throw new Error(message);
}

function readText(filePath) {
  if (!existsSync(filePath)) {
    fail(`missing file: ${filePath}`);
  }
  return readFileSync(filePath, 'utf8');
}

function readYaml(filePath) {
  const parsed = parseYaml(readText(filePath));
  if (!parsed || typeof parsed !== 'object') {
    fail(`YAML root must be object: ${filePath}`);
  }
  return parsed;
}

function readPackageJson(modDir) {
  const packageJsonPath = path.join(modDir, 'package.json');
  if (!existsSync(packageJsonPath)) {
    return null;
  }
  const raw = readText(packageJsonPath);
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }
  return parsed;
}

function collectSourceRules(value, out) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectSourceRules(item, out);
    }
    return;
  }
  if (!value || typeof value !== 'object') {
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (key === 'source_rule' && typeof nested === 'string') {
      out.add(nested.trim());
    }
    collectSourceRules(nested, out);
  }
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
    if ((key === 'reason_code' || key === 'mismatch_reason_code') && typeof nested === 'string' && nested.trim().length > 0) {
      out.add(nested.trim());
    }
    collectReasonCodes(nested, out);
  }
}

function collectCapabilityKeys(value, out) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectCapabilityKeys(item, out);
    }
    return;
  }
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string') {
      const text = value.trim();
      if (CAPABILITY_KEY_RE.test(text)) {
        out.add(text);
      }
    }
    return;
  }
  for (const nested of Object.values(value)) {
    collectCapabilityKeys(nested, out);
  }
}

function normalizeCommandList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((row) => {
      if (row && typeof row === 'object') {
        return String(row.command || '').trim();
      }
      return String(row || '').trim();
    })
    .filter(Boolean);
}

function checkAcceptanceCoverage(mod, acceptanceTable, config, modDir) {
  const cases = Array.isArray(acceptanceTable?.cases) ? acceptanceTable.cases : [];
  if (cases.length === 0) {
    fail(`[${mod}] acceptance cases table is empty`);
  }

  const caseIdSet = new Set();
  for (const row of cases) {
    const id = String(row?.id || '').trim();
    if (!id) {
      fail(`[${mod}] acceptance case id is empty`);
    }
    if (caseIdSet.has(id)) {
      fail(`[${mod}] duplicated acceptance case id: ${id}`);
    }
    caseIdSet.add(id);

    const testReference = String(row?.test_reference || '').trim();
    if (testReference) {
      const inTestDir = path.join(modDir, 'test', testReference);
      const inModDir = path.join(modDir, testReference);
      if (!existsSync(inTestDir) && !existsSync(inModDir)) {
        fail(`[${mod}] acceptance test_reference not found: ${testReference}`);
      }
    }
  }

  const requiredCaseIds = Array.isArray(config.requiredAcceptanceCaseIds) ? config.requiredAcceptanceCaseIds : [];
  for (const caseId of requiredCaseIds) {
    if (!caseIdSet.has(caseId)) {
      fail(`[${mod}] missing required acceptance case: ${caseId}`);
    }
  }

  const commands = normalizeCommandList(acceptanceTable?.verification_commands);
  const commandSet = new Set(commands);
  const requiredCommands = Array.isArray(config.requiredVerificationCommands) ? config.requiredVerificationCommands : [];
  for (const command of requiredCommands) {
    if (!commandSet.has(command)) {
      fail(`[${mod}] missing required verification command: ${command}`);
    }
  }
}

function findManifestPath(modDir) {
  for (const filename of ['mod.manifest.yaml', 'mod.manifest.yml', 'mod.manifest.json']) {
    const candidate = path.join(modDir, filename);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return '';
}

function readManifestCapabilities(modDir) {
  const packageJson = readPackageJson(modDir);
  const packageKind = String(packageJson?.nimiPackageKind || '').trim();
  const manifestPath = findManifestPath(modDir);
  if (!manifestPath) {
    if (packageKind === 'capability-module') {
      return null;
    }
    if (packageJson) {
      fail(`missing manifest in ${modDir}`);
    }
    return null;
  }
  if (manifestPath.endsWith('.json')) {
    const manifest = JSON.parse(readText(manifestPath));
    const capabilities = Array.isArray(manifest?.capabilities) ? manifest.capabilities : [];
    return new Set(capabilities.map((item) => String(item || '').trim()).filter(Boolean));
  }
  const manifest = readYaml(manifestPath);
  const capabilities = Array.isArray(manifest?.capabilities) ? manifest.capabilities : [];
  return new Set(capabilities.map((item) => String(item || '').trim()).filter(Boolean));
}

function checkManifestCapabilitiesParity(mod, modDir, capabilitiesTable) {
  const manifestCapabilities = readManifestCapabilities(modDir);
  if (manifestCapabilities == null) {
    return;
  }
  const specCapabilities = new Set();
  collectCapabilityKeys(capabilitiesTable, specCapabilities);

  if (manifestCapabilities.size === 0) {
    fail(`[${mod}] manifest capabilities must not be empty`);
  }
  if (specCapabilities.size === 0) {
    fail(`[${mod}] capabilities table has no capability keys`);
  }

  for (const capability of manifestCapabilities) {
    if (!specCapabilities.has(capability)) {
      fail(`[${mod}] manifest capability not declared in spec table: ${capability}`);
    }
  }
  for (const capability of specCapabilities) {
    if (!manifestCapabilities.has(capability)) {
      fail(`[${mod}] spec capability missing in manifest: ${capability}`);
    }
  }
}

function collectKernelRuleDefinitions(kernelDir, rulePrefix) {
  const files = readdirSync(kernelDir)
    .filter((file) => file.endsWith('.md'))
    .filter((file) => file !== 'index.md');
  const ruleRegex = new RegExp(`\\b${rulePrefix}-[A-Z]+-\\d{3}\\b`, 'g');
  const ruleSet = new Set();

  for (const file of files) {
    const text = readText(path.join(kernelDir, file));
    const matches = text.match(ruleRegex) || [];
    for (const id of matches) {
      ruleSet.add(id);
    }
  }

  return ruleSet;
}

function ensureDomainImportsReferenceKernelDocs(domainText, requiredKernelDocs) {
  for (const doc of requiredKernelDocs) {
    if (doc === 'index.md') {
      continue;
    }
    const name = `kernel/${doc}`;
    if (!domainText.includes(name)) {
      fail(`domain doc missing kernel import reference: ${name}`);
    }
  }
}

function ensureNoKernelRuleDefinitionInDomain(domainText, rulePrefix) {
  const headingRegex = new RegExp(`^##\\s+${rulePrefix}-[A-Z]+-\\d{3}`, 'mu');
  if (headingRegex.test(domainText)) {
    fail('domain doc defines kernel rule heading directly');
  }
}

function checkNarrative(tables, reasonCodeSet, config) {
  const moduleIdentity = tables['capabilities.yaml']?.module_identity;
  const exportFactory = String(moduleIdentity?.export_factory || '').trim();
  if (exportFactory !== 'createNarrativeEngineModule') {
    fail('[narrative-engine] module_identity.export_factory must be createNarrativeEngineModule');
  }

  const chain = tables['pipeline-states.yaml']?.execution_chain || [];
  const chainSteps = chain.map((row) => String(row?.step || '').trim());
  if (JSON.stringify(chainSteps) !== JSON.stringify(config.requiredPipelineChain)) {
    fail('[narrative-engine] pipeline execution_chain mismatch');
  }

  const whitelist = tables['fact-layers.yaml']?.core_output_whitelist || [];
  const fields = whitelist.map((row) => String(row?.field || '').trim());
  const expected = ['spineEvents', 'stateChanges', 'metrics'];
  if (JSON.stringify(fields) !== JSON.stringify(expected)) {
    fail('[narrative-engine] core_output_whitelist must be spineEvents/stateChanges/metrics');
  }

  const initiativeReasonCode = String(tables['initiative-policies.yaml']?.cooldown?.reason_code || '').trim();
  if (!reasonCodeSet.has(initiativeReasonCode)) {
    fail(`[narrative-engine] initiative cooldown reason code missing from reason-codes table: ${initiativeReasonCode}`);
  }
}

function checkTextplay(tables, config) {
  const chain = tables['pipeline-states.yaml']?.execution_chain || [];
  const chainSteps = chain.map((row) => String(row?.step || '').trim());
  if (JSON.stringify(chainSteps) !== JSON.stringify(config.requiredPipelineChain)) {
    fail('[textplay] pipeline execution_chain mismatch');
  }

  const visibilityValues = tables['visibility-policies.yaml']?.visibility_enum || [];
  const values = visibilityValues.map((row) => String(row?.value || '').trim());
  const expectedVisibility = ['public', 'internal', 'sensory'];
  if (JSON.stringify(values) !== JSON.stringify(expectedVisibility)) {
    fail('[textplay] visibility enum mismatch');
  }

  const presenceRows = tables['presence-transitions.yaml']?.states || [];
  const states = presenceRows.map((row) => String(row?.state || '').trim());
  const requiredStates = ['composing', 'paused', 'active', 'idle', 'away'];
  for (const state of requiredStates) {
    if (!states.includes(state)) {
      fail(`[textplay] missing presence state: ${state}`);
    }
  }
}

function checkVideoplay(tables, reasonCodeSet, config) {
  const chain = tables['pipeline-states.yaml']?.execution_chain || [];
  const chainSteps = chain.map((row) => String(row?.step || '').trim());
  if (JSON.stringify(chainSteps) !== JSON.stringify(config.requiredPipelineChain)) {
    fail('[videoplay] pipeline execution_chain mismatch');
  }

  const weighted = tables['quality-gates.yaml']?.visual_attraction_formula?.weighted_components || [];
  const sum = weighted.reduce((acc, row) => acc + Number(row?.weight || 0), 0);
  if (Math.abs(sum - 1) > 1e-6) {
    fail(`[videoplay] quality weighted components must sum to 1, got ${sum}`);
  }

  const routingStages = tables['routing-stages.yaml']?.stages || [];
  for (const stage of routingStages) {
    const code = String(stage?.fail_code_when_both_unavailable || '').trim();
    if (!reasonCodeSet.has(code)) {
      fail(`[videoplay] routing fail code missing from reason-codes table: ${code}`);
    }
  }
}

function checkWorldStudio(tables, reasonCodeSet, config) {
  const chain = tables['pipeline-states.yaml']?.distill_stage_chain || [];
  const chainSteps = chain.map((row) => String(row?.stage || '').trim());
  if (JSON.stringify(chainSteps) !== JSON.stringify(config.requiredPipelineChain)) {
    fail('[world-studio] distill_stage_chain mismatch');
  }

  const singleFlight = Number(tables['task-states.yaml']?.single_flight?.max_active_task_count || 0);
  if (singleFlight !== 1) {
    fail(`[world-studio] single-flight max_active_task_count must be 1, got ${singleFlight}`);
  }

  const taskLifecycleRows = tables['task-states.yaml']?.lifecycle_states || [];
  const lifecycleStates = taskLifecycleRows.map((row) => String(row?.state || '').trim());
  const requiredStates = ['RUNNING', 'PAUSE_REQUESTED', 'PAUSED', 'CANCEL_REQUESTED', 'CANCELED', 'FAILED', 'COMPLETED'];
  for (const state of requiredStates) {
    if (!lifecycleStates.includes(state)) {
      fail(`[world-studio] missing task lifecycle state: ${state}`);
    }
  }

  const routeRows = tables['route-readiness-codes.yaml']?.route_readiness || [];
  for (const row of routeRows) {
    const code = String(row?.reason_code || '').trim();
    if (!reasonCodeSet.has(code)) {
      fail(`[world-studio] route readiness reason code missing from reason-codes table: ${code}`);
    }
  }

  const embeddingRows = tables['route-readiness-codes.yaml']?.embedding_readiness || [];
  for (const row of embeddingRows) {
    const code = String(row?.reason_code || '').trim();
    if (!reasonCodeSet.has(code)) {
      fail(`[world-studio] embedding readiness reason code missing from reason-codes table: ${code}`);
    }
  }

  const primaryEvidenceThreshold = Number(tables['quality-gate-policies.yaml']?.thresholds?.primary_evidence_coverage_block_lt);
  if (Math.abs(primaryEvidenceThreshold - 0.75) > 1e-6) {
    fail(`[world-studio] primary_evidence_coverage_block_lt must be 0.75, got ${primaryEvidenceThreshold}`);
  }
}

function main() {
  const { mod } = parseArgs(process.argv.slice(2));
  const config = getConfig(mod);
  const modDir = path.join(modsRoot, mod);

  const specDir = path.join(modsRoot, config.specRoot);
  const kernelDir = path.join(specDir, 'kernel');
  const tablesDir = path.join(kernelDir, 'tables');

  for (const doc of config.requiredKernelDocs) {
    const absolute = path.join(kernelDir, doc);
    if (!existsSync(absolute)) {
      fail(`[${mod}] missing kernel doc: ${doc}`);
    }
  }

  const domainText = readText(path.join(specDir, config.domainDoc));
  ensureDomainImportsReferenceKernelDocs(domainText, config.requiredKernelDocs);
  ensureNoKernelRuleDefinitionInDomain(domainText, config.rulePrefix);

  const kernelRules = collectKernelRuleDefinitions(kernelDir, config.rulePrefix);
  if (kernelRules.size === 0) {
    fail(`[${mod}] no kernel rule IDs found`);
  }

  const tables = {};
  for (const spec of config.tableSpecs) {
    const absolute = path.join(tablesDir, spec.input);
    tables[spec.input] = readYaml(absolute);
  }

  checkManifestCapabilitiesParity(mod, modDir, tables['capabilities.yaml']);

  const sourceRuleSet = new Set();
  for (const table of Object.values(tables)) {
    collectSourceRules(table, sourceRuleSet);
  }
  if (sourceRuleSet.size === 0) {
    fail(`[${mod}] no source_rule found in tables`);
  }
  for (const sourceRule of sourceRuleSet) {
    if (!kernelRules.has(sourceRule)) {
      fail(`[${mod}] unresolved source_rule: ${sourceRule}`);
    }
  }

  const reasonCodeRows = tables['reason-codes.yaml']?.codes;
  if (!Array.isArray(reasonCodeRows) || reasonCodeRows.length === 0) {
    fail(`[${mod}] reason-codes table is missing or empty`);
  }
  const reasonCodeSet = new Set();
  for (const row of reasonCodeRows) {
    const code = String(row?.code || '').trim();
    if (!code) {
      fail(`[${mod}] empty reason code entry`);
    }
    if (reasonCodeSet.has(code)) {
      fail(`[${mod}] duplicated reason code: ${code}`);
    }
    reasonCodeSet.add(code);
  }

  const acceptance = tables['acceptance-cases.yaml'];
  checkAcceptanceCoverage(mod, acceptance, config, modDir);

  const referenced = new Set();
  collectReasonCodes(acceptance, referenced);
  for (const code of referenced) {
    if (!reasonCodeSet.has(code)) {
      fail(`[${mod}] acceptance references unknown reason code: ${code}`);
    }
  }

  if (mod === 'narrative-engine') {
    checkNarrative(tables, reasonCodeSet, config);
  } else if (mod === 'textplay') {
    checkTextplay(tables, config);
  } else if (mod === 'videoplay') {
    checkVideoplay(tables, reasonCodeSet, config);
  } else if (mod === 'world-studio') {
    checkWorldStudio(tables, reasonCodeSet, config);
  }

  process.stdout.write(`[${mod}] kernel consistency checks passed\n`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`check-mod-spec-kernel-consistency failed: ${message}\n`);
  process.exit(1);
}
