import { worldStudioMessage } from '../../../i18n/messages.js';
import type { WorldStudioMaintainActionContext } from './types.js';

export async function updateCreatorAgentMetadata(
  context: WorldStudioMaintainActionContext,
  agentId: string,
  patch: Record<string, unknown>,
) {
  const normalizedAgentId = String(agentId || '').trim();
  if (!normalizedAgentId) {
    return;
  }
  context.setError(null);
  context.setNotice(null);
  await context.mutations.updateCreatorAgentMutation.mutateAsync({
    agentId: normalizedAgentId,
    patch,
  });
  context.patchSnapshot({
    panel: {
      ...context.snapshot.panel,
      selectedAgentId: normalizedAgentId,
    },
    unsavedChangesByPanel: {
      ...context.snapshot.unsavedChangesByPanel,
      agentEditor: false,
    },
  });
  await Promise.all([
    context.queries.creatorAgentsQuery.refetch(),
    context.queries.selectedAgentQuery.refetch(),
  ]);
  context.setStatusBanner({
    kind: 'success',
    message: worldStudioMessage('banner.agentMetadataSaved', 'Agent metadata saved'),
  });
  context.setNotice(worldStudioMessage('notice.agentMetadataSaved', 'Saved metadata for agent {{agentId}}.', {
    agentId: normalizedAgentId,
  }));
}
