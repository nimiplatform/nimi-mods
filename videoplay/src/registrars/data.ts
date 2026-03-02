import type { HookClient } from '@nimiplatform/sdk/mod/types';
import {
  VIDEOPLAY_DATA_API_ASSET_BATCH_UPSERT,
  VIDEOPLAY_DATA_API_EPISODE_UPSERT,
  VIDEOPLAY_DATA_API_RELEASE_PUBLISH,
} from '../contracts.js';
import { createVideoPlayFlowId, emitVideoPlayLog } from '../logging.js';
import {
  getEpisode,
  getRelease,
  listAssets,
  listEpisodes,
  listReleases,
  loadVideoPlayState,
  publishRelease,
  saveVideoPlayState,
  upsertAssets,
  upsertEpisode,
} from '../storage/state.js';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {};
}

function readRequiredString(value: unknown, key: string): string {
  const record = asRecord(value);
  const raw = String(record[key] || '').trim();
  if (!raw) {
    throw new Error(`VIDEOPLAY_REQUIRED_FIELD_MISSING:${key}`);
  }
  return raw;
}

export async function registerVideoPlayDataCapabilities(input: {
  hookClient: HookClient;
}): Promise<void> {
  const flowId = createVideoPlayFlowId('videoplay-data-registrar');

  await input.hookClient.data.register({
    capability: VIDEOPLAY_DATA_API_EPISODE_UPSERT,
    handler: async (query) => {
      const state = loadVideoPlayState();
      const payload = asRecord(query);
      const operation = String(payload.operation || '').trim();

      if (operation === 'upsert') {
        const response = upsertEpisode(state, {
          idempotencyKey: readRequiredString(payload, 'idempotencyKey'),
          episode: asRecord(payload.episode) as never,
        });
        saveVideoPlayState(state);
        return response;
      }

      if (operation === 'get') {
        return getEpisode(state, readRequiredString(payload, 'episodeId'));
      }

      if (operation === 'list') {
        const storyId = String(payload.storyId || '').trim() || undefined;
        return listEpisodes(state, storyId);
      }

      throw new Error(`VIDEOPLAY_UNSUPPORTED_OPERATION:${VIDEOPLAY_DATA_API_EPISODE_UPSERT}:${operation}`);
    },
  });

  await input.hookClient.data.register({
    capability: VIDEOPLAY_DATA_API_ASSET_BATCH_UPSERT,
    handler: async (query) => {
      const state = loadVideoPlayState();
      const payload = asRecord(query);
      const operation = String(payload.operation || '').trim();

      if (operation === 'upsert') {
        const assetsRaw = Array.isArray(payload.assets) ? payload.assets : [];
        const response = upsertAssets(state, {
          idempotencyKey: readRequiredString(payload, 'idempotencyKey'),
          episodeId: readRequiredString(payload, 'episodeId'),
          assets: assetsRaw as never,
        });
        saveVideoPlayState(state);
        return response;
      }

      if (operation === 'list') {
        return listAssets(state, readRequiredString(payload, 'episodeId'));
      }

      throw new Error(`VIDEOPLAY_UNSUPPORTED_OPERATION:${VIDEOPLAY_DATA_API_ASSET_BATCH_UPSERT}:${operation}`);
    },
  });

  await input.hookClient.data.register({
    capability: VIDEOPLAY_DATA_API_RELEASE_PUBLISH,
    handler: async (query) => {
      const state = loadVideoPlayState();
      const payload = asRecord(query);
      const operation = String(payload.operation || '').trim();

      if (operation === 'publish') {
        const response = publishRelease(state, {
          idempotencyKey: readRequiredString(payload, 'idempotencyKey'),
          episodeId: readRequiredString(payload, 'episodeId'),
          releasePackage: asRecord(payload.releasePackage) as never,
        });
        saveVideoPlayState(state);
        return response;
      }

      if (operation === 'get') {
        return getRelease(state, readRequiredString(payload, 'releaseId'));
      }

      if (operation === 'list') {
        const episodeId = String(payload.episodeId || '').trim() || undefined;
        return listReleases(state, episodeId);
      }

      throw new Error(`VIDEOPLAY_UNSUPPORTED_OPERATION:${VIDEOPLAY_DATA_API_RELEASE_PUBLISH}:${operation}`);
    },
  });

  emitVideoPlayLog({
    level: 'info',
    message: 'action:data-registrar:done',
    flowId,
    source: 'registerVideoPlayDataCapabilities',
  });
}
