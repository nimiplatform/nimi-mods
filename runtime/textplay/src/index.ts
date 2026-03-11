import { TEXTPLAY_MANIFEST } from './manifest.js';
import {
  TEXTPLAY_CAPABILITIES,
  TEXTPLAY_CHAIN_REASON,
  TEXTPLAY_DATA_API_CORE_AGENT_MEMORY_RECALL_FOR_ENTITY,
  TEXTPLAY_DATA_API_RENDER_PERSIST,
  TEXTPLAY_DATA_API_SESSIONS_MINE,
  TEXTPLAY_DATA_API_WORLD_ACCESS_ME,
  TEXTPLAY_DATA_API_WORLD_EVENTS_LIST,
  TEXTPLAY_DATA_API_WORLD_LOREBOOKS_LIST,
  TEXTPLAY_MOD_ID,
  TEXTPLAY_NAV_SLOT,
  TEXTPLAY_REASON,
  TEXTPLAY_ROUTE_SLOT,
  TEXTPLAY_STAGE,
  TEXTPLAY_TAB_ID,
} from './contracts.js';
import {
  createTextplayRuntimeMod,
  createRuntimeMod,
} from './runtime-mod.js';
import {
  createTextplayFlowId,
  emitTextplayLog,
} from './logging.js';

export {
  TEXTPLAY_CAPABILITIES,
  TEXTPLAY_CHAIN_REASON,
  TEXTPLAY_DATA_API_CORE_AGENT_MEMORY_RECALL_FOR_ENTITY,
  TEXTPLAY_DATA_API_RENDER_PERSIST,
  TEXTPLAY_DATA_API_SESSIONS_MINE,
  TEXTPLAY_DATA_API_WORLD_ACCESS_ME,
  TEXTPLAY_DATA_API_WORLD_EVENTS_LIST,
  TEXTPLAY_DATA_API_WORLD_LOREBOOKS_LIST,
  TEXTPLAY_MOD_ID,
  TEXTPLAY_NAV_SLOT,
  TEXTPLAY_REASON,
  TEXTPLAY_ROUTE_SLOT,
  TEXTPLAY_STAGE,
  TEXTPLAY_TAB_ID,
  createRuntimeMod,
  createTextplayRuntimeMod,
};

type ManifestValidationResult = {
  valid: boolean;
  issues: string[];
};

function validateTextplayManifestShape(manifest: {
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
  return TEXTPLAY_MANIFEST;
}

export function validateTextplayManifest() {
  const flowId = createTextplayFlowId('textplay-manifest-validate');
  const startedAt = performance.now();
  emitTextplayLog({
    level: 'debug',
    message: 'action:validate-textplay-manifest:start',
    flowId,
    source: 'validateTextplayManifest',
  });

  const result = validateTextplayManifestShape(TEXTPLAY_MANIFEST);

  emitTextplayLog({
    level: result.valid ? 'info' : 'error',
    message: result.valid
      ? 'action:validate-textplay-manifest:done'
      : 'action:validate-textplay-manifest:failed',
    flowId,
    source: 'validateTextplayManifest',
    costMs: Number((performance.now() - startedAt).toFixed(2)),
    details: {
      valid: result.valid,
      issueCount: result.issues.length,
      issues: result.issues,
    },
  });

  return result;
}
