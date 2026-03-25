import type { WorldStudioMaintainActionContext } from './types.js';

export async function refreshResources(context: WorldStudioMaintainActionContext) {
  await Promise.all([
    context.queries.worldsQuery.refetch(),
    context.queries.draftsQuery.refetch(),
    context.queries.creatorAgentsQuery.refetch(),
    context.snapshot.panel.selectedAgentId ? context.queries.selectedAgentQuery.refetch() : Promise.resolve(),
    context.selectedWorldId ? context.queries.maintenanceQuery.refetch() : Promise.resolve(),
    context.selectedWorldId ? context.queries.eventsQuery.refetch() : Promise.resolve(),
    context.selectedWorldId ? context.queries.lorebooksQuery.refetch() : Promise.resolve(),
    context.selectedWorldId ? context.queries.mutationsQuery.refetch() : Promise.resolve(),
    context.selectedWorldId ? context.queries.resourceBindingsQuery.refetch() : Promise.resolve(),
  ]);
}
