import { DAILY_OUTFIT_MANIFEST } from './manifest.js';
import {
  DAILY_OUTFIT_CAPABILITIES,
  DAILY_OUTFIT_MOD_ID,
  DAILY_OUTFIT_NAV_SLOT,
  DAILY_OUTFIT_PERMISSIONS,
  DAILY_OUTFIT_ROUTE_SLOT,
} from './contracts.js';
import { createDailyOutfitFlowId, emitDailyOutfitLog } from './logging.js';
import {
  createDailyOutfitRuntimeMod,
  createRuntimeMod,
  getDailyOutfitHookClient,
  getDailyOutfitRuntimeClient,
} from './runtime-mod.js';

export {
  DAILY_OUTFIT_CAPABILITIES,
  DAILY_OUTFIT_MOD_ID,
  DAILY_OUTFIT_NAV_SLOT,
  DAILY_OUTFIT_PERMISSIONS,
  DAILY_OUTFIT_ROUTE_SLOT,
  createDailyOutfitFlowId,
  createDailyOutfitRuntimeMod,
  createRuntimeMod,
  emitDailyOutfitLog,
  getDailyOutfitHookClient,
  getDailyOutfitRuntimeClient,
};

type ManifestValidationResult = {
  valid: boolean;
  issues: string[];
};

function validateDailyOutfitManifestShape(manifest: {
  id?: unknown;
  entry?: unknown;
  capabilities?: unknown;
}): ManifestValidationResult {
  const issues: string[] = [];
  if (typeof manifest.id !== 'string' || !manifest.id.trim()) {
    issues.push('id-required');
  }
  if (typeof manifest.entry !== 'string' || !manifest.entry.trim()) {
    issues.push('entry-required');
  }
  if (!Array.isArray(manifest.capabilities)) {
    issues.push('capabilities-array-required');
  }
  return {
    valid: issues.length === 0,
    issues,
  };
}

export function getManifest() {
  return DAILY_OUTFIT_MANIFEST;
}

export function validateDailyOutfitManifest() {
  const flowId = createDailyOutfitFlowId('daily-outfit-manifest-validate');
  const startedAt = performance.now();
  emitDailyOutfitLog({
    level: 'debug',
    message: 'action:validate-daily-outfit-manifest:start',
    flowId,
    source: 'validateDailyOutfitManifest',
  });
  const result = validateDailyOutfitManifestShape(DAILY_OUTFIT_MANIFEST);
  emitDailyOutfitLog({
    level: result.valid ? 'info' : 'error',
    message: result.valid
      ? 'action:validate-daily-outfit-manifest:done'
      : 'action:validate-daily-outfit-manifest:failed',
    flowId,
    source: 'validateDailyOutfitManifest',
    costMs: Number((performance.now() - startedAt).toFixed(2)),
    details: {
      valid: result.valid,
      issues: [...result.issues],
    },
  });
  return result;
}
