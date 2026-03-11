import type { HookClient } from '@nimiplatform/sdk/mod/types';
import { TEXTPLAY_DATA_API_RENDER_PERSIST, TEXTPLAY_REASON } from '../contracts.js';
import type {
  TextplayNormalizedRenderInput,
  TextplayPresenceReport,
  TextplayRunEvent,
  TextplayRunSnapshot,
  TextplayWarning,
} from '../types.js';

export async function persistTextplayRenderBestEffort(input: {
  hookClient: HookClient;
  normalized: TextplayNormalizedRenderInput;
  text: string;
  meta: Record<string, unknown>;
  runEvents: TextplayRunEvent[];
  runSnapshot: TextplayRunSnapshot;
  warnings: TextplayWarning[];
  presenceReports: TextplayPresenceReport[];
}): Promise<TextplayWarning | null> {
  try {
    await input.hookClient.data.query({
      capability: TEXTPLAY_DATA_API_RENDER_PERSIST,
      query: {
        op: 'upsert',
        record: {
          storyId: input.normalized.storyId,
          worldId: input.normalized.worldId,
          agentId: input.normalized.agentId,
          turnId: input.normalized.turnId,
          runId: input.normalized.runId,
          traceId: input.normalized.traceId,
          triggerSource: input.normalized.triggerSource,
          playerId: input.normalized.playerId,
          playerIdentity: input.normalized.playerIdentity || undefined,
          userMessage: input.normalized.userMessage,
          systemPayload: input.normalized.systemPayload,
          text: input.text,
          meta: input.meta,
          runEvents: input.runEvents,
          runSnapshot: input.runSnapshot,
          warnings: input.warnings,
          presenceReports: input.presenceReports,
        },
      },
    });
    return null;
  } catch (error) {
    return {
      code: TEXTPLAY_REASON.PERSISTENCE_FAILED_WARN,
      stage: 'persistence',
      actionHint: 'Investigate persistence path. Output already returned.',
      message: error instanceof Error ? error.message : String(error || ''),
      at: new Date().toISOString(),
    };
  }
}
