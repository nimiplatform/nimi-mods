import type { HookClient } from '@nimiplatform/sdk/mod/types';
import { TEXTPLAY_DATA_API_RENDER_PERSIST } from '../contracts.js';
import { createTextplayFlowId, emitTextplayLog } from '../logging.js';
import {
  getTextplayPersistRecordsByTurn,
  getTextplayPersistRunEvents,
  listTextplayPersistRecordsByStory,
  upsertTextplayPersistRecord,
} from '../persist/store.js';
import { TextplayPersistQuerySchema } from '../data/schemas.js';

export async function registerTextplayDataCapabilities(input: {
  hookClient: HookClient;
}): Promise<void> {
  const flowId = createTextplayFlowId('textplay-data-registrar');

  emitTextplayLog({
    level: 'debug',
    message: 'action:data-registrar:init',
    flowId,
    source: 'registerTextplayDataCapabilities',
  });

  await input.hookClient.data.register({
    capability: TEXTPLAY_DATA_API_RENDER_PERSIST,
    handler: async (query) => {
      const parsed = TextplayPersistQuerySchema.safeParse(query);
      if (!parsed.success) {
        throw new Error(`TEXTPLAY_PERSIST_QUERY_INVALID:${parsed.error.issues[0]?.message || 'unknown'}`);
      }

      const payload = parsed.data;
      switch (payload.op) {
        case 'upsert': {
          const record = upsertTextplayPersistRecord(payload.record);
          return {
            ok: true,
            record,
          };
        }
        case 'getByTurn': {
          const records = getTextplayPersistRecordsByTurn({
            storyId: payload.storyId,
            turnId: payload.turnId,
          });
          return {
            ok: true,
            records,
          };
        }
        case 'getRun': {
          const result = getTextplayPersistRunEvents({
            runId: payload.runId,
            afterSeq: payload.afterSeq,
            limit: payload.limit,
          });
          return {
            ok: true,
            record: result.record,
            events: result.events,
            gapRefillApplied: result.gapRefillApplied,
            nextAfterSeq: result.nextAfterSeq,
            runSnapshot: result.record
              ? {
                ...result.record.runSnapshot,
                gapRefillApplied: result.gapRefillApplied,
              }
              : null,
          };
        }
        case 'listByStory': {
          const records = listTextplayPersistRecordsByStory({
            storyId: payload.storyId,
            limit: payload.limit,
          });
          return {
            ok: true,
            records,
          };
        }
        default: {
          throw new Error('TEXTPLAY_PERSIST_QUERY_UNSUPPORTED');
        }
      }
    },
  });

  emitTextplayLog({
    level: 'info',
    message: 'action:data-registrar:done',
    flowId,
    source: 'registerTextplayDataCapabilities',
  });
}
