import type { HookClient } from '@nimiplatform/sdk/mod/types';
import {
  DAILY_OUTFIT_DATA_API_INSIGHTS_QUERY,
  DAILY_OUTFIT_DATA_API_OUTFITS_FAVORITES,
  DAILY_OUTFIT_DATA_API_OUTFITS_GET,
  DAILY_OUTFIT_DATA_API_OUTFITS_LIST,
  DAILY_OUTFIT_DATA_API_PROFILE_READ,
  DAILY_OUTFIT_DATA_API_PROFILE_WRITE,
  DAILY_OUTFIT_DATA_API_WARDROBE_CREATE,
  DAILY_OUTFIT_DATA_API_WARDROBE_GET,
  DAILY_OUTFIT_DATA_API_WARDROBE_LIST,
  DAILY_OUTFIT_DATA_API_WARDROBE_RETIRE,
  DAILY_OUTFIT_DATA_API_WARDROBE_UPDATE,
  DAILY_OUTFIT_DATA_API_WEARLOG_CREATE,
  DAILY_OUTFIT_DATA_API_WEARLOG_LIST,
} from '../contracts.js';
import { createDailyOutfitFlowId, emitDailyOutfitLog } from '../logging.js';
import {
  createGarment,
  createWearLog,
  getGarment,
  getOutfit,
  listFavoriteOutfits,
  listOutfits,
  listWardrobe,
  listWearLogs,
  queryInsights,
  readProfile,
  retireGarment,
  updateGarment,
  writeProfile,
} from '../state/store.js';
import type { GarmentCreateInput, GarmentUpdateInput, UserProfileWriteInput, WearLogCreateInput } from '../types.js';

function readStringField(input: unknown, key: string): string {
  if (!input || typeof input !== 'object') {
    return '';
  }
  const value = (input as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

function readObjectField<T extends Record<string, unknown>>(input: unknown, key: string): T | null {
  if (!input || typeof input !== 'object') {
    return null;
  }
  const value = (input as Record<string, unknown>)[key];
  return value && typeof value === 'object' ? (value as T) : null;
}

export async function registerDailyOutfitDataCapabilities(input: {
  hookClient: HookClient;
}): Promise<void> {
  const { hookClient } = input;
  const flowId = createDailyOutfitFlowId('daily-outfit-data');

  async function register(capability: string, handler: (query: unknown) => Promise<unknown> | unknown) {
    await hookClient.data.register({
      capability,
      handler: async (query) => {
        emitDailyOutfitLog({
          level: 'debug',
          message: 'action:data-capability:invoke',
          flowId,
          source: capability,
        });
        return await handler(query);
      },
    });
  }

  await register(DAILY_OUTFIT_DATA_API_WARDROBE_LIST, async () => listWardrobe());
  await register(DAILY_OUTFIT_DATA_API_WARDROBE_GET, async (query) => getGarment(readStringField(query, 'id')));
  await register(DAILY_OUTFIT_DATA_API_WARDROBE_CREATE, async (query) => {
    const garment = readObjectField<GarmentCreateInput>(query, 'garment');
    if (!garment) {
      throw new Error('DAILY_OUTFIT_GARMENT_INPUT_REQUIRED');
    }
    return createGarment(garment);
  });
  await register(DAILY_OUTFIT_DATA_API_WARDROBE_UPDATE, async (query) => {
    const id = readStringField(query, 'id');
    const garment = readObjectField<GarmentUpdateInput>(query, 'garment');
    if (!id || !garment) {
      throw new Error('DAILY_OUTFIT_GARMENT_UPDATE_REQUIRED');
    }
    return updateGarment(id, garment);
  });
  await register(DAILY_OUTFIT_DATA_API_WARDROBE_RETIRE, async (query) => {
    const id = readStringField(query, 'id');
    if (!id) {
      throw new Error('DAILY_OUTFIT_GARMENT_ID_REQUIRED');
    }
    return retireGarment(id);
  });

  await register(DAILY_OUTFIT_DATA_API_OUTFITS_LIST, async () => listOutfits());
  await register(DAILY_OUTFIT_DATA_API_OUTFITS_GET, async (query) => getOutfit(readStringField(query, 'id')));
  await register(DAILY_OUTFIT_DATA_API_OUTFITS_FAVORITES, async () => listFavoriteOutfits());

  await register(DAILY_OUTFIT_DATA_API_PROFILE_READ, async () => readProfile());
  await register(DAILY_OUTFIT_DATA_API_PROFILE_WRITE, async (query) => {
    const profile = readObjectField<UserProfileWriteInput>(query, 'profile');
    if (!profile) {
      throw new Error('DAILY_OUTFIT_PROFILE_INPUT_REQUIRED');
    }
    return writeProfile(profile);
  });

  await register(DAILY_OUTFIT_DATA_API_INSIGHTS_QUERY, async () => queryInsights());
  await register(DAILY_OUTFIT_DATA_API_WEARLOG_LIST, async () => listWearLogs());
  await register(DAILY_OUTFIT_DATA_API_WEARLOG_CREATE, async (query) => {
    const wearLog = readObjectField<WearLogCreateInput>(query, 'wearLog');
    if (!wearLog) {
      throw new Error('DAILY_OUTFIT_WEARLOG_INPUT_REQUIRED');
    }
    return createWearLog(wearLog);
  });
}
