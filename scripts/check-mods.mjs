#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { modSlugFromPath, resolveWorkspaceEntries, resolveWorkspaceModDir } from './workspace-mods.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modsRoot = path.resolve(__dirname, '..');
const requireDist = process.argv.includes('--require-dist');

function loadWorkspaceMods() {
  return resolveWorkspaceEntries(modsRoot);
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

function parseTsconfig(modDir) {
  const tsconfigPath = path.join(modDir, 'tsconfig.json');
  if (!existsSync(tsconfigPath)) {
    return null;
  }
  return JSON.parse(readFileSync(tsconfigPath, 'utf8'));
}

function listSourceTsFiles(modDir) {
  const candidates = [path.join(modDir, 'index.ts'), path.join(modDir, 'src')];
  const results = [];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      continue;
    }
    const stats = readdirOrFile(candidate);
    if (stats.kind === 'file') {
      results.push(candidate);
      continue;
    }
    const pendingDirs = [candidate];
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
        if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
          results.push(absolutePath);
        }
      }
    }
  }

  return [...new Set(results)].sort((left, right) => left.localeCompare(right));
}

function readdirOrFile(targetPath) {
  try {
    const entries = readdirSync(targetPath, { withFileTypes: true });
    return {
      kind: 'dir',
      entries,
    };
  } catch {
    return {
      kind: 'file',
      entries: [],
    };
  }
}

function hasUiCapabilities(manifest) {
  const capabilities = Array.isArray(manifest?.capabilities) ? manifest.capabilities : [];
  return capabilities.some((capability) => String(capability || '').startsWith('ui.register.'));
}

function validateIconAsset(modDir, manifest, errors) {
  if (!Object.prototype.hasOwnProperty.call(manifest, 'iconAsset')) {
    errors.push('manifest.iconAsset is required for runtime mods');
    return;
  }
  const iconAsset = String(manifest.iconAsset || '').trim();
  if (!iconAsset) {
    errors.push('manifest.iconAsset must be a non-empty relative path when declared');
    return;
  }
  if (/^[a-z]+:\/\//i.test(iconAsset)) {
    errors.push('manifest.iconAsset must not be a URL');
    return;
  }
  if (path.isAbsolute(iconAsset)) {
    errors.push('manifest.iconAsset must be a relative path');
    return;
  }
  if (!iconAsset.toLowerCase().endsWith('.svg')) {
    errors.push('manifest.iconAsset must point to an .svg file');
    return;
  }
  const resolved = path.resolve(modDir, iconAsset);
  const relative = path.relative(modDir, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    errors.push('manifest.iconAsset must stay within the mod directory');
    return;
  }
  if (!existsSync(resolved)) {
    errors.push(`manifest.iconAsset file does not exist: ${iconAsset}`);
  }
}

function validateManifestLegacyFields(manifest, errors) {
  if (Object.prototype.hasOwnProperty.call(manifest, 'icon')) {
    errors.push('manifest.icon is forbidden; use manifest.iconAsset only');
  }
  if (Object.prototype.hasOwnProperty.call(manifest, 'permissions')) {
    errors.push('manifest.permissions is forbidden; use manifest.capabilities');
  }
}

function validateSourceLegacyFields(modDir, errors) {
  const sourceFiles = listSourceTsFiles(modDir);
  for (const sourcePath of sourceFiles) {
    const content = readFileSync(sourcePath, 'utf8');
    const relativePath = path.relative(modDir, sourcePath);
    if (/\b[A-Z0-9_]+_PERMISSIONS\b/.test(content)) {
      errors.push(`source must not declare or export *_PERMISSIONS aliases: ${relativePath}`);
    }
    if (relativePath === path.join('src', 'manifest.ts')) {
      if (/\bicon\s*:/.test(content)) {
        errors.push('src/manifest.ts must not declare icon; use iconAsset only');
      }
      if (/\bpermissions\s*:/.test(content)) {
        errors.push('src/manifest.ts must not declare permissions; use capabilities');
      }
    }
  }
}

function validateRuntimeModPackage(modName, modDir, packageJson, errors) {
  const scripts = packageJson?.scripts || {};
  for (const scriptName of ['build', 'dev', 'doctor', 'pack']) {
    if (typeof scripts[scriptName] !== 'string' || !scripts[scriptName].trim()) {
      errors.push(`runtime mod package.json must define scripts.${scriptName}`);
    }
  }

  const allDeps = {
    ...(packageJson?.dependencies || {}),
    ...(packageJson?.devDependencies || {}),
  };

  if (!allDeps.react) {
    errors.push('runtime mod package.json must declare react dependency');
  }
  if (!allDeps['@nimiplatform/sdk']) {
    errors.push('runtime mod package.json must declare @nimiplatform/sdk dependency');
  }
  if (!allDeps['@nimiplatform/dev-tools']) {
    errors.push('runtime mod package.json must declare @nimiplatform/dev-tools dependency');
  }

  const tsconfig = parseTsconfig(modDir);
  const sdkPaths = tsconfig?.compilerOptions?.paths?.['@nimiplatform/sdk'];
  const sdkWildcardPaths = tsconfig?.compilerOptions?.paths?.['@nimiplatform/sdk/*'];
  if (sdkPaths || sdkWildcardPaths) {
    errors.push('tsconfig.json must not define @nimiplatform/sdk path aliases');
  }
}

function validateMod(modName) {
  const modDir = resolveWorkspaceModDir(modsRoot, modName);
  const modSlug = modSlugFromPath(modName);
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

    const expectedEntry = `./dist/mods/${modSlug}/index.js`;
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

    validateRuntimeModPackage(modName, modDir, packageJson, errors);
    validateManifestLegacyFields(manifest, errors);
    validateIconAsset(modDir, manifest, errors);

    if (hasUiCapabilities(manifest)) {
      const stylePaths = Array.isArray(manifest.styles)
        ? manifest.styles.map((item) => String(item || '').trim()).filter(Boolean)
        : [];
      if (stylePaths.length === 0) {
        errors.push('UI runtime mod manifest must declare styles[]');
      }
      for (const stylePath of stylePaths) {
        const expectedStylePath = `./dist/mods/${modSlug}/index.css`;
        if (stylePath !== expectedStylePath) {
          errors.push(`manifest.styles[] must be ["${expectedStylePath}"] (received "${stylePath}")`);
        }
        if (requireDist) {
          const absoluteStylePath = path.join(modDir, stylePath.slice(2));
          if (!existsSync(absoluteStylePath)) {
            errors.push(`missing dist style file: ${stylePath}`);
          }
        }
      }
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

  validateSourceLegacyFields(modDir, errors);

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
