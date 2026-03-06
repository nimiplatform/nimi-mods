import { registerModTranslations } from '@nimiplatform/sdk/mod/i18n';
import enLocale from './locales/en.js';
import zhLocale from './locales/zh.js';
import { VIDEOPLAY_MANIFEST } from './manifest.js';
import {
  VIDEOPLAY_CAPABILITIES,
  VIDEOPLAY_DATA_API_ASSET_BATCH_UPSERT,
  VIDEOPLAY_DATA_API_EPISODE_UPSERT,
  VIDEOPLAY_DATA_API_RELEASE_PUBLISH,
  VIDEOPLAY_MOD_ID,
  VIDEOPLAY_NAV_SLOT,
  VIDEOPLAY_ROUTE_SLOT,
  VIDEOPLAY_TAB_ID,
} from './contracts.js';
import { createVideoPlayFlowId, emitVideoPlayLog } from './logging.js';
import { createVideoPlayRuntimeMod, createRuntimeMod } from './runtime-mod.js';

registerModTranslations('videoplay', 'en', enLocale as Record<string, unknown>);
registerModTranslations('videoplay', 'zh', zhLocale as Record<string, unknown>);

export * from './contracts.js';
export * from './types.js';
export * from './schemas.js';
export * from './data/story-package.js';
export * from './storage/state.js';
export * from './storage/operations.js';
export {
  composeEpisode,
  evaluateQualityGates,
  invokeWithRouteFallback,
  runVideoPlayEpisodeProduction,
  segmentEpisodes,
} from './pipeline/orchestrator.js';

export {
  VIDEOPLAY_CAPABILITIES,
  VIDEOPLAY_DATA_API_ASSET_BATCH_UPSERT,
  VIDEOPLAY_DATA_API_EPISODE_UPSERT,
  VIDEOPLAY_DATA_API_RELEASE_PUBLISH,
  VIDEOPLAY_MOD_ID,
  VIDEOPLAY_NAV_SLOT,
  VIDEOPLAY_ROUTE_SLOT,
  VIDEOPLAY_TAB_ID,
  createVideoPlayRuntimeMod,
  createRuntimeMod,
};

type ManifestValidationResult = {
  valid: boolean;
  issues: string[];
};

function validateVideoPlayManifestShape(manifest: {
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
  return VIDEOPLAY_MANIFEST;
}

export function validateVideoPlayManifest() {
  const flowId = createVideoPlayFlowId('videoplay-manifest-validate');
  const startedAt = performance.now();
  const result = validateVideoPlayManifestShape(VIDEOPLAY_MANIFEST);
  const issues = [...result.issues];
  emitVideoPlayLog({
    level: result.valid ? 'info' : 'error',
    message: result.valid
      ? 'action:validate-videoplay-manifest:done'
      : 'action:validate-videoplay-manifest:failed',
    flowId,
    source: 'validateVideoPlayManifest',
    costMs: Number((performance.now() - startedAt).toFixed(2)),
    details: {
      valid: result.valid,
      issueCount: issues.length,
      issues,
    },
  });
  return result;
}
