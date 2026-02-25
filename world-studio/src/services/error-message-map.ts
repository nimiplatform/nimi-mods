import { worldStudioMessage } from '../i18n/messages.js';

const ERROR_SUMMARY_MAP: Record<string, string> = {
  WORLD_STUDIO_PHASE1_QUALITY_GATE_BLOCKED: 'error.phase1QualityGateBlocked',
  WORLD_STUDIO_EVENT_EVIDENCE_REQUIRED: 'error.eventEvidenceRequired',
  WORLD_STUDIO_EVENT_GRAPH_INVALID: 'error.eventGraphInvalid',
  WORLD_STUDIO_CONTEXT_OVERFLOW: 'error.contextOverflow',
  WORLD_STUDIO_TASK_CONFLICT: 'error.taskConflict',
  WORLD_STUDIO_TASK_CANCELED: 'error.taskCanceled',
  WORLD_STUDIO_ROUTE_CONFIG_REQUIRED: 'error.routeConfigRequired',
  WORLD_STUDIO_MAINTENANCE_CONFLICT: 'error.maintenanceConflict',
  WORLD_MAINTENANCE_VERSION_CONFLICT: 'error.maintenanceConflict',
  PLAY_PROVIDER_TIMEOUT: 'error.providerTimeout',
  PLAY_PROVIDER_ABORTED: 'error.taskCanceled',
};

function extractErrorCode(message: string): string | null {
  const match = message.match(/(WORLD_STUDIO_[A-Z0-9_]+|WORLD_[A-Z0-9_]+|PLAY_PROVIDER_[A-Z0-9_]+)/);
  return match?.[1] || null;
}

export function mapWorldStudioErrorMessage(error: unknown): {
  summary: string;
  code: string | null;
  detail: string | null;
} {
  const detail = String(error || '').trim();
  if (!detail) {
    return {
      summary: '',
      code: null,
      detail: null,
    };
  }
  const code = extractErrorCode(detail);
  if (code && ERROR_SUMMARY_MAP[code]) {
    return {
      summary: worldStudioMessage(ERROR_SUMMARY_MAP[code], detail),
      code,
      detail,
    };
  }
  return {
    summary: code ? worldStudioMessage('error.genericWithCode', 'Task failed. Check technical detail.') : detail,
    code,
    detail,
  };
}
