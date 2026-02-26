import { registerModTranslations } from '@nimiplatform/sdk/mod/i18n';
import enLocale from './locales/en.js';
import zhLocale from './locales/zh.js';

registerModTranslations('re-life', 'en', enLocale as Record<string, unknown>);
registerModTranslations('re-life', 'zh', zhLocale as Record<string, unknown>);

import { RELIFE_MANIFEST } from './manifest.js';
import {
  RELIFE_CAPABILITIES,
  RELIFE_DATA_API_DECISIONS_GET,
  RELIFE_DATA_API_DECISIONS_LIST,
  RELIFE_DATA_API_DECISIONS_UPSERT,
  RELIFE_DATA_API_METRICS_AGGREGATE,
  RELIFE_DATA_API_RUNTIME_ROUTE_OPTIONS,
  RELIFE_DATA_API_SCENARIOS_LIST,
  RELIFE_DATA_API_SCENARIOS_UPSERT,
  RELIFE_DATA_API_SHARED_LIST,
  RELIFE_DATA_API_SHARED_PUBLISH,
  RELIFE_DATA_API_SHARED_REVOKE,
  RELIFE_MOD_ID,
  RELIFE_NAV_SLOT,
  RELIFE_PERMISSIONS,
  RELIFE_ROUTE_SLOT,
} from './contracts.js';
import { createReLifeFlowId, emitReLifeLog } from './logging.js';
import { createReLifeRuntimeMod, createRuntimeMod } from './runtime-mod.js';

export {
  RELIFE_CAPABILITIES,
  RELIFE_DATA_API_DECISIONS_GET,
  RELIFE_DATA_API_DECISIONS_LIST,
  RELIFE_DATA_API_DECISIONS_UPSERT,
  RELIFE_DATA_API_METRICS_AGGREGATE,
  RELIFE_DATA_API_RUNTIME_ROUTE_OPTIONS,
  RELIFE_DATA_API_SCENARIOS_LIST,
  RELIFE_DATA_API_SCENARIOS_UPSERT,
  RELIFE_DATA_API_SHARED_LIST,
  RELIFE_DATA_API_SHARED_PUBLISH,
  RELIFE_DATA_API_SHARED_REVOKE,
  RELIFE_MOD_ID,
  RELIFE_NAV_SLOT,
  RELIFE_PERMISSIONS,
  RELIFE_ROUTE_SLOT,
  createReLifeRuntimeMod,
  createRuntimeMod,
};

type ManifestValidationResult = {
  valid: boolean;
  issues: string[];
};

function validateReLifeManifestShape(manifest: {
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
  return RELIFE_MANIFEST;
}

export function validateReLifeManifest() {
  const flowId = createReLifeFlowId('re-life-manifest-validate');
  const startedAt = performance.now();
  emitReLifeLog({
    level: 'debug',
    message: 'action:validate-re-life-manifest:start',
    flowId,
    source: 'validateReLifeManifest',
  });
  const result = validateReLifeManifestShape(RELIFE_MANIFEST);
  const issues = [...result.issues];
  emitReLifeLog({
    level: result.valid ? 'info' : 'error',
    message: result.valid
      ? 'action:validate-re-life-manifest:done'
      : 'action:validate-re-life-manifest:failed',
    flowId,
    source: 'validateReLifeManifest',
    costMs: Number((performance.now() - startedAt).toFixed(2)),
    details: {
      valid: result.valid,
      issueCount: issues.length,
      issues,
    },
  });
  return result;
}
