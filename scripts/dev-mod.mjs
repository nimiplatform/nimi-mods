#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { buildMod, resolveModDir } from './mod-cli-lib.mjs';

function resolveExplicitMod(argv) {
  const index = argv.indexOf('--mod');
  if (index === -1) {
    return '';
  }
  return String(argv[index + 1] || '').trim();
}

try {
  const modDir = resolveModDir(process.cwd(), resolveExplicitMod(process.argv.slice(2)));
  await buildMod(path.resolve(modDir), true);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error || 'unknown error');
  process.stderr.write(`[dev-tools] dev failed: ${message}\n`);
  process.exit(1);
}
