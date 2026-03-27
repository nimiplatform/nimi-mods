import enLocale from './locales/en.js';
import zhLocale from './locales/zh.js';
import { registerModTranslations } from '@nimiplatform/sdk/mod';
import { AGENT_CAPTURE_MANIFEST } from './manifest.js';
import {
  AGENT_CAPTURE_CAPABILITIES,
  AGENT_CAPTURE_DATA_API_CREATOR_AGENTS_GET,
  AGENT_CAPTURE_DATA_API_CREATOR_AGENTS_LIST,
  AGENT_CAPTURE_HANDOFF_CHANNEL,
  AGENT_CAPTURE_MOD_ID,
  AGENT_CAPTURE_NAV_SLOT,
  AGENT_CAPTURE_ROUTE_SLOT,
} from './contracts.js';
import { createAgentCaptureRuntimeMod, createRuntimeMod } from './runtime-mod.js';

registerModTranslations('agent-capture', 'en', enLocale as Record<string, unknown>);
registerModTranslations('agent-capture', 'zh', zhLocale as Record<string, unknown>);

export {
  AGENT_CAPTURE_CAPABILITIES,
  AGENT_CAPTURE_DATA_API_CREATOR_AGENTS_GET,
  AGENT_CAPTURE_DATA_API_CREATOR_AGENTS_LIST,
  AGENT_CAPTURE_HANDOFF_CHANNEL,
  AGENT_CAPTURE_MOD_ID,
  AGENT_CAPTURE_NAV_SLOT,
  AGENT_CAPTURE_ROUTE_SLOT,
  createAgentCaptureRuntimeMod,
  createRuntimeMod,
};

type ManifestValidationResult = {
  valid: boolean;
  issues: string[];
};

function validateManifestShape(manifest: {
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
  return AGENT_CAPTURE_MANIFEST;
}

export function validateAgentCaptureManifest() {
  return validateManifestShape(AGENT_CAPTURE_MANIFEST);
}
