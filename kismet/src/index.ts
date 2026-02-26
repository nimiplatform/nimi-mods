import { registerModTranslations } from '@nimiplatform/sdk/mod/i18n';
import enLocale from './locales/en.js';
import zhLocale from './locales/zh.js';

registerModTranslations('kismet', 'en', enLocale as Record<string, unknown>);
registerModTranslations('kismet', 'zh', zhLocale as Record<string, unknown>);

import { KISMET_MANIFEST } from './manifest.js';
import {
  KISMET_CAPABILITIES,
  KISMET_MOD_ID,
  KISMET_PERMISSIONS,
  KISMET_NAV_SLOT,
  KISMET_ROUTE_SLOT,
  KISMET_DATA_API_RUNTIME_ROUTE_OPTIONS,
  KISMET_AUDIT,
  KISMET_REASON,
  ANALYSIS_DIMENSIONS,
} from './contracts.js';
import { createKismetFlowId, emitKismetLog } from './logging.js';
import { createKismetRuntimeMod, createRuntimeMod, getKismetAiClient } from './runtime-mod.js';

export {
  KISMET_CAPABILITIES,
  KISMET_MOD_ID,
  KISMET_PERMISSIONS,
  KISMET_NAV_SLOT,
  KISMET_ROUTE_SLOT,
  KISMET_DATA_API_RUNTIME_ROUTE_OPTIONS,
  KISMET_AUDIT,
  KISMET_REASON,
  ANALYSIS_DIMENSIONS,
  createKismetRuntimeMod,
  createRuntimeMod,
  getKismetAiClient,
};

type ManifestValidationResult = {
  valid: boolean;
  issues: string[];
};

function validateKismetManifestShape(manifest: {
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
  return KISMET_MANIFEST;
}

export function validateKismetManifest() {
  const flowId = createKismetFlowId('kismet-manifest-validate');
  const startedAt = performance.now();
  emitKismetLog({
    level: 'debug',
    message: 'action:validate-kismet-manifest:start',
    flowId,
    source: 'validateKismetManifest',
  });
  const result = validateKismetManifestShape(KISMET_MANIFEST);
  const issues = [...result.issues];
  emitKismetLog({
    level: result.valid ? 'info' : 'error',
    message: result.valid
      ? 'action:validate-kismet-manifest:done'
      : 'action:validate-kismet-manifest:failed',
    flowId,
    source: 'validateKismetManifest',
    costMs: Number((performance.now() - startedAt).toFixed(2)),
    details: {
      valid: result.valid,
      issueCount: issues.length,
      issues,
    },
  });
  return result;
}
