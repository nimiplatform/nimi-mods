import type { HookClient } from '@nimiplatform/sdk/mod/types';
import { createMintYouFlowId, emitMintYouLog } from '../logging.js';
import { canSeePhoto } from '../services/photo-auth.js';

export async function registerMintYouDataCapabilities(input: {
  hookClient: HookClient;
}): Promise<void> {
  const flowId = createMintYouFlowId('mint-you-data-registrar');

  emitMintYouLog({
    level: 'debug',
    message: 'action:data-registrar:init',
    flowId,
    source: 'registerMintYouDataCapabilities',
  });

  // mint-you consumes:
  //   data.query.data-api.creator.agents.create   — provided by host runtime
  //   data.query.data-api.world.access.me         — provided by host runtime
  //   data.query.data-api.world.oasis.get         — provided by host runtime
  // No custom data handlers needed for these capabilities.

  await input.hookClient.profile.registerAgentReadFilter({
    handler: async ({ viewerUserId, ownerAgentId, worldId, profile }) => {
      const referenceImageUrl = String(profile.referenceImageUrl || '').trim();
      if (!referenceImageUrl) {
        return { referenceImageUrl: null };
      }
      const viewer = String(viewerUserId || '').trim();
      const owner = String(ownerAgentId || '').trim();
      const resolvedWorldId = String(worldId || profile.worldId || '').trim();
      if (!viewer || !owner) {
        return { referenceImageUrl: null };
      }
      if (viewer === owner) {
        return { referenceImageUrl };
      }
      if (!resolvedWorldId) {
        return { referenceImageUrl: null };
      }
      return {
        referenceImageUrl: canSeePhoto(viewer, owner, resolvedWorldId)
          ? referenceImageUrl
          : null,
      };
    },
  });

  emitMintYouLog({
    level: 'info',
    message: 'action:data-registrar:done',
    flowId,
    source: 'registerMintYouDataCapabilities',
  });
}
