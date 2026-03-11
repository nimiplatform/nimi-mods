import type { WorldStudioMaintainActionContext } from './types.js';

export async function refreshResources(context: WorldStudioMaintainActionContext) {
  await Promise.all([
    context.queries.worldsQuery.refetch(),
    context.queries.draftsQuery.refetch(),
    context.selectedWorldId ? context.queries.maintenanceQuery.refetch() : Promise.resolve(),
    context.selectedWorldId ? context.queries.eventsQuery.refetch() : Promise.resolve(),
    context.selectedWorldId ? context.queries.lorebooksQuery.refetch() : Promise.resolve(),
    context.selectedWorldId ? context.queries.mutationsQuery.refetch() : Promise.resolve(),
  ]);
}
