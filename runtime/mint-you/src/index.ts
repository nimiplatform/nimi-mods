import { registerModTranslations } from '@nimiplatform/sdk/mod/i18n';
import enLocale from './locales/en.js';
import zhLocale from './locales/zh.js';

registerModTranslations('mint-you', 'en', enLocale as Record<string, unknown>);
registerModTranslations('mint-you', 'zh', zhLocale as Record<string, unknown>);

import { MINTYOU_MANIFEST } from './manifest.js';
import {
  MINTYOU_CAPABILITIES,
  MINTYOU_MOD_ID,
  MINTYOU_PERMISSIONS,
  MINTYOU_NAV_SLOT,
  MINTYOU_ROUTE_SLOT,
  MINTYOU_DATA_API_AGENTS_CREATE,
  MINTYOU_DATA_API_WORLD_ACCESS_ME,
  MINTYOU_DATA_API_WORLD_OASIS_GET,
  MINTYOU_RUNTIME_PROFILE_READ_AGENT,
  MINTYOU_AUDIT,
  MINTYOU_REASON,
  MINTYOU_PIPELINE_STEPS,
} from './contracts.js';
import { createMintYouFlowId, emitMintYouLog } from './logging.js';
import { createMintYouRuntimeMod, createRuntimeMod, getMintYouHookClient, getMintYouRuntimeClient } from './runtime-mod.js';

export {
  MINTYOU_CAPABILITIES,
  MINTYOU_MOD_ID,
  MINTYOU_PERMISSIONS,
  MINTYOU_NAV_SLOT,
  MINTYOU_ROUTE_SLOT,
  MINTYOU_DATA_API_AGENTS_CREATE,
  MINTYOU_DATA_API_WORLD_ACCESS_ME,
  MINTYOU_DATA_API_WORLD_OASIS_GET,
  MINTYOU_RUNTIME_PROFILE_READ_AGENT,
  MINTYOU_AUDIT,
  MINTYOU_REASON,
  MINTYOU_PIPELINE_STEPS,
  createMintYouRuntimeMod,
  createRuntimeMod,
  getMintYouRuntimeClient,
  getMintYouHookClient,
};

type ManifestValidationResult = {
  valid: boolean;
  issues: string[];
};

function validateMintYouManifestShape(manifest: {
  id?: unknown;
  entry?: unknown;
  styles?: unknown;
  capabilities?: unknown;
}): ManifestValidationResult {
  const issues: string[] = [];
  if (typeof manifest.id !== 'string' || !manifest.id.trim()) {
    issues.push('id-required');
  }
  if (typeof manifest.entry !== 'string' || !manifest.entry.trim()) {
    issues.push('entry-required');
  }
  if (!Array.isArray(manifest.styles) || manifest.styles.length === 0) {
    issues.push('styles-required');
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
  return MINTYOU_MANIFEST;
}

export function validateMintYouManifest() {
  const flowId = createMintYouFlowId('mint-you-manifest-validate');
  const startedAt = performance.now();
  emitMintYouLog({
    level: 'debug',
    message: 'action:validate-mint-you-manifest:start',
    flowId,
    source: 'validateMintYouManifest',
  });
  const result = validateMintYouManifestShape(MINTYOU_MANIFEST);
  const issues = [...result.issues];
  emitMintYouLog({
    level: result.valid ? 'info' : 'error',
    message: result.valid
      ? 'action:validate-mint-you-manifest:done'
      : 'action:validate-mint-you-manifest:failed',
    flowId,
    source: 'validateMintYouManifest',
    costMs: Number((performance.now() - startedAt).toFixed(2)),
    details: {
      valid: result.valid,
      issueCount: issues.length,
      issues,
    },
  });
  return result;
}
