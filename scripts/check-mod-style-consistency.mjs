#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
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
    if (!normalized || normalized.includes('*') || normalized.includes('/')) {
      continue;
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

function hasUiCapabilities(manifest) {
  const capabilities = Array.isArray(manifest?.capabilities) ? manifest.capabilities : [];
  return capabilities.some((capability) => String(capability || '').startsWith('ui.register.'));
}

function listSourceFiles(modDir) {
  const candidates = [path.join(modDir, 'index.ts'), path.join(modDir, 'src')];
  const results = [];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      continue;
    }
    const stats = safeStat(candidate);
    if (!stats) {
      continue;
    }
    if (stats.kind === 'file') {
      results.push(candidate);
      continue;
    }
    const pending = [candidate];
    while (pending.length > 0) {
      const currentDir = pending.pop();
      if (!currentDir) {
        continue;
      }
      const entries = readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const absolutePath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          pending.push(absolutePath);
          continue;
        }
        if (entry.isFile() && /\.(tsx?|jsx?)$/.test(entry.name)) {
          results.push(absolutePath);
        }
      }
    }
  }

  return results.sort((a, b) => a.localeCompare(b));
}

function safeStat(targetPath) {
  try {
    const stats = statSync(targetPath);
    return {
      kind: stats.isDirectory() ? 'dir' : (stats.isFile() ? 'file' : 'other'),
    };
  } catch {
    return null;
  }
}

function readJoinedContent(filePaths) {
  return filePaths
    .map((filePath) => readFileSync(filePath, 'utf8'))
    .join('\n');
}

function validateModStyles(modName) {
  const modDir = path.join(modsRoot, modName);
  const errors = [];
  const manifestPath = findManifestPath(modDir);
  if (!manifestPath) {
    return errors;
  }

  const manifest = parseManifest(manifestPath);
  if (!hasUiCapabilities(manifest)) {
    return errors;
  }

  const sourceFiles = listSourceFiles(modDir);
  const source = readJoinedContent(sourceFiles);
  const rootMarker = `data-nimi-mod-root="${modName}"`;
  if (!source.includes(rootMarker)) {
    errors.push(`UI runtime mod source must declare ${rootMarker}`);
  }

  const portalUsed = /(?:DialogPrimitive|TooltipPrimitive|SelectPrimitive)\.Portal|<DialogPortal\b|<DialogPrimitive\.Portal\b|<TooltipPrimitive\.Portal\b|<SelectPrimitive\.Portal\b/.test(source);
  const portalMarker = `data-nimi-mod-portal="${modName}"`;
  if (portalUsed && !source.includes(portalMarker)) {
    errors.push(`portalled UI surfaces must declare ${portalMarker}`);
  }

  if (/fonts\.googleapis\.com/.test(source)) {
    errors.push('source must not import remote fonts; use Desktop compatibility font vars');
  }

  if (/apps\/desktop\/src\/shell\/renderer\/styles\.css|runtime-mod-styles\.ts/.test(source)) {
    errors.push('source must not reference Desktop stylesheet internals directly');
  }

  if (!requireDist) {
    return errors;
  }

  const stylePaths = Array.isArray(manifest.styles)
    ? manifest.styles.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  for (const stylePath of stylePaths) {
    const absoluteStylePath = path.join(modDir, stylePath.replace(/^\.\//, ''));
    if (!existsSync(absoluteStylePath)) {
      errors.push(`missing dist style file: ${stylePath}`);
      continue;
    }
    const css = readFileSync(absoluteStylePath, 'utf8');
    if (!/--font-ui\s*:/.test(css)) {
      errors.push(`built CSS must include Desktop compatibility font vars: ${stylePath}`);
    }
    if (!/--color-mint-500\s*:\s*#4ecca3/i.test(css)) {
      errors.push(`built CSS must include Desktop mint token baseline: ${stylePath}`);
    }
    if (!/\[data-nimi-mod-root\]/.test(css)) {
      errors.push(`built CSS must scope compatibility baseline to [data-nimi-mod-root]: ${stylePath}`);
    }
    if (portalUsed && !/\[data-nimi-mod-portal\]/.test(css)) {
      errors.push(`built CSS must scope compatibility baseline to [data-nimi-mod-portal]: ${stylePath}`);
    }
  }

  return errors;
}

function main() {
  const mods = loadWorkspaceMods();
  let failed = 0;

  for (const modName of mods) {
    const errors = validateModStyles(modName);
    if (errors.length === 0) {
      process.stdout.write(`[check-mod-style-consistency] ok: ${modName}\n`);
      continue;
    }
    failed += 1;
    process.stderr.write(`[check-mod-style-consistency] failed: ${modName}\n`);
    for (const error of errors) {
      process.stderr.write(`  - ${error}\n`);
    }
  }

  if (failed > 0) {
    process.exit(1);
  }
}

main();
