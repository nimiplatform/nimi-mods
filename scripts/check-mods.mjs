#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modsRoot = path.resolve(__dirname, '..');
const requireDist = process.argv.includes('--require-dist');

function loadWorkspaceMods() {
  const workspacePath = path.join(modsRoot, 'pnpm-workspace.yaml');
  const content = readFileSync(workspacePath, 'utf8');
  const workspace = parseYaml(content);
  const packageEntries = Array.isArray(workspace?.packages) ? workspace.packages : [];
  const mods = [];

  for (const entry of packageEntries) {
    if (typeof entry !== 'string') {
      continue;
    }
    const normalized = entry.trim().replace(/\/+$/, '').replace(/^\.\//, '');
    if (!normalized || normalized.includes('*')) {
      continue;
    }
    if (normalized.includes('/')) {
      throw new Error(
        `Unsupported workspace package entry "${entry}". Expected top-level mod directories only.`,
      );
    }
    mods.push(normalized);
  }

  return [...new Set(mods)].sort((a, b) => a.localeCompare(b));
}

function findManifestPath(modDir) {
  const candidates = ['mod.manifest.yaml', 'mod.manifest.yml', 'mod.manifest.json'];
  for (const filename of candidates) {
    const candidate = path.join(modDir, filename);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function parseManifest(manifestPath) {
  const raw = readFileSync(manifestPath, 'utf8');
  if (manifestPath.endsWith('.json')) {
    return JSON.parse(raw);
  }
  return parseYaml(raw);
}

function parsePackageJson(modDir) {
  const packageJsonPath = path.join(modDir, 'package.json');
  if (!existsSync(packageJsonPath)) {
    return null;
  }
  const raw = readFileSync(packageJsonPath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }
  return parsed;
}

function validateMod(modName) {
  const modDir = path.join(modsRoot, modName);
  const errors = [];
  const packageJson = parsePackageJson(modDir);
  const packageKind = String(packageJson?.nimiPackageKind || '').trim();

  const manifestPath = findManifestPath(modDir);
  const isCapabilityModule = packageKind === 'capability-module';
  if (!manifestPath && !isCapabilityModule) {
    errors.push('missing manifest (mod.manifest.yaml|yml|json)');
    return errors;
  }
  if (!packageJson) {
    errors.push('missing package.json');
    return errors;
  }

  if (manifestPath) {
    let manifest = null;
    try {
      manifest = parseManifest(manifestPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`manifest parse failed: ${message}`);
      return errors;
    }
    if (!manifest || typeof manifest !== 'object') {
      errors.push('manifest is not an object');
      return errors;
    }

    const expectedEntry = `./dist/mods/${modName}/index.js`;
    const manifestEntry = String(manifest.entry || '').trim();
    if (!manifestEntry) {
      errors.push('manifest.entry is required');
    } else if (manifestEntry !== expectedEntry) {
      errors.push(`manifest.entry must be "${expectedEntry}" (received "${manifestEntry}")`);
    }

    const manifestId = String(manifest.id || '').trim();
    if (!manifestId) {
      errors.push('manifest.id is required');
    }

    if (requireDist) {
      const entryPath = path.join(modDir, expectedEntry.slice(2));
      if (!existsSync(entryPath)) {
        errors.push(`missing dist entry file: ${expectedEntry}`);
      }
    }
  } else if (isCapabilityModule) {
    const moduleEntryPath = path.join(modDir, 'src', 'index.ts');
    if (!existsSync(moduleEntryPath)) {
      errors.push('capability module requires src/index.ts');
    }
  }

  const indexTsPath = path.join(modDir, 'index.ts');
  if (!existsSync(indexTsPath)) {
    errors.push('missing index.ts');
  }

  const disallowedSourceJsFiles = listDisallowedSourceJsFiles(modDir);
  if (disallowedSourceJsFiles.length > 0) {
    const preview = disallowedSourceJsFiles.slice(0, 5).join(', ');
    const remainder = disallowedSourceJsFiles.length > 5
      ? ` (+${disallowedSourceJsFiles.length - 5} more)`
      : '';
    errors.push(`src must be TypeScript-only; remove .js files in src/: ${preview}${remainder}`);
  }

  return errors;
}

function listDisallowedSourceJsFiles(modDir) {
  const srcDir = path.join(modDir, 'src');
  if (!existsSync(srcDir)) {
    return [];
  }

  const results = [];
  const pendingDirs = [srcDir];
  while (pendingDirs.length > 0) {
    const currentDir = pendingDirs.pop();
    if (!currentDir) {
      continue;
    }
    const entries = readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        pendingDirs.push(absolutePath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith('.js')) {
        results.push(path.relative(modDir, absolutePath));
      }
    }
  }
  return results.sort((a, b) => a.localeCompare(b));
}

function main() {
  const mods = loadWorkspaceMods();
  if (mods.length === 0) {
    throw new Error('No mods declared in pnpm-workspace.yaml');
  }

  let failed = 0;
  for (const modName of mods) {
    const errors = validateMod(modName);
    if (errors.length === 0) {
      process.stdout.write(`[check-mods] ok: ${modName}\n`);
      continue;
    }
    failed += 1;
    process.stderr.write(`[check-mods] failed: ${modName}\n`);
    for (const error of errors) {
      process.stderr.write(`  - ${error}\n`);
    }
  }

  if (failed > 0) {
    throw new Error(`${failed} mod(s) failed validation.`);
  }

  process.stdout.write(`[check-mods] all ${mods.length} mod(s) valid\n`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[check-mods] ${message}\n`);
  process.exit(1);
}
