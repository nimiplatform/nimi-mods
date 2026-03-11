import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

export function normalizeWorkspaceEntry(entry) {
  return String(entry || '').trim().replace(/\/+$/, '').replace(/^\.\//, '');
}

export function modSlugFromPath(modPath) {
  return path.basename(String(modPath || '').trim());
}

export function resolveWorkspaceEntries(modsRoot) {
  const workspacePath = path.join(modsRoot, 'pnpm-workspace.yaml');
  const content = readFileSync(workspacePath, 'utf8');
  const workspace = parseYaml(content);
  const packageEntries = Array.isArray(workspace?.packages) ? workspace.packages : [];
  const resolved = [];

  for (const entry of packageEntries) {
    if (typeof entry !== 'string') {
      continue;
    }
    const normalized = normalizeWorkspaceEntry(entry);
    if (!normalized) {
      continue;
    }
    if (normalized.endsWith('/*')) {
      const baseDir = path.join(modsRoot, normalized.slice(0, -2));
      if (!existsSync(baseDir) || !statSync(baseDir).isDirectory()) {
        throw new Error(`Workspace package base directory does not exist: ${normalized}`);
      }
      const childEntries = readdirSync(baseDir, { withFileTypes: true })
        .filter((item) => item.isDirectory())
        .map((item) => path.posix.join(normalized.slice(0, -2), item.name));
      resolved.push(...childEntries);
      continue;
    }
    if (normalized.includes('*')) {
      throw new Error(`Unsupported workspace package pattern: ${normalized}`);
    }
    const absPath = path.join(modsRoot, normalized);
    if (!existsSync(absPath) || !statSync(absPath).isDirectory()) {
      throw new Error(`Workspace package directory does not exist: ${normalized}`);
    }
    resolved.push(normalized);
  }

  return [...new Set(resolved)].sort((left, right) => left.localeCompare(right));
}

export function resolveWorkspaceModDir(modsRoot, modPath) {
  const normalized = normalizeWorkspaceEntry(modPath);
  if (!normalized) {
    throw new Error('mod path is required');
  }
  return path.join(modsRoot, normalized);
}
