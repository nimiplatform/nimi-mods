import { worldStudioMessage } from '../../../i18n/messages.js';
import { findLinkedCreatorAgent } from '../../../services/creator-agent-link.js';
import type { WorldStudioMaintainActionContext } from './types.js';
import { asRecord } from "@nimiplatform/sdk/mod";

function toNullableTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized ? normalized : null;
}

export async function syncResourceBindings(
  context: WorldStudioMaintainActionContext,
  scope: 'WORLD_ASSETS' | 'AGENT_ASSETS',
) {
  if (!context.selectedWorldId) {
    return;
  }
  const bindingUpserts: Array<Record<string, unknown>> = [];
  if (scope === 'WORLD_ASSETS') {
    const worldCoverUrl = toNullableTrimmedString(context.snapshot.assets.worldCover.imageUrl);
    if (worldCoverUrl) {
      bindingUpserts.push({
        targetType: 'WORLD',
        targetId: context.selectedWorldId,
        slot: 'WORLD_ICON',
        priority: 0,
        resource: {
          resourceType: 'IMAGE',
          storageRef: worldCoverUrl,
          provenance: 'GENERATED',
          sourceRef: 'world-studio:world-cover',
          label: 'world_icon',
          tags: ['world-studio', 'world-icon'],
        },
      });
      bindingUpserts.push({
        targetType: 'WORLD',
        targetId: context.selectedWorldId,
        slot: 'WORLD_BANNER',
        priority: 0,
        resource: {
          resourceType: 'IMAGE',
          storageRef: worldCoverUrl,
          provenance: 'GENERATED',
          sourceRef: 'world-studio:world-cover',
          label: 'world_cover',
          tags: ['world-studio', 'world-cover'],
        },
      });
    }
    let galleryPriority = 0;
    for (const [locationName, draft] of Object.entries(context.snapshot.assets.locationImages || {})) {
      const imageUrl = toNullableTrimmedString(asRecord(draft).imageUrl);
      if (!imageUrl) {
        continue;
      }
      bindingUpserts.push({
        targetType: 'WORLD',
        targetId: context.selectedWorldId,
        slot: 'WORLD_GALLERY',
        priority: galleryPriority,
        conditions: { location: locationName },
        tags: ['world-studio', 'location'],
        resource: {
          resourceType: 'IMAGE',
          storageRef: imageUrl,
          provenance: 'GENERATED',
          sourceRef: `world-studio:location:${locationName}`,
          label: locationName,
          tags: ['world-studio', 'location'],
        },
      });
      galleryPriority += 1;
    }
  }
  if (scope === 'AGENT_ASSETS') {
    const creatorAgents = Array.isArray(context.queries.creatorAgentsQuery.data)
      ? (context.queries.creatorAgentsQuery.data as Array<Record<string, unknown>>)
      : [];
    for (const [characterName, draft] of Object.entries(context.snapshot.assets.characterPortraits || {})) {
      const imageUrl = toNullableTrimmedString(asRecord(draft).imageUrl);
      const matchedAgent = findLinkedCreatorAgent({
        creatorAgents,
        draft: context.snapshot.agentSync.draftsByCharacter[characterName],
        characterName,
        worldId: context.selectedWorldId,
      });
      const targetId = String(matchedAgent?.id || '').trim();
      if (!imageUrl || !targetId) {
        continue;
      }
      bindingUpserts.push({
        targetType: 'AGENT',
        targetId,
        slot: 'AGENT_AVATAR',
        priority: 0,
        conditions: { characterName },
        tags: ['world-studio', 'agent-avatar'],
        resource: {
          resourceType: 'IMAGE',
          storageRef: imageUrl,
          provenance: 'GENERATED',
          sourceRef: `world-studio:avatar:${characterName}`,
          label: `${characterName} avatar`,
          tags: ['world-studio', 'agent-avatar'],
        },
      });
      bindingUpserts.push({
        targetType: 'AGENT',
        targetId,
        slot: 'AGENT_PORTRAIT',
        priority: 0,
        conditions: { characterName },
        tags: ['world-studio', 'character-portrait'],
        resource: {
          resourceType: 'IMAGE',
          storageRef: imageUrl,
          provenance: 'GENERATED',
          sourceRef: `world-studio:portrait:${characterName}`,
          label: characterName,
          tags: ['world-studio', 'character-portrait'],
        },
      });
    }
  }
  if (bindingUpserts.length === 0) {
    context.setNotice(worldStudioMessage('notice.mediaSyncSkipped', 'No generated assets are ready to sync.'));
    return;
  }
  await context.mutations.syncResourceBindingsMutation.mutateAsync({
    worldId: context.selectedWorldId,
    bindingUpserts,
    reason: scope === 'WORLD_ASSETS'
      ? 'Sync world assets from world-studio maintenance'
      : 'Sync agent assets from world-studio maintenance',
  });
  context.patchSnapshot({
    unsavedChangesByPanel: {
      ...context.snapshot.unsavedChangesByPanel,
      worldAssets: scope === 'WORLD_ASSETS' ? false : context.snapshot.unsavedChangesByPanel.worldAssets,
      agentAssets: scope === 'AGENT_ASSETS' ? false : context.snapshot.unsavedChangesByPanel.agentAssets,
    },
  });
  await Promise.all([
    context.queries.resourceBindingsQuery.refetch(),
    context.queries.creatorAgentsQuery.refetch(),
    context.queries.selectedAgentQuery.refetch(),
  ]);
  context.setStatusBanner({
    kind: 'success',
    message: worldStudioMessage('banner.resourceBindingsSynchronized', 'Resource bindings synchronized'),
  });
  context.setNotice(worldStudioMessage('notice.resourceBindingsSynchronized', 'Synchronized {{count}} resource bindings.', {
    count: bindingUpserts.length,
  }));
}
