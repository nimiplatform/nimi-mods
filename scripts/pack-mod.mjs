#!/usr/bin/env node

import process from 'node:process';
import { packMod, resolveModDir } from './mod-cli-lib.mjs';

function resolveExplicitMod(argv) {
  const index = argv.indexOf('--mod');
  if (index === -1) {
    return '';
  }
  return String(argv[index + 1] || '').trim();
}

try {
  const modDir = resolveModDir(process.cwd(), resolveExplicitMod(process.argv.slice(2)));
  packMod(modDir);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error || 'unknown error');
  process.stderr.write(`[dev-tools] pack failed: ${message}\n`);
  process.exit(1);
}
