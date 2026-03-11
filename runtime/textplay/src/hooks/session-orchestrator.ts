import { TEXTPLAY_REASON } from '../contracts.js';
import type {
  TextplayPersistRecord,
  TextplayRenderSuccess,
  TextplayTriggerSource,
  TextplayWarning,
} from '../types.js';
import { createUlid } from '../utils/ulid.js';

export function createFallbackPersistRecord(input: {
  result: TextplayRenderSuccess;
  worldId: string;
  agentId: string;
  triggerSource: TextplayTriggerSource;
  playerId: string;
  playerIdentity?: string;
  userMessage: string;
  systemPayload?: Record<string, unknown> | null;
}): TextplayPersistRecord {
  return {
    id: createUlid(),
    storyId: input.result.meta.storyId,
    worldId: input.worldId,
    agentId: input.agentId,
    turnId: input.result.meta.turnId,
    runId: input.result.meta.runId,
    traceId: input.result.meta.traceId,
    triggerSource: input.triggerSource,
    playerId: input.playerId,
    playerIdentity: input.playerIdentity,
    userMessage: input.userMessage,
    systemPayload: input.systemPayload || null,
    text: input.result.text,
    meta: input.result.meta,
    runEvents: input.result.runEvents,
    runSnapshot: input.result.meta.runSnapshot,
    warnings: input.result.meta.warnings,
    presenceReports: input.result.meta.presenceReports,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function hasPersistenceWarning(warnings: TextplayWarning[]): boolean {
  return warnings.some((warning) => warning.code === TEXTPLAY_REASON.PERSISTENCE_FAILED_WARN);
}
