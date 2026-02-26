#!/usr/bin/env node

import * as esbuild from 'esbuild';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modsRoot = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = {
    watch: false,
    all: false,
    mods: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--') {
      continue;
    }
    if (token === '--watch') {
      args.watch = true;
      continue;
    }
    if (token === '--all') {
      args.all = true;
      continue;
    }
    if (token === '--mod') {
      const value = String(argv[i + 1] || '').trim();
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value after --mod');
      }
      args.mods.push(value);
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  if (args.all && args.mods.length > 0) {
    throw new Error('Use either --all or --mod <name>, not both.');
  }

  return args;
}

function findManifestFile(modDir) {
  const candidates = ['mod.manifest.yaml', 'mod.manifest.yml', 'mod.manifest.json'];
  for (const filename of candidates) {
    const candidate = path.join(modDir, filename);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function parseManifest(modDir) {
  const manifestPath = findManifestFile(modDir);
  if (!manifestPath) {
    throw new Error(`Missing mod manifest in ${modDir}`);
  }
  const raw = readFileSync(manifestPath, 'utf8');
  const ext = path.extname(manifestPath).toLowerCase();
  const value = ext === '.json' ? JSON.parse(raw) : parseYaml(raw);
  if (!value || typeof value !== 'object') {
    throw new Error(`Invalid manifest: ${manifestPath}`);
  }
  const id = String(value.id || '').trim();
  const entry = String(value.entry || '').trim();
  if (!id) {
    throw new Error(`Manifest missing "id": ${manifestPath}`);
  }
  if (!entry) {
    throw new Error(`Manifest missing "entry": ${manifestPath}`);
  }
  return {
    id,
    entry,
    manifestPath,
  };
}

function listAvailableMods() {
  const workspacePath = path.join(modsRoot, 'pnpm-workspace.yaml');
  const workspaceRaw = readFileSync(workspacePath, 'utf8');
  const workspace = parseYaml(workspaceRaw);
  const packageEntries = Array.isArray(workspace?.packages) ? workspace.packages : [];
  const modNames = [];

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
    const modDir = path.join(modsRoot, normalized);
    if (!existsSync(modDir)) {
      throw new Error(`Workspace package directory does not exist: ${normalized}`);
    }
    modNames.push(normalized);
  }

  return [...new Set(modNames)].sort((a, b) => a.localeCompare(b));
}

function resolveTargetMods(args) {
  const available = listAvailableMods();
  if (args.all) {
    return available;
  }
  if (args.mods.length > 0) {
    const deduped = [...new Set(args.mods)];
    const unknown = deduped.filter((name) => !available.includes(name));
    if (unknown.length > 0) {
      throw new Error(`Unknown mod(s): ${unknown.join(', ')}. Available: ${available.join(', ')}`);
    }
    return deduped;
  }
  throw new Error('No target mod selected. Use --mod <name> or --all.');
}

function getExternalList() {
  return [
    'react',
    'react-dom',
    'react/jsx-runtime',
    '@nimiplatform/sdk',
    '@nimiplatform/sdk/*',
    '@tanstack/react-query',
    'i18next',
    'react-i18next',
    'zod',
    'zustand',
  ];
}

function createPreferTypeScriptSourcesPlugin(modDir) {
  const normalizedModDir = path.resolve(modDir);

  return {
    name: 'prefer-typescript-sources',
    setup(build) {
      // Keep ESM ".js" import style while forcing bundling/watch to follow TS sources in mod workspace.
      build.onResolve({ filter: /^\.\.?\// }, (args) => {
        if (!args.importer || !args.path.endsWith('.js')) {
          return null;
        }

        const importerPath = path.resolve(args.importer);
        if (
          importerPath !== normalizedModDir
          && !importerPath.startsWith(`${normalizedModDir}${path.sep}`)
        ) {
          return null;
        }

        const withoutJsExt = args.path.slice(0, -3);
        const candidateRelativePaths = [
          `${withoutJsExt}.ts`,
          `${withoutJsExt}.tsx`,
          `${withoutJsExt}.mts`,
          `${withoutJsExt}.cts`,
        ];

        for (const candidateRelativePath of candidateRelativePaths) {
          const candidateAbsPath = path.resolve(path.dirname(importerPath), candidateRelativePath);
          if (existsSync(candidateAbsPath)) {
            return { path: candidateAbsPath };
          }
        }

        return null;
      });
    },
  };
}

function buildConfig(modName) {
  const modDir = path.join(modsRoot, modName);
  const entryPoint = path.join(modDir, 'index.ts');
  if (!existsSync(entryPoint)) {
    throw new Error(`Missing entry file: ${entryPoint}`);
  }

  const manifest = parseManifest(modDir);
  const outFile = path.resolve(modDir, manifest.entry);
  const outDir = path.dirname(outFile);
  const distRoot = path.join(modDir, 'dist');
  const expectedOutFile = path.join(modDir, 'dist', 'mods', modName, 'index.js');
  if (path.resolve(outFile) !== path.resolve(expectedOutFile)) {
    throw new Error(
      `Manifest entry mismatch for ${modName}. Expected ./dist/mods/${modName}/index.js, got ${manifest.entry}`,
    );
  }

  return {
    modName,
    modDir,
    entryPoint,
    outDir,
    distRoot,
    external: getExternalList(),
    plugins: [createPreferTypeScriptSourcesPlugin(modDir)],
  };
}

async function runBuild(targetMods, watchMode) {
  const configs = targetMods.map((name) => buildConfig(name));
  for (const config of configs) {
    rmSync(config.distRoot, { recursive: true, force: true });
  }

  const contexts = await Promise.all(configs.map(async (config) => esbuild.context({
    entryPoints: [config.entryPoint],
    bundle: true,
    format: 'esm',
    outdir: config.outDir,
    platform: 'browser',
    target: ['es2022'],
    jsx: 'automatic',
    external: config.external,
    plugins: config.plugins,
    splitting: false,
    sourcemap: true,
    logLevel: 'info',
  })));

  const disposeAll = async () => {
    await Promise.all(contexts.map((context) => context.dispose().catch(() => {})));
  };

  if (!watchMode) {
    try {
      await Promise.all(contexts.map((context) => context.rebuild()));
    } finally {
      await disposeAll();
    }
    process.stdout.write(`[build-mod] built: ${targetMods.join(', ')}\n`);
    return;
  }

  const onSignal = async () => {
    await disposeAll();
    process.exit(0);
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  await Promise.all(contexts.map((context) => context.watch()));
  process.stdout.write(`[build-mod] watching: ${targetMods.join(', ')}\n`);
  await new Promise(() => {});
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const targetMods = resolveTargetMods(args);
  await runBuild(targetMods, args.watch);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[build-mod] failed: ${message}\n`);
  process.exit(1);
});
